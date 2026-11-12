"""Step 12: All features (minus leaky POC) + stacking."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score

OUT = Path('outputs'); MODELS = Path('models'); MODELS.mkdir(exist_ok=True)

THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65
N_OOF_SPLITS = 5
LEAKY = ['POC20', 'POC_dist']  # known leaks in structural.py

print('=' * 65)
print('STEP 12 - All features test')
print('=' * 65)

print('\n[1/6] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
pos_rate = df['label'].mean()

with open(OUT / 'summary.json') as f:
    summary = json.load(f)
all_feat_names = summary['feature_names']
print(f'  Summary features: {len(all_feat_names)}')

# Filter leaky + missing
feat_cols = [c for c in all_feat_names if c in df.columns and c not in LEAKY]
missing = [c for c in all_feat_names if c not in df.columns]
print(f'  After filtering leaks: {len(feat_cols)}')
if missing:
    print(f'  Missing from df: {missing[:5]}...')

print('\n[2/6] Walk-forward folds...')
df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

fold_bounds = []
folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy()
    te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    fold_bounds.append({'fold':k,'test_start':int(s),'test_end':int(e)})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')

with open(OUT / 'fold_bounds.json','w') as f:
    json.dump(fold_bounds, f, indent=2)

xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.7,  # lower for more features
    'reg_lambda': 1.0, 'tree_method': 'hist',
    'objective': 'binary:logistic', 'eval_metric': 'auc',
    'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}
lgb_params = {
    'n_estimators': 300, 'num_leaves': 31, 'max_depth': 6,
    'learning_rate': 0.05, 'min_data_in_leaf': 50,
    'feature_fraction': 0.7, 'bagging_fraction': 0.8, 'bagging_freq': 5,
    'lambda_l2': 1.0, 'objective': 'binary',
    'metric': 'auc', 'is_unbalance': True,
    'n_jobs': -1, 'random_state': 42, 'verbose': -1,
}

def make_meta_features(px, pl):
    return np.column_stack([px, pl, px*pl])

print('\n[3/6] Training...')
fold_results = []
for f in folds:
    k = f['fold']; print(f'\n  Fold {k}:')
    tr = f['train'].sort_values('date').reset_index(drop=True)
    te = f['test']
    Xtr = tr[feat_cols].values; ytr = tr['label'].values
    Xte = te[feat_cols].values; yte = te['label'].values

    # OOF
    tscv = TimeSeriesSplit(n_splits=N_OOF_SPLITS)
    oof_px = np.zeros(len(tr)); oof_pl = np.zeros(len(tr))
    for tr_idx, val_idx in tscv.split(Xtr):
        mx = xgb.XGBClassifier(**xgb_params); mx.fit(Xtr[tr_idx], ytr[tr_idx], verbose=False)
        oof_px[val_idx] = mx.predict_proba(Xtr[val_idx])[:,1]
        ml = lgb.LGBMClassifier(**lgb_params); ml.fit(Xtr[tr_idx], ytr[tr_idx])
        oof_pl[val_idx] = ml.predict_proba(Xtr[val_idx])[:,1]

    valid_mask = (oof_px > 0) & (oof_pl > 0)
    meta = LogisticRegression(C=0.5, penalty='l2', solver='liblinear',
                               class_weight='balanced', max_iter=1000)
    meta.fit(make_meta_features(oof_px, oof_pl)[valid_mask], ytr[valid_mask])

    # Refit full
    mx_full = xgb.XGBClassifier(**xgb_params); mx_full.fit(Xtr, ytr, verbose=False)
    px_te = mx_full.predict_proba(Xte)[:,1]
    ml_full = lgb.LGBMClassifier(**lgb_params); ml_full.fit(Xtr, ytr)
    pl_te = ml_full.predict_proba(Xte)[:,1]

    p_avg_te = (px_te + pl_te) / 2
    p_meta_te = meta.predict_proba(make_meta_features(px_te, pl_te))[:,1]

    auc_x = roc_auc_score(yte, px_te); auc_l = roc_auc_score(yte, pl_te)
    auc_avg = roc_auc_score(yte, p_avg_te); auc_meta = roc_auc_score(yte, p_meta_te)

    def wr(p):
        s = p > THRESHOLD_BUY
        return float(yte[s].mean()) if s.sum() > 0 else 0
    def ns(p): return int((p > THRESHOLD_BUY).sum())

    fm = {
        'fold': k,
        'auc_xgb': round(float(auc_x),4), 'auc_lgbm': round(float(auc_l),4),
        'auc_avg': round(float(auc_avg),4), 'auc_meta': round(float(auc_meta),4),
        'wr_xgb': round(wr(px_te),4), 'wr_lgbm': round(wr(pl_te),4),
        'wr_avg': round(wr(p_avg_te),4), 'wr_meta': round(wr(p_meta_te),4),
        'n_xgb': ns(px_te), 'n_avg': ns(p_avg_te),
        'meta_weights': [round(float(c),3) for c in meta.coef_[0]],
    }
    fold_results.append(fm)
    print(f'    XGB={auc_x:.4f} LGBM={auc_l:.4f} AVG={auc_avg:.4f} META={auc_meta:.4f}')

    mx_full.save_model(str(MODELS / f'xgb_fold{k}.json'))
    ml_full.booster_.save_model(str(MODELS / f'lgbm_fold{k}.txt'))
    with open(MODELS / f'meta_fold{k}.json','w') as f_:
        json.dump({'coef': meta.coef_[0].tolist(),
                   'intercept': float(meta.intercept_[0])}, f_)

    p = te[['symbol','date','close','label','future_ret_5d']].copy()
    p['prob_xgb'] = px_te; p['prob_lgbm'] = pl_te
    p['prob_avg'] = p_avg_te; p['prob_meta'] = p_meta_te
    p['fold'] = k
    p.to_parquet(OUT / f'preds_fold{k}.parquet', index=False)

print('\n[4/6] Aggregate...')
agg = {}
for key in ['auc_xgb','auc_lgbm','auc_avg','auc_meta','wr_xgb','wr_lgbm','wr_avg','wr_meta']:
    agg[key] = round(float(np.mean([f[key] for f in fold_results])),4)
best = max([('xgb',agg['auc_xgb']),('lgbm',agg['auc_lgbm']),
            ('avg',agg['auc_avg']),('meta',agg['auc_meta'])], key=lambda x: x[1])
agg['best_model'] = best[0]; agg['best_auc'] = best[1]

print('\n[5/6] Save predictions...')
all_preds = pd.concat([pd.read_parquet(OUT / f'preds_fold{k}.parquet') for k in range(1,5)],
                      ignore_index=True)
all_preds.to_parquet(OUT / 'predictions.parquet', index=False)

print('\n[6/6] Save metrics...')
metrics = {
    'step': '12', 'model': 'Stacking with ALL features (minus POC)',
    'n_features': len(feat_cols),
    'n_features_removed_leaky': len(LEAKY),
    'feature_names': feat_cols,
    'aggregate': agg, 'folds': fold_results,
}
with open(OUT / 'metrics.json','w',encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print(f'COMPARISON (prev 64-baseline: AUC=0.6763, WR=0.7102):')
print(f"  XGB:   AUC={agg['auc_xgb']:.4f} WR={agg['wr_xgb']:.1%}")
print(f"  LGBM:  AUC={agg['auc_lgbm']:.4f} WR={agg['wr_lgbm']:.1%}")
print(f"  AVG:   AUC={agg['auc_avg']:.4f} WR={agg['wr_avg']:.1%}")
print(f"  META:  AUC={agg['auc_meta']:.4f} WR={agg['wr_meta']:.1%}")
print(f"  WINNER: {agg['best_model']} (AUC={agg['best_auc']:.4f})")
print(f"  Features: {len(feat_cols)} (was 64)")
print('=' * 65)
