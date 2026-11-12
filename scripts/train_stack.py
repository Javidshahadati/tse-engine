"""Step 14: Train with 68 features (64 tech + 4 fundamental)."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score

OUT = Path('outputs'); MODELS = Path('models'); MODELS.mkdir(exist_ok=True)
THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65

print('=' * 55)
print('TSE.Engine Trainer - Step 14')
print('=' * 55)

print('\n[1/6] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
pos_rate = df['label'].mean()

with open(OUT / 'summary.json') as f:
    feat_cols = json.load(f)['feature_names']
feat_cols = [c for c in feat_cols if c in df.columns]
print(f'  Rows: {len(df):,} | Features: {len(feat_cols)} | Pos: {pos_rate:.2%}')

print('\n[2/6] Folds...')
df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]
fold_bounds = []; folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy(); te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    fold_bounds.append({'fold':k,'test_start':int(s),'test_end':int(e)})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')
with open(OUT / 'fold_bounds.json','w') as f:
    json.dump(fold_bounds, f, indent=2)

xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}
lgb_params = {
    'n_estimators': 300, 'num_leaves': 31, 'max_depth': 6,
    'learning_rate': 0.05, 'min_data_in_leaf': 50,
    'feature_fraction': 0.8, 'bagging_fraction': 0.8, 'bagging_freq': 5,
    'lambda_l2': 1.0, 'objective': 'binary', 'metric': 'auc',
    'is_unbalance': True, 'n_jobs': -1, 'random_state': 42, 'verbose': -1,
}

print('\n[3/6] Train (avg only - meta disabled)...')
fold_results = []
for f in folds:
    k = f['fold']; print(f'\n  Fold {k}:')
    tr = f['train'].sort_values('date').reset_index(drop=True)
    te = f['test']
    Xtr = tr[feat_cols].values; ytr = tr['label'].values
    Xte = te[feat_cols].values; yte = te['label'].values

    mx = xgb.XGBClassifier(**xgb_params); mx.fit(Xtr, ytr, verbose=False)
    px_te = mx.predict_proba(Xte)[:,1]
    ml = lgb.LGBMClassifier(**lgb_params); ml.fit(Xtr, ytr)
    pl_te = ml.predict_proba(Xte)[:,1]
    p_avg = (px_te + pl_te) / 2

    auc_x = roc_auc_score(yte, px_te); auc_l = roc_auc_score(yte, pl_te)
    auc_avg = roc_auc_score(yte, p_avg)

    def wr(p):
        s = p > THRESHOLD_BUY
        return float(yte[s].mean()) if s.sum() > 0 else 0

    fm = {
        'fold': k,
        'auc_xgb': round(float(auc_x),4), 'auc_lgbm': round(float(auc_l),4),
        'auc_avg': round(float(auc_avg),4),
        'wr_xgb': round(wr(px_te),4), 'wr_lgbm': round(wr(pl_te),4),
        'wr_avg': round(wr(p_avg),4),
        'n_avg': int((p_avg > THRESHOLD_BUY).sum()),
    }
    fold_results.append(fm)
    print(f'    XGB={auc_x:.4f} LGBM={auc_l:.4f} AVG={auc_avg:.4f}')
    print(f'    WR: XGB={wr(px_te):.1%} LGBM={wr(pl_te):.1%} AVG={wr(p_avg):.1%}')

    mx.save_model(str(MODELS / f'xgb_fold{k}.json'))
    ml.booster_.save_model(str(MODELS / f'lgbm_fold{k}.txt'))

    p = te[['symbol','date','close','label','future_ret_5d']].copy()
    p['prob_xgb'] = px_te; p['prob_lgbm'] = pl_te
    p['prob_avg'] = p_avg; p['fold'] = k
    p.to_parquet(OUT / f'preds_fold{k}.parquet', index=False)

print('\n[4/6] Aggregate...')
agg = {}
for key in ['auc_xgb','auc_lgbm','auc_avg','wr_xgb','wr_lgbm','wr_avg']:
    agg[key] = round(float(np.mean([f[key] for f in fold_results])),4)
agg['best_model'] = 'avg'
agg['best_auc'] = agg['auc_avg']

print('\n[5/6] Combine predictions...')
all_preds = pd.concat([pd.read_parquet(OUT / f'preds_fold{k}.parquet') for k in range(1,5)], ignore_index=True)
all_preds.to_parquet(OUT / 'predictions.parquet', index=False)

print('\n[6/6] Save metrics...')
metrics = {
    'step': '14', 'model': 'XGB+LGBM avg (68 features, +fundamental)',
    'n_features': len(feat_cols), 'feature_names': feat_cols,
    'aggregate': agg, 'folds': fold_results,
}
with open(OUT / 'metrics.json','w',encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 55)
print(f'BASELINE (64 features): AUC=0.6763, WR=0.7102, Alpha=+3.07%')
print(f'NEW (68 features):      AUC={agg["auc_avg"]:.4f}, WR={agg["wr_avg"]:.4f}')
print(f'  XGB:  AUC={agg["auc_xgb"]:.4f} WR={agg["wr_xgb"]:.1%}')
print(f'  LGBM: AUC={agg["auc_lgbm"]:.4f} WR={agg["wr_lgbm"]:.1%}')
print(f'  AVG:  AUC={agg["auc_avg"]:.4f} WR={agg["wr_avg"]:.1%}')
print('=' * 55)
