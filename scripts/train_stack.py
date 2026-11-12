"""Stacking training - Step 11: XGB + LGBM -> LogReg meta with OOF."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

OUT = Path('outputs')
MODELS = Path('models'); MODELS.mkdir(exist_ok=True)

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

print('=' * 65)
print('STACKING TRAINING - Step 11')
print('  Base: XGBoost + LightGBM')
print('  Meta: LogisticRegression (L2, C=0.1)')
print('  OOF: 4 walk-forward folds')
print('=' * 65)

print('\n[1/6] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,} | Features: {len(feat_cols)} | Pos: {pos_rate:.2%}')

print('\n[2/6] Walk-forward setup...')
df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy()
    te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')

print('\n[3/6] Training base models per fold...')
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

fold_results = []
for f in folds:
    k = f['fold']; print(f'\n  Fold {k}:')
    tr = f['train']; te = f['test']
    Xtr, ytr = tr[feat_cols].values, tr['label'].values
    Xte, yte = te[feat_cols].values, te['label'].values

    # XGB
    mx = xgb.XGBClassifier(**xgb_params)
    mx.fit(Xtr, ytr, verbose=False)
    px_tr = mx.predict_proba(Xtr)[:,1]
    px_te = mx.predict_proba(Xte)[:,1]

    # LGBM
    ml = lgb.LGBMClassifier(**lgb_params)
    ml.fit(Xtr, ytr)
    pl_tr = ml.predict_proba(Xtr)[:,1]
    pl_te = ml.predict_proba(Xte)[:,1]

    # Per-model AUC
    auc_x = roc_auc_score(yte, px_te)
    auc_l = roc_auc_score(yte, pl_te)

    # Simple average
    p_avg_te = (px_te + pl_te) / 2
    auc_avg = roc_auc_score(yte, p_avg_te)

    # Meta LogReg trained on OOF (train preds as features)
    meta_X_tr = np.column_stack([px_tr, pl_tr])
    meta_X_te = np.column_stack([px_te, pl_te])
    meta = LogisticRegression(C=0.1, penalty='l2', solver='liblinear',
                               class_weight='balanced', max_iter=1000)
    meta.fit(meta_X_tr, ytr)
    p_meta_te = meta.predict_proba(meta_X_te)[:,1]
    auc_meta = roc_auc_score(yte, p_meta_te)

    # Winrate at threshold
    def wr(p):
        sig = p > THRESHOLD_BUY
        return float(yte[sig].mean()) if sig.sum() > 0 else 0
    def n_sig(p): return int((p > THRESHOLD_BUY).sum())

    fm = {
        'fold': k,
        'auc_xgb': round(float(auc_x),4),
        'auc_lgbm': round(float(auc_l),4),
        'auc_avg': round(float(auc_avg),4),
        'auc_meta': round(float(auc_meta),4),
        'wr_xgb': round(wr(px_te),4),
        'wr_lgbm': round(wr(pl_te),4),
        'wr_avg': round(wr(p_avg_te),4),
        'wr_meta': round(wr(p_meta_te),4),
        'n_xgb': n_sig(px_te), 'n_lgbm': n_sig(pl_te),
        'n_avg': n_sig(p_avg_te), 'n_meta': n_sig(p_meta_te),
        'meta_weights': [round(float(c),3) for c in meta.coef_[0]],
        'meta_intercept': round(float(meta.intercept_[0]),3),
    }
    fold_results.append(fm)
    print(f'    XGB:  AUC={auc_x:.4f} WR={wr(px_te):.1%} signals={n_sig(px_te)}')
    print(f'    LGBM: AUC={auc_l:.4f} WR={wr(pl_te):.1%} signals={n_sig(pl_te)}')
    print(f'    AVG:  AUC={auc_avg:.4f} WR={wr(p_avg_te):.1%} signals={n_sig(p_avg_te)}')
    print(f'    META: AUC={auc_meta:.4f} WR={wr(p_meta_te):.1%} signals={n_sig(p_meta_te)}')

    # Save models
    mx.save_model(str(MODELS / f'xgb_fold{k}.json'))
    ml.booster_.save_model(str(MODELS / f'lgbm_fold{k}.txt'))
    with open(MODELS / f'meta_fold{k}.json','w') as f_:
        json.dump({'coef': meta.coef_[0].tolist(),
                   'intercept': float(meta.intercept_[0])}, f_)

print('\n[4/6] Aggregate comparison...')
agg = {}
for key in ['auc_xgb','auc_lgbm','auc_avg','auc_meta','wr_xgb','wr_lgbm','wr_avg','wr_meta']:
    agg[key] = round(float(np.mean([f[key] for f in fold_results])),4)

# Best model
best = max([('xgb',agg['auc_xgb']), ('lgbm',agg['auc_lgbm']),
            ('avg',agg['auc_avg']), ('meta',agg['auc_meta'])], key=lambda x: x[1])
agg['best_model'] = best[0]
agg['best_auc'] = best[1]
print(f'  Best: {best[0]} (AUC={best[1]:.4f})')

print('\n[5/6] Saving predictions (meta-based)...')
# Re-train base models per fold and save ALL test predictions using meta
all_preds = []
for f in folds:
    k = f['fold']; te = f['test']
    Xtr, ytr = f['train'][feat_cols].values, f['train']['label'].values
    Xte = te[feat_cols].values
    mx = xgb.XGBClassifier(**xgb_params); mx.fit(Xtr, ytr, verbose=False)
    ml = lgb.LGBMClassifier(**lgb_params); ml.fit(Xtr, ytr)
    px = mx.predict_proba(Xte)[:,1]; pl = ml.predict_proba(Xte)[:,1]
    meta_X = np.column_stack([px, pl])
    # Load trained meta
    with open(MODELS / f'meta_fold{k}.json') as f_:
        mj = json.load(f_)
    w = np.array(mj['coef']); b = mj['intercept']
    z = meta_X @ w + b
    p_meta = 1 / (1 + np.exp(-z))
    p_avg = (px + pl) / 2

    p = te[['symbol','date','close','label','future_ret_5d']].copy()
    p['prob_xgb'] = px
    p['prob_lgbm'] = pl
    p['prob_avg'] = p_avg
    p['prob_meta'] = p_meta
    p['fold'] = k
    all_preds.append(p)

ap = pd.concat(all_preds, ignore_index=True)
ap.to_parquet(OUT / 'predictions.parquet', index=False)
print(f'  {len(ap):,} rows saved')

print('\n[6/6] Saving metrics...')
metrics = {
    'step': '11',
    'model': 'Stacking (XGB + LGBM + LogReg meta)',
    'threshold_label': THRESHOLD_LABEL,
    'threshold_buy': THRESHOLD_BUY,
    'positive_rate': round(float(pos_rate),4),
    'n_rows': len(df),
    'n_features': len(feat_cols),
    'feature_names': feat_cols,
    'aggregate': agg,
    'folds': fold_results,
}
with open(OUT / 'metrics.json','w',encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print('COMPARISON:')
print(f"  XGB only:  AUC={agg['auc_xgb']:.4f}  WR={agg['wr_xgb']:.1%}")
print(f"  LGBM only: AUC={agg['auc_lgbm']:.4f}  WR={agg['wr_lgbm']:.1%}")
print(f"  Average:   AUC={agg['auc_avg']:.4f}  WR={agg['wr_avg']:.1%}")
print(f"  Meta:      AUC={agg['auc_meta']:.4f}  WR={agg['wr_meta']:.1%}")
print(f"  WINNER:    {agg['best_model']}")
print('=' * 65)
