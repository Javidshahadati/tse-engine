"""Download all flow artifacts + merge + push"""
import os, gzip, json, requests, zipfile, io

TOKEN = os.environ['GH_TOKEN']
USER, REPO = 'JavidShahadati', 'tse-engine'
H = {'Authorization': f'token {TOKEN}', 'Accept': 'application/vnd.github+json'}

r = requests.get(f"https://api.github.com/repos/{USER}/{REPO}/actions/workflows/fetch_flow.yml/runs?per_page=30", headers=H)
runs = r.json()['workflow_runs']
print(f"Total runs: {len(runs)}")

merged = {}
seen = set()
for run in runs:
    if run['conclusion'] != 'success': continue
    arts = requests.get(f"https://api.github.com/repos/{USER}/{REPO}/actions/runs/{run['id']}/artifacts", headers=H).json()
    for art in arts['artifacts']:
        name = art['name']
        if not name.startswith('flow-') or name in seen: continue
        if name in ['flow-0-3', 'flow-0-3-1']: continue
        seen.add(name)
        print(f"Downloading {name}...")
        dl = requests.get(art['archive_download_url'], headers=H, allow_redirects=True)
        with zipfile.ZipFile(io.BytesIO(dl.content)) as zf:
            for fn in zf.namelist():
                if fn.endswith('.json.gz'):
                    with zf.open(fn) as fh:
                        d = json.loads(gzip.decompress(fh.read()))
                    print(f"  {fn}: {len(d)} symbols")
                    merged.update(d)

print(f"\nTotal merged: {len(merged)}")
os.makedirs('data', exist_ok=True)
with gzip.open('data/flow_full.json.gz', 'wt', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False)
print(f"Saved: {os.path.getsize('data/flow_full.json.gz')/1e6:.2f}MB")
