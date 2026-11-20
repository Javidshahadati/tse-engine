"""Test ClientType API from GitHub Actions"""
import requests
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
for ins in ['778253364357513', '35700344742885862']:
    url = f"https://cdn.tsetmc.com/api/ClientType/GetClientTypeHistory/{ins}"
    print(f"\n[{ins}] {url}", flush=True)
    try:
        r = requests.get(url, headers=H, timeout=30)
        print(f"  status={r.status_code} len={len(r.text)}", flush=True)
        if r.status_code == 200:
            d = r.json()
            keys = list(d.keys())
            print(f"  keys={keys}", flush=True)
            for k in keys:
                if isinstance(d[k], list) and d[k]:
                    print(f"  {k}: {len(d[k])} rows | sample={str(d[k][0])[:200]}", flush=True)
    except Exception as e:
        print(f"  ERR: {type(e).__name__}: {e}", flush=True)
