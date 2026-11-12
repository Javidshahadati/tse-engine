"""DIAGNOSTIC: train only on 64 safe features (no imports from features/)."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path('outputs')

# Safe feature names (hardcoded, no import needed)
SAFE_FEATURES = [
    # technical (30)
    'RSI','RSI_slope','MACD','MACD_Sig','MACD_Hist','MACD_slope',
    'EMA20','EMA50','EMA200','SMA20','BB_pct','BB_width','ATR_pct',
    'Stoch','Stoch_D','WillR','CCI','MFI','OBV_slope','ADX',
    'Return_1d','Return_5d','Return_20d','Volatility_20d',
    'Price_EMA50_ratio','Price_EMA200_ratio','Volume_ratio',
    'High_Low_range','Close_Open','Gap',
    # rtm (6)
    'BOS_Bull','BOS_Bear','CHoCH_Bull','CHoCH_Bear','FVG_Bull','FVG_Bear',
    # price action (28)
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
THRESHOLD_BUY = 0.60

print('=' * 60)
print(f'DIAGNOSTIC: 64 safe features (no structural, no CS)')
print('=' * 60)

print('\n[1/4] Loading features.parquet...')
df = pd.read_parquet(OUT / 'features.parquet')
print(f'  Total: {len(df):,} rows, {df["symbol"].nunique()} stocks')

df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)

feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
missing = [f for f in SAFE_FEATURES if f not in df.columns]

print(f'  Features used: {len(feat_cols)} / {len(SAFE_FEATURES)}')
if missing:
    print(f'  Missing: {missing}')

pos_rate = df['label'].mean()
print(f'  Positive rate: {pos_rate:.2%}')
print(f'  Rows after label: {len(df):,}')

print('\n[2/4] Walk-forward folds...')
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy()
    te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')

print('\n[3/4] Training XGBoost (64 features)...')
xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}

fold_metrics = []
for f in folds:
    k = f['fold']; print(f'  Fold {k}...', end=' ', flush=True)
    Xtr = f['train'][feat_cols].values; ytr = f['train']['label'].values
    Xte = f['test'][feat_cols].values; yte = f['test']['label'].values
    m = xgb.XGBClassifier(**xgb_params); m.fit(Xtr, ytr, verbose=False)
    ptr = m.predict_proba(Xtr)[:,1]; pte = m.predict_proba(Xte)[:,1]
    auc_tr = roc_auc_score(ytr, ptr); auc_te = roc_auc_score(yte, pte)
    sig = pte > THRESHOLD_BUY; ns = int(sig.sum())
    if ns > 0:
        sr = f['test']['future_ret_5d'].values[sig]; sl = yte[sig]
        wr = sl.mean(); ar = sr.mean()
    else: wr=ar=0
    fm = {
        'fold': k, 'train_size': len(ytr), 'test_size': len(yte),
        'auc_train': round(float(auc_tr),4), 'auc_test': round(float(auc_te),4),
        'auc_gap': round(float(auc_tr-auc_te),4),
        'n_signals': ns, 'winrate': round(float(wr),4),
        'avg_return': round(float(ar),4),
    }
    fold_metrics.append(fm)
    print(f'AUC_te={auc_te:.3f} gap={auc_tr-auc_te:.3f} signals={ns} wr={wr:.1%}')

print('\n[4/4] Summary...')
mean_gap = float(np.mean([f['auc_gap'] for f in fold_metrics]))
mean_auc = float(np.mean([f['auc_test'] for f in fold_metrics]))
total_signals = sum(f['n_signals'] for f in fold_metrics)

verdict = (
    'LEAK_IN_STRUCTURAL_OR_CS' if mean_gap < 0.08
    else 'LEAK_ALSO_IN_SAFE_FEATURES' if mean_gap < 0.15
    else 'SEVERE_OVERFIT_OR_LABEL_ISSUE'
)

result = {
    'diagnostic': 'scenario_A_64_features',
    'features_count': len(feat_cols),
    'features_used': feat_cols,
    'missing_features': missing,
    'n_rows': len(df),
    'positive_rate': round(float(pos_rate),4),
    'mean_auc_test': round(mean_auc,4),
    'mean_auc_gap': round(mean_gap,4),
    'total_signals': total_signals,
    'folds': fold_metrics,
    'verdict': verdict,
}
with open(OUT / 'metrics_diag.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print('=' * 60)
print(f'  Mean AUC test:  {mean_auc:.4f}')
print(f'  Mean AUC gap:   {mean_gap:.4f}  ← KEY METRIC')
print(f'  Total signals:  {total_signals:,}')
print(f'  VERDICT: {verdict}')
print('=' * 60)
