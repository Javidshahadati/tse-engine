"""Merge 6 chunks into final ohlc_full.json.gz"""
import gzip, json, os
from pathlib import Path

OUT = Path('data_fetch')
CHUNKS = [
    'ohlc_part_000_100.json.gz',
    'ohlc_part_100_200.json.gz',
    'ohlc_part_200_300.json.gz',
    'ohlc_part_300_400.json.gz',
    'ohlc_part_400_500.json.gz',
    'ohlc_part_500_606.json.gz',
]

merged = {}
for fn in CHUNKS:
    p = OUT / fn
    if not p.exists():
        print(f"  SKIP {fn} (not found)", flush=True); continue
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        d = json.load(f)
    print(f"  {fn}: {len(d)} symbols", flush=True)
    merged.update(d)

print(f"\nMerged: {len(merged)} symbols", flush=True)

# Save final
final = OUT / 'ohlc_full.json.gz'
with gzip.open(final, 'wt', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False)

all_d = [r['d'] for v in merged.values() for r in v['r']]
meta = {
    'symbols': len(merged),
    'total_rows': sum(len(v['r']) for v in merged.values()),
    'size_mb': round(final.stat().st_size/1e6, 2),
    'date_min': min(all_d),
    'date_max': max(all_d),
    'adjusted': True,
    'source': 'TSETMC cdn.tsetmc.com ClosingPriceDailyList + PriceAdjustList',
}
with open(OUT / 'ohlc_full_meta.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

print(f"\n=== FINAL: {meta['symbols']} symbols | {meta['size_mb']}MB | {meta['total_rows']:,} rows ===", flush=True)
print(f"    Dates: {meta['date_min']} -> {meta['date_max']}", flush=True)
