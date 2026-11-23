
#!/usr/bin/env python3
import argparse, gzip, json
from pathlib import Path
import numpy as np
import pandas as pd

def load_chunks(folder):
    parts = []

    for path in sorted(Path(folder).glob("ohlc_part_*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            obj = json.load(f)

        rows = []

        for sym, item in obj.items():
            for r in item.get("r", []):
                if len(r) >= 5:
                    rows.append((
                        sym,
                        int(r[0]),
                        float(r[1]),
                        float(r[4])
                    ))

        if rows:
            parts.append(pd.DataFrame(
                rows,
                columns=["symbol", "date", "open", "close"]
            ))

        print(f"Loaded {path.name}: {len(rows):,} rows")

    if not parts:
        raise RuntimeError("No dataset chunks found.")

    df = pd.concat(parts, ignore_index=True)

    df = df.drop_duplicates(
        ["symbol", "date"]
    ).sort_values(
        ["symbol", "date"]
    ).reset_index(drop=True)

    return df


def stats(s):
    s = s.dropna()

    if len(s) == 0:
        return {}

    result = {}

    for q in [1, 5, 10, 20, 25, 50, 75, 80, 90, 95, 99]:
        result[f"q{q}"] = float(s.quantile(q / 100))

    result.update({
        "mean": float(s.mean()),
        "std": float(s.std()),
        "count": int(len(s)),
        "positive_rate": float((s > 0).mean()),
        "negative_rate": float((s < 0).mean())
    })

    return result


def main():
    p = argparse.ArgumentParser()

    p.add_argument("--input-dir", default="data/chunks")
    p.add_argument("--output-dir", default="outputs/target_audit")
    p.add_argument("--horizons", default="20,40,60")
    p.add_argument(
        "--thresholds",
        default="0.017,0.05,0.10,0.15,0.20"
    )
    p.add_argument("--min-symbol-rows", type=int, default=120)

    args = p.parse_args()

    horizons = [int(x) for x in args.horizons.split(",")]
    thresholds = [float(x) for x in args.thresholds.split(",")]

    df = load_chunks(args.input_dir)

    counts = df.groupby("symbol").size()

    eligible = counts[
        counts >= args.min_symbol_rows
    ].index

    df = df[df.symbol.isin(eligible)].copy()

    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)

    g = df.groupby("symbol", sort=False)

    for h in horizons:
        df[f"entry_open_h{h}"] = g["open"].shift(-1)
        df[f"exit_close_h{h}"] = g["close"].shift(-h)

        df[f"return_h{h}"] = (
            df[f"exit_close_h{h}"] /
            df[f"entry_open_h{h}"] - 1
        )

    summaries = {}
    daily_rows = []

    for h in horizons:
        col = f"return_h{h}"

        valid = df.dropna(subset=[col]).copy()

        # Market proxy: cross-sectional median return per date.
        # Not official index return.
        valid["market_proxy"] = (
            valid.groupby("date")[col].transform("median")
        )

        valid["excess"] = (
            valid[col] - valid["market_proxy"]
        )

        valid["rank_pct"] = (
            valid.groupby("date")[col]
            .rank(pct=True, method="average")
        )

        top10 = valid["rank_pct"] >= 0.90
        top20 = valid["rank_pct"] >= 0.80

        summaries[str(h)] = {
            "return_distribution": stats(valid[col]),
            "market_proxy_distribution": stats(valid["market_proxy"]),
            "excess_return_distribution": stats(valid["excess"]),
            "rank_distribution": stats(valid["rank_pct"]),
            "top10_return": stats(valid.loc[top10, col]),
            "top20_return": stats(valid.loc[top20, col]),
            "top10_excess": stats(valid.loc[top10, "excess"]),
            "top20_excess": stats(valid.loc[top20, "excess"]),
            "threshold_rates": {
                str(t): float((valid[col] > t).mean())
                for t in thresholds
            },
            "rows": int(len(valid)),
            "symbols": int(valid.symbol.nunique()),
            "dates": int(valid.date.nunique())
        }

        valid["top10"] = top10
        valid["top20"] = top20

        for _, day in valid.groupby("date"):
            daily_rows.append({
                "horizon": h,
                "date": int(day.date.iloc[0]),
                "market_median": float(day.market_proxy.median()),
                "top10_return": (
                    float(day.loc[day.top10, col].mean())
                    if day.top10.any() else None
                ),
                "top20_return": (
                    float(day.loc[day.top20, col].mean())
                    if day.top20.any() else None
                ),
                "top10_excess": (
                    float(day.loc[day.top10, "excess"].mean())
                    if day.top10.any() else None
                ),
                "top20_excess": (
                    float(day.loc[day.top20, "excess"].mean())
                    if day.top20.any() else None
                )
            })

        print(
            f"Horizon {h}: "
            f"{len(valid):,} rows | "
            f"{valid.symbol.nunique()} symbols | "
            f"{valid.date.nunique()} dates"
        )

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    report = {
        "method": (
            "Signal after close[t]; entry open[t+1]; "
            "exit close[t+h]"
        ),
        "market_relative_definition": (
            "Stock return minus same-date cross-sectional "
            "median; not official index return"
        ),
        "input_rows": int(len(df)),
        "symbols": int(df.symbol.nunique()),
        "date_min": int(df.date.min()),
        "date_max": int(df.date.max()),
        "horizons": summaries,
        "warning": (
            "Exploratory distributions only. Adjusted price "
            "point-in-time safety is not verified. "
            "Survivorship and execution costs are not controlled."
        )
    }

    (out / "target_audit_summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    pd.DataFrame(daily_rows).to_csv(
        out / "daily_top_bucket_returns.csv",
        index=False
    )

    print("\nAudit finished.")
    print("Output directory:", out)


if __name__ == "__main__":
    main()
