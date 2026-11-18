
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb

from pathlib import Path
from sklearn.metrics import roc_auc_score

BASE = Path("outputs")
MODELS = Path("models/multi_horizon")
BASE.mkdir(exist_ok=True)
MODELS.mkdir(parents=True, exist_ok=True)

THRESHOLD_BUY = 0.65

HORIZONS = [
    {"name": "1m", "days": 20, "target": 0.03},
    {"name": "3m", "days": 60, "target": 0.08},
]

EXCLUDED = [
    "eps_yield", "pe_relative", "psr", "eps_log"
]

XGB_PARAMS = {
    "n_estimators": 150,
    "max_depth": 5,
    "learning_rate": 0.07,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_lambda": 1.0,
    "tree_method": "hist",
    "objective": "binary:logistic",
    "eval_metric": "auc",
    "n_jobs": -1,
    "random_state": 42,
}

LGB_PARAMS = {
    "n_estimators": 300,
    "num_leaves": 31,
    "max_depth": 6,
    "learning_rate": 0.05,
    "min_data_in_leaf": 50,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "lambda_l2": 1.0,
    "objective": "binary",
    "metric": "auc",
    "is_unbalance": True,
    "n_jobs": -1,
    "random_state": 42,
    "verbose": -1,
}

print("=" * 60)
print("TSE ENGINE - MULTI HORIZON TRAINER")
print("=" * 60)

print("\n[1] Loading features...")

df = pd.read_parquet(BASE / "features.parquet")
df["date"] = pd.to_numeric(df["date"], errors="coerce")
df["close"] = pd.to_numeric(df["close"], errors="coerce")
df = df.dropna(subset=["date", "close"])
df["date"] = df["date"].astype("int64")

with open(BASE / "summary.json", encoding="utf-8") as f:
    summary = json.load(f)

feat_cols = [
    c for c in summary["feature_names"]
    if c in df.columns and c not in EXCLUDED
]

if not feat_cols:
    raise RuntimeError("No usable features found.")

print("Rows:", f"{len(df):,}")
print("Features:", len(feat_cols))
print("Fundamental features excluded:", EXCLUDED)

# Make sure only numeric features are passed to models.
for c in feat_cols:
    df[c] = pd.to_numeric(df[c], errors="coerce")

df[feat_cols] = (
    df[feat_cols]
    .replace([np.inf, -np.inf], np.nan)
    .fillna(0)
)

df = df.sort_values(
    ["symbol", "date"]
).reset_index(drop=True)


def safe_auc(y, p):
    if len(np.unique(y)) < 2:
        return None
    return round(float(roc_auc_score(y, p)), 4)


def train_horizon(cfg):
    name = cfg["name"]
    horizon = cfg["days"]
    target = cfg["target"]

    print("\n" + "=" * 60)
    print(f"HORIZON {name.upper()} | {horizon} rows | target {target:.1%}")
    print("=" * 60)

    data = df.copy()

    grouped = data.groupby("symbol", sort=False)

    data["future_close"] = grouped["close"].shift(-horizon)
    data["label_end_date"] = grouped["date"].shift(-horizon)

    data["future_return"] = (
        data["future_close"] / data["close"] - 1
    )

    data["label"] = (
        data["future_return"] > target
    ).astype("int8")

    data = data.dropna(
        subset=["future_return", "label_end_date"]
    ).copy()

    data["label_end_date"] = (
        data["label_end_date"].astype("int64")
    )

    pos_rate = float(data["label"].mean())

    print("Usable rows:", f"{len(data):,}")
    print("Positive rate:", f"{pos_rate:.2%}")

    if data["label"].nunique() < 2:
        raise RuntimeError(
            f"{name}: only one label class; cannot train."
        )

    dates = sorted(data["date"].unique())
    n = len(dates)

    if n < 20:
        raise RuntimeError("Not enough unique dates.")

    indexes = [int(n * p) for p in
               [0.50, 0.625, 0.75, 0.875]]

    bounds = [dates[i] for i in indexes]

    tests = [
        (bounds[0], bounds[1]),
        (bounds[1], bounds[2]),
        (bounds[2], bounds[3]),
        (bounds[3], None),
    ]

    out_dir = BASE / "multi_horizon" / name
    model_dir = MODELS / name

    out_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    results = []
    predictions = []

    for k, (start, end) in enumerate(tests, 1):

        raw_train = data[data["date"] < start].copy()

        # Purge: training label horizon must finish
        # strictly before the test period begins.
        train = raw_train[
            raw_train["label_end_date"] < start
        ].copy()

        if end is None:
            test = data[data["date"] >= start].copy()
        else:
            test = data[
                (data["date"] >= start) &
                (data["date"] < end)
            ].copy()

        purged = len(raw_train) - len(train)

        print(
            f"\nFold {k}: train={len(train):,} "
            f"test={len(test):,} purged={purged:,}"
        )

        if len(train) < 100 or len(test) < 100:
            print("Skipped: insufficient rows.")
            continue

        if train["label"].nunique() < 2:
            print("Skipped: training has one class.")
            continue

        Xtr = train[feat_cols].values
        ytr = train["label"].values

        Xte = test[feat_cols].values
        yte = test["label"].values

        xparams = dict(XGB_PARAMS)
        xparams["scale_pos_weight"] = (
            (1 - float(ytr.mean())) /
            max(float(ytr.mean()), 1e-8)
        )

        mx = xgb.XGBClassifier(**xparams)
        mx.fit(Xtr, ytr, verbose=False)

        ml = lgb.LGBMClassifier(**LGB_PARAMS)
        ml.fit(Xtr, ytr)

        px = mx.predict_proba(Xte)[:, 1]
        pl = ml.predict_proba(Xte)[:, 1]
        pav = (px + pl) / 2

        auc_x = safe_auc(yte, px)
        auc_l = safe_auc(yte, pl)
        auc_avg = safe_auc(yte, pav)

        selected = pav > THRESHOLD_BUY
        count = int(selected.sum())

        if count:
            wr = float(yte[selected].mean())
            selected_return = float(
                test["future_return"].values[selected].mean()
            )
        else:
            wr = None
            selected_return = None

        market_return = float(
            test["future_return"].mean()
        )

        alpha = (
            selected_return - market_return
            if selected_return is not None else None
        )

        result = {
            "fold": k,
            "train_rows": len(train),
            "test_rows": len(test),
            "purged_rows": purged,
            "auc_xgb": auc_x,
            "auc_lgbm": auc_l,
            "auc_avg": auc_avg,
            "selected_count": count,
            "win_rate": (
                round(wr, 4) if wr is not None else None
            ),
            "selected_mean_return": (
                round(selected_return, 6)
                if selected_return is not None else None
            ),
            "market_mean_return": round(market_return, 6),
            "alpha": (
                round(alpha, 6) if alpha is not None else None
            ),
        }

        results.append(result)

        print(
            "AUC:",
            "XGB", auc_x,
            "| LGBM", auc_l,
            "| AVG", auc_avg
        )
        print(
            "Selected:", count,
            "| WR:", result["win_rate"],
            "| Alpha:", result["alpha"]
        )

        mx.save_model(
            str(model_dir / f"xgb_fold{k}.json")
        )
        ml.booster_.save_model(
            str(model_dir / f"lgbm_fold{k}.txt")
        )

        pred = test[
            ["symbol", "date", "close",
             "future_return", "label"]
        ].copy()

        pred["prob_xgb"] = px
        pred["prob_lgbm"] = pl
        pred["prob_avg"] = pav
        pred["fold"] = k

        predictions.append(pred)

    if not results:
        raise RuntimeError(f"No successful folds for {name}.")

    if predictions:
        all_predictions = pd.concat(
            predictions, ignore_index=True
        )
        all_predictions.to_parquet(
            out_dir / "predictions.parquet",
            index=False
        )

    metric_keys = [
        "auc_xgb", "auc_lgbm", "auc_avg",
        "win_rate", "alpha"
    ]

    aggregate = {}

    for key in metric_keys:
        vals = [
            r[key] for r in results
            if r[key] is not None
        ]
        aggregate[key] = (
            round(float(np.mean(vals)), 4)
            if vals else None
        )

    report = {
        "horizon": name,
        "trading_rows": horizon,
        "target_return": target,
        "purge_rows": horizon,
        "features": feat_cols,
        "n_features": len(feat_cols),
        "positive_rate": pos_rate,
        "folds": results,
        "aggregate": aggregate,
        "note": (
            "Alpha is selected mean forward return minus "
            "all-test mean forward return. It is not a "
            "compounded portfolio backtest and excludes costs."
        ),
    }

    with open(
        out_dir / "metrics.json",
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            report, f, ensure_ascii=False,
            indent=2, allow_nan=False
        )

    print("\nAGGREGATE", name, aggregate)
    print("Saved:", out_dir)


for config in HORIZONS:
    train_horizon(config)

print("\n" + "=" * 60)
print("BOTH HORIZONS COMPLETED")
print("1M: 20 rows / 3% target / 20-row purge")
print("3M: 60 rows / 8% target / 60-row purge")
print("=" * 60)
