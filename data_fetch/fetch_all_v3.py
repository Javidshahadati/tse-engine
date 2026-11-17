"""Fetch all symbols from TSETMC + adjust prices"""
import requests, json, gzip, time, os
from pathlib import Path

OUT = Path('data_fetch'); OUT.mkdir(exist_ok=True)
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
N = os.environ.get('N_SYMBOLS', '10')
SLEEP = float(os.environ.get('SLEEP_SEC', '1.5'))

print(f"=== FETCH ALL START | N={N} | sleep={SLEEP} ===", flush=True)

with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)

symbols = list(fundamentals.keys())
if N.lower() != 'all':
    symbols = symbols[:int(N)]
print(f"Fetching {len(symbols)} of {len(fundamentals)} symbols", flush=True)

def get_daily(ins):
    url = f"https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{ins}/0"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200: return []
        return r.json().get('closingPriceDaily', [])
    except: return []

def get_adjust(ins):
    url = f"https://cdn.tsetmc.com/api/ClosingPrice/GetPriceAdjustList/{ins}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code != 200: return []
        return r.json().get('priceAdjust', [])
    except: return []

def build_events(adjust_rows):
    events = []
    for a in adjust_rows:
        d = a.get('dEven')
        pn = a.get('pClosing')
        po = a.get('pClosingNotAdjusted')
        if not d or not pn or not po or po <= 0: continue
        events.append((int(d), float(pn) / float(po)))
    events.sort()
    return events

def factor_for(date, events):
    f = 1.0
    for ed, ef in events:
        if ed > date:
            f *= ef
    return f

result = {}
errors = []
t0 = time.time()

for i, name in enumerate(symbols, 1):
    meta = fundamentals.get(name, {})
    ins = meta.get('insCode')
    if not ins:
        errors.append({'sym': name, 'err': 'no insCode'}); continue
    
    daily = get_daily(ins); time.sleep(SLEEP)
    adj = get_adjust(ins); time.sleep(SLEEP)
    
    if not daily:
        errors.append({'sym': name, 'err': 'empty'})
        print(f"[{i}/{len(symbols)}] {name}: EMPTY", flush=True)
        continue
    
    events = build_events(adj)
    records = []
    for row in daily:
        d = row.get('dEven')
        if not d: continue
        c = row.get('pClosing')
        if c is None or c <= 0: continue
        f = factor_for(int(d), events)
        o = row.get('priceFirst') or c
        h = row.get('priceMax') or c
        l = row.get('priceMin') or c
        v = row.get('qTotTran5J') or 0
        records.append({
            'd': int(d),
            'o': round(float(o)*f, 2),
            'h': round(float(h)*f, 2),
            'l': round(float(l)*f, 2),
            'c': round(float(c)*f, 2),
            'v': int(v) if v else 0,
        })
    
    if not records:
        errors.append({'sym': name, 'err': 'no records'}); continue
    
    records.sort(key=lambda x: x['d'], reverse=True)
    result[name] = {'i': ins, 'n': meta.get('name', name), 'r': records}
    
    if i % 10 == 0 or i == len(symbols):
        el = time.time() - t0
        eta = el/i * (len(symbols) - i)
        print(f"[{i}/{len(symbols)}] {name}: {len(records)} rows | ETA {eta/60:.0f}min", flush=True)

# Save
out = OUT / 'ohlc_adjusted_full.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)

all_d = [r['d'] for v in result.values() for r in v['r']]
meta_out = {
    'symbols_requested': len(symbols),
    'symbols_ok': len(result),
    'errors': len(errors),
    'errors_sample': errors[:20],
    'size_mb': round(out.stat().st_size/1e6, 2),
    'date_min': min(all_d) if all_d else None,
    'date_max': max(all_d) if all_d else None,
    'total_rows': sum(len(v['r']) for v in result.values()),
    'adjusted': True,
    'elapsed_sec': round(time.time()-t0, 1),
}
with open(OUT / 'meta_full.json', 'w', encoding='utf-8') as f:
    json.dump(meta_out, f, ensure_ascii=False, indent=2)

print(f"\n=== DONE: {len(result)}/{len(symbols)} | {meta_out['size_mb']}MB | {meta_out['total_rows']} rows | {meta_out['elapsed_sec']}s ===", flush=True)
