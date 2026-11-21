"""Patch trainer - exclude regime for 20d"""
from pathlib import Path
p = Path('scripts/train_v3_unified.py')
src = p.read_text(encoding='utf-8')

old = """def should_exclude_20d(c):
    if c.startswith('flow_'): return True
    if c.startswith('market_'): return True
    if c.startswith('sector_idx_'): return True
    if c.startswith('stock_vs_market'): return True
    if c.startswith('stock_vs_sector_idx'): return True
    if c in ['smart_money', 'retail_dominance']: return True
    return False"""

new = """def should_exclude_20d(c):
    if c.startswith('flow_'): return True
    if c.startswith('market_'): return True
    if c.startswith('sector_idx_'): return True
    if c.startswith('stock_vs_market'): return True
    if c.startswith('stock_vs_sector_idx'): return True
    if c in ['smart_money', 'retail_dominance']: return True
    if c in ['is_bull_market', 'is_bear_market', 'is_sideways']: return True
    return False"""

src = src.replace(old, new)
p.write_text(src, encoding='utf-8')
print("PATCHED")
