"""Fix flow duplicate dates"""
from pathlib import Path
p = Path('features/builder_v3.py')
src = p.read_text(encoding='utf-8')

old = """    fdf = pd.DataFrame(flow_rows).sort_values('d').reset_index(drop=True)"""
new = """    fdf = pd.DataFrame(flow_rows).sort_values('d').drop_duplicates('d', keep='last').reset_index(drop=True)"""

if old in src:
    src = src.replace(old, new)
    p.write_text(src, encoding='utf-8')
    print("PATCHED")
else:
    print("NO MATCH - checking current code...")
    for line in src.split('\n'):
        if 'fdf = pd.DataFrame' in line:
            print(f"  Found: {line}")
