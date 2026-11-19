import requests
import csv
import json
import time
import math
import os
from collections import defaultdict
from datetime import datetime

OUT = "v5_4_output"
os.makedirs(OUT, exist_ok=True)

BASE = "https://cdn.tsetmc.com/api"

INSTRUMENTS = {
    "وبملت": ("778253364357513", "Bank Mellat"),
    "حکشتی": ("60610861509165508", "Shipping"),
    "فارس": ("25244329144808274", "Persian Gulf Petrochemical"),
    "کگل": ("35700344742885862", "Gol Gohar"),
    "وبصادر": ("28320293733348826", "Export Bank"),
    "شپنا": ("7745894403636165", "Isfahan Refinery"),
}

HORIZONS = {20: 0.03, 60: 0.08}

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 TSE-Engine-Audit/5.4"
})

errors = []
all_summary = []
all_comparisons = []
all_events = []

def get_json(url):
    r = session.get(url, timeout=45)
    r.raise_for_status()
    return r.json()

def safe_num(x):
    try:
        v = float(x)
        if math.isfinite(v):
            return v
    except:
        pass
    return None

def date_num(x):
    try:
        return int(str(x)[:8])
    except:
        return 0

def fetch_daily(ins):
    data = get_json(
        f"{BASE}/ClosingPrice/GetClosingPriceDailyList/{ins}/0"
    )
    rows = data.get("closingPriceDaily", [])
    return rows if isinstance(rows, list) else []

def fetch_adjust(ins):
    data = get_json(
        f"{BASE}/ClosingPrice/GetPriceAdjustList/{ins}"
    )
    rows = data.get("priceAdjust", [])
    return rows if isinstance(rows, list) else []

def build_events(rows):
    events = []
    for x in rows:
        d = date_num(x.get("dEven"))
        pc = safe_num(x.get("pClosing"))
        pn = safe_num(x.get("pClosingNotAdjusted"))

        if not d or pc is None or pn is None or pn == 0:
            continue

        factor = pc / pn
        if factor <= 0 or not math.isfinite(factor):
            continue

        events.append({
            "date": d,
            "pClosing": pc,
            "pClosingNotAdjusted": pn,
            "factor": factor
        })

    events.sort(key=lambda z: z["date"])
    return events

def factor_for(d, events):
    factor = 1.0
    for e in events:
        if e["date"] > d:
            factor *= e["factor"]
    return factor

def parse_rows(raw_rows, events):
    parsed = []

    for x in raw_rows:
        d = date_num(x.get("م"))
        if not d:
            d = date_num(x.get("dEven"))

        if not d:
            continue

        pc = safe_num(x.get("pClosing"))
        pd = safe_num(x.get("pDrCotVal"))
        vol = safe_num(x.get("qTotTran5J"))

        if vol is None:
            vol = 0.0

        factor = factor_for(d, events)

        parsed.append({
            "date": d,
            "pClosing_raw": pc,
            "pDrCotVal_raw": pd,
            "pClosing_adj": pc * factor if pc is not None else None,
            "pDrCotVal_adj": pd * factor if pd is not None else None,
            "volume": vol,
            "factor": factor
        })

    parsed.sort(key=lambda z: z["date"])

    # Remove duplicate dates deterministically
    unique = {}
    for x in parsed:
        unique[x["date"]] = x

    return [unique[d] for d in sorted(unique)]

def make_labels(rows, field, horizon, traded_only):
    eligible = [
        i for i, x in enumerate(rows)
        if x.get(field) is not None
        and x[field] > 0
        and (not traded_only or x["volume"] > 0)
    ]

    results = {}
    threshold = HORIZONS[horizon]

    for pos, i in enumerate(eligible):
        target_pos = pos + horizon
        if target_pos >= len(eligible):
            continue

        j = eligible[target_pos]
        start = rows[i][field]
        end = rows[j][field]

        if start is None or end is None or start <= 0:
            continue

        ret = end / start - 1
        results[i] = {
            "target_date": rows[j]["date"],
            "return": ret,
            "label": int(ret > threshold)
        }

    return results

def summarize_variant(rows, field, horizon, traded):
    labels = make_labels(rows, field, horizon, traded)
    vals = list(labels.values())

    return labels, {
        "count": len(vals),
        "positive": sum(x["label"] for x in vals),
        "positive_rate": (
            sum(x["label"] for x in vals) / len(vals)
            if vals else None
        )
    }

def main():
    total_rows = 0
    total_events = 0

    for symbol, (ins, name) in INSTRUMENTS.items():
        print("\n" + "=" * 65)
        print("INSTRUMENT:", symbol, name, ins)

        try:
            raw = fetch_daily(ins)
            time.sleep(0.25)
            adj_raw = fetch_adjust(ins)
            time.sleep(0.25)

            events = build_events(adj_raw)
            rows = parse_rows(raw, events)

            total_rows += len(rows)
            total_events += len(events)

            print("Daily rows:", len(rows))
            print("Adjustment records:", len(adj_raw))
            print("Valid adjustment events:", len(events))

            for e in events:
                all_events.append({
                    "symbol": symbol,
                    **e
                })

            if rows:
                print("Date range:", rows[0]["date"], "-", rows[-1]["date"])
                print("Zero volume:", sum(x["volume"] <= 0 for x in rows))
                print("Positive volume:", sum(x["volume"] > 0 for x in rows))
                print("Non-unit factors:", sum(abs(x["factor"] - 1) > 1e-12 for x in rows))

            for horizon in HORIZONS:
                variants = {}

                for field in [
                    "pClosing_raw",
                    "pDrCotVal_raw",
                    "pClosing_adj",
                    "pDrCotVal_adj"
                ]:
                    for traded in [False, True]:
                        key = field + ("_traded" if traded else "_all")
                        labels, stats = summarize_variant(
                            rows, field, horizon, traded
                        )
                        variants[key] = labels

                        all_summary.append({
                            "symbol": symbol,
                            "name": name,
                            "horizon": horizon,
                            "variant": key,
                            **stats
                        })

                # Compare raw vs adjusted labels for each price field
                comparisons = [
                    ("pClosing_raw_all", "pClosing_adj_all"),
                    ("pDrCotVal_raw_all", "pDrCotVal_adj_all"),
                    ("pClosing_raw_traded", "pClosing_adj_traded"),
                    ("pDrCotVal_raw_traded", "pDrCotVal_adj_traded")
                ]

                for a, b in comparisons:
                    A = variants[a]
                    B = variants[b]
                    common = sorted(set(A) & set(B))
                    diff = sum(
                        A[i]["label"] != B[i]["label"]
                        for i in common
                    )

                    all_comparisons.append({
                        "symbol": symbol,
                        "horizon": horizon,
                        "comparison": a + "_VS_" + b,
                        "matched": len(common),
                        "disagreements": diff,
                        "disagreement_rate": (
                            diff / len(common) if common else None
                        )
                    })

                # Compare price field labels after adjustment
                for traded in [False, True]:
                    suffix = "_traded" if traded else "_all"
                    a = "pClosing_adj" + suffix
                    b = "pDrCotVal_adj" + suffix
                    A = variants[a]
                    B = variants[b]
                    common = sorted(set(A) & set(B))
                    diff = sum(
                        A[i]["label"] != B[i]["label"]
                        for i in common
                    )

                    all_comparisons.append({
                        "symbol": symbol,
                        "horizon": horizon,
                        "comparison": a + "_VS_" + b,
                        "matched": len(common),
                        "disagreements": diff,
                        "disagreement_rate": (
                            diff / len(common) if common else None
                        )
                    })

            # Save per-instrument row-level audit
            path = os.path.join(OUT, symbol + "_rows.csv")
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(
                    f,
                    fieldnames=list(rows[0].keys()) if rows else [
                        "date", "pClosing_raw", "pDrCotVal_raw",
                        "pClosing_adj", "pDrCotVal_adj", "volume", "factor"
                    ]
                )
                writer.writeheader()
                writer.writerows(rows)

        except Exception as e:
            msg = f"{symbol}: {type(e).__name__}: {e}"
            print("ERROR:", msg)
            errors.append(msg)

    # CSV outputs
    def save_csv(filename, records):
        if not records:
            return
        with open(os.path.join(OUT, filename), "w",
                  newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(records[0].keys()))
            w.writeheader()
            w.writerows(records)

    save_csv("v5_4_summary.csv", all_summary)
    save_csv("v5_4_label_comparisons.csv", all_comparisons)
    save_csv("v5_4_adjustment_events.csv", all_events)

    # Pooled comparison
    pooled = {}
    for x in all_comparisons:
        key = (x["horizon"], x["comparison"])
        if key not in pooled:
            pooled[key] = [0, 0]
        pooled[key][0] += x["matched"]
        pooled[key][1] += x["disagreements"]

    report = []
    report.append("=" * 75)
    report.append("TSE ENGINE - V5.4 ADJUSTED LABEL AUDIT")
    report.append("=" * 75)
    report.append("Generated: " + datetime.utcnow().isoformat())
    report.append(f"Instruments requested: {len(INSTRUMENTS)}")
    report.append(f"Total daily rows: {total_rows}")
    report.append(f"Total valid adjustment events: {total_events}")
    report.append(f"Errors: {len(errors)}")
    report.append("")

    report.append("POOLED LABEL DISAGREEMENT")
    report.append("-" * 75)

    for (h, key), (n, d) in sorted(pooled.items()):
        rate = d / n if n else 0
        report.append(
            f"Horizon={h} | {key} | matched={n} | "
            f"disagreements={d} | rate={rate:.6%}"
        )

    report.append("")
    report.append("PER INSTRUMENT")
    report.append("-" * 75)

    for x in all_comparisons:
        rate = x["disagreement_rate"]
        report.append(
            f"{x['symbol']} | H={x['horizon']} | {x['comparison']} | "
            f"n={x['matched']} | diff={x['disagreements']} | "
            f"rate={rate if rate is not None else 'NA'}"
        )

    report.append("")
    report.append("ERRORS")
    report.extend(errors if errors else ["None"])

    report.append("")
    report.append("IMPORTANT LIMITATIONS")
    report.append("- Only six previously verified instrument IDs were tested.")
    report.append("- Positive volume does not guarantee executable liquidity.")
    report.append("- Adjustment factors follow the project's existing factor logic.")
    report.append("- Adjustment direction and completeness still require validation.")
    report.append("- This is an audit only; no production data or model was changed.")
    report.append("- pClosing and pDrCotVal have different market meanings.")
    report.append("- A disagreement rate is not proof that one field is superior.")

    with open(os.path.join(OUT, "v5_4_report.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n".join(report))

    print("\n".join(report))
    print("\nOUTPUT FILES:")
    for x in sorted(os.listdir(OUT)):
        print(x)

if __name__ == "__main__":
    main()
