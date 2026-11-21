"""Find correct index history endpoint"""
import requests
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
INS = '32097828799138957'  # شاخص کل

ENDPOINTS = [
    f"https://cdn.tsetmc.com/api/Index/GetIndexB1History/{INS}/0",
    f"https://cdn.tsetmc.com/api/Index/GetIndexB1History/{INS}",
    f"https://cdn.tsetmc.com/api/Index/GetIndexB2History/{INS}",
    f"https://cdn.tsetmc.com/api/Index/GetIndexHistory/{INS}",
    f"https://cdn.tsetmc.com/api/ClosingPrice/GetPriceAdjustList/{INS}",
    f"https://cdn.tsetmc.com/api/MarketData/GetMarketOverview/{INS}",
    f"https://cdn.tsetmc.com/api/Instrument/GetInstrumentHistory/{INS}",
]

for url in ENDPOINTS:
    print(f"\n{url.split('/api/')[-1]}", flush=True)
    try:
        r = requests.get(url, headers=H, timeout=20)
        print(f"  status={r.status_code} len={len(r.text)}", flush=True)
        if r.status_code == 200 and len(r.text) > 50:
            d = r.json()
            print(f"  keys={list(d.keys())}", flush=True)
            for k in d:
                if isinstance(d[k], list) and d[k]:
                    print(f"  ✅ {k}: {len(d[k])} rows | sample={str(d[k][0])[:200]}", flush=True)
    except Exception as e:
        print(f"  ERR: {e}", flush=True)
