#!/usr/bin/env python3
# TSE.Engine - Memory-conscious chronological multi-horizon training.
# Input SQLite targets already include the assumed 0.2% round-trip cost.
# No random split. A 60-session purge is applied before each test window.

import os
import json
import sqlite3
import argparse
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

def load_dataset(db_path):
    con = sqlite3.connect(db_path)
    try:
        count = con.execute(
            "SELECT COUNT(*) FROM dataset"
        ).fetchone()[0]
        if not count:
            raise RuntimeError("The dataset table is empty.")

        first = con.execute(
            "SELECT features FROM dataset LIMIT 1"
        ).fetchone()
        feature_names = sorted(json.loads(first[0]).keys())
        if not feature_names:
            raise RuntimeError("No feature columns found in JSON.")

        n_features = len(feature_names)
        X = np.empty((count, n_features), dtype=np.float32)
        dates = np.empty(count, dtype=np.int32)
        y20 = np.empty(count, dtype=np.float32)
        y40 = np.empty(count, dtype=np.float32)
        y60 = np.empty(count, dtype=np.float32)

        cursor = con.execute("""
            SELECT date, features, target_20, target_40, target_60
            FROM dataset
            ORDER BY date, symbol
        """)

        pos = 0
        while True:
            rows = cursor.fetchmany(20000)
            if not rows:
                break

            end = pos + len(rows)
            for j, row in enumerate(rows, start=pos):
                d, feature_json, t20, t40, t60 = row
                values = json.loads(feature_json)
                X[j] = [values.get(k, np.nan) for k in feature_names]
                dates[j] = int(str(d).replace("-", "")[:8])
                y20[j] = np.nan if t20 is None else float(t20)
                y40[j] = np.nan if t40 is None else float(t40)
                y60[j] = np.nan if t60 is None else float(t60)

            pos = end
            if pos % 200000 < 20000:
                print(f"Loaded {pos:,}/{count:,} rows", flush=True)

        if pos != count:
            raise RuntimeError(f"Row count mismatch: expected {count}, loaded {pos}")

        return X, dates, {
            20: y20,
            40: y40,
            60: y60,
        }, feature_names
    finally:
        con.close()


def safe_metrics(y_true, prob):
    pred = (prob >= 0.60).astype(np.int8)
    result = {
        "positive_rate_pct": float(np.mean(y_true) * 100),
        "precision_at_060_pct": float(precision_score(
            y_true, pred, zero_division=0
        ) * 100),
        "recall_at_060_pct": float(recall_score(
            y_true, pred, zero_division=0
        ) * 100),
        "f1_at_060": float(f1_score(
            y_true, pred, zero_division=0
        )),
        "baseline_ap_pct": float(np.mean(y_true) * 100),
    }
    if len(np.unique(y_true)) > 1:
        result["roc_auc"] = float(roc_auc_score(y_true, prob))
        result["average_precision_pct"] = float(
            average_precision_score(y_true, prob) * 100
        )
    else:
        result["roc_auc"] = None
        result["average_precision_pct"] = None
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--out", default="results")
    parser.add_argument("--threshold", type=float, default=0.017)
    parser.add_argument("--embargo", type=int, default=60)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    print("Loading SQLite dataset...", flush=True)
    X, dates, targets, feature_names = load_dataset(args.db)

    unique_dates = np.unique(dates)
    n_dates = len(unique_dates)
    print(f"Rows: {len(dates):,}", flush=True)
    print(f"Symbols represented in rows: {sqlite3.connect(args.db).execute('SELECT COUNT(DISTINCT symbol) FROM dataset').fetchone()[0]}", flush=True)
    print(f"Features: {len(feature_names)}", flush=True)
    print(f"Trading dates: {n_dates}", flush=True)
    print(f"Feature names: {feature_names}", flush=True)

    if n_dates < 500:
        raise RuntimeError("Too few distinct dates for reliable walk-forward training.")

    # Four expanding chronological test folds, covering 20%-80% of history.
    # The final 20% is held aside and not used for fold reporting.
    fold_ranges = []
    for fold in range(4):
        start_frac = 0.20 + fold * 0.15
        end_frac = start_frac + 0.15
        start_i = int(n_dates * start_frac)
        end_i = min(int(n_dates * end_frac), n_dates)
        if end_i > start_i:
            fold_ranges.append((fold + 1, start_i, end_i))

    fold_results = []
    final_models = {}

    for horizon in (20, 40, 60):
        print(f"\n========== HORIZON {horizon} ==========", flush=True)
        raw_y = targets[horizon]
        valid = np.isfinite(raw_y)
        labels = (raw_y > args.threshold).astype(np.int8)

        for fold, test_start_i, test_end_i in fold_ranges:
            train_end_i = max(0, test_start_i - args.embargo)
            train_cutoff = unique_dates[train_end_i] if train_end_i > 0 else -1
            test_start = unique_dates[test_start_i]
            test_end = unique_dates[test_end_i - 1]

            train_mask = valid & (dates < train_cutoff)
            test_mask = valid & (dates >= test_start) & (dates <= test_end)

            train_idx = np.flatnonzero(train_mask)
            test_idx = np.flatnonzero(test_mask)

            if len(train_idx) < 10000 or len(test_idx) < 1000:
                print(
                    f"Fold {fold}: skipped (train={len(train_idx)}, test={len(test_idx)})",
                    flush=True,
                )
                continue

            y_train = labels[train_idx]
            y_test = labels[test_idx]
            if len(np.unique(y_train)) < 2 or len(np.unique(y_test)) < 2:
                print(f"Fold {fold}: skipped; only one class in train or test.", flush=True)
                continue

            positives = max(int(y_train.sum()), 1)
            negatives = max(len(y_train) - positives, 1)
            model = xgb.XGBClassifier(
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

            print(
                f"Fold {fold}: fitting train={len(train_idx):,}, test={len(test_idx):,}",
                flush=True,
            )
            model.fit(X[train_idx], y_train, verbose=False)
            prob = model.predict_proba(X[test_idx])[:, 1]
            metrics = safe_metrics(y_test, prob)
            row = {
                "horizon": horizon,
                "fold": fold,
                "train_rows": len(train_idx),
                "test_rows": len(test_idx),
                "train_last_date": int(train_cutoff),
                "test_start_date": int(test_start),
                "test_end_date": int(test_end),
                **metrics,
            }
            fold_results.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            del model, prob, train_idx, test_idx

        # Final model uses data only up to the beginning of the untouched final 20%.
        final_cut_i = int(n_dates * 0.80)
        final_cutoff = unique_dates[final_cut_i]
        final_idx = np.flatnonzero(valid & (dates < final_cutoff))
        if len(final_idx) < 10000 or len(np.unique(labels[final_idx])) < 2:
            raise RuntimeError(f"Insufficient data to fit final H{horizon} model.")

        y_final = labels[final_idx]
        positives = max(int(y_final.sum()), 1)
        negatives = max(len(y_final) - positives, 1)
        final_model = xgb.XGBClassifier(
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
        print(
            f"Fitting final H{horizon} model on {len(final_idx):,} rows; cutoff={final_cutoff}",
            flush=True,
        )
        final_model.fit(X[final_idx], y_final, verbose=False)
        model_path = os.path.join(args.out, f"xgb_h{horizon}.json")
        # Save Booster directly to avoid sklearn-wrapper metadata issues.
        final_model.get_booster().save_model(model_path)
        final_models[str(horizon)] = {
            "model_file": os.path.basename(model_path),
            "training_rows": int(len(final_idx)),
            "training_cutoff_exclusive": int(final_cutoff),
            "positive_rate_pct": float(y_final.mean() * 100),
        }
        del final_model, final_idx

    if not fold_results:
        raise RuntimeError("No valid walk-forward fold produced evaluation metrics.")

    df = pd.DataFrame(fold_results)
    df.to_csv(os.path.join(args.out, "walk_forward_metrics.csv"), index=False)

    summary = (
        df.groupby("horizon")
        .agg(
            folds=("fold", "count"),
            mean_roc_auc=("roc_auc", "mean"),
            mean_average_precision_pct=("average_precision_pct", "mean"),
            mean_precision_at_060_pct=("precision_at_060_pct", "mean"),
            mean_positive_rate_pct=("positive_rate_pct", "mean"),
        )
        .reset_index()
    )
    summary.to_csv(os.path.join(args.out, "summary_metrics.csv"), index=False)

    metadata = {
        "rows": int(len(dates)),
        "distinct_dates": int(n_dates),
        "feature_names": feature_names,
        "horizons": [20, 40, 60],
        "positive_label": f"net target return > {args.threshold}",
        "targets_already_include_assumed_round_trip_cost": True,
        "additional_cost_subtracted_during_training": False,
        "embargo_sessions": int(args.embargo),
        "walk_forward_folds": 4,
        "final_model_training_cutoff_fraction": 0.80,
        "final_models": final_models,
        "important_data_caveat": (
            "Exploratory only: point-in-time corporate-action adjustments "
            "for dividends and capital increases have not yet been independently validated."
        ),
    }
    with open(os.path.join(args.out, "training_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print("\n===== WALK-FORWARD SUMMARY =====", flush=True)
    print(summary.to_string(index=False), flush=True)
    print(f"\nOutputs saved in: {args.out}", flush=True)


if __name__ == "__main__":
    main()
