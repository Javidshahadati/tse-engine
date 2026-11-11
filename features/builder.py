"""Feature builder - Step 5.3: + RTM + Price Action (60 features total)."""
import json, gzip
import pandas as pd
import numpy as np
from pathlib import Path
from features.technical import build_technical_features, FEATURE_NAMES as TECH_FEATS
from features.rtm import build_rtm_features
from features.price_action import build_pa_features, FEATURE_NAMES as PA_FEATS

DATA = Path('data')
OUT = Path('outputs')
OUT.mkdir(exist_ok=True)

RTM_FEATS = ['BOS_Bull', 'BOS_Bear', 'CHoCH_Bull', 'CHoCH_Bear', 'FVG_Bull', 'FVG_Bear']
ALL_FEATS = TECH_FEATS + RTM_FEATS + PA_FEATS

print('=' * 55)
print('TSE.Engine Feature Builder - Step 5.3')
print(f'Expected features: {len(ALL_FEATS)}')
print('=' * 55)

print('\n[1/5] Loading...')
with gzip.open(DATA / 'all_history.json.gz', 'rb') as f:
    history = json.loads(f.read().decode('utf-8'))
print(f'  ✅ {len(history)} stocks')

print('\n[2/5] Building features...')
all_dfs = []
skipped = 0
errors = []

for i, (sym, stock) in enumerate(history.items(), 1):
    try:
        rows = stock.get('r', [])
        if len(rows) < 250:
            skipped += 1
            continue

        df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)

        tech = build_technical_features(df)
        rtm = build_rtm_features(df)
        pa = build_pa_features(df)

        combined = pd.concat([tech, rtm, pa], axis=1)
        combined['symbol'] = sym
        combined['date'] = df['d'].values
        combined['close'] = df['c'].values.astype(float)
        all_dfs.append(combined)

        if i % 100 == 0:
            print(f'  {i}/{len(history)}...')
    except Exception as e:
        errors.append({'sym': sym, 'err': str(e)[:100]})

print(f'  ✅ Processed: {len(all_dfs)}')
print(f'  ⏭  Skipped: {skipped}')
print(f'  ❌ Errors: {len(errors)}')

print('\n[3/5] Combining...')
combined = pd.concat(all_dfs, ignore_index=True)
before = len(combined)
print(f'  Rows: {before:,}')

print('\n[4/5] Dropping warmup (EMA200)...')
combined = combined.dropna(subset=['EMA200']).reset_index(drop=True)
print(f'  After: {len(combined):,} (dropped {before - len(combined):,})')

# Fill remaining NaN with 0
feat_cols = [c for c in combined.columns if c not in ['symbol', 'date', 'close']]
nan_before = combined[feat_cols].isna().sum().sum()
combined[feat_cols] = combined[feat_cols].fillna(0)
print(f'  Filled NaN: {nan_before:,}')

print('\n[5/5] Saving...')
combined.to_parquet(OUT / 'features.parquet', index=False)
size_mb = (OUT / 'features.parquet').stat().st_size / 1e6
print(f'  ✅ features.parquet ({size_mb:.1f} MB)')

summary = {
    'step': '5.3',
    'stocks_processed': len(all_dfs),
    'stocks_skipped': skipped,
    'errors': len(errors),
    'total_rows': len(combined),
    'features': len(ALL_FEATS),
    'feature_names': ALL_FEATS,
    'output_size_mb': round(size_mb, 2),
    'date_range': {'min': int(combined['date'].min()), 'max': int(combined['date'].max())},
}
with open(OUT / 'summary.json', 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 55)
print('✅ DONE')
print('=' * 55)
print(f'  Stocks:   {len(all_dfs)}')
print(f'  Rows:     {len(combined):,}')
print(f'  Features: {len(ALL_FEATS)}')
print(f'  Size:     {size_mb:.1f} MB')
