from pathlib import Path
p = Path('scripts/train_v3_unified.py')
src = p.read_text(encoding='utf-8')
src = src.replace("n_jobs=-1", "n_jobs=2")
src = src.replace("n_estimators=300", "n_estimators=200")
p.write_text(src, encoding='utf-8')
print("Patched memory")
