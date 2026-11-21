"""Fetch all index histories"""
import requests, json, gzip, time
from pathlib import Path

OUT = Path('data'); OUT.mkdir(exist_ok=True)
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}

# 1) همه شاخص‌ها (منتخب + صنعتی)
print("Fetching index list...", flush=True)
r = requests.get("https://cdn.tsetmc.com/api/Index/GetIndexB1LastAll/All/1", headers=H, timeout=30)
items = r.json().get('indexB1', [])
print(f"Total indexes: {len(items)}", flush=True)

result = {}
for i, item in enumerate(items, 1):
    code = item.get('insCode')
    name = item.get('lVal30', str(code))
    if not code: continue
    url = f"https://cdn.tsetmc.com/api/Index/GetIndexB2History/{code}"
    try:
        r = requests.get(url, headers=H, timeout=20)
        if r.status_code != 200: continue
        rows = r.json().get('indexB2', [])
        if not rows: continue
        kept = []
        for x in rows:
            d = x.get('dEven')
            c = x.get('xNivInuClMresIbs')
            if d and c:
                kept.append({'d': int(d), 'c': float(c)})
        kept.sort(key=lambda x: x['d'], reverse=True)
        result[str(code)] = {'name': name, 'r': kept}
        if i % 10 == 0:
            print(f"  {i}/{len(items)} | {name}: {len(kept)} rows", flush=True)
    except Exception as e:
        print(f"  ERR {name}: {e}", flush=True)
    time.sleep(0.5)

print(f"\nTotal fetched: {len(result)}", flush=True)
out = OUT / 'indexes_full.json.gz'
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print(f"Saved: {out} ({out.stat().st_size/1e6:.2f}MB)", flush=True)
