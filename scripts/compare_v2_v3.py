"""Fair compare: v2-style (binary 5d) vs v3-style (regression 20d)"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import f1_score, roc_auc_score
from scipy.stats import spearmanr

OUT = Path("javid_v3")
COST = 0.008 + 2*0.005
MAX_FUT = 1.0; MIN_FUT = -0.80

df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
# ساخت label برای هر دو افق
df['ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['ret_20d'] = df.groupby('symbol')['close'].shift(-20) / df['close'] - 1
df = df.dropna(subset=['ret_5d', 'ret_20d']).reset_index(drop=True)
df = df[(df['ret_5d'] <= MAX_FUT) & (df['ret_5d'] >= MIN_FUT)].reset_index(drop=True)
df = df[df['Volume_ratio'] > 0.1].reset_index(drop=True)

# labels
df['label_v2'] = (df['ret_5d'] > 0.017).astype(int)
df['rank_v3'] = df.groupby('date')['ret_20d'].rank(pct=True) * 100
df['weight_v3'] = np.abs(df['rank_v3'] - 50) / 50 + 0.3

with open(OUT / 'summary_v3_20d.json') as f:
    feat_cols = [c for c in json.load(f)['feature_names'] if c in df.columns]

df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
split = udates[int(n*0.7)]
tr = df[df['date'] < split]; te = df[df['date'] >= split].copy()
print(f"Train: {len(tr):,} | Test: {len(te):,} | Features: {len(feat_cols)}")

# ── v2-style: binary 5-day ──
print("\n=== V2-STYLE (binary 5d) ===")
pos_rate = tr['label_v2'].mean()
m_v2 = xgb.XGBClassifier(
    n_estimators=300, max_depth=5, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, tree_method='hist',
    objective='binary:logistic', scale_pos_weight=(1-pos_rate)/pos_rate,
    n_jobs=-1, random_state=42)
m_v2.fit(tr[feat_cols].values, tr['label_v2'].values, verbose=False)
te['prob_v2'] = m_v2.predict_proba(te[feat_cols].values)[:, 1]

auc_v2 = roc_auc_score(te['label_v2'], te['prob_v2'])
print(f"  AUC(5d)={auc_v2:.4f}")

# backtest با top-10% بر اساس prob
for top in [0.10, 0.20, 0.30]:
    te['rk'] = te.groupby('date')['prob_v2'].rank(pct=True, ascending=False)
    picks = te[te['rk'] <= top]
    gross_5 = picks['ret_5d'].mean(); net_5 = gross_5 - COST
    hit_5 = (picks['ret_5d'] > 0).mean()
    print(f"  Top {int(top*100)}% | 5d: ret={gross_5:+.2%} net={net_5:+.2%} hit={hit_5:.1%}")

# ── v3-style: regression 20d ──
print("\n=== V3-STYLE (regression 20d) ===")
m_v3 = xgb.XGBRegressor(
    n_estimators=300, max_depth=5, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, tree_method='hist',
    n_jobs=-1, random_state=42)
m_v3.fit(tr[feat_cols].values, tr['rank_v3'].values,
         sample_weight=tr['weight_v3'].values, verbose=False)
te['score_v3'] = m_v3.predict(te[feat_cols].values)

ic_v3, _ = spearmanr(te['score_v3'], te['rank_v3'])
print(f"  IC(20d)={ic_v3:.4f}")

for top in [0.10, 0.20, 0.30]:
    te['rk'] = te.groupby('date')['score_v3'].rank(pct=True, ascending=False)
    picks = te[te['rk'] <= top]
    gross_20 = picks['ret_20d'].mean(); net_20 = gross_20 - COST
    hit_20 = (picks['ret_20d'] > 0).mean()
    print(f"  Top {int(top*100)}% | 20d: ret={gross_20:+.2%} net={net_20:+.2%} hit={hit_20:.1%}")

# benchmarks
mkt_5 = te.groupby('date')['ret_5d'].mean().mean()
mkt_20 = te.groupby('date')['ret_20d'].mean().mean()
print(f"\nMarket 5d: {mkt_5:+.2%} | Market 20d: {mkt_20:+.2%}")

# ذخیره
result = {
    'v2_style': {'auc': float(auc_v2), 'market_5d': float(mkt_5)},
    'v3_style': {'ic': float(ic_v3), 'market_20d': float(mkt_20)},
    'note': 'v2 predicts 5d binary, v3 predicts 20d rank. Metrics not directly comparable.',
}
with open(OUT / 'compare_v2_v3.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("\n✅ DONE")
