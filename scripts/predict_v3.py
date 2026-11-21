"""Generate predictions_v3.json for today"""
import json, gzip
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

df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
last_date = df['date'].max()
print(f"Latest date: {last_date}")
today_df = df[df['date'] == last_date].copy()
print(f"Stocks today: {len(today_df)}")

# Load 20d model
m20 = xgb.XGBRegressor()
m20.load_model(str(OUT / 'model_v3_20d_reg.json'))

avail_20 = [c for c in feat_cols_20d if c in today_df.columns]
pred_20 = m20.predict(today_df[avail_20].values)

# Convert score → rank_pct (0-100)
today_df['score_20d'] = pred_20
today_df['rank_20d'] = today_df['score_20d'].rank(pct=True) * 100

# 60d model if exists
pred_60 = None
m60_path = OUT / 'model_v3_60d_reg.json'
if m60_path.exists():
    m60 = xgb.XGBRegressor()
    m60.load_model(str(m60_path))
    avail_60 = [c for c in summary['feature_names'] if c in today_df.columns
                and c not in ['flow_ratio_5d','flow_ratio_20d','flow_momentum','smart_money','retail_dominance']]
    pred_60 = m60.predict(today_df[avail_60].values)
    today_df['rank_60d'] = pd.Series(pred_60).rank(pct=True).values * 100

result = {}
for _, r in today_df.iterrows():
    sym = r['symbol'].split('_seg')[0]
    if sym in result: continue
    entry = {
        'symbol': sym,
        'rank_20d': round(float(r['rank_20d']), 1),
        'score_20d': round(float(r['score_20d']), 2),
        'signal_20d': 'UP' if r['rank_20d'] >= 65 else ('DOWN' if r['rank_20d'] <= 35 else 'NEUTRAL'),
        'date': int(last_date),
    }
    if 'rank_60d' in r and not pd.isna(r['rank_60d']):
        entry['rank_60d'] = round(float(r['rank_60d']), 1)
        entry['signal_60d'] = 'UP' if r['rank_60d'] >= 65 else ('DOWN' if r['rank_60d'] <= 35 else 'NEUTRAL')
    result[sym] = entry

# Sorted by rank_20d
sorted_preds = dict(sorted(result.items(), key=lambda x: -x[1]['rank_20d']))
with open(PUB / 'predictions_v3.json', 'w', encoding='utf-8') as f:
    json.dump({
        'generated_at': datetime.utcnow().isoformat(),
        'date': int(last_date),
        'version': 'v3',
        'horizons': ['20d', '60d'],
        'total': len(sorted_preds),
        'predictions': sorted_preds,
    }, f, ensure_ascii=False, indent=2)

print(f"✅ Saved {len(sorted_preds)} predictions to public/data/predictions_v3.json")
top10 = list(sorted_preds.items())[:10]
print("\nTop 10 (20d):")
for sym, d in top10:
    print(f"  {sym}: rank={d['rank_20d']} signal={d['signal_20d']}")
