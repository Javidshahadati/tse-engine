"""Fetch ClientType flow chunked"""
import requests, json, gzip, time, os
from pathlib import Path

OUT = Path('data_fetch'); OUT.mkdir(exist_ok=True)
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
START = int(os.environ.get('START_IDX', '0'))
END = int(os.environ.get('END_IDX', '30'))
SLEEP = float(os.environ.get('SLEEP_SEC', '1.5'))

print(f"=== FLOW CHUNK {START}-{END} ===", flush=True)
with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)
all_syms = list(fundamentals.keys())
chunk = all_syms[START:END]
print(f"Total: {len(all_syms)} | Chunk: {len(chunk)}", flush=True)

def get_flow(ins):
    url = f"https://cdn.tsetmc.com/api/ClientType/GetClientTypeHistory/{ins}"
    try:
        r = requests.get(url, headers=H, timeout=30)
        if r.status_code != 200: return []
        return r.json().get('clientType', [])
    except: return []

result, errors = {}, []
t0 = time.time()
for i, sym in enumerate(chunk, 1):
    meta = fundamentals.get(sym, {})
    ins = meta.get('insCode')
    if not ins:
        errors.append({'sym': sym, 'err': 'no insCode'}); continue
    rows = get_flow(ins); time.sleep(SLEEP)
    if not rows:
        errors.append({'sym': sym, 'err': 'empty'})
        print(f"[{i}/{len(chunk)}] {sym}: EMPTY", flush=True); continue
    # فقط فیلدهای ضروری
    kept = []
    for r in rows:
        d = r.get('recDate')
        if not d: continue
        kept.append({
            'd': int(d),
            'buy_I_Vol': float(r.get('buy_I_Volume') or 0),
            'buy_N_Vol': float(r.get('buy_N_Volume') or 0),
            'buy_I_Val': float(r.get('buy_I_Value') or 0),
            'buy_N_Val': float(r.get('buy_N_Value') or 0),
            'sell_I_Vol': float(r.get('sell_I_Volume') or 0),
            'sell_N_Vol': float(r.get('sell_N_Volume') or 0),
            'sell_I_Val': float(r.get('sell_I_Value') or 0),
            'sell_N_Val': float(r.get('sell_N_Value') or 0),
        })
    if not kept:
        errors.append({'sym': sym, 'err': 'no valid'}); continue
    kept.sort(key=lambda x: x['d'], reverse=True)
    result[sym] = {'i': ins, 'r': kept}
    el = time.time() - t0
    eta = el/i * (len(chunk) - i)
    print(f"[{i}/{len(chunk)}] {sym}: {len(kept)} rows | ETA {eta/60:.1f}min", flush=True)

part = f"flow_part_{START:03d}_{END:03d}"
out = OUT / f'{part}.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print(f"\n=== DONE {part}: {len(result)}/{len(chunk)} | {out.stat().st_size/1e6:.2f}MB | {time.time()-t0:.0f}s ===", flush=True)
