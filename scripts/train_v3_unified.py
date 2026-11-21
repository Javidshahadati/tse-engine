"""Train v3 - excludes flow features (54 features)"""
import json, os
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import f1_score
from scipy.stats import spearmanr

HORIZON = os.environ.get('HORIZON', '20d')
DAYS = int(HORIZON.replace('d', ''))
OUT = Path("javid_v3")

FLOW_FEATURES = ['flow_ratio_5d','flow_ratio_20d','flow_momentum','smart_money','retail_dominance']

df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
df['future_ret'] = df.groupby('symbol')['close'].shift(-DAYS) / df['close'] - 1
df = df.dropna(subset=['future_ret']).reset_index(drop=True)
df['rank_pct'] = df.groupby('date')['future_ret'].rank(pct=True) * 100
df['weight'] = np.abs(df['rank_pct'] - 50) / 50 + 0.3

with open(OUT / 'summary_v3_20d.json') as f:
    feat_cols = [c for c in json.load(f)['feature_names']
                 if c in df.columns and c not in FLOW_FEATURES]
print(f"Horizon: {HORIZON} | Rows: {len(df):,} | Features: {len(feat_cols)}")

df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.6, 0.7, 0.8, 0.9]]
tests = [(bounds[i], bounds[i+1] if i+1 < len(bounds) else udates[-1]+1) for i in range(len(bounds))]

THRESHOLDS = [(55,45),(60,40),(65,35),(70,30),(75,25)]
oof_p, oof_true, fold_results = [], [], []

for k, (s, e) in enumerate(tests, 1):
    tr = df[df['date'] < s]; te = df[(df['date'] >= s) & (df['date'] < e)]
    if len(te) < 100: continue
    X_tr = tr[feat_cols].values; X_te = te[feat_cols].values
    y_te = te['rank_pct'].values

    reg = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
    reg.fit(X_tr, tr['rank_pct'].values, sample_weight=tr['weight'].values, verbose=False)
    p = reg.predict(X_te)
    ic, _ = spearmanr(p, y_te)
    oof_p.extend(p.tolist()); oof_true.extend(y_te.tolist())
    print(f"Fold {k}: n={len(te):,} IC={ic:.4f}")
    fold_results.append({'fold': k, 'n': len(te), 'ic': float(ic)})

overall_ic, _ = spearmanr(oof_p, oof_true)
print(f"\nOverall OOF IC: {overall_ic:.4f}")

oof_p = np.array(oof_p); oof_true = np.array(oof_true)
print("\n=== Threshold Sweep ===")
thr_results = []
for up, dn in THRESHOLDS:
    yt = np.where(oof_true >= up, 2, np.where(oof_true <= dn, 0, 1))
    yp = np.where(oof_p >= up, 2, np.where(oof_p <= dn, 0, 1))
    f1 = f1_score(yt, yp, average='macro'); acc = (yt == yp).mean()
    print(f"  {up}/{dn}: F1={f1:.4f} Acc={acc:.4f}")
    thr_results.append({'up': up, 'down': dn, 'f1': float(f1), 'acc': float(acc)})

best = max(thr_results, key=lambda x: x['f1'])
print(f"\nBEST: {best['up']}/{best['down']} F1={best['f1']:.4f}")

reg_final = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
reg_final.fit(df[feat_cols].values, df['rank_pct'].values,
              sample_weight=df['weight'].values, verbose=False)
reg_final.save_model(str(OUT / f'model_v3_{HORIZON}_reg.json'))

metrics = {'horizon': HORIZON, 'n_features': len(feat_cols),
           'folds': fold_results, 'overall_ic': float(overall_ic),
           'threshold_sweep': thr_results,
           'best': {'up': best['up'], 'down': best['down'], 'f1': best['f1']}}
with open(OUT / f'metrics_v3_{HORIZON}.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
print(f"✅ DONE {HORIZON}")
