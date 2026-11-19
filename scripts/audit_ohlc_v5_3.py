
import requests
import csv
import json
import os
import time
import statistics
from bisect import bisect_right

INSTRUMENTS = [
    {"symbol": "وبملت", "name": "بانک ملت",
     "ins": "778253364357513"},
    {"symbol": "حکشتی", "name": "کشتیرانی جمهوری اسلامی ایران",
     "ins": "60610861509165508"},
    {"symbol": "فارس", "name": "صنایع پتروشیمی خلیج فارس",
     "ins": "25244329144808274"},
    {"symbol": "کگل", "name": "معدنی و صنعتی گل گهر",
     "ins": "35700344742885862"},
    {"symbol": "وبصادر", "name": "بانک صادرات ایران",
     "ins": "28320293733348826"},
    {"symbol": "شپنا", "name": "پالایش نفت اصفهان",
     "ins": "7745894403636165"}
]

HORIZONS = {
    20: 0.03,
    60: 0.08
}

OUT = "v5_3_output"
os.makedirs(OUT, exist_ok=True)

URL = (
    "https://cdn.tsetmc.com/api/ClosingPrice/"
    "GetClosingPriceDailyList/{}/0"
)

def number(x):
    try:
        if x is None:
            return 0.0
        return float(x)
    except:
        return 0.0

def percentile(values, p):
    if not values:
        return None
    a = sorted(values)
    pos = (len(a) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(a))
    frac = pos - lo
    return a[lo] * (1-frac) + a[hi] * frac

def metrics(values, threshold):
    if not values:
        return {
            "count": 0,
            "positive": 0,
            "positive_rate": None,
            "mean_return": None,
            "median_return": None,
            "q05": None,
            "q95": None
        }

    labels = [x > threshold for x in values]

    return {
        "count": len(values),
        "positive": sum(labels),
        "positive_rate": sum(labels) / len(labels),
        "mean_return": statistics.mean(values),
        "median_return": statistics.median(values),
        "q05": percentile(values, 0.05),
        "q95": percentile(values, 0.95)
    }

def fetch_instrument(inst):
    url = URL.format(inst["ins"])
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    payload = response.json()
    rows = payload.get("closingPriceDaily", [])

    parsed = []

    for x in rows:
        parsed.append({
            "date": str(x.get("dEven", "")),
            "open": number(x.get("priceFirst")),
            "high": number(x.get("priceMax")),
            "low": number(x.get("priceMin")),
            "pClosing": number(x.get("pClosing")),
            "pDrCotVal": number(x.get("pDrCotVal")),
            "volume": number(x.get("qTotTran5J")),
            "trades": number(x.get("zTotTran"))
        })

    parsed = [x for x in parsed if x["date"]]
    parsed.sort(key=lambda x: x["date"])

    return parsed

def calculate(inst, rows):
    n = len(rows)
    positive_volume_indices = [
        i for i, r in enumerate(rows)
        if r["volume"] > 0
    ]

    detail = []
    summary = []
    comparisons = []

    for i, current in enumerate(rows):
        out = {
            "symbol": inst["symbol"],
            "name": inst["name"],
            "date": current["date"],
            "volume": current["volume"],
            "trades": current["trades"],
            "pClosing": current["pClosing"],
            "pDrCotVal": current["pDrCotVal"]
        }

        for horizon, threshold in HORIZONS.items():

            # Two horizon definitions:
            # fixed_rows = exactly 20 or 60 subsequent records
            # traded_rows = 20 or 60 subsequent positive-volume records

            targets = {}

            fixed_i = i + horizon
            targets["fixed_rows"] = (
                fixed_i if fixed_i < n else None
            )

            if current["volume"] > 0:
                pos = bisect_right(positive_volume_indices, i)
                target_pos = pos + horizon - 1

                targets["traded_rows"] = (
                    positive_volume_indices[target_pos]
                    if target_pos < len(positive_volume_indices)
                    else None
                )
            else:
                targets["traded_rows"] = None

            for horizon_type, target_i in targets.items():
                prefix = f"{horizon}_{horizon_type}"

                if target_i is None:
                    for field in ("pClosing", "pDrCotVal"):
                        out[f"{prefix}_{field}_return"] = None
                        out[f"{prefix}_{field}_label"] = None
                    out[f"{prefix}_future_date"] = None
                    out[f"{prefix}_future_volume"] = None
                    continue

                future = rows[target_i]
                out[f"{prefix}_future_date"] = future["date"]
                out[f"{prefix}_future_volume"] = future["volume"]

                returns = {}

                for field in ("pClosing", "pDrCotVal"):
                    start_price = current[field]
                    future_price = future[field]

                    ret = None
                    label = None

                    if start_price > 0 and future_price > 0:
                        ret = future_price / start_price - 1
                        label = int(ret > threshold)

                    returns[field] = ret
                    out[f"{prefix}_{field}_return"] = ret
                    out[f"{prefix}_{field}_label"] = label

                # Individual price-field metrics
                for field in ("pClosing", "pDrCotVal"):
                    ret = returns[field]
                    if ret is not None:
                        summary.append({
                            "symbol": inst["symbol"],
                            "horizon": horizon,
                            "horizon_type": horizon_type,
                            "price_field": field,
                            "threshold": threshold,
                            "return": ret,
                            "label": int(ret > threshold),
                            "start_volume": current["volume"],
                            "future_volume": future["volume"]
                        })

                # Direct field comparison on identical dates
                a = returns["pClosing"]
                b = returns["pDrCotVal"]

                if a is not None and b is not None:
                    comparisons.append({
                        "symbol": inst["symbol"],
                        "horizon": horizon,
                        "horizon_type": horizon_type,
                        "pClosing_return": a,
                        "pDrCotVal_return": b,
                        "difference": a - b,
                        "pClosing_label": int(a > threshold),
                        "pDrCotVal_label": int(b > threshold),
                        "label_disagreement": int(
                            (a > threshold) != (b > threshold)
                        )
                    })

        detail.append(out)

    return detail, summary, comparisons

def main():
    all_detail = []
    all_summary = []
    all_comparisons = []
    errors = []
    instrument_info = []

    for inst in INSTRUMENTS:
        print("Fetching:", inst["symbol"])

        try:
            rows = fetch_instrument(inst)

            if not rows:
                raise Exception("No daily rows returned")

            detail, summary, comparisons = calculate(inst, rows)

            all_detail.extend(detail)
            all_summary.extend(summary)
            all_comparisons.extend(comparisons)

            instrument_info.append({
                "symbol": inst["symbol"],
                "name": inst["name"],
                "insCode": inst["ins"],
                "rows": len(rows),
                "first_date": rows[0]["date"],
                "last_date": rows[-1]["date"],
                "zero_volume_rows": sum(
                    r["volume"] == 0 for r in rows
                ),
                "positive_volume_rows": sum(
                    r["volume"] > 0 for r in rows
                )
            })

            print("Rows:", len(rows))
            time.sleep(0.4)

        except Exception as e:
            errors.append({
                "symbol": inst["symbol"],
                "error": str(e)
            })
            print("ERROR:", inst["symbol"], str(e))

    # Detailed row-level output
    if all_detail:
        path = os.path.join(OUT, "v5_3_all_rows.csv")
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            fields = list(all_detail[0].keys())
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(all_detail)

    # Raw comparison rows
    if all_comparisons:
        path = os.path.join(OUT, "v5_3_comparisons.csv")
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            fields = list(all_comparisons[0].keys())
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(all_comparisons)

    # Aggregated metrics
    aggregate = {}

    for symbol in [x["symbol"] for x in INSTRUMENTS]:
        for horizon, threshold in HORIZONS.items():
            for horizon_type in ("fixed_rows", "traded_rows"):
                for field in ("pClosing", "pDrCotVal"):

                    selected = [
                        x for x in all_summary
                        if x["symbol"] == symbol
                        and x["horizon"] == horizon
                        and x["horizon_type"] == horizon_type
                        and x["price_field"] == field
                    ]

                    vals = [x["return"] for x in selected]
                    key = (
                        f"{symbol}|{horizon}|"
                        f"{horizon_type}|{field}"
                    )

                    aggregate[key] = metrics(vals, threshold)

                selected_cmp = [
                    x for x in all_comparisons
                    if x["symbol"] == symbol
                    and x["horizon"] == horizon
                    and x["horizon_type"] == horizon_type
                ]

                if selected_cmp:
                    diffs = [x["difference"] for x in selected_cmp]
                    disagreements = sum(
                        x["label_disagreement"]
                        for x in selected_cmp
                    )

                    aggregate[
                        f"{symbol}|{horizon}|{horizon_type}|comparison"
                    ] = {
                        "common_count": len(selected_cmp),
                        "label_disagreements": disagreements,
                        "label_disagreement_rate":
                            disagreements / len(selected_cmp),
                        "mean_return_difference": statistics.mean(diffs),
                        "median_return_difference":
                            statistics.median(diffs),
                        "mean_absolute_return_difference":
                            statistics.mean(abs(x) for x in diffs),
                        "q95_absolute_return_difference":
                            percentile([abs(x) for x in diffs], 0.95)
                    }

    result = {
        "audit": "TSE ENGINE V5.3",
        "description": (
            "pClosing versus pDrCotVal; fixed-row and "
            "positive-volume horizon comparison"
        ),
        "horizons": HORIZONS,
        "instruments": instrument_info,
        "total_rows": len(all_detail),
        "comparison_rows": len(all_comparisons),
        "errors": errors,
        "metrics": aggregate
    }

    with open(
        os.path.join(OUT, "v5_3_metrics.json"),
        "w", encoding="utf-8"
    ) as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    report = []
    report.append("TSE ENGINE - OHLC V5.3 AUDIT")
    report.append("=" * 75)
    report.append(f"Total rows: {len(all_detail)}")
    report.append(f"Comparison rows: {len(all_comparisons)}")
    report.append(f"Instruments with data: {len(instrument_info)}")
    report.append(f"Errors: {len(errors)}")
    report.append("")
    report.append("INSTRUMENT COVERAGE")

    for x in instrument_info:
        report.append(
            f'{x["symbol"]}: rows={x["rows"]}, '
            f'dates={x["first_date"]}-{x["last_date"]}, '
            f'zero_volume={x["zero_volume_rows"]}, '
            f'positive_volume={x["positive_volume_rows"]}'
        )

    report.append("")
    report.append("METRICS")
    report.append(
        "Returns are decimal fractions: 0.03 means 3 percent."
    )

    for key, value in aggregate.items():
        report.append("-" * 75)
        report.append(key)
        report.append(json.dumps(value, ensure_ascii=False))

    report.append("")
    report.append("ERRORS")
    for e in errors:
        report.append(json.dumps(e, ensure_ascii=False))

    report_text = "\n".join(report)

    with open(
        os.path.join(OUT, "v5_3_report.txt"),
        "w", encoding="utf-8"
    ) as f:
        f.write(report_text)

    print("\n" + report_text)

    if not instrument_info:
        raise Exception("No instruments were successfully audited")

if __name__ == "__main__":
    main()
