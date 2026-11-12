"""4 dynamic fundamental features (avoiding look-ahead bias)."""
import numpy as np
import pandas as pd


def build_fundamental_features(df, fundamentals):
    """Compute dynamic fundamentals from static EPS/PE data + daily close."""
    out = pd.DataFrame(index=df.index)
    
    # Static per stock (only 4 that don't leak)
    eps = float(fundamentals.get('estimatedEPS') or 0)
    sector_pe = float(fundamentals.get('sectorPE') or 0)
    psr = float(fundamentals.get('psr') or 0)
    
    close = df['c'].astype(float).replace(0, np.nan)
    
    # 1. EPS yield = EPS / price (dynamic - changes with price)
    out['eps_yield'] = eps / close if eps > 0 else 0
    
    # 2. PE relative = (price/EPS) / sectorPE
    if eps > 0 and sector_pe > 0:
        stock_pe = close / eps
        out['pe_relative'] = stock_pe / sector_pe
    else:
        out['pe_relative'] = 0
    
    # 3. PSR (static per stock)
    out['psr'] = psr
    
    # 4. Log EPS (static, but scaled)
    out['eps_log'] = np.log1p(max(eps, 0))
    
    return out


FEATURE_NAMES = ['eps_yield', 'pe_relative', 'psr', 'eps_log']
