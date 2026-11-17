"""Train v2"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path("javid_v2"); OUT.mkdir(exist_ok=True)
THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65

print("=" * 60); print("Train v2"); print("=" * 60)

df = pd.read_parquet(OUT / "features_v2.parquet")
df = df.sort_values(["symbol","date"]).reset_index(drop=True)
df["future_ret_5d"] = df.groupby("symbol")["close"].shift(-5) / df["close"] - 1
df["label"] = (df["future_ret_5d"] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=["future_ret_5d"]).reset_index(drop=True)
pos_rate = df["label"].mean()

with open(OUT / "summary_v2.json") as f:
    feat_cols = json.load(f)["feature_names"]
feat_cols = [c for c in feat_cols if c in df.columns]
print(f"Rows: {len(df):,} | Features: {len(feat_cols)} | Pos: {pos_rate:.2%}")

df = df.sort_values("date").reset_index(drop=True)
udates = sorted(df["date"].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

results = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df["date"] < s]; te = df[(df["date"] >= s) & (df["date"] < e)]
    X_tr, y_tr = tr[feat_cols].values, tr["label"].values
    X_te, y_te = te[feat_cols].values, te["label"].values

    mx = xgb.XGBClassifier(n_estimators=150, max_depth=5, learning_rate=0.07,
        subsample=0.8, colsample_bytree=0.8, tree_method="hist",
        objective="binary:logistic", eval_metric="auc",
        scale_pos_weight=(1-pos_rate)/pos_rate, n_jobs=-1, random_state=42)
    mx.fit(X_tr, y_tr, verbose=False)
    p_xgb = mx.predict_proba(X_te)[:,1]

    ml = lgb.LGBMClassifier(n_estimators=150, max_depth=5, learning_rate=0.07,
        subsample=0.8, colsample_bytree=0.8, objective="binary", metric="auc",
        is_unbalance=True, n_jobs=-1, random_state=42, verbose=-1)
    ml.fit(X_tr, y_tr)
    p_lgb = ml.predict_proba(X_te)[:,1]
    p_avg = (p_xgb + p_lgb) / 2

    auc_avg = roc_auc_score(y_te, p_avg)
    mask = p_avg > THRESHOLD_BUY
    hr = float(y_te[mask].mean()) if mask.sum() > 0 else 0.0
    print(f"Fold {k}: AUC={auc_avg:.4f} HitRate={hr:.4f} n={int(mask.sum())}")

    results.append({"fold":k, "auc":round(float(auc_avg),4),
                    "hit_rate":round(hr,4), "n":int(mask.sum())})

avg_auc = round(float(np.mean([r["auc"] for r in results])),4)
avg_hr  = round(float(np.mean([r["hit_rate"] for r in results])),4)
delta = avg_hr - 0.307

metrics = {"version":"v2", "n_features":len(feat_cols),
           "folds":results, "avg_auc":avg_auc,
           "avg_hit_rate":avg_hr, "baseline":0.307,
           "delta":round(delta,4),
           "verdict":"IMPROVED" if delta>0.02 else ("MARGINAL" if delta>0 else "NO_IMPROVEMENT")}
with open(OUT / "metrics_v2.json","w",encoding="utf-8") as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
print(f"\nDONE | Avg HitRate={avg_hr:.4f} | Delta={delta:+.4f} | {metrics['verdict']}")
