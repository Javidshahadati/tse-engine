#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    precision_score,
    recall_score,
    f1_score,
)


def load_data(db_path):
    con = sqlite3.connect(
        f"file:{Path(db_path).resolve()}?mode=ro", uri=True
    )

    try:
        tables = {
            r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }

        cols = {
            r[1] for r in con.execute(
                "PRAGMA table_info(dataset)"
            )
        }

        required = {
            "date", "symbol", "features",
            "target_20", "target_40", "target_60"
        }

        if not required.issubset(cols):
            raise RuntimeError(
                f"Missing columns: {required - cols}"
            )

        count = con.execute(
            "SELECT COUNT(*) FROM dataset"
        ).fetchone()[0]

        first = con.execute(
            "SELECT features FROM dataset LIMIT 1"
        ).fetchone()

        feature_names = sorted(
            json.loads(first[0]).keys()
        )

        X = np.empty(
            (count, len(feature_names)),
            dtype=np.float32
        )

        dates = np.empty(count, dtype=np.int32)
        symbols = np.empty(count, dtype=object)

        targets = {
            h: np.full(count, np.nan, dtype=np.float32)
            for h in (20, 40, 60)
        }

        cursor = con.execute("""
            SELECT date, symbol, features,
                   target_20, target_40, target_60
            FROM dataset
            ORDER BY date, symbol
        """)

        pos = 0

        while True:
            batch = cursor.fetchmany(20000)

            if not batch:
                break

            for j, row in enumerate(batch, start=pos):
                d, sym, feature_json, t20, t40, t60 = row

                values = json.loads(feature_json)

                X[j] = [
                    values.get(k, np.nan)
                    for k in feature_names
                ]

                dates[j] = int(
                    str(d).replace("-", "")[:8]
                )

                symbols[j] = str(sym)

                for h, value in zip(
                    (20, 40, 60),
                    (t20, t40, t60)
                ):
                    targets[h][j] = (
                        np.nan if value is None
                        else float(value)
                    )

            pos += len(batch)

            if pos % 200000 < 20000:
                print(f"Loaded {pos:,}/{count:,}", flush=True)

        if pos != count:
            raise RuntimeError("Database row count mismatch")

        dataset_symbols = set(str(x) for x in np.unique(symbols))

        symbol_audit = {
            "dataset_unique_symbols": len(dataset_symbols),
            "symbol_stats_available": "symbol_stats" in tables,
        }

        if "symbol_stats" in tables:
            stat_cols = [
                r[1] for r in con.execute(
                    "PRAGMA table_info(symbol_stats)"
                )
            ]

            symbol_col = next(
                (c for c in ("symbol", "ticker", "ins_code")
                 if c in stat_cols),
                None
            )

            if symbol_col:
                stats_symbols = set(
                    str(r[0]) for r in con.execute(
                        f'SELECT DISTINCT "{symbol_col}" '
                        f'FROM symbol_stats '
                        f'WHERE "{symbol_col}" IS NOT NULL'
                    )
                )

                symbol_audit.update({
                    "symbol_stats_unique_symbols": len(stats_symbols),
                    "missing_from_dataset": sorted(
                        stats_symbols - dataset_symbols
                    ),
                    "not_in_symbol_stats": sorted(
                        dataset_symbols - stats_symbols
                    )
                })

        audit = {
            "rows": int(count),
            "symbols": len(dataset_symbols),
            "date_min": int(dates.min()),
            "date_max": int(dates.max()),
            "symbol_audit": symbol_audit,
            "tables": sorted(tables),
        }

        return X, dates, symbols, targets, feature_names, audit

    finally:
        con.close()


def make_model(y):
    positives = max(int(y.sum()), 1)
    negatives = max(len(y) - positives, 1)

    return xgb.XGBClassifier(
        n_estimators=220,
        max_depth=6,
        learning_rate=0.04,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=10,
        reg_lambda=5.0,
        objective="binary:logistic",
        eval_metric="aucpr",
        tree_method="hist",
        n_jobs=4,
        random_state=2026,
        scale_pos_weight=negatives / positives,
    )


def evaluate_returns(frame):
    selected = frame[frame["probability"] >= 0.60]

    result = {
        "selected_rows": int(len(selected)),
        "all_test_mean_net_return_pct":
            float(frame["target_return"].mean() * 100),
        "selected_mean_net_return_pct": None,
        "selected_median_net_return_pct": None,
        "selected_positive_rate_pct": None,
        "selected_excess_vs_test_pct_points": None,
    }

    if len(selected):
        result.update({
            "selected_mean_net_return_pct":
                float(selected["target_return"].mean() * 100),

            "selected_median_net_return_pct":
                float(selected["target_return"].median() * 100),

            "selected_positive_rate_pct":
                float((selected["target_return"] > 0).mean() * 100),

            "selected_excess_vs_test_pct_points":
                float(
                    (selected["target_return"].mean()
                     - frame["target_return"].mean()) * 100
                ),
        })

    # Top 10% of model scores within each trading date.
    frame = frame.copy()

    frame["rank"] = frame.groupby("date")[
        "probability"
    ].rank(
        method="first",
        ascending=False,
        pct=True
    )

    top = frame[frame["rank"] <= 0.10]

    result["top_decile_rows"] = int(len(top))

    result["top_decile_mean_net_return_pct"] = (
        float(top["target_return"].mean() * 100)
        if len(top) else None
    )

    result["top_decile_positive_rate_pct"] = (
        float((top["target_return"] > 0).mean() * 100)
        if len(top) else None
    )

    result["test_dates"] = int(frame["date"].nunique())

    result["note"] = (
        "Forward-return cohort statistics, not a compounded "
        "portfolio equity curve."
    )

    return result


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--db", required=True)
    parser.add_argument("--out", default="holdout_results")
    parser.add_argument("--threshold", type=float, default=0.017)
    parser.add_argument("--embargo", type=int, default=60)

    args = parser.parse_args()

    if args.embargo < 60:
        raise ValueError("Embargo must be at least 60 sessions.")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    X, dates, symbols, targets, features, db_audit = load_data(
        args.db
    )

    unique_dates = np.unique(dates)
    n_dates = len(unique_dates)

    split_i = int(n_dates * 0.80)

    if split_i <= args.embargo:
        raise RuntimeError("Not enough dates for purged split.")

    holdout_start = int(unique_dates[split_i])

    train_cut_i = split_i - args.embargo

    train_cutoff = int(unique_dates[train_cut_i])

    train_date_mask = dates < train_cutoff
    test_date_mask = dates >= holdout_start

    print("Total dates:", n_dates)
    print("Training cutoff exclusive:", train_cutoff)
    print("Holdout start:", holdout_start)
    print("Embargo sessions:", args.embargo)

    reports = {}
    prediction_frames = []

    for horizon in (20, 40, 60):
        print(f"\n========== H{horizon} ==========")

        target = targets[horizon]
        valid = np.isfinite(target)

        train_idx = np.flatnonzero(
            valid & train_date_mask
        )

        test_idx = np.flatnonzero(
            valid & test_date_mask
        )

        if len(train_idx) < 10000:
            raise RuntimeError(
                f"H{horizon}: insufficient training rows"
            )

        if len(test_idx) < 1000:
            raise RuntimeError(
                f"H{horizon}: insufficient holdout rows"
            )

        y_train = (
            target[train_idx] > args.threshold
        ).astype(np.int8)

        y_test = (
            target[test_idx] > args.threshold
        ).astype(np.int8)

        if len(np.unique(y_train)) < 2:
            raise RuntimeError("Training has only one class.")

        if len(np.unique(y_test)) < 2:
            raise RuntimeError("Holdout has only one class.")

        model = make_model(y_train)

        print(
            f"Train={len(train_idx):,} "
            f"Holdout={len(test_idx):,}"
        )

        model.fit(
            X[train_idx],
            y_train,
            verbose=False
        )

        probabilities = model.predict_proba(
            X[test_idx]
        )[:, 1]

        predicted = (
            probabilities >= 0.60
        ).astype(np.int8)

        metrics = {
            "train_rows": int(len(train_idx)),
            "holdout_rows": int(len(test_idx)),
            "train_last_date": int(
                unique_dates[train_cut_i - 1]
            ),
            "training_cutoff_exclusive": train_cutoff,
            "holdout_start": holdout_start,
            "holdout_end": int(unique_dates[-1]),
            "embargo_sessions": args.embargo,
            "positive_rate_pct": float(y_test.mean() * 100),
            "precision_at_060_pct": float(
                precision_score(
                    y_test, predicted, zero_division=0
                ) * 100
            ),
            "recall_at_060_pct": float(
                recall_score(
                    y_test, predicted, zero_division=0
                ) * 100
            ),
            "f1_at_060": float(
                f1_score(
                    y_test, predicted, zero_division=0
                )
            ),
            "roc_auc": float(
                roc_auc_score(y_test, probabilities)
            ),
            "average_precision_pct": float(
                average_precision_score(
                    y_test, probabilities
                ) * 100
            ),
        }

        pred = pd.DataFrame({
            "symbol": symbols[test_idx],
            "date": dates[test_idx],
            "horizon": horizon,
            "probability": probabilities,
            "target_return": target[test_idx],
            "label": y_test,
        })

        returns = evaluate_returns(pred)

        model_path = out / (
            f"xgb_h{horizon}_purged_holdout.json"
        )

        model.get_booster().save_model(str(model_path))

        reports[str(horizon)] = {
            "classification": metrics,
            "forward_return_cohort": returns,
            "model_file": model_path.name,
        }

        prediction_frames.append(pred)

        print(json.dumps(
            reports[str(horizon)],
            ensure_ascii=False
        ))

        del model, probabilities, train_idx, test_idx

    all_predictions = pd.concat(
        prediction_frames,
        ignore_index=True
    )

    all_predictions.to_csv(
        out / "holdout_predictions.csv",
        index=False
    )

    report = {
        "validation": "chronological_final_20_percent",
        "database": db_audit,
        "total_trading_dates": n_dates,
        "holdout_start": holdout_start,
        "embargo_sessions": args.embargo,
        "positive_return_threshold": args.threshold,
        "probability_signal_threshold": 0.60,
        "targets_include_assumed_round_trip_cost": True,
        "additional_cost_subtracted": False,
        "features": features,
        "horizons": reports,
        "limitations": [
            "Forward-return cohorts are not a compounded portfolio backtest.",
            "Point-in-time corporate-action adjustments remain unverified.",
            "Survivorship bias remains unresolved.",
            "These purged models differ from the previously published final models."
        ],
    }

    (out / "holdout_validation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("\nHOLDOUT VALIDATION COMPLETE")


if __name__ == "__main__":
    main()
