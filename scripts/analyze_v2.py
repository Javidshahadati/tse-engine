"""Analyze v2 - feature importance + sanity checks"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import roc_auc_score
from sklearn.dummy import DummyClassifier

OUT = Path("javid_v2")
THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65

df = pd.read_parquet(OUT / "features_v2.parquet")
df = df.sort_values(["symbol","date"]).reset_index(drop=True)
df["future_ret_5d"] = df.groupby("symbol")["close"].shift(-5) / df["close"] - 1
df["label"] = (df["future_ret_5d"] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=["future_ret_5d"]).reset_index(drop=True)

with open(OUT / "summary_v2.json") as f:
    feat_cols = json.load(f)["feature_names"]
feat_cols = [c for c in feat_cols if c in df.columns]

# 4 فولد
df = df.sort_values("date").reset_index(drop=True)
udates = sorted(df["date"].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

report = {"per_fold": [], "feature_importance": {}, "baseline_tests": {}}

for k,(s,e) in enumerate(tests,1):
    tr = df[df["date"] < s]; te = df[(df["date"] >= s) & (df["date"] < e)]
    X_tr, y_tr = tr[feat_cols].values, tr["label"].values
    X_te, y_te = te[feat_cols].values, te["label"].values
    pos_rate_tr = y_tr.mean()
    pos_rate_te = y_te.mean()

    # Dummy baseline: always predict pos_rate
    dummy = DummyClassifier(strategy="prior").fit(X_tr, y_tr)
    p_dummy = dummy.predict_proba(X_te)[:,1]
    mask_dummy = p_dummy > THRESHOLD_BUY
    hr_dummy = float(y_te[mask_dummy].mean()) if mask_dummy.sum() > 0 else 0.0

    # XGB
    mx = xgb.XGBClassifier(n_estimators=150, max_depth=5, learning_rate=0.07,
        subsample=0.8, colsample_bytree=0.8, tree_method="hist",
        objective="binary:logistic", eval_metric="auc",
        scale_pos_weight=(1-pos_rate_tr)/pos_rate_tr,
        n_jobs=-1, random_state=42)
    mx.fit(X_tr, y_tr, verbose=False)
    p_xgb = mx.predict_proba(X_te)[:,1]

    auc = roc_auc_score(y_te, p_xgb)
    mask = p_xgb > THRESHOLD_BUY
    hr = float(y_te[mask].mean()) if mask.sum() > 0 else 0.0

    # Top-K precision at various thresholds
    prec = {}
    for thr in [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]:
        m = p_xgb > thr
        prec[str(thr)] = {"hit": round(float(y_te[m].mean()),4) if m.sum()>0 else 0.0,
                          "n": int(m.sum())}

    report["per_fold"].append({
        "fold": k,
        "pos_rate_train": round(float(pos_rate_tr),4),
        "pos_rate_test": round(float(pos_rate_te),4),
        "auc_xgb": round(float(auc),4),
        "hit_rate_p065": round(hr,4),
        "n_p065": int(mask.sum()),
        "dummy_hit_p065": round(hr_dummy,4),
        "dummy_n": int(mask_dummy.sum()),
        "precision_by_threshold": prec,
    })

    # importance
    imp = mx.feature_importances_
    report["feature_importance"][f"fold_{k}"] = {
        feat_cols[i]: round(float(imp[i]),4) for i in np.argsort(imp)[::-1][:20]
    }

# میانگین importance
all_imp = {}
for fold_data in report["feature_importance"].values():
    for f, v in fold_data.items():
        all_imp[f] = all_imp.get(f, 0) + v / len(report["feature_importance"])
report["top_features_avg"] = dict(sorted(all_imp.items(), key=lambda x: -x[1])[:20])

with open(OUT / "analysis_v2.json","w",encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print("="*60)
print("ANALYSIS v2")
print("="*60)
for r in report["per_fold"]:
    print(f"\nFold {r['fold']}: pos_rate_tr={r['pos_rate_train']:.2%} te={r['pos_rate_test']:.2%}")
    print(f"  AUC={r['auc_xgb']} | HR@p>0.65={r['hit_rate_p065']} (n={r['n_p065']})")
    print(f"  DUMMY HR@p>0.65={r['dummy_hit_p065']} (n={r['dummy_n']})")
    for thr, d in r["precision_by_threshold"].items():
        print(f"    thr={thr}: hit={d['hit']:.4f} n={d['n']}")
print("\nTOP-20 features (avg):")
for f, v in report["top_features_avg"].items():
    print(f"  {f:25s} {v:.4f}")
