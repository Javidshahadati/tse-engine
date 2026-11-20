"""Backtest v3 - regression score top-N"""
import json, os
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import roc_auc_score
from scipy.stats import spearmanr

OUT = Path("javid_v3")
INITIAL = 1_000_000
COMMISSION = 0.008  # 0.8% round-trip
SLIPPAGE = 0.005
COST = COMMISSION + 2*SLIPPAGE
TDPY = 252

def run_backtest(horizon):
    days = int(horizon.replace('d', ''))
    df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
    df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
    df['future_ret'] = df.groupby('symbol')['close'].shift(-days) / df['close'] - 1
    df = df.dropna(subset=['future_ret']).reset_index(drop=True)
    df['rank_pct'] = df.groupby('date')['future_ret'].rank(pct=True) * 100
    df['weight'] = np.abs(df['rank_pct'] - 50) / 50 + 0.3
    with open(OUT / 'summary_v3_20d.json') as f:
        feat_cols = [c for c in json.load(f)['feature_names'] if c in df.columns]

    df = df.sort_values('date').reset_index(drop=True)
    udates = sorted(df['date'].unique()); n = len(udates)
    split = udates[int(n*0.7)]
    tr = df[df['date'] < split]; te = df[df['date'] >= split].copy()

    reg = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist',
        n_jobs=-1, random_state=42)
    reg.fit(tr[feat_cols].values, tr['rank_pct'].values,
            sample_weight=tr['weight'].values, verbose=False)

    te['score'] = reg.predict(te[feat_cols].values)
    ic, _ = spearmanr(te['score'], te['rank_pct'])
    auc = roc_auc_score((te['rank_pct'] > 50).astype(int), te['score'])
    print(f"\n[{horizon}] Test: {len(te):,} rows | IC={ic:.4f} | AUC={auc:.4f}")

    results = {}
    for top_pct in [0.10, 0.20, 0.30]:
        te_d = te.dropna(subset=['future_ret']).copy()
        te_d['rank_in_day'] = te_d.groupby('date')['score'].rank(pct=True, ascending=False)
        picks = te_d[te_d['rank_in_day'] <= top_pct]
        if len(picks) == 0: continue
        gross = picks['future_ret'].mean()
        net = gross - COST
        hit = (picks['future_ret'] > 0).mean()
        best = picks['future_ret'].max(); worst = picks['future_ret'].min()
        print(f"  Top {int(top_pct*100)}%: n={len(picks):,} | ret={gross:+.2%} | net={net:+.2%} | hit={hit:.1%}")
        print(f"            best={best:+.2%} worst={worst:+.2%}")
        results[f'top_{int(top_pct*100)}'] = {
            'n': len(picks), 'gross_ret': float(gross), 'net_ret': float(net),
            'hit_rate': float(hit), 'best': float(best), 'worst': float(worst)
        }

    # Buy-and-hold benchmark
    mkt_ret = te.groupby('date')['future_ret'].mean()
    print(f"  Market avg: {mkt_ret.mean():+.2%}")
    results['market'] = {'avg_ret': float(mkt_ret.mean())}
    return {'horizon': horizon, 'ic': float(ic), 'auc': float(auc), 'results': results}

all_res = {}
for h in ['20d', '60d']:
    all_res[h] = run_backtest(h)

with open(OUT / 'backtest_v3.json', 'w', encoding='utf-8') as f:
    json.dump(all_res, f, ensure_ascii=False, indent=2)
print("\n✅ DONE")
