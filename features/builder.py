"""Feature builder - Step 5.1: minimal test."""
import json, gzip
from pathlib import Path

DATA = Path('data')
OUT = Path('outputs')
OUT.mkdir(exist_ok=True)

print('=' * 50)
print('TSE.Engine Feature Builder - Step 5.1')
print('=' * 50)

# Load history
with gzip.open(DATA / 'all_history.json.gz', 'rb') as f:
    history = json.loads(f.read().decode('utf-8'))

with open(DATA / 'companies_final.json') as f:
    companies = json.load(f)

print(f'✅ History: {len(history)} stocks')
print(f'✅ Companies: {len(companies)}')

# Stats
total_rows = sum(len(v['r']) for v in history.values())
print(f'✅ Total rows: {total_rows:,}')

# Show one sample
sample_sym = next(iter(history))
sample = history[sample_sym]['r'][0]
print(f'\n📊 Sample: {sample_sym}')
print(f'   Latest: {sample["d"]} | close: {sample["c"]:,} تومان')
print(f'   Fields: {list(sample.keys())}')

# Save test output
result = {
    'step': '5.1',
    'stocks': len(history),
    'companies': len(companies),
    'total_rows': total_rows,
    'status': 'ok',
}
with open(OUT / 'test_result.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'\n✅ Saved: outputs/test_result.json')
print('=' * 50)
