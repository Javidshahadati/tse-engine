"""Stacking FIXED - Step 11.5: proper OOF meta + saved folds."""
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

SAFE_FEATURES = [
    'RSI','RSI_slope','MACD','MACD_Sig','MACD_Hist','MACD_slope',
    'EMA20','EMA50','EMA200','SMA20','BB_pct','BB_width','ATR_pct',
    'Stoch','Stoch_D','WillR','CCI','MFI','OBV_slope','ADX',
    'Return_1d','Return_5d','Return_20d','Volatility_20d',
    'Price_EMA50_ratio','Price_EMA200_ratio','Volume_ratio',
    'High_Low_range','Close_Open','Gap',
    'BOS_Bull','BOS_Bear','CHoCH_Bull','CHoCH_Bear','FVG_Bull','FVG_Bear',
    'Doji','Hammer','ShootingStar','BullEngulf','BearEngulf',
    'InsideBar','OutsideBar',
    'Body_pct','UpperWick_pct','LowerWick_pct','ClosePosition',
    'IsLimitUp','IsLimitDown',
    'DistToHigh20','DistToLow20','DistToHigh50','DistToLow50',
    'RangePos20','BodyRange_ratio',
    'Uptrend','Downtrend',
    'BreakHigh20','BreakLow20','BreakHigh50','BreakLow50',
    'Consolidation','ConsecUp_3','ConsecDown_3',
]

THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65
N_OOF_SPLITS = 5

print('=' * 65)
print('STACKING FIXED - Step 11.5')
print('  Meta: OOF via TimeSeriesSplit(5)')
print('  Features: px, pl, px*pl')
print('=' * 65)

print('\n[1/6] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,} | Features: {len(feat_cols)}')

print('\n[2/6] Walk-forward folds (save boundaries)...')
df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

fold_bounds = []  # save for backtest
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
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}
lgb_params = {
    'n_estimators': 300, 'num_leaves': 31, 'max_depth': 6,
    'learning_rate': 0.05, 'min_data_in_leaf': 50,
    'feature_fraction': 0.8, 'bagging_fraction': 0.8, 'bagging_freq': 5,
    'lambda_l2': 1.0, 'objective': 'binary',
    'metric': 'auc', 'is_unbalance': True,
    'n_jobs': -1, 'random_state': 42, 'verbose': -1,
}

def make_meta_features(px, pl):
    """3 features: px, pl, px*pl."""
    return np.column_stack([px, pl, px*pl])

print('\n[3/6] Training with OOF meta...')
fold_results = []
for f in folds:
    k = f['fold']; print(f'\n  Fold {k}:')
    tr = f['train'].sort_values('date').reset_index(drop=True)
    te = f['test']
    Xtr = tr[feat_cols].values; ytr = tr['label'].values
    Xte = te[feat_cols].values; yte = te['label'].values

    # ─── OOF via TimeSeriesSplit on train ───
    tscv = TimeSeriesSplit(n_splits=N_OOF_SPLITS)
    oof_px = np.zeros(len(tr))
    oof_pl = np.zeros(len(tr))

    for tr_idx, val_idx in tscv.split(Xtr):
        m_x = xgb.XGBClassifier(**xgb_params)
        m_x.fit(Xtr[tr_idx], ytr[tr_idx], verbose=False)
        oof_px[val_idx] = m_x.predict_proba(Xtr[val_idx])[:,1]

        m_l = lgb.LGBMClassifier(**lgb_params)
        m_l.fit(Xtr[tr_idx], ytr[tr_idx])
        oof_pl[val_idx] = m_l.predict_proba(Xtr[val_idx])[:,1]

    # ─── Train meta on OOF ───
    meta_X_oof = make_meta_features(oof_px, oof_pl)
    # Skip first split (zeros) — meta needs valid OOF
    valid_mask = (oof_px > 0) & (oof_pl > 0)
    meta = LogisticRegression(C=0.5, penalty='l2', solver='liblinear',
                               class_weight='balanced', max_iter=1000)
    meta.fit(meta_X_oof[valid_mask], ytr[valid_mask])

    # ─── Refit base models on full train ───
    m_x_full = xgb.XGBClassifier(**xgb_params)
    m_x_full.fit(Xtr, ytr, verbose=False)
    px_tr_full = m_x_full.predict_proba(Xtr)[:,1]
    px_te = m_x_full.predict_proba(Xte)[:,1]

    m_l_full = lgb.LGBMClassifier(**lgb_params)
    m_l_full.fit(Xtr, ytr)
    pl_te = m_l_full.predict_proba(Xte)[:,1]

    # ─── Meta predicts on test ───
    meta_X_te = make_meta_features(px_te, pl_te)
    p_meta_te = meta.predict_proba(meta_X_te)[:,1]
    p_avg_te = (px_te + pl_te) / 2

    auc_x = roc_auc_score(yte, px_te)
    auc_l = roc_auc_score(yte, pl_te)
    auc_avg = roc_auc_score(yte, p_avg_te)
    auc_meta = roc_auc_score(yte, p_meta_te)

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
        'n_xgb': ns(px_te), 'n_lgbm': ns(pl_te),
        'n_avg': ns(p_avg_te), 'n_meta': ns(p_meta_te),
        'meta_weights': [round(float(c),3) for c in meta.coef_[0]],
        'meta_intercept': round(float(meta.intercept_[0]),3),
        'oof_valid_count': int(valid_mask.sum()),
    }
    fold_results.append(fm)
    print(f'    XGB:  AUC={auc_x:.4f} WR={wr(px_te):.1%} n={ns(px_te)}')
    print(f'    LGBM: AUC={auc_l:.4f} WR={wr(pl_te):.1%} n={ns(pl_te)}')
    print(f'    AVG:  AUC={auc_avg:.4f} WR={wr(p_avg_te):.1%} n={ns(p_avg_te)}')
    print(f'    META: AUC={auc_meta:.4f} WR={wr(p_meta_te):.1%} n={ns(p_meta_te)}')
    print(f'    Meta weights: {fm["meta_weights"]}')

    # Save models
    m_x_full.save_model(str(MODELS / f'xgb_fold{k}.json'))
    m_l_full.booster_.save_model(str(MODELS / f'lgbm_fold{k}.txt'))
    with open(MODELS / f'meta_fold{k}.json','w') as f_:
        json.dump({'coef': meta.coef_[0].tolist(),
                   'intercept': float(meta.intercept_[0]),
                   'uses': 'px, pl, px*pl'}, f_)

    # Save predictions
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

print('\n[5/6] Combining predictions...')
all_preds = pd.concat([pd.read_parquet(OUT / f'preds_fold{k}.parquet') for k in range(1,5)],
                      ignore_index=True)
all_preds.to_parquet(OUT / 'predictions.parquet', index=False)
print(f'  {len(all_preds):,} rows')

print('\n[6/6] Saving metrics...')
metrics = {
    'step': '11.5', 'model': 'Stacking FIXED (OOF meta)',
    'threshold_label': THRESHOLD_LABEL, 'threshold_buy': THRESHOLD_BUY,
    'positive_rate': round(float(pos_rate),4), 'n_rows': len(df),
    'n_features': len(feat_cols), 'feature_names': feat_cols,
    'n_oof_splits': N_OOF_SPLITS,
    'meta_features': 'px, pl, px*pl',
    'aggregate': agg, 'folds': fold_results,
}
with open(OUT / 'metrics.json','w',encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print('COMPARISON:')
print(f"  XGB:   AUC={agg['auc_xgb']:.4f} WR={agg['wr_xgb']:.1%}")
print(f"  LGBM:  AUC={agg['auc_lgbm']:.4f} WR={agg['wr_lgbm']:.1%}")
print(f"  AVG:   AUC={agg['auc_avg']:.4f} WR={agg['wr_avg']:.1%}")
print(f"  META:  AUC={agg['auc_meta']:.4f} WR={agg['wr_meta']:.1%}  ← FIXED")
print(f"  WINNER: {agg['best_model']} (AUC={agg['best_auc']:.4f})")
print('=' * 65)
