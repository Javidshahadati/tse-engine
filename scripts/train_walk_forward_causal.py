"""Multi-horizon walk-forward training using authoritative net targets."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import roc_auc_score

RAW = {
    "symbol", "date", "open", "high", "low", "close", "volume",
    "target_20", "target_40", "target_60",
    "ohl_geometry_valid", "close_in_trade_range",
    "IsLimitUp", "IsLimitDown"
}


def train_one(source, horizon, args, root):
    target_col = f"target_{horizon}"
    df = source.sort_values(["symbol", "date"]).reset_index(drop=True).copy()

    g = df.groupby("symbol", sort=False)
    df["entry_date"] = g.date.shift(-1)
    df["exit_date"] = g.date.shift(-horizon)

    # Target is used verbatim; no OHLC return reconstruction or second cost.
    df["future_return_net"] = pd.to_numeric(df[target_col], errors="coerce")
    df = df.dropna(
        subset=["entry_date", "exit_date", "future_return_net"]
    ).copy()
    if df.empty:
        raise RuntimeError(f"H{horizon}: no valid target rows")

    df["label"] = (
        df.future_return_net > args.label_threshold
    ).astype("int8")

    excluded = RAW | {
        "entry_date", "exit_date", "future_return_net", "label"
    }

    FEATURE_ALLOWLIST = ['RSI', 'RSI_slope', 'MACD', 'MACD_Sig', 'MACD_Hist', 'MACD_slope', 'EMA20', 'EMA50', 'EMA200', 'SMA20', 'BB_pct', 'BB_width', 'ATR_pct', 'Stoch', 'Stoch_D', 'WillR', 'CCI', 'MFI', 'OBV_slope', 'ADX', 'Return_1d', 'Return_5d', 'Return_20d', 'Volatility_20d', 'Price_EMA50_ratio', 'Price_EMA200_ratio', 'Volume_ratio', 'High_Low_range', 'Close_Open', 'Gap', 'Doji', 'Hammer', 'ShootingStar', 'BullEngulf', 'BearEngulf', 'InsideBar', 'OutsideBar', 'Body_pct', 'UpperWick_pct', 'LowerWick_pct', 'ClosePosition', 'IsLimitUp', 'IsLimitDown', 'DistToHigh20', 'DistToLow20', 'DistToHigh50', 'DistToLow50', 'RangePos20', 'BodyRange_ratio', 'Uptrend', 'Downtrend', 'BreakHigh20', 'BreakLow20', 'BreakHigh50', 'BreakLow50', 'Consolidation', 'ConsecUp_3', 'ConsecDown_3', 'BOS_Bull', 'BOS_Bear', 'CHoCH_Bull', 'CHoCH_Bear', 'FVG_Bull', 'FVG_Bear', 'ohl_geometry_valid', 'close_in_trade_range']

    missing_features = sorted(
        set(FEATURE_ALLOWLIST) - set(df.columns)
    )
    if missing_features:
        raise RuntimeError(
            f"Missing approved features: {missing_features}"
        )

    features = [
        c for c in FEATURE_ALLOWLIST
        if c not in excluded
        and pd.api.types.is_numeric_dtype(df[c])
    ]

    if len(features) != 62:
        raise RuntimeError(
            f"Expected 62 model features, got {len(features)}"
        )

    if not features:
        raise RuntimeError("No numeric features")

    dates = np.array(sorted(df.date.unique()))
    if len(dates) < args.folds + 2:
        raise RuntimeError(f"H{horizon}: insufficient dates")
    first = max(1, int(len(dates) * 0.50))
    edges = np.linspace(first, len(dates), args.folds + 1, dtype=int)

    out = root / f"H{horizon}"
    models = out / "models"
    models.mkdir(parents=True, exist_ok=True)
    oof_parts, fold_reports = [], []

    for k in range(args.folds):
        si, ei = edges[k], edges[k + 1]
        if ei <= si:
            continue
        start = int(dates[si])
        end = int(dates[ei]) if ei < len(dates) else int(dates[-1]) + 1

        test = df[(df.date >= start) & (df.date < end)].copy()
        train = df[df.exit_date < start].copy()

        if train.empty or test.empty or train.label.nunique() < 2:
            fold_reports.append({
                "fold": k + 1, "status": "skipped",
                "train_rows": len(train), "test_rows": len(test),
                "test_start": start
            })
            continue

        y = train.label.to_numpy()
        pos = int(y.sum())
        neg = len(y) - pos

        model = xgb.XGBClassifier(
            n_estimators=250, max_depth=5, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
            min_child_weight=5, tree_method="hist",
            objective="binary:logistic", eval_metric="auc",
            scale_pos_weight=neg / pos if pos else 1.0,
            n_jobs=-1, random_state=42
        )
        model.fit(train[features], y, verbose=False)
        test["probability"] = model.predict_proba(test[features])[:, 1]
        test["fold"] = k + 1
        oof_parts.append(test[[
            "symbol", "date", "entry_date", "exit_date",
            "future_return_net", "label", "probability", "fold"
        ]])

        selected = test[test.probability >= args.signal_threshold]
        auc = (
            float(roc_auc_score(test.label, test.probability))
            if test.label.nunique() == 2 else None
        )
        fold_reports.append({
            "fold": k + 1, "status": "completed",
            "test_start": start, "test_end_exclusive": end,
            "train_rows": len(train), "test_rows": len(test),
            "purge_rule": "exit_date < test_start",
            "auc": auc, "signals": len(selected),
            "mean_net_return": (
                float(selected.future_return_net.mean())
                if len(selected) else None
            ),
            "net_win_rate": (
                float((selected.future_return_net > 0).mean())
                if len(selected) else None
            )
        })
        model.save_model(str(models / f"xgb_fold_{k + 1}.json"))
        print(f"H{horizon} fold {k + 1} complete", flush=True)

    if not oof_parts:
        raise RuntimeError(f"H{horizon}: no completed folds")

    oof = pd.concat(oof_parts, ignore_index=True)
    selected = oof[oof.probability >= args.signal_threshold]
    auc = (
        float(roc_auc_score(oof.label, oof.probability))
        if oof.label.nunique() == 2 else None
    )
    oof.to_pickle(out / "oof_predictions.pkl")

    report = {
        "pipeline": "causal_walk_forward_authoritative_targets_v2",
        "horizon": horizon,
        "target_column": target_col,
        "target_recomputed": False,
        "second_cost_deduction": False,
        "target_semantics": "Validated net target from final_training.sqlite",
        "label_threshold_net": args.label_threshold,
        "signal_threshold": args.signal_threshold,
        "feature_count": len(features),
        "feature_names": features,
        "oof_rows": len(oof),
        "oof_file": "oof_predictions.pkl",
        "oof_format": "pickle",
        "overall_oof_auc": auc,
        "oof_signal_count": len(selected),
        "oof_mean_net_return": (
            float(selected.future_return_net.mean())
            if len(selected) else None
        ),
        "oof_net_win_rate": (
            float((selected.future_return_net > 0).mean())
            if len(selected) else None
        ),
        "folds": fold_reports,
        "production_model_trained": False,
        "point_in_time_adjustment_verified": False,
        "warning": (
            "Research only. Point-in-time corporate actions, survivorship, "
            "liquidity, execution and price-limit safety remain unverified."
        )
    }
    (out / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="outputs/features_causal_586.pkl")
    p.add_argument("--horizons", nargs="+", type=int,
                   choices=[20, 40, 60], default=[20, 40, 60])
    p.add_argument("--label-threshold", type=float, default=0.017)
    p.add_argument("--signal-threshold", type=float, default=0.60)
    p.add_argument("--folds", type=int, default=4)
    p.add_argument("--output-dir", default="outputs/causal_walk_forward")
    a = p.parse_args()

    if a.folds < 2 or not 0 < a.signal_threshold < 1:
        raise ValueError("Invalid folds or signal threshold")

    source = pd.read_pickle(a.input)
    required = {
        "symbol", "date", "target_20", "target_40", "target_60"
    }
    missing = required - set(source.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")
    if source.symbol.nunique() != 586:
        raise RuntimeError("Input must contain exactly 586 symbols")
    if source.duplicated(["symbol", "date"]).any():
        raise RuntimeError("Duplicate symbol/date keys")

    root = Path(a.output_dir)
    root.mkdir(parents=True, exist_ok=True)
    reports = {}
    for h in sorted(set(a.horizons)):
        reports[str(h)] = train_one(source, h, a, root)

    (root / "metrics_all_horizons.json").write_text(
        json.dumps({
            "pipeline": "causal_multi_horizon_walk_forward_v2",
            "universe_symbols": 586,
            "horizons": reports,
            "production_model_trained": False
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print("ALL REQUESTED HORIZONS COMPLETE")


if __name__ == "__main__":
    main()
