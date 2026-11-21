"""Predict today - memory efficient (20d only)"""
import json, gzip, gc
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from datetime import datetime

OUT = Path("javid_v3")
PUB = Path("public/data"); PUB.mkdir(exist_ok=True, parents=True)

with open(OUT / 'summary_v3_20d.json') as f:
    summary = json.load(f)

feat_cols_20d = [c for c in summary['feature_names']
                 if not (c.startswith('flow_') or c.startswith('market_') or
                         c.startswith('sector_idx_') or c.startswith('stock_vs_market') or
                         c.startswith('stock_vs_sector_idx') or
                         c in ['smart_money','retail_dominance',
                               'is_bull_market','is_bear_market','is_sideways'])]
print(f"Features: {len(feat_cols_20d)}")

# Load only columns needed + date/symbol/close
cols_to_load = ['symbol','date','close'] + [c for c in feat_cols_20d if c != 'close']
df = pd.read_parquet(OUT / 'features_v3_20d.parquet', columns=cols_to_load)
df = df.sort_values(['symbol','date']).reset_index(drop=True)
last_date = df['date'].max()
print(f"Latest date: {last_date}")

today_df = df[df['date'] == last_date].copy().reset_index(drop=True)
print(f"Stocks today: {len(today_df)}")
del df; gc.collect()

avail_20 = [c for c in feat_cols_20d if c in today_df.columns]
X = today_df[avail_20].values.astype(np.float32)
print(f"X shape: {X.shape}")

m20 = xgb.XGBRegressor()
m20.load_model(str(OUT / 'model_v3_20d_reg.json'))
m20.set_params(n_jobs=2)
pred = m20.predict(X)
del m20; gc.collect()

today_df['score'] = pred
today_df['rank'] = today_df['score'].rank(pct=True) * 100

result = {}
for _, r in today_df.iterrows():
    sym = r['symbol'].split('_seg')[0]
    if sym in result: continue
    result[sym] = {
        'symbol': sym,
        'rank_20d': round(float(r['rank']), 1),
        'score_20d': round(float(r['score']), 2),
        'signal_20d': 'UP' if r['rank'] >= 65 else ('DOWN' if r['rank'] <= 35 else 'NEUTRAL'),
        'date': int(last_date),
    }

sorted_preds = dict(sorted(result.items(), key=lambda x: -x[1]['rank_20d']))
with open(PUB / 'predictions_v3.json', 'w', encoding='utf-8') as f:
    json.dump({
        'generated_at': datetime.utcnow().isoformat(),
        'date': int(last_date),
        'version': 'v3-20d',
        'total': len(sorted_preds),
        'predictions': sorted_preds,
    }, f, ensure_ascii=False, indent=2)
print(f"✅ Saved {len(sorted_preds)} predictions")
print("\nTop 10:")
for sym, d in list(sorted_preds.items())[:10]:
    print(f"  {sym}: rank={d['rank_20d']} {d['signal_20d']}")
