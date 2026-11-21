"""Test index endpoints - correct paths"""
import requests, json
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}

# 1) شاخص‌های منتخب (همه ۷ شاخص اصلی)
print("=== Selected Indexes ===", flush=True)
url = "https://cdn.tsetmc.com/api/Index/GetIndexB1LastAll/SelectedIndexes/1"
r = requests.get(url, headers=H, timeout=30)
print(f"status={r.status_code} len={len(r.text)}", flush=True)
if r.status_code == 200:
    d = r.json()
    print(f"keys={list(d.keys())}", flush=True)
    for k in d:
        if isinstance(d[k], list):
            print(f"  {k}: {len(d[k])} items", flush=True)
            if d[k]:
                item = d[k][0]
                print(f"  sample keys: {list(item.keys())}", flush=True)
                print(f"  sample: insCode={item.get('insCode')}, name={item.get('lVal30')}, value={item.get('xDrNivJIdx004')}", flush=True)

# 2) یک شاخص منتخب رو بردار و تاریخچه‌ش رو بگیر
if r.status_code == 200 and d.get('indexB1'):
    idx_code = d['indexB1'][0].get('insCode')
    print(f"\n=== Index history for insCode={idx_code} ===", flush=True)
    url2 = f"https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{idx_code}/0"
    r2 = requests.get(url2, headers=H, timeout=30)
    print(f"status={r2.status_code} len={len(r2.text)}", flush=True)
    if r2.status_code == 200:
        d2 = r2.json()
        print(f"keys={list(d2.keys())}", flush=True)
        rows = d2.get('closingPriceDaily', [])
        print(f"rows={len(rows)}", flush=True)
        if rows:
            print(f"first: {rows[0]}", flush=True)
