"""Fetch v3 - modern TSETMC API test"""
import requests, json, sys
print("=== V3 TEST START ===", flush=True)

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

with open('data/fundamentals.json', encoding='utf-8') as f:
    fundamentals = json.load(f)

for sym in ['وبملت', 'كگل']:
    meta = fundamentals.get(sym, {})
    ins = meta.get('insCode')
    print(f"\n[{sym}] insCode={ins}", flush=True)
    if not ins: continue
    url = f"https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{ins}/0"
    print(f"  GET {url}", flush=True)
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        print(f"  status={r.status_code} len={len(r.text)}", flush=True)
        if r.status_code == 200:
            data = r.json()
            rows = data.get('closingPriceDaily', [])
            print(f"  rows={len(rows)}", flush=True)
            if rows:
                print(f"  first dEven={rows[0].get('dEven')} | last dEven={rows[-1].get('dEven')}", flush=True)
        else:
            print(f"  body: {r.text[:200]}", flush=True)
    except Exception as e:
        print(f"  ERR: {type(e).__name__}: {e}", flush=True)

print("\n=== V3 TEST DONE ===", flush=True)
