"""Feature builder - Step 8 (post-leak-fix): 103 features."""
import json, gzip
import pandas as pd
import numpy as np
from pathlib import Path
from features.technical import build_technical_features, FEATURE_NAMES as TECH_F
from features.rtm import build_rtm_features
from features.price_action import build_pa_features, FEATURE_NAMES as PA_F
from features.structural import build_structural_features, FEATURE_NAMES as STR_F
from features.cross_sectional import build_cross_sectional, FEATURE_NAMES as CS_F

DATA = Path('data'); OUT = Path('outputs'); OUT.mkdir(exist_ok=True)
RTM_F = ['BOS_Bull','BOS_Bear','CHoCH_Bull','CHoCH_Bear','FVG_Bull','FVG_Bear']
ALL_F = TECH_F + RTM_F + PA_F + STR_F + CS_F

print('=' * 55)
print(f'TSE.Engine Builder - Step 8 ({len(ALL_F)} features)')
print('=' * 55)

print('\n[1/5] Loading...')
with gzip.open(DATA / 'all_history.json.gz', 'rb') as f:
    history = json.loads(f.read().decode('utf-8'))
print(f'  {len(history)} stocks')

print('\n[2/5] Building...')
all_dfs, skipped, errors = [], 0, []
for i, (sym, stock) in enumerate(history.items(), 1):
    try:
        rows = stock.get('r', [])
        if len(rows) < 300: skipped += 1; continue
        df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)
        t = build_technical_features(df)
        r = build_rtm_features(df)
        p = build_pa_features(df)
        s = build_structural_features(df)
        m = pd.concat([t, r, p, s], axis=1)
        m['symbol'] = sym
        m['date'] = df['d'].values
        m['close'] = df['c'].values.astype(float)
        all_dfs.append(m)
        if i % 100 == 0: print(f'  {i}/{len(history)}')
    except Exception as e:
        errors.append({'sym': sym, 'err': str(e)[:100]})

print(f'  Processed: {len(all_dfs)} | Skipped: {skipped} | Errors: {len(errors)}')

print('\n[3/5] Combining...')
combined = pd.concat(all_dfs, ignore_index=True)
before = len(combined); print(f'  {before:,} rows')

print('\n[4/5] Cleanup...')
combined = combined.dropna(subset=['EMA200','Ichimoku_SenkouB']).reset_index(drop=True)
print(f'  After warmup: {len(combined):,}')
print('  Computing cross-sectional...')
cs = build_cross_sectional(combined)
combined = pd.concat([combined, cs], axis=1)
feat_cols = [c for c in combined.columns if c not in ['symbol','date','close']]
nan_cnt = combined[feat_cols].isna().sum().sum()
combined[feat_cols] = combined[feat_cols].replace([np.inf,-np.inf], np.nan).fillna(0)
print(f'  Filled NaN/inf: {nan_cnt:,}')

print('\n[5/5] Saving...')
combined.to_parquet(OUT / 'features.parquet', index=False)
size_mb = (OUT / 'features.parquet').stat().st_size / 1e6
print(f'  {size_mb:.1f} MB')

summary = {
    'step': '8', 'stocks': len(all_dfs), 'skipped': skipped, 'errors': len(errors),
    'rows': len(combined), 'features': len(ALL_F), 'feature_names': ALL_F,
    'size_mb': round(size_mb, 2),
    'date_min': int(combined['date'].min()), 'date_max': int(combined['date'].max()),
}
with open(OUT / 'summary.json','w',encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print(f'\n✅ DONE: {len(combined):,} rows, {len(ALL_F)} features, {size_mb:.1f} MB')
if errors:
    for e in errors[:3]: print(f'  {e["sym"]}: {e["err"]}')
