"""Fetch chunked TSETMC data - for GitHub Actions"""
import requests, json, gzip, time, os
from pathlib import Path

OUT = Path('data_fetch'); OUT.mkdir(exist_ok=True)
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

START = int(os.environ.get('START_IDX', '0'))
END = int(os.environ.get('END_IDX', '30'))
SLEEP = float(os.environ.get('SLEEP_SEC', '1.5'))
TOP = int(os.environ.get('TOP_N', '0'))

print(f"=== CHUNKED | range={START}-{END} | top={TOP} | sleep={SLEEP} ===", flush=True)

with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)

all_syms = list(fundamentals.keys())
chunk = all_syms[START:END]
print(f"Total: {len(all_syms)} | This chunk: {len(chunk)}", flush=True)

def get_daily(ins, top=0):
    url = f"https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{ins}/{top}"
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

def build_events(adj):
    ev = []
    for a in adj:
        d = a.get('dEven'); pn = a.get('pClosing'); po = a.get('pClosingNotAdjusted')
        if not d or not pn or not po or po <= 0: continue
        ev.append((int(d), float(pn)/float(po)))
    ev.sort(); return ev

def factor_for(date, events):
    f = 1.0
    for ed, ef in events:
        if ed > date: f *= ef
    return f

result, errors = {}, []
t0 = time.time()

for i, name in enumerate(chunk, 1):
    meta = fundamentals.get(name, {})
    ins = meta.get('insCode')
    if not ins:
        errors.append({'sym': name, 'err': 'no insCode'}); continue
    daily = get_daily(ins, top=TOP); time.sleep(SLEEP)
    adj = get_adjust(ins); time.sleep(SLEEP)
    if not daily:
        errors.append({'sym': name, 'err': 'empty'})
        print(f"[{i}/{len(chunk)}] {name}: EMPTY", flush=True); continue
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
        records.append({'d': int(d), 'o': round(float(o)*f, 2), 'h': round(float(h)*f, 2),
                        'l': round(float(l)*f, 2), 'c': round(float(c)*f, 2),
                        'v': int(v) if v else 0})
    if not records:
        errors.append({'sym': name, 'err': 'no valid'}); continue
    records.sort(key=lambda x: x['d'], reverse=True)
    result[name] = {'i': ins, 'n': meta.get('name', name), 'r': records}
    el = time.time() - t0
    eta = el/i * (len(chunk) - i)
    print(f"[{i}/{len(chunk)}] {name}: {len(records)} rows | ETA {eta/60:.1f}min", flush=True)

part_name = f"ohlc_part_{START:03d}_{END:03d}"
out = OUT / f'{part_name}.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)

all_d = [r['d'] for v in result.values() for r in v['r']]
meta_out = {'start_idx': START, 'end_idx': END, 'symbols_requested': len(chunk),
            'symbols_ok': len(result), 'errors': len(errors), 'errors_sample': errors[:20],
            'size_mb': round(out.stat().st_size/1e6, 2),
            'date_min': min(all_d) if all_d else None,
            'date_max': max(all_d) if all_d else None,
            'total_rows': sum(len(v['r']) for v in result.values()),
            'elapsed_sec': round(time.time()-t0, 1)}
with open(OUT / f'{part_name}_meta.json', 'w', encoding='utf-8') as f:
    json.dump(meta_out, f, ensure_ascii=False, indent=2)
print(f"\n=== DONE {part_name}: {len(result)}/{len(chunk)} | {meta_out['size_mb']}MB | {meta_out['total_rows']} rows | {meta_out['elapsed_sec']}s ===", flush=True)
