
"""Memory-bounded causal feature builder for six verified TSE chunks."""
import argparse
import gzip
import json
import sys
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from features.technical import build_technical_features
from features.price_action import build_pa_features
from features.rtm_causal import build_rtm_features_causal


def load_chunk(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("Invalid chunk: " + str(path))
    return data


def normalize(rows, symbol):
    cols = ["d", "o", "h", "l", "c", "v"]
    df = pd.DataFrame(rows)

    if not set(cols).issubset(df.columns):
        raise ValueError(symbol + ": missing OHLCV columns")

    df = df[cols].copy()

    for col in cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["d", "o", "h", "l", "c"])
    df["d"] = df["d"].astype("int64")
    df = df.sort_values("d", kind="mergesort").reset_index(drop=True)

    if df["d"].duplicated().any():
        raise ValueError(symbol + ": duplicate dates")

    if (df[["o", "h", "l", "c"]] <= 0).any().any():
        raise ValueError(symbol + ": non-positive OHLC")

    if (df["v"] < 0).any():
        raise ValueError(symbol + ": negative volume")

    # TSETMC closing price may be outside intraday H/L.
    # Geometry is checked only with O/H/L.
    df["ohl_geometry_valid"] = (
        (df["h"] >= df[["o", "l"]].max(axis=1)) &
        (df["l"] <= df[["o", "h"]].min(axis=1)) &
        (df["h"] >= df["l"])
    )

    df["close_in_trade_range"] = (
        (df["c"] >= df["l"]) &
        (df["c"] <= df["h"])
    )

    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="data/chunks")
    parser.add_argument(
        "--output", default="outputs/features_causal.parquet"
    )
    parser.add_argument("--swing", type=int, default=5)
    args = parser.parse_args()

    chunks = sorted(
        Path(args.input_dir).glob("ohlc_part_*.json.gz")
    )

    if len(chunks) != 6:
        raise RuntimeError(
            f"Expected 6 chunks, found {len(chunks)}"
        )

    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output

    output.parent.mkdir(parents=True, exist_ok=True)

    writer = None
    schema = None
    seen_symbols = set()

    summary = {
        "pipeline": "causal_ohlcv_streaming_v1",
        "input_files": [p.name for p in chunks],
        "input_symbols": 0,
        "processed_symbols": 0,
        "failed_symbols": [],
        "rows": 0,
        "date_min": None,
        "date_max": None,
        "fundamentals_included": False,
        "raw_prices_modified": False,
        "rtm_swing_confirmation_bars": args.swing
    }

    try:
        for chunk_path in chunks:
            universe = load_chunk(chunk_path)
            summary["input_symbols"] += len(universe)

            print(
                "Loaded", chunk_path.name,
                len(universe), "symbols",
                flush=True
            )

            for symbol, stock in universe.items():
                if symbol in seen_symbols:
                    raise RuntimeError(
                        "Duplicate symbol across chunks: " + symbol
                    )

                seen_symbols.add(symbol)

                try:
                    raw = normalize(stock.get("r", []), symbol)

                    if raw.empty:
                        raise ValueError("Empty history")

                    # Raw OHLC remains untouched.
                    feature_input = raw.copy()
                    bad = ~raw["ohl_geometry_valid"]

                    feature_input.loc[
                        bad, ["h", "l"]
                    ] = float("nan")

                    tech = build_technical_features(feature_input)
                    pa_features = build_pa_features(feature_input)
                    rtm = build_rtm_features_causal(
                        feature_input,
                        swing=args.swing
                    )

                    out = pd.concat(
                        [tech, pa_features, rtm],
                        axis=1
                    )

                    out.insert(0, "symbol", symbol)
                    out.insert(1, "date", raw["d"].to_numpy())

                    mapping = {
                        "o": "open",
                        "h": "high",
                        "l": "low",
                        "c": "close",
                        "v": "volume"
                    }

                    for src, dst in mapping.items():
                        out[dst] = raw[src].to_numpy()

                    out["ohl_geometry_valid"] = (
                        raw["ohl_geometry_valid"]
                        .astype("int8").to_numpy()
                    )

                    out["close_in_trade_range"] = (
                        raw["close_in_trade_range"]
                        .astype("int8").to_numpy()
                    )

                    # Stable Arrow schema across all symbols.
                    fixed = {
                        "symbol": "string",
                        "date": "int64",
                        "open": "float64",
                        "high": "float64",
                        "low": "float64",
                        "close": "float64",
                        "volume": "float64",
                        "ohl_geometry_valid": "int8",
                        "close_in_trade_range": "int8"
                    }

                    for col, dtype in fixed.items():
                        out[col] = out[col].astype(dtype)

                    feature_cols = [
                        c for c in out.columns
                        if c not in fixed
                    ]

                    for col in feature_cols:
                        out[col] = pd.to_numeric(
                            out[col], errors="coerce"
                        ).astype("float64")

                    table = pa.Table.from_pandas(
                        out, preserve_index=False
                    )

                    if writer is None:
                        schema = table.schema
                        writer = pq.ParquetWriter(
                            output,
                            schema,
                            compression="zstd"
                        )
                    else:
                        table = table.cast(schema, safe=False)

                    writer.write_table(table)

                    summary["processed_symbols"] += 1
                    summary["rows"] += len(raw)

                    lo = int(raw["d"].min())
                    hi = int(raw["d"].max())

                    if summary["date_min"] is None:
                        summary["date_min"] = lo
                        summary["date_max"] = hi
                    else:
                        summary["date_min"] = min(
                            lo, summary["date_min"]
                        )
                        summary["date_max"] = max(
                            hi, summary["date_max"]
                        )

                except Exception as exc:
                    summary["failed_symbols"].append({
                        "symbol": symbol,
                        "error": str(exc)[:300]
                    })

            del universe

            print(
                "Progress:",
                summary["processed_symbols"],
                "/ 604 symbols;",
                f"{summary['rows']:,} rows",
                flush=True
            )

    finally:
        if writer is not None:
            writer.close()

    if (
        summary["input_symbols"] != 604
        or summary["processed_symbols"] != 604
        or summary["rows"] != 1842402
        or summary["failed_symbols"]
    ):
        raise RuntimeError(
            "Build rejected. "
            + json.dumps(summary, ensure_ascii=False)
        )

    summary_path = output.with_name(
        "features_causal_summary.json"
    )

    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("BUILD COMPLETE")
    print("604 symbols / 1,842,402 rows")
    print("Parquet:", output)
    print("Summary:", summary_path)


if __name__ == "__main__":
    main()
