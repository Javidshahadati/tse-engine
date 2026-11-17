"""Fetch adjusted OHLC from TSETMC via pytse-client -> gzip JSON"""
import gzip, json, os, time
from pathlib import Path
import pandas as pd
import pytse_client as tse

OUT = Path('data_fetch'); OUT.mkdir(exist_ok=True)
N_SYMBOLS = os.environ.get('N_SYMBOLS', '10')
SLEEP = float(os.environ.get('SLEEP_SEC', '1.5'))

with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)

all_symbols = list(fundamentals.keys())
symbols = all_symbols if N_SYMBOLS.lower() == 'all' else all_symbols[:int(N_SYMBOLS)]
print(f"Total: {len(all_symbols)} | Fetching: {len(symbols)} | Sleep: {SLEEP}s")

def to_gregorian_int(idx):
    try:
        if hasattr(idx, 'strftime'):
            return int(idx.strftime('%Y%m%d'))
        s = str(idx)[:10].replace('-', '').replace('/', '')
        return int(s)
    except Exception:
        return None

result, errors = {}, []
for i, name in enumerate(symbols, 1):
    print(f"[{i}/{len(symbols)}] {name}...")
    try:
        d = tse.download(symbols=name, adjust=True, write_to_csv=False)
        if not d or name not in d or len(d[name]) == 0:
            errors.append({'sym': name, 'err': 'empty'}); print("  empty"); continue
        t = d[name]
        records = []
        for idx, row in t.iterrows():
            dt = to_gregorian_int(idx)
            if not dt: continue
            c = row.get('adjClose', row.get('close'))
            if pd.isna(c) or c <= 0: continue
            o = row.get('adjOpen', row.get('open', c))
            h = row.get('adjHigh', row.get('high', c))
            l = row.get('adjLow', row.get('low', c))
            v = row.get('volume', 0)
            records.append({'d': dt,
                            'o': float(o) if not pd.isna(o) else float(c),
                            'h': float(h) if not pd.isna(h) else float(c),
                            'l': float(l) if not pd.isna(l) else float(c),
                            'c': float(c),
                            'v': int(v) if not pd.isna(v) else 0})
        if not records:
            errors.append({'sym': name, 'err': 'no records'}); print("  no records"); continue
        records.sort(key=lambda x: x['d'], reverse=True)
        meta = fundamentals.get(name, {})
        result[name] = {'i': meta.get('insCode'), 'n': meta.get('name', name), 'r': records}
        print(f"  OK: {len(records)} | {records[-1]['d']} -> {records[0]['d']}")
    except Exception as e:
        errors.append({'sym': name, 'err': str(e)[:200]}); print(f"  ERR: {str(e)[:120]}")
    time.sleep(SLEEP)

out = OUT / 'ohlc_adjusted.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
size_mb = out.stat().st_size / 1e6
all_dates = [r['d'] for v in result.values() for r in v['r']]
meta = {'symbols_requested': len(symbols), 'symbols_ok': len(result),
        'errors_count': len(errors), 'errors_sample': errors[:20],
        'size_mb': round(size_mb, 2), 'adjusted': True,
        'date_min': min(all_dates) if all_dates else None,
        'date_max': max(all_dates) if all_dates else None,
        'avg_records': round(sum(len(v['r']) for v in result.values())/max(len(result),1),1)}
with open(OUT / 'meta.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"\nOK: {len(result)} symbols | {size_mb:.2f} MB | {meta['date_min']} -> {meta['date_max']}")
