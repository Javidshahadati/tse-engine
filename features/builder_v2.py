"""Builder v2 - structural + cross-sectional + better fundamental"""
import json, gzip
import pandas as pd
import numpy as np
from pathlib import Path

from features.technical import build_technical_features, FEATURE_NAMES as TECH_F
from features.rtm import build_rtm_features
from features.price_action import build_pa_features, FEATURE_NAMES as PA_F
from features.structural import build_structural_features, FEATURE_NAMES as STRUCT_F
from features.cross_sectional import build_cross_sectional, FEATURE_NAMES as CS_F
from features.fundamental_v2 import build_fundamental_features_v2, FEATURE_NAMES as FUND_F

DATA = Path("data")
OUT = Path("javid_v2"); OUT.mkdir(exist_ok=True)

RTM_F = ["BOS_Bull","BOS_Bear","CHoCH_Bull","CHoCH_Bear","FVG_Bull","FVG_Bear"]
ALL_F = TECH_F + RTM_F + PA_F + STRUCT_F + CS_F + FUND_F

print("=" * 60)
print(f"Builder v2 - {len(ALL_F)} features")
print("=" * 60)

with gzip.open(DATA / "all_history.json.gz", "rb") as f:
    history = json.loads(f.read().decode("utf-8"))
with open(DATA / "fundamentals.json", "r", encoding="utf-8") as f:
    fundamentals = json.load(f)
print(f"Loaded {len(history)} stocks")

print("\n[1/4] Per-symbol features...")
all_dfs, skipped, errors = [], 0, []
for i, (sym, stock) in enumerate(history.items(), 1):
    try:
        rows = stock.get("r", [])
        if len(rows) < 300: skipped += 1; continue
        df = pd.DataFrame(rows).iloc[::-1].reset_index(drop=True)
        t  = build_technical_features(df)
        r  = build_rtm_features(df)
        p  = build_pa_features(df)
        s  = build_structural_features(df)
        fd = build_fundamental_features_v2(df, fundamentals.get(sym, {}))
        m = pd.concat([t, r, p, s, fd], axis=1)
        m["symbol"] = sym
        m["date"] = df["d"].values
        m["close"] = df["c"].values.astype(float)
        all_dfs.append(m)
    except Exception as e:
        errors.append({"sym": sym, "err": str(e)[:150]})
    if i % 100 == 0: print(f"  {i}/{len(history)}")

print(f"  Processed: {len(all_dfs)} | Skipped: {skipped} | Errors: {len(errors)}")

print("\n[2/4] Cross-sectional...")
combined = pd.concat(all_dfs, ignore_index=True)
combined = combined.sort_values(["date","symbol"]).reset_index(drop=True)
cs = build_cross_sectional(combined[["symbol","date","close"]].copy()).reset_index(drop=True)
combined = pd.concat([combined, cs], axis=1)

print("\n[3/4] Cleanup...")
combined = combined.dropna(subset=["EMA200"]).reset_index(drop=True)
feat_cols = [c for c in combined.columns if c not in ["symbol","date","close"]]
combined[feat_cols] = combined[feat_cols].replace([np.inf,-np.inf], np.nan).fillna(0)

print("\n[4/4] Saving...")
combined.to_parquet(OUT / "features_v2.parquet", index=False)
summary = {
    "version":"v2", "stocks":len(all_dfs), "rows":len(combined),
    "features":len(ALL_F), "feature_names":ALL_F,
}
with open(OUT / "summary_v2.json","w",encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"OK: {len(combined):,} rows, {len(ALL_F)} features")
