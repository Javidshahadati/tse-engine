"""Fetch v2 - unbuffered + timeout + test import first"""
import sys, os
print("=== SCRIPT START ===", flush=True)

import gzip, json, time
print("stdlib ok", flush=True)

try:
    import pandas as pd
    print(f"pandas {pd.__version__}", flush=True)
except Exception as e:
    print(f"pandas FAIL: {e}", flush=True); sys.exit(1)

try:
    import pytse_client as tse
    print(f"pytse_client imported", flush=True)
except Exception as e:
    print(f"pytse_client FAIL: {type(e).__name__}: {e}", flush=True); sys.exit(1)

from pathlib import Path

OUT = Path('data_fetch'); OUT.mkdir(exist_ok=True)
N = os.environ.get('N_SYMBOLS', '2')
SLEEP = float(os.environ.get('SLEEP_SEC', '2'))

with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)

symbols = list(fundamentals.keys())[:int(N)] if N.lower() != 'all' else list(fundamentals.keys())
print(f"Fetching {len(symbols)}: {symbols}", flush=True)

def to_int(idx):
    try:
        return int(idx.strftime('%Y%m%d')) if hasattr(idx, 'strftime') else int(str(idx)[:10].replace('-','').replace('/',''))
    except: return None

result, errors = {}, []
for i, name in enumerate(symbols, 1):
    print(f"[{i}/{len(symbols)}] {name}...", flush=True)
    try:
        d = tse.download(symbols=name, adjust=True, write_to_csv=False)
        if not d or name not in d:
            print(f"  empty result", flush=True); errors.append({'sym':name,'err':'empty'}); continue
        t = d[name]
        print(f"  got {len(t)} rows, cols={list(t.columns)[:5]}", flush=True)

        records = []
        for idx, row in t.iterrows():
            dt = to_int(idx)
            if not dt: continue
            c = row.get('adjClose', row.get('close'))
            if pd.isna(c) or c <= 0: continue
            o = row.get('adjOpen', row.get('open', c)); h = row.get('adjHigh', row.get('high', c))
            l = row.get('adjLow', row.get('low', c)); v = row.get('volume', 0)
            records.append({'d': dt,
                            'o': float(o) if not pd.isna(o) else float(c),
                            'h': float(h) if not pd.isna(h) else float(c),
                            'l': float(l) if not pd.isna(l) else float(c),
                            'c': float(c),
                            'v': int(v) if not pd.isna(v) else 0})
        if not records:
            print(f"  no records", flush=True); errors.append({'sym':name,'err':'no records'}); continue
        records.sort(key=lambda x: x['d'], reverse=True)
        meta = fundamentals.get(name, {})
        result[name] = {'i': meta.get('insCode'), 'n': meta.get('name', name), 'r': records}
        print(f"  OK: {len(records)} | {records[-1]['d']} -> {records[0]['d']}", flush=True)
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e)[:150]}"
        print(f"  ERR: {msg}", flush=True); errors.append({'sym':name,'err':msg})
    time.sleep(SLEEP)

out = OUT / 'ohlc_adjusted.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)

all_dates = [r['d'] for v in result.values() for r in v['r']]
meta = {'symbols_requested': len(symbols), 'symbols_ok': len(result),
        'errors_count': len(errors), 'errors_sample': errors[:20],
        'size_mb': round(out.stat().st_size/1e6, 2),
        'date_min': min(all_dates) if all_dates else None,
        'date_max': max(all_dates) if all_dates else None}
with open(OUT / 'meta.json','w',encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

print(f"\n=== DONE: {len(result)}/{len(symbols)} OK, {len(errors)} errors ===", flush=True)
