"""Build causal OHLCV features from the verified full file or six chunks."""
import argparse
import gzip
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from features.technical import build_technical_features
from features.price_action import build_pa_features
from features.rtm_causal import build_rtm_features_causal


def load_json_gz(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return obj


def load_universe(input_path):
    path = Path(input_path)
    if path.is_file():
        return load_json_gz(path), [str(path)]
    if not path.is_dir():
        raise FileNotFoundError(path)
    chunks = sorted(path.glob("*.json.gz"))
    if not chunks:
        raise FileNotFoundError(f"No .json.gz chunks in {path}")
    merged = {}
    for chunk_path in chunks:
        chunk = load_json_gz(chunk_path)
        overlap = set(merged).intersection(chunk)
        if overlap:
            raise ValueError(f"Overlapping chunk symbols: {sorted(overlap)[:5]}")
        merged.update(chunk)
    return merged, [str(p) for p in chunks]


def normalize_rows(rows, symbol):
    frame = pd.DataFrame(rows)
    required = ["d", "o", "h", "l", "c", "v"]
    missing = set(required) - set(frame.columns)
    if missing:
        raise ValueError(f"{symbol}: missing fields {sorted(missing)}")
    frame = frame[required].copy()
    frame["d"] = pd.to_numeric(frame["d"], errors="coerce")
    for col in required[1:]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=["d", "o", "h", "l", "c"])
    frame["d"] = frame["d"].astype("int64")
    frame = frame.sort_values("d", kind="mergesort").reset_index(drop=True)
    if frame["d"].duplicated().any():
        raise ValueError(f"{symbol}: duplicate dates")
    if (frame[["o", "h", "l", "c"]] <= 0).any().any():
        raise ValueError(f"{symbol}: non-positive OHLC")
    if (frame["v"] < 0).any():
        raise ValueError(f"{symbol}: negative volume")
    if (frame["h"] < frame[["o", "l", "c"]].max(axis=1)).any():
        raise ValueError(f"{symbol}: invalid high")
    if (frame["l"] > frame[["o", "h", "c"]].min(axis=1)).any():
        raise ValueError(f"{symbol}: invalid low")
    return frame


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="data/ohlc_full.json.gz",
                   help="Full gzip JSON or directory containing six gzip JSON chunks")
    p.add_argument("--output", default="outputs/features_causal.parquet")
    p.add_argument("--swing", type=int, default=5)
    args = p.parse_args()

    universe, sources = load_universe(args.input)
    frames, errors = [], []
    print(f"Loaded {len(universe)} symbols from {len(sources)} file(s)")

    for i, (symbol, stock) in enumerate(universe.items(), 1):
        try:
            raw = normalize_rows(stock.get("r", []), symbol)
            if raw.empty:
                errors.append({"symbol": symbol, "error": "no valid rows"})
                continue
            tech = build_technical_features(raw)
            pa = build_pa_features(raw)
            rtm = build_rtm_features_causal(raw, swing=args.swing)
            feats = pd.concat([tech, pa, rtm], axis=1)

            out = feats.copy()
            out.insert(0, "symbol", symbol)
            out.insert(1, "date", raw["d"].to_numpy())
            for col in ["o", "h", "l", "c", "v"]:
                out[{"o":"open", "h":"high", "l":"low",
                     "c":"close", "v":"volume"}[col]] = raw[col].to_numpy()
            frames.append(out)
            if i % 50 == 0:
                print(f"Processed {i}/{len(universe)}")
        except Exception as exc:
            errors.append({"symbol": symbol, "error": str(exc)[:300]})

    if not frames:
        raise RuntimeError("No symbols processed successfully")
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    excluded = {"symbol", "date", "open", "high", "low", "close", "volume"}
    feature_names = [c for c in combined.columns if c not in excluded]

    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(output, index=False)

    summary = {
        "pipeline": "causal_ohlcv_v1",
        "input_sources": sources,
        "input_symbols": len(universe),
        "processed_symbols": int(combined["symbol"].nunique()),
        "failed_symbols": errors,
        "rows": int(len(combined)),
        "date_min": int(combined["date"].min()),
        "date_max": int(combined["date"].max()),
        "feature_count": len(feature_names),
        "feature_names": feature_names,
        "fundamentals_included": False,
        "rtm_swing_confirmation_bars": args.swing,
        "warmup_rows_removed": 0,
        "missing_feature_values_filled": False,
    }
    summary_path = output.with_name("features_causal_summary.json")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2),
                            encoding="utf-8")
    print(f"BUILD COMPLETE: {combined['symbol'].nunique()} symbols, "
          f"{len(combined):,} rows, {len(feature_names)} features")
    print(f"Parquet: {output}")
    print(f"Summary: {summary_path}")
    print(f"Failed symbols: {len(errors)}")


if __name__ == "__main__":
    main()
