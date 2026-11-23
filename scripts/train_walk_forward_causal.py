"""Purged chronological walk-forward XGBoost evaluation."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import roc_auc_score


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="outputs/features_causal.parquet")
    p.add_argument("--horizon", type=int, default=5)
    p.add_argument("--label-threshold", type=float, default=0.017,
                   help="Minimum net forward return for positive label")
    p.add_argument("--round-trip-cost", type=float, required=True,
                   help="Total entry+exit costs as decimal; 0.03 means 3 percent")
    p.add_argument("--signal-threshold", type=float, default=0.60)
    p.add_argument("--folds", type=int, default=4)
    p.add_argument("--output-dir", default="outputs/causal_walk_forward")
    args = p.parse_args()

    if args.horizon < 1 or args.folds < 2:
        raise ValueError("horizon >= 1 and folds >= 2 required")
    if not 0 <= args.round_trip_cost < 1:
        raise ValueError("round-trip cost must be in [0, 1)")
    if not 0 < args.signal_threshold < 1:
        raise ValueError("signal threshold must be between 0 and 1")

    source = Path(args.input)
    df = pd.read_parquet(source)
    required = {"symbol", "date", "open", "close"}
    if not required.issubset(df.columns):
        raise ValueError(f"Missing columns: {sorted(required - set(df.columns))}")

    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    g = df.groupby("symbol", sort=False)

    # Signal is generated after close[t].
    # Entry: open[t+1]. Exit: close[t+horizon].
    df["entry_date"] = g["date"].shift(-1)
    df["entry_open"] = g["open"].shift(-1)
    df["exit_date"] = g["date"].shift(-args.horizon)
    df["exit_close"] = g["close"].shift(-args.horizon)

    valid_prices = (
        (df["entry_open"] > 0) &
        (df["exit_close"] > 0)
    )
    df.loc[~valid_prices, ["entry_open", "exit_close"]] = np.nan

    df["future_return_gross"] = (
        df["exit_close"] / df["entry_open"] - 1
    )

    # Proportional total round-trip cost.
    df["future_return_net"] = (
        (1 + df["future_return_gross"]) *
        (1 - args.round_trip_cost) - 1
    )

    df = df.dropna(
        subset=["entry_date", "exit_date",
                "future_return_gross", "future_return_net"]
    ).copy()

    df["label"] = (
        df["future_return_net"] > args.label_threshold
    ).astype("int8")

    excluded = {
        "symbol", "date", "open", "high", "low", "close", "volume",
        "entry_date", "entry_open", "exit_date", "exit_close",
        "future_return_gross", "future_return_net", "label",
        "ohl_geometry_valid", "close_in_trade_range",
    }
    features = [c for c in df.columns if c not in excluded
                and pd.api.types.is_numeric_dtype(df[c])]
    if not features:
        raise RuntimeError("No numeric feature columns")

    dates = np.array(sorted(df["date"].unique()))
    if len(dates) < args.folds + 2:
        raise RuntimeError("Not enough unique dates")
    first = max(1, int(len(dates) * 0.50))
    edges = np.linspace(first, len(dates), args.folds + 1, dtype=int)

    out_dir = Path(args.output_dir)
    model_dir = out_dir / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    fold_metrics, oof_parts = [], []

    for k in range(args.folds):
        si, ei = edges[k], edges[k + 1]
        if ei <= si:
            continue
        start = int(dates[si])
        end = int(dates[ei]) if ei < len(dates) else int(dates[-1]) + 1
        test = df[(df.date >= start) & (df.date < end)].copy()

        # Purge overlapping labels: training outcome must mature before test.
        train = df[df["exit_date"] < start].copy()
        if train.empty or test.empty or train.label.nunique() < 2:
            fold_metrics.append({"fold": k + 1, "status": "skipped",
                                 "train_rows": len(train), "test_rows": len(test),
                                 "test_start": start})
            continue

        y = train.label.to_numpy()
        pos = int(y.sum())
        neg = len(y) - pos
        model = xgb.XGBClassifier(
            n_estimators=250, max_depth=5, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
            min_child_weight=5, tree_method="hist",
            objective="binary:logistic", eval_metric="auc",
            scale_pos_weight=(neg / pos if pos else 1.0),
            n_jobs=-1, random_state=42,
        )
        model.fit(train[features], y, verbose=False)
        test["probability"] = model.predict_proba(test[features])[:, 1]
        test["fold"] = k + 1
        oof_parts.append(test[[
            "symbol", "date", "entry_date", "exit_date", "label",
            "future_return_gross", "future_return_net",
            "probability", "fold"
        ]])

        selected = test[test.probability >= args.signal_threshold]
        auc = (float(roc_auc_score(test.label, test.probability))
               if test.label.nunique() == 2 else None)
        fold_metrics.append({
            "fold": k + 1, "status": "completed",
            "test_start": start, "test_end_exclusive": end,
            "train_rows": int(len(train)), "test_rows": int(len(test)),
            "purge_rule": "exit_date < test_start",
            "auc": auc, "signals": int(len(selected)),
            "mean_gross_return": (float(selected.future_return_gross.mean())
                                  if len(selected) else None),
            "mean_net_return": (float(selected.future_return_net.mean())
                                if len(selected) else None),
            "net_win_rate": (float((selected.future_return_net > 0).mean())
                             if len(selected) else None),
        })
        model.save_model(str(model_dir / f"xgb_fold_{k + 1}.json"))
        print(f"Fold {k + 1}: train={len(train):,} test={len(test):,} "
              f"AUC={auc} signals={len(selected):,}")

    if not oof_parts:
        raise RuntimeError("No fold completed")
    oof = pd.concat(oof_parts, ignore_index=True)
    selected = oof[oof.probability >= args.signal_threshold]
    overall_auc = (float(roc_auc_score(oof.label, oof.probability))
                   if oof.label.nunique() == 2 else None)
    oof.to_parquet(out_dir / "oof_predictions.parquet", index=False)

    report = {
        "pipeline": "causal_purged_walk_forward_v1",
        "input": str(source), "horizon_trading_sessions": args.horizon,
        "label_net_return_threshold": args.label_threshold,
        "round_trip_cost": args.round_trip_cost,
        "signal_probability_threshold": args.signal_threshold,
        "feature_count": len(features), "feature_names": features,
        "oof_rows": int(len(oof)), "overall_oof_auc": overall_auc,
        "oof_signal_count": int(len(selected)),
        "oof_mean_gross_return": (float(selected.future_return_gross.mean())
                                  if len(selected) else None),
        "oof_mean_net_return": (float(selected.future_return_net.mean())
                                if len(selected) else None),
        "oof_net_win_rate": (float((selected.future_return_net > 0).mean())
                             if len(selected) else None),
        "folds": fold_metrics,
        "production_model_trained": False,
        "warning": "Research metrics only; validate execution, liquidity, "
                   "price limits, corporate actions and survivorship bias.",
    }
    (out_dir / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OOF AUC: {overall_auc}; rows={len(oof):,}; signals={len(selected):,}")


if __name__ == "__main__":
    main()
