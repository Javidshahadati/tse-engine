"""Test index data from TSETMC"""
import requests, json
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}

# کدهای شاخص
INDICES = {
    'شاخص_کل': '32097828799138957',
    'شاخص_هم‌وزن': '67130298613737946',
    'شاخص_فولاد': '5798407779554453',  # یک صنعت نمونه
}

for name, code in INDICES.items():
    print(f"\n[{name}] {code}", flush=True)
    # Method 1: IndexHistory
    url = f"https://cdn.tsetmc.com/api/Index/GetIndexB1History/{code}/0"
    try:
        r = requests.get(url, headers=H, timeout=30)
        print(f"  Method1 status={r.status_code} len={len(r.text)}", flush=True)
        if r.status_code == 200:
            d = r.json()
            print(f"  keys={list(d.keys())}", flush=True)
            for k in d:
                if isinstance(d[k], list) and d[k]:
                    print(f"  {k}: {len(d[k])} rows | sample={str(d[k][0])[:250]}", flush=True)
    except Exception as e:
        print(f"  ERR: {e}", flush=True)
