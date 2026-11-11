"""Feature builder - Step 5.2: 30 technical indicators."""
import json, gzip
import pandas as pd
import numpy as np
from pathlib import Path
from features.technical import build_technical_features, FEATURE_NAMES

DATA = Path('data')
OUT = Path('outputs')
OUT.mkdir(exist_ok=True)

print('=' * 55)
print('TSE.Engine Feature Builder - Step 5.2')
print('=' * 55)

# 1. Load
print('\n[1/5] Loading data...')
with gzip.open(DATA / 'all_history.json.gz', 'rb') as f:
    history = json.loads(f.read().decode('utf-8'))
print(f'  ✅ {len(history)} stocks')

# 2. Build features per stock
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
        
        df = pd.DataFrame(rows)
        # Reverse: rows are new->old, need old->new
        df = df.iloc[::-1].reset_index(drop=True)
        
        feats = build_technical_features(df)
        feats['symbol'] = sym
        feats['date'] = df['d'].values
        feats['close'] = df['c'].values.astype(float)
        
        all_dfs.append(feats)
        
        if i % 100 == 0:
            print(f'  {i}/{len(history)} stocks processed...')
    except Exception as e:
        errors.append({'sym': sym, 'err': str(e)[:100]})

print(f'  ✅ Processed: {len(all_dfs)} stocks')
print(f'  ⏭  Skipped (<250 days): {skipped}')
print(f'  ❌ Errors: {len(errors)}')

# 3. Combine
print('\n[3/5] Combining...')
combined = pd.concat(all_dfs, ignore_index=True)
print(f'  Rows: {len(combined):,}')

# 4. Drop warmup NaN (EMA200 needs 200 days)
print('\n[4/5] Dropping warmup rows (need 200 days for EMA200)...')
before = len(combined)
combined = combined.dropna(subset=['EMA200']).reset_index(drop=True)
print(f'  Before: {before:,}')
print(f'  After:  {len(combined):,}')
print(f'  Dropped: {before - len(combined):,}')

# 5. Save
print('\n[5/5] Saving...')
combined.to_parquet(OUT / 'features.parquet', index=False)
size_mb = (OUT / 'features.parquet').stat().st_size / 1e6
print(f'  ✅ features.parquet ({size_mb:.1f} MB)')

# Summary
summary = {
    'step': '5.2',
    'stocks_processed': len(all_dfs),
    'stocks_skipped': skipped,
    'errors': len(errors),
    'total_rows_raw': before,
    'total_rows_final': len(combined),
    'features': len(FEATURE_NAMES),
    'output_size_mb': round(size_mb, 2),
    'date_range': {
        'min': int(combined['date'].min()),
        'max': int(combined['date'].max()),
    },
}
with open(OUT / 'summary.json', 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 55)
print('✅ DONE')
print('=' * 55)
print(f'  Stocks:   {len(all_dfs)}')
print(f'  Rows:     {len(combined):,}')
print(f'  Features: {len(FEATURE_NAMES)}')
print(f'  Size:     {size_mb:.1f} MB')
print(f'  Date:     {summary["date_range"]["min"]} -> {summary["date_range"]["max"]}')

if errors:
    print(f'\n  ⚠️  First 3 errors:')
    for e in errors[:3]:
        print(f'    {e["sym"]}: {e["err"]}')
