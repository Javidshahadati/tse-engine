"""Build causal features from the validated 586-symbol SQLite datasets."""
import argparse
import json
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from features.technical import build_technical_features
from features.price_action import build_pa_features
from features.rtm_causal import build_rtm_features_causal


def connect_readonly(path):
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    return sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)


def read_targets(path):
    with closing(connect_readonly(path)) as con:
        tables = pd.read_sql_query(
            "SELECT name FROM sqlite_master WHERE type='table'", con
        )["name"].tolist()
        if "dataset" not in tables:
            raise RuntimeError("Missing dataset table")
        targets = pd.read_sql_query(
            """SELECT symbol, CAST(date AS INTEGER) AS date,
                      target_20, target_40, target_60 FROM dataset""",
            con,
        )

    targets["symbol"] = targets["symbol"].astype(str)
    targets["date"] = pd.to_numeric(targets["date"], errors="coerce")
    if targets["date"].isna().any():
        raise RuntimeError("Invalid dates in target database")
    targets["date"] = targets["date"].astype("int64")

    symbols = sorted(targets.symbol.unique().tolist())
    if len(symbols) != 586:
        raise RuntimeError(
            f"Expected exactly 586 symbols; found {len(symbols)}"
        )
    if targets.duplicated(["symbol", "date"]).any():
        raise RuntimeError("Duplicate target keys")
    return targets, symbols


def read_bars(path, symbols):
    with closing(connect_readonly(path)) as con:
        tables = pd.read_sql_query(
            "SELECT name FROM sqlite_master WHERE type='table'", con
        )["name"].tolist()
        if "clean" not in tables:
            raise RuntimeError("Missing clean table in OHLC database")
        marks = ",".join(["?"] * len(symbols))
        bars = pd.read_sql_query(
            f"SELECT symbol,d,o,h,l,c,v FROM clean WHERE symbol IN ({marks})",
            con, params=symbols
        )
    bars["symbol"] = bars["symbol"].astype(str)
    bars["d"] = pd.to_numeric(bars["d"], errors="coerce")
    if bars["d"].isna().any():
        raise RuntimeError("Invalid OHLC dates")
    bars["d"] = bars["d"].astype("int64")
    return bars


def normalize(frame, symbol):
    cols = ["d", "o", "h", "l", "c", "v"]
    frame = frame[cols].copy()
    for col in cols[1:]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=["d", "o", "h", "l", "c"])
    frame["d"] = frame["d"].astype("int64")
    frame = frame.sort_values("d", kind="mergesort").reset_index(drop=True)

    if frame.d.duplicated().any():
        raise ValueError(f"{symbol}: duplicate dates")
    if (frame[["o", "h", "l", "c"]] <= 0).any().any():
        raise ValueError(f"{symbol}: non-positive OHLC")
    if (frame.v.dropna() < 0).any():
        raise ValueError(f"{symbol}: negative volume")

    frame["ohl_geometry_valid"] = (
        (frame.h >= frame[["o", "l"]].max(axis=1)) &
        (frame.l <= frame[["o", "h"]].min(axis=1)) &
        (frame.h >= frame.l)
    )
    frame["close_in_trade_range"] = (
        (frame.c >= frame.l) & (frame.c <= frame.h)
    )
    return frame


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ohlc-sqlite", required=True)
    p.add_argument("--targets-sqlite", required=True)
    p.add_argument("--output", default="outputs/features_causal_586.parquet")
    p.add_argument("--swing", type=int, default=5)
    a = p.parse_args()

    if a.swing < 1:
        raise ValueError("swing must be >= 1")

    targets, symbols = read_targets(a.targets_sqlite)
    bars = read_bars(a.ohlc_sqlite, symbols)

    frames, errors = [], []
    for i, symbol in enumerate(symbols, 1):
        try:
            raw = normalize(
                bars.loc[bars.symbol == symbol, ["d", "o", "h", "l", "c", "v"]],
                symbol
            )
            if raw.empty:
                raise ValueError("No valid OHLC rows")

            x = raw.copy()
            x.loc[~raw.ohl_geometry_valid, ["h", "l"]] = float("nan")

            feats = pd.concat([
                build_technical_features(x),
                build_pa_features(x),
                build_rtm_features_causal(x, swing=a.swing)
            ], axis=1)

            feats["ohl_geometry_valid"] = raw.ohl_geometry_valid.astype("int8").to_numpy()
            feats["close_in_trade_range"] = raw.close_in_trade_range.astype("int8").to_numpy()
            feats.insert(0, "symbol", symbol)
            feats.insert(1, "date", raw.d.to_numpy())

            for src, dst in (
                ("o", "open"), ("h", "high"), ("l", "low"),
                ("c", "close"), ("v", "volume")
            ):
                feats[dst] = raw[src].to_numpy()

            frames.append(feats)
            if i % 50 == 0 or i == 586:
                print(f"Processed {i}/586", flush=True)

        except Exception as e:
            errors.append({"symbol": symbol, "error": str(e)[:300]})

    if errors or len(frames) != 586:
        raise RuntimeError(
            "Build aborted; partial 586-symbol output is forbidden: "
            + json.dumps(errors[:20], ensure_ascii=False)
        )

    features = pd.concat(frames, ignore_index=True)
    if features.duplicated(["symbol", "date"]).any():
        raise RuntimeError("Duplicate feature keys")

    result = features.merge(
        targets, on=["symbol", "date"], how="inner",
        validate="one_to_one"
    )
    if len(result) != len(targets):
        raise RuntimeError(
            f"Missing OHLC matches: {len(targets) - len(result)}"
        )
    if result.symbol.nunique() != 586:
        raise RuntimeError("Final universe is not exactly 586 symbols")

    result = result.sort_values(["symbol", "date"]).reset_index(drop=True)
    excluded = {
        "symbol", "date", "open", "high", "low", "close", "volume",
        "target_20", "target_40", "target_60"
    }
    feature_names = [
        c for c in result.columns
        if c not in excluded and pd.api.types.is_numeric_dtype(result[c])
    ]

    out = Path(a.output)
    if not out.is_absolute():
        out = ROOT / out
    out.parent.mkdir(parents=True, exist_ok=True)
    result.to_parquet(out, index=False)

    summary = {
        "pipeline": "causal_ohlcv_authoritative_targets_v2",
        "universe_symbols": int(result.symbol.nunique()),
        "rows": int(len(result)),
        "feature_count": len(feature_names),
        "feature_names": feature_names,
        "target_source": "final_training.sqlite dataset table",
        "target_recomputed": False,
        "target_null_counts": {
            c: int(result[c].isna().sum())
            for c in ("target_20", "target_40", "target_60")
        },
        "sqlite_sources_read_only": True,
        "partial_build_allowed": False
    }
    out.with_name("features_causal_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"BUILD COMPLETE: 586 symbols, {len(result):,} rows")


if __name__ == "__main__":
    main()
