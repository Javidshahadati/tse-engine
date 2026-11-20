"""Ensemble 20d+60d final"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import f1_score
from scipy.stats import spearmanr

OUT = Path("javid_v3")
COST = 0.008 + 2*0.005
MAX_FUT = 1.0; MIN_FUT = -0.80

def train_and_score(tr, te, feat_cols, label_days, days):
    y_tr = (tr.groupby('symbol')['close'].shift(-days) / tr['close'] - 1)
    # label از future_ret که در prepare ساخته شده
    reg = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
    reg.fit(tr[feat_cols].values, label_days.values, verbose=False)
    return reg.predict(te[feat_cols].values)

def run(horizon):
    days = int(horizon.replace('d', ''))
    df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
    df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
    df['future_ret'] = df.groupby('symbol')['close'].shift(-days) / df['close'] - 1
    df = df.dropna(subset=['future_ret']).reset_index(drop=True)
    df = df[(df['future_ret'] <= MAX_FUT) & (df['future_ret'] >= MIN_FUT)].reset_index(drop=True)
    df = df[df['Volume_ratio'] > 0.1].reset_index(drop=True)
    df['rank_pct'] = df.groupby('date')['future_ret'].rank(pct=True) * 100
    with open(OUT / 'summary_v3_20d.json') as f:
        feat_cols = [c for c in json.load(f)['feature_names'] if c in df.columns]
    df = df.sort_values('date').reset_index(drop=True)
    udates = sorted(df['date'].unique()); n = len(udates)
    split = udates[int(n*0.7)]
    tr = df[df['date'] < split]; te = df[df['date'] >= split].copy()
    return tr, te, feat_cols

tr20, te20, fc20 = run('20d')
tr60, te60, fc60 = run('60d')
print(f"Test 20d: {len(te20):,} | Test 60d: {len(te60):,}")

# Train models
m20 = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
m20.fit(tr20[fc20].values, tr20['rank_pct'].values, verbose=False)
te20['score'] = m20.predict(te20[fc20].values)

m60 = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
m60.fit(tr60[fc60].values, tr60['rank_pct'].values, verbose=False)
te60['score'] = m60.predict(te60[fc60].values)

# Ensemble: merge on symbol+date
merged = te20[['symbol','date','close','score','rank_pct','future_ret']].merge(
    te60[['symbol','date','score']], on=['symbol','date'], suffixes=('_20','_60'), how='inner')
print(f"Merged: {len(merged):,}")
merged['score_ens'] = 0.5*merged['score_20'] + 0.5*merged['score_60']

ic20, _ = spearmanr(merged['score_20'], merged['rank_pct'])
ic60, _ = spearmanr(merged['score_60'], merged['rank_pct'])
icens, _ = spearmanr(merged['score_ens'], merged['rank_pct'])
print(f"\nIC: 20d={ic20:.4f} | 60d={ic60:.4f} | ENSEMBLE={icens:.4f}")

print("\n=== Backtest (on merged dataset) ===")
res = {}
for label, col in [('20d', 'score_20'), ('60d', 'score_60'), ('ens', 'score_ens')]:
    print(f"\n[{label}]")
    r = {}
    for top in [0.10, 0.20, 0.30]:
        merged['rk'] = merged.groupby('date')[col].rank(pct=True, ascending=False)
        picks = merged[merged['rk'] <= top]
        gross = picks['future_ret'].mean(); net = gross - COST
        hit = (picks['future_ret'] > 0).mean()
        print(f"  Top {int(top*100)}%: n={len(picks):,} net={net:+.2%} hit={hit:.1%}")
        r[f'top_{int(top*100)}'] = {'n': len(picks), 'net': float(net), 'hit': float(hit)}
    mkt = merged.groupby('date')['future_ret'].mean().mean()
    print(f"  Market: {mkt:+.2%}")
    r['market'] = float(mkt)
    res[label] = r

res['ic'] = {'20d': float(ic20), '60d': float(ic60), 'ensemble': float(icens)}
with open(OUT / 'ensemble_v3.json', 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
print("\n✅ DONE")
