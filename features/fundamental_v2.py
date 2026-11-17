"""6 fundamental features"""
import numpy as np
import pandas as pd


def build_fundamental_features_v2(df, fund):
    out = pd.DataFrame(index=df.index)
    try:
        eps = float(str(fund.get("estimatedEPS", "0")).replace(",", "").strip() or 0)
    except (ValueError, TypeError):
        eps = 0.0
    sector_pe = float(fund.get("sectorPE", 0) or 0)
    psr = float(fund.get("psr", 0) or 0)
    close = df["c"].astype(float).replace(0, np.nan)
    out["eps_yield"]     = eps / close if eps > 0 else 0.0
    out["pe_relative"]   = (close / eps) / sector_pe if (eps > 0 and sector_pe > 0) else 0.0
    out["psr"]           = psr
    out["eps_log"]       = float(np.log1p(max(eps, 0)))
    out["eps_to_sector"] = eps / sector_pe if sector_pe > 0 else 0.0
    out["price_to_psr"]  = close / psr if psr > 0 else 0.0
    return out


FEATURE_NAMES = ["eps_yield","pe_relative","psr","eps_log","eps_to_sector","price_to_psr"]
