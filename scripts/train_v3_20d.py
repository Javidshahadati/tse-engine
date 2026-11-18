"""Train v3 - 20d - Regression + 3-class"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import f1_score
from scipy.stats import spearmanr

OUT = Path("javid_v3")
THRESHOLD_UP = 65
THRESHOLD_DOWN = 35

df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
df = df.sort_values(['symbol', 'date']).reset_index(drop=True)

df['future_ret_20d'] = df.groupby('symbol')['close'].shift(-20) / df['close'] - 1
df['label_end_date'] = df.groupby('symbol')['date'].shift(-20)
df = df.dropna(subset=['future_ret_20d', 'label_end_date']).reset_index(drop=True)
df['rank_pct'] = df.groupby('date')['future_ret_20d'].rank(pct=True) * 100
df['label_3'] = np.where(df['rank_pct'] >= THRESHOLD_UP, 2,
                  np.where(df['rank_pct'] <= THRESHOLD_DOWN, 0, 1))
df['weight'] = np.abs(df['rank_pct'] - 50) / 50 + 0.3

with open(OUT / 'summary_v3_20d.json') as f:
    summary = json.load(f)
feat_cols = [c for c in summary['feature_names'] if c in df.columns]
print(f"Rows: {len(df):,} | Features: {len(feat_cols)}")
print(f"Class dist: {df['label_3'].value_counts().to_dict()}")

df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique())
n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.6, 0.7, 0.8, 0.9]]
tests = [(bounds[i], bounds[i+1] if i+1 < len(bounds) else udates[-1]+1) for i in range(len(bounds))]

results = []
clf = None
reg = None
for k, (s, e) in enumerate(tests, 1):
    raw_tr = df[df['date'] < s]
    tr = raw_tr[raw_tr['label_end_date'] < s]
    te = df[(df['date'] >= s) & (df['date'] < e)]
    purged_n = len(raw_tr) - len(tr)
    print(f'  Purged: {purged_n:,} | Remaining train: {len(tr):,}')
    if len(te) < 100 or len(tr) < 100: continue
    X_tr = tr[feat_cols].values; X_te = te[feat_cols].values
    w_tr = tr['weight'].values

    reg = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
    reg.fit(X_tr, tr['rank_pct'].values, sample_weight=w_tr, verbose=False)
    p_reg = reg.predict(X_te)
    ic, _ = spearmanr(p_reg, te['rank_pct'].values)

    clf = xgb.XGBClassifier(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist',
        objective='multi:softprob', num_class=3, n_jobs=-1, random_state=42)
    clf.fit(X_tr, tr['label_3'].values, sample_weight=w_tr, verbose=False)
    p_clf = clf.predict(X_te)
    f1 = f1_score(te['label_3'].values, p_clf, average='macro')
    acc = (p_clf == te['label_3'].values).mean()

    print(f"Fold {k}: n={len(te):,} | IC={ic:.4f} | F1={f1:.4f} | Acc={acc:.4f}")
    results.append({'fold': k, 'test_n': len(te), 'ic': float(ic), 'f1': float(f1), 'acc': float(acc)})

if reg: reg.save_model(str(OUT / 'model_v3_reg.json'))
if clf: clf.save_model(str(OUT / 'model_v3_clf.json'))

metrics = {
    'horizon': '20d', 'n_folds': len(results), 'folds': results,
    'avg_ic': round(float(np.mean([r['ic'] for r in results])), 4),
    'avg_f1': round(float(np.mean([r['f1'] for r in results])), 4),
    'avg_acc': round(float(np.mean([r['acc'] for r in results])), 4),
}
with open(OUT / 'metrics_v3_20d.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
print(f"\n=== Avg IC: {metrics['avg_ic']} | F1: {metrics['avg_f1']} | Acc: {metrics['avg_acc']} ===")
