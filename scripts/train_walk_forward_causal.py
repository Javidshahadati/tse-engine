
"""Multi-model purged walk-forward research trainer. H20/H40/H60 only."""
import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from catboost import CatBoostClassifier

warnings.filterwarnings("ignore")

HORIZONS = (20, 40, 60)
FEATURE_ALLOWLIST = ['RSI', 'RSI_slope', 'MACD', 'MACD_Sig', 'MACD_Hist', 'MACD_slope', 'EMA20', 'EMA50', 'EMA200', 'SMA20', 'BB_pct', 'BB_width', 'ATR_pct', 'Stoch', 'Stoch_D', 'WillR', 'CCI', 'MFI', 'OBV_slope', 'ADX', 'Return_1d', 'Return_5d', 'Return_20d', 'Volatility_20d', 'Price_EMA50_ratio', 'Price_EMA200_ratio', 'Volume_ratio', 'High_Low_range', 'Close_Open', 'Gap', 'Doji', 'Hammer', 'ShootingStar', 'BullEngulf', 'BearEngulf', 'InsideBar', 'OutsideBar', 'Body_pct', 'UpperWick_pct', 'LowerWick_pct', 'ClosePosition', 'IsLimitUp', 'IsLimitDown', 'DistToHigh20', 'DistToLow20', 'DistToHigh50', 'DistToLow50', 'RangePos20', 'BodyRange_ratio', 'Uptrend', 'Downtrend', 'BreakHigh20', 'BreakLow20', 'BreakHigh50', 'BreakLow50', 'Consolidation', 'ConsecUp_3', 'ConsecDown_3', 'BOS_Bull', 'BOS_Bear', 'CHoCH_Bull', 'CHoCH_Bear', 'FVG_Bull', 'FVG_Bear', 'ohl_geometry_valid', 'close_in_trade_range']

RAW = {
    "symbol", "date", "open", "high", "low", "close", "volume",
    "target_20", "target_40", "target_60",
    "ohl_geometry_valid", "close_in_trade_range",
    "IsLimitUp", "IsLimitDown"
}

def auc_score(y, p):
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None

def make_models(pos_weight, seed, threads):
    return {
        "xgboost": XGBClassifier(
            n_estimators=250, max_depth=5, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, reg_lambda=2,
            min_child_weight=5, tree_method="hist",
            objective="binary:logistic", eval_metric="auc",
            scale_pos_weight=pos_weight, n_jobs=threads,
            random_state=seed
        ),
        "lightgbm": LGBMClassifier(
            n_estimators=250, learning_rate=0.04, num_leaves=31,
            subsample=0.8, colsample_bytree=0.8,
            reg_lambda=2, verbosity=-1, n_jobs=threads,
            scale_pos_weight=pos_weight, random_state=seed
        ),
        "catboost": CatBoostClassifier(
            iterations=250, depth=6, learning_rate=0.04,
            loss_function="Logloss", verbose=False,
            thread_count=threads, random_seed=seed,
            scale_pos_weight=pos_weight,
            allow_writing_files=False
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=200, max_depth=12, min_samples_leaf=20,
            max_features="sqrt", class_weight="balanced_subsample",
            n_jobs=threads, random_state=seed
        ),
        "extra_trees": ExtraTreesClassifier(
            n_estimators=200, max_depth=14, min_samples_leaf=15,
            max_features="sqrt", class_weight="balanced",
            n_jobs=threads, random_state=seed
        ),
        "logistic_regression": make_pipeline(
            StandardScaler(),
            LogisticRegression(
                C=0.1, max_iter=400, class_weight="balanced",
                random_state=seed
            )
        ),
        "mlp": make_pipeline(
            StandardScaler(),
            MLPClassifier(
                hidden_layer_sizes=(128, 64), alpha=0.001,
                batch_size=2048, max_iter=60,
                early_stopping=True, validation_fraction=0.12,
                n_iter_no_change=7, random_state=seed
            )
        )
    }

def summarize(oof, threshold):
    selected = oof[oof.probability >= threshold]
    return {
        "oof_rows": int(len(oof)),
        "auc": auc_score(oof.label, oof.probability),
        "average_precision": float(
            average_precision_score(oof.label, oof.probability)
        ),
        "brier_score": float(
            brier_score_loss(oof.label, oof.probability)
        ),
        "signals": int(len(selected)),
        "mean_net_return": (
            float(selected.future_return_net.mean())
            if len(selected) else None
        ),
        "net_win_rate": (
            float((selected.future_return_net > 0).mean())
            if len(selected) else None
        )
    }

def train_horizon(source, horizon, args, output):
    target = f"target_{horizon}"
    df = source.sort_values(["symbol", "date"]).reset_index(drop=True).copy()

    grouped = df.groupby("symbol", sort=False)
    df["entry_date"] = grouped.date.shift(-1)
    df["exit_date"] = grouped.date.shift(-horizon)
    df["future_return_net"] = pd.to_numeric(df[target], errors="coerce")
    df = df.dropna(
        subset=["entry_date", "exit_date", "future_return_net"]
    ).copy()

    if df.empty:
        raise RuntimeError(f"H{horizon}: no valid rows")

    df["label"] = (
        df.future_return_net > args.label_threshold
    ).astype("int8")

    missing = sorted(set(FEATURE_ALLOWLIST) - set(df.columns))
    if missing:
        raise RuntimeError(f"Missing features: {missing}")

    excluded = RAW | {
        "entry_date", "exit_date", "future_return_net", "label"
    }
    features = [
        c for c in FEATURE_ALLOWLIST
        if c not in excluded
        and pd.api.types.is_numeric_dtype(df[c])
    ]
    if len(features) != 62:
        raise RuntimeError(
            f"Expected 62 numeric features; found {len(features)}"
        )

    df[features] = df[features].replace([np.inf, -np.inf], np.nan)
    dates = np.array(sorted(df.date.unique()))
    if len(dates) < args.folds + 2:
        raise RuntimeError(f"H{horizon}: insufficient dates")

    first = max(1, int(len(dates) * 0.50))
    edges = np.linspace(first, len(dates), args.folds + 1, dtype=int)

    out = output / f"H{horizon}"
    models_dir = out / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    predictions = {}
    folds_report = []

    for fold in range(args.folds):
        si, ei = edges[fold], edges[fold + 1]
        if ei <= si:
            continue

        start = int(dates[si])
        end = int(dates[ei]) if ei < len(dates) else int(dates[-1]) + 1

        # Purge: هیچ نمونه آموزشی که افق خروجش به شروع آزمون برسد مجاز نیست.
        train = df[df.exit_date < start].copy()
        test = df[(df.date >= start) & (df.date < end)].copy()

        if train.empty or test.empty or train.label.nunique() < 2:
            folds_report.append({
                "fold": fold + 1, "status": "skipped",
                "train_rows": len(train), "test_rows": len(test)
            })
            continue

        y = train.label.to_numpy()
        positives = int(y.sum())
        negatives = len(y) - positives
        if positives == 0 or negatives == 0:
            raise RuntimeError("Training fold has only one class.")

        weight = negatives / positives
        fold_predictions = {}
        fold_dir = models_dir / f"fold_{fold+1}"
        fold_dir.mkdir(exist_ok=True)

        # Fit imputation ONLY on this fold's training rows.
        # Apply the same fitted transform to held-out test rows.
        # Preserve all 62 columns, including entirely-missing columns.
        imputer = SimpleImputer(
            strategy="median",
            keep_empty_features=True
        )
        x_train = imputer.fit_transform(train[features])
        x_test = imputer.transform(test[features])

        # Save preprocessing with the fold models.
        joblib.dump(
            imputer,
            fold_dir / "feature_imputer.joblib",
            compress=3
        )

        for name, estimator in make_models(
            weight, args.seed, args.threads
        ).items():
            model = clone(estimator)
            model.fit(x_train, y)
            probability = model.predict_proba(x_test)[:, 1]
            fold_predictions[name] = probability

            part = test[[
                "symbol", "date", "entry_date", "exit_date",
                "future_return_net", "label"
            ]].copy()
            part["probability"] = probability
            part["fold"] = fold + 1
            predictions.setdefault(name, []).append(part)

            if name == "xgboost":
                model.save_model(str(fold_dir / "xgboost.json"))
            elif name == "lightgbm":
                model.booster_.save_model(str(fold_dir / "lightgbm.txt"))
            elif name == "catboost":
                model.save_model(str(fold_dir / "catboost.cbm"))
            else:
                joblib.dump(model, fold_dir / f"{name}.joblib", compress=3)

        # Ensemble ساده با میانگین احتمال‌ها؛ هیچ پیش‌بینی آزمونی
        # در آموزش مدل‌های پایه استفاده نشده است.
        ensemble = np.mean(
            np.column_stack(list(fold_predictions.values())), axis=1
        )
        part = test[[
            "symbol", "date", "entry_date", "exit_date",
            "future_return_net", "label"
        ]].copy()
        part["probability"] = ensemble
        part["fold"] = fold + 1
        predictions.setdefault("ensemble_equal_weight", []).append(part)

        folds_report.append({
            "fold": fold + 1, "status": "completed",
            "test_start": start, "test_end_exclusive": end,
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "purge_rule": "exit_date < test_start",
            "auc": {
                name: auc_score(test.label, pred)
                for name, pred in fold_predictions.items()
            },
            "ensemble_auc": auc_score(test.label, ensemble)
        })
        print(f"H{horizon}: fold {fold+1} complete", flush=True)

    if not predictions:
        raise RuntimeError(f"H{horizon}: no completed folds")

    reports = {}
    for name, parts in predictions.items():
        oof = pd.concat(parts, ignore_index=True)
        oof = oof.sort_values(["date", "symbol"])
        oof.to_parquet(out / f"oof_{name}.parquet", index=False)
        reports[name] = summarize(oof, args.signal_threshold)

    ranked = sorted(
        [
            {
                "model": name,
                "mean_net_return": report["mean_net_return"],
                "signals": report["signals"],
                "auc": report["auc"]
            }
            for name, report in reports.items()
            if report["mean_net_return"] is not None
            and report["signals"] >= args.min_signals
        ],
        key=lambda x: (
            x["mean_net_return"],
            x["auc"] if x["auc"] is not None else -1
        ),
        reverse=True
    )

    report = {
        "pipeline": "multi_model_purged_walk_forward",
        "horizon": horizon,
        "target_column": target,
        "target_recomputed": False,
        "second_cost_deduction": False,
        "feature_count": len(features),
        "feature_names": features,
        "label_threshold_net": args.label_threshold,
        "signal_threshold": args.signal_threshold,
        "models": reports,
        "ranking_by_mean_net_return": ranked,
        "folds": folds_report,
        "production_model_trained": False,
        "warning": (
            "Research only. Point-in-time corporate actions, survivorship, "
            "liquidity, execution and portfolio constraints are not verified."
        )
    }
    (out / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    return report

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--horizons", nargs="+", type=int, default=[20, 40, 60])
    p.add_argument("--label-threshold", type=float, default=0.017)
    p.add_argument("--signal-threshold", type=float, default=0.60)
    p.add_argument("--folds", type=int, default=4)
    p.add_argument("--threads", type=int, default=2)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--min-signals", type=int, default=100)
    p.add_argument("--output-dir", default="outputs/causal_walk_forward")
    a = p.parse_args()

    if tuple(sorted(set(a.horizons))) != HORIZONS:
        raise RuntimeError("Only H20, H40 and H60 must be trained.")
    if a.folds < 2 or a.threads < 1:
        raise RuntimeError("Invalid folds or thread count.")

    df = pd.read_pickle(a.input)
    required = {
        "symbol", "date", "target_20", "target_40", "target_60"
    }
    missing = required - set(df.columns)
    if missing:
        raise RuntimeError(f"Missing columns: {sorted(missing)}")
    if len(df) != 1472718 or df.symbol.nunique() != 586:
        raise RuntimeError("Dataset universe/row-count validation failed.")
    if df.duplicated(["symbol", "date"]).any():
        raise RuntimeError("Duplicate symbol/date keys.")

    expected_nulls = {
        "target_20": 0, "target_40": 32385, "target_60": 63574
    }
    actual_nulls = {
        c: int(df[c].isna().sum()) for c in expected_nulls
    }
    if actual_nulls != expected_nulls:
        raise RuntimeError(f"Target NULL mismatch: {actual_nulls}")

    out = Path(a.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    results = {}
    for h in HORIZONS:
        results[str(h)] = train_horizon(df, h, a, out)

    (out / "metrics_all_horizons.json").write_text(
        json.dumps({
            "pipeline": "TSE multi-model causal training",
            "universe_symbols": 586,
            "horizons": results,
            "production_model_trained": False
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print("ALL HORIZONS COMPLETED", flush=True)

if __name__ == "__main__":
    main()
