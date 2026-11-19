import os
import json
import gzip
import csv
import math
import requests
import statistics
from collections import defaultdict
from datetime import datetime

OUT = "v5_5_output"
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

CLEAN_FILE = "data/ohlc_clean_v3_20d.json.gz"

session = requests.Session()
session.headers.update({"User-Agent": "TSE-Engine-Audit/5.5"})

errors = []
event_rows = []
price_rows = []
comparison_rows = []
symbol_reports = []

def num(x):
    try:
        y = float(x)
        return y if math.isfinite(y) else None
    except:
        return None

def dnum(x):
    try:
        return int(str(x)[:8])
    except:
        return 0

def get_json(url):
    r = session.get(url, timeout=60)
    r.raise_for_status()
    return r.json()

def daily(ins):
    x = get_json(
        f"{BASE}/ClosingPrice/GetClosingPriceDailyList/{ins}/0"
    )
    return x.get("closingPriceDaily", [])

def adjustments(ins):
    x = get_json(
        f"{BASE}/ClosingPrice/GetPriceAdjustList/{ins}"
    )
    return x.get("priceAdjust", [])

def build_events(raw):
    out = []
    for x in raw:
        d = dnum(x.get("dEven"))
        pc = num(x.get("pClosing"))
        pn = num(x.get("pClosingNotAdjusted"))

        if not d or pc is None or pn is None or pn == 0:
            continue

        f = pc / pn
        if f <= 0 or not math.isfinite(f):
            continue

        out.append({
            "date": d,
            "pClosing": pc,
            "pClosingNotAdjusted": pn,
            "direct_factor": f,
            "inverse_factor": 1.0 / f
        })

    out.sort(key=lambda z: z["date"])
    return out

def factor_at(d, events, inverse=False):
    f = 1.0
    for e in events:
        if e["date"] > d:
            f *= (
                e["inverse_factor"] if inverse
                else e["direct_factor"]
            )
    return f

def parse_api_rows(raw, events):
    out = []
    for x in raw:
        d = dnum(x.get("dEven"))
        if not d:
            continue

        pc = num(x.get("pClosing"))
        pd = num(x.get("pDrCotVal"))
        vol = num(x.get("qTotTran5J")) or 0.0

        fd = factor_at(d, events, False)
        fi = factor_at(d, events, True)

        out.append({
            "date": d,
            "pClosing_raw": pc,
            "pDrCotVal_raw": pd,
            "volume": vol,
            "factor_direct": fd,
            "factor_inverse": fi,
            "pClosing_direct": pc * fd if pc is not None else None,
            "pClosing_inverse": pc * fi if pc is not None else None,
            "pDrCotVal_direct": pd * fd if pd is not None else None,
            "pDrCotVal_inverse": pd * fi if pd is not None else None
        })

    unique = {}
    for x in out:
        unique[x["date"]] = x
    return [unique[d] for d in sorted(unique)]

# ---------------------------------------------------------
# Generic Clean V3 parser
# ---------------------------------------------------------

def find_price_records(obj, found):
    if isinstance(obj, dict):
        # A record may be a symbol object with rows in r/history/prices/data.
        symbol = (
            obj.get("symbol") or obj.get("s") or
            obj.get("ticker") or obj.get("name") or
            obj.get("n")
        )

        ins = (
            obj.get("insCode") or obj.get("i") or
            obj.get("instrumentId")
        )

        for key in ("prices", "history", "rows", "data", "r"):
            value = obj.get(key)
            if isinstance(value, list) and value:
                first = value[0]
                if isinstance(first, dict):
                    found.append({
                        "symbol": str(symbol) if symbol is not None else "",
                        "insCode": str(ins) if ins is not None else "",
                        "rows": value
                    })

        for value in obj.values():
            if isinstance(value, (dict, list)):
                find_price_records(value, found)

    elif isinstance(obj, list):
        for value in obj:
            if isinstance(value, (dict, list)):
                find_price_records(value, found)


def load_clean():

    if not os.path.exists(CLEAN_FILE):
        raise FileNotFoundError(CLEAN_FILE)

    with gzip.open(
        CLEAN_FILE,
        "rt",
        encoding="utf-8-sig"
    ) as f:
        obj = json.load(f)

    if not isinstance(obj, dict):
        raise TypeError(
            "Clean V3 top-level object must be a dict"
        )

    grouped = {}

    for key, value in obj.items():

        if not isinstance(value, dict):
            continue

        ins = str(value.get("i", "")).strip()
        raw_rows = value.get("r", [])

        if not ins:
            continue

        if not isinstance(raw_rows, list):
            continue

        base_symbol = str(key).split("_seg")[0]

        group = grouped.setdefault(
            ins,
            {
                "symbol": base_symbol,
                "insCode": ins,
                "segment_keys": [],
                "date_values": {}
            }
        )

        group["segment_keys"].append(str(key))

        for row in raw_rows:

            if not isinstance(row, dict):
                continue

            d = dnum(row.get("d"))
            c = num(row.get("c"))

            if not d or c is None or c <= 0:
                continue

            group["date_values"].setdefault(
                d, []
            ).append(c)

    clean = []

    for ins, group in grouped.items():

        rows = []

        duplicate_dates = 0
        conflicting_dates = 0

        for d, values in group["date_values"].items():

            if len(values) > 1:
                duplicate_dates += 1

            reference = values[0]

            tolerance = max(
                abs(reference), 1.0
            ) * 1e-9

            conflict = any(
                abs(v - reference) > tolerance
                for v in values[1:]
            )

            if conflict:
                conflicting_dates += 1
                continue

            rows.append({
                "date": d,
                "close": reference
            })

        rows.sort(
            key=lambda x: x["date"]
        )

        clean.append({
            "symbol": group["symbol"],
            "insCode": ins,
            "rows": rows,
            "segment_keys": group["segment_keys"],
            "segment_count": len(group["segment_keys"]),
            "duplicate_dates": duplicate_dates,
            "conflicting_duplicate_dates": conflicting_dates
        })

    print(
        "Clean instrument groups:",
        len(clean)
    )

    return clean


def normalize(s):

    if s is None:
        return ""

    return (
        str(s)
        .replace("\ufeff", "")
        .replace("\u200c", "")
        .replace("\u200f", "")
        .replace("\u200e", "")
        .replace("ي", "ی")
        .replace("ى", "ی")
        .replace("ك", "ک")
        .replace(" ", "")
        .strip()
    )


def match_clean(symbol, ins, clean):

    target_id = str(ins).strip()

    id_matches = [
        x for x in clean
        if x.get("insCode") == target_id
    ]

    if len(id_matches) == 1:
        return (
            id_matches[0],
            "insCode_grouped_segments"
        )

    if len(id_matches) > 1:
        return (
            None,
            "duplicate_insCode_groups"
        )

    target = normalize(symbol)

    matches = [
        x for x in clean
        if normalize(x.get("symbol")) == target
    ]

    if len(matches) == 1:
        return (
            matches[0],
            "symbol_normalized"
        )

    if len(matches) > 1:
        return (
            None,
            "ambiguous_symbol"
        )

    return None, "not_found"

def rel_error(a, b):
    if a is None or b is None or b == 0:
        return None
    return abs(a - b) / abs(b)

def median_or_none(values):
    values = [x for x in values if x is not None and math.isfinite(x)]
    return statistics.median(values) if values else None


def save_csv(name, rows):

    if not rows:
        return

    fieldnames = []
    seen = set()

    for row in rows:

        for key in row.keys():

            if key not in seen:
                seen.add(key)
                fieldnames.append(key)

    path = os.path.join(
        OUT,
        name
    )

    with open(
        path,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            extrasaction="raise"
        )

        writer.writeheader()
        writer.writerows(rows)

    print(
        "CSV SAVED:",
        name,
        "| rows:",
        len(rows),
        "| columns:",
        len(fieldnames)
    )

def main():
    print("Loading Clean V3...")
    clean = load_clean()
    print("Clean records parsed:", len(clean))

    for symbol, (ins, english) in INSTRUMENTS.items():
        print("\n" + "=" * 60)
        print("SYMBOL:", symbol)

        try:
            raw_daily = daily(ins)
            raw_adj = adjustments(ins)
            events = build_events(raw_adj)
            rows = parse_api_rows(raw_daily, events)

            print("API rows:", len(rows))
            print("Raw adjustment records:", len(raw_adj))
            print("Valid events:", len(events))

            # Event diagnostics
            seen = set()
            duplicate_dates = 0

            for e in events:
                if e["date"] in seen:
                    duplicate_dates += 1
                seen.add(e["date"])

                event_rows.append({
                    "symbol": symbol,
                    "insCode": ins,
                    **e
                })

            factors = [e["direct_factor"] for e in events]
            event_report = {
                "symbol": symbol,
                "api_rows": len(rows),
                "raw_adjustment_records": len(raw_adj),
                "valid_events": len(events),
                "duplicate_event_dates": duplicate_dates,
                "min_event_factor": min(factors) if factors else None,
                "max_event_factor": max(factors) if factors else None,
                "events_factor_lt_1": sum(x < 1 for x in factors),
                "events_factor_gt_1": sum(x > 1 for x in factors),
                "nonunit_direct_rows": sum(
                    abs(x["factor_direct"] - 1) > 1e-12 for x in rows
                )
            }

            # Compare API adjusted series with Clean V3
            match, match_type = match_clean(symbol, ins, clean)
            event_report["clean_match_type"] = match_type
            event_report["clean_symbol"] = match["symbol"] if match else ""
            event_report["clean_rows"] = len(match["rows"]) if match else 0
            event_report["clean_segments"] = match.get("segment_count", 0) if match else 0
            event_report["clean_duplicate_dates"] = match.get("duplicate_dates", 0) if match else 0
            event_report["clean_conflicting_duplicate_dates"] = match.get("conflicting_duplicate_dates", 0) if match else 0
            event_report["clean_segment_keys"] = ";".join(match.get("segment_keys", [])) if match else ""


            if match:
                clean_map = {
                    x["date"]: x["close"] for x in match["rows"]
                }

                metrics = {
                    "pClosing_direct": [],
                    "pClosing_inverse": [],
                    "pDrCotVal_direct": [],
                    "pDrCotVal_inverse": []
                }

                for x in rows:
                    d = x["date"]
                    if d not in clean_map:
                        continue

                    c = clean_map[d]
                    candidates = {
                        "pClosing_direct": x["pClosing_direct"],
                        "pClosing_inverse": x["pClosing_inverse"],
                        "pDrCotVal_direct": x["pDrCotVal_direct"],
                        "pDrCotVal_inverse": x["pDrCotVal_inverse"]
                    }

                    for key, value in candidates.items():
                        err = rel_error(value, c)
                        if err is not None:
                            metrics[key].append(err)

                    price_rows.append({
                        "symbol": symbol,
                        "date": d,
                        "clean_close": c,
                        **{
                            k: candidates[k] for k in candidates
                        },
                        **{
                            k + "_rel_error": rel_error(v, c)
                            for k, v in candidates.items()
                        },
                        "factor_direct": x["factor_direct"],
                        "factor_inverse": x["factor_inverse"]
                    })

                for key, vals in metrics.items():
                    event_report[key + "_n"] = len(vals)
                    event_report[key + "_median_rel_error"] = median_or_none(vals)
                    event_report[key + "_mean_rel_error"] = (
                        sum(vals) / len(vals) if vals else None
                    )

                # Best candidate by median relative error.
                valid = [
                    (k, median_or_none(v))
                    for k, v in metrics.items() if v
                ]
                valid = [x for x in valid if x[1] is not None]
                event_report["best_candidate"] = (
                    min(valid, key=lambda x: x[1])[0] if valid else ""
                )
            else:
                event_report["best_candidate"] = ""

            # Per-date factor and event diagnostics
            for x in rows:
                price_rows.append({
                    "symbol": symbol,
                    "date": x["date"],
                    "clean_close": None,
                    "pClosing_direct": x["pClosing_direct"],
                    "pClosing_inverse": x["pClosing_inverse"],
                    "pDrCotVal_direct": x["pDrCotVal_direct"],
                    "pDrCotVal_inverse": x["pDrCotVal_inverse"],
                    "factor_direct": x["factor_direct"],
                    "factor_inverse": x["factor_inverse"]
                }) if not match else None

            symbol_reports.append(event_report)

            # Store complete per-symbol daily series
            save_csv(symbol + "_v5_5_prices.csv", [
                {"symbol": symbol, **x} for x in rows
            ])

            print("Clean match:", match_type)
            print("Best candidate:", event_report.get("best_candidate"))

        except Exception as e:
            msg = f"{symbol}: {type(e).__name__}: {e}"
            print("ERROR:", msg)
            errors.append(msg)

    save_csv("v5_5_events.csv", event_rows)
    save_csv("v5_5_clean_comparison.csv", price_rows)
    save_csv("v5_5_symbol_summary.csv", symbol_reports)

    report = []
    report.append("=" * 75)
    report.append("TSE ENGINE - V5.5 ADJUSTMENT VALIDATION")
    report.append("=" * 75)
    report.append("Generated UTC: " + datetime.utcnow().isoformat())
    report.append("Clean file: " + CLEAN_FILE)
    report.append("Clean parsed records: " + str(len(clean)))
    report.append("Instruments requested: " + str(len(INSTRUMENTS)))
    report.append("Total valid events: " + str(len(event_rows)))
    report.append("Errors: " + str(len(errors)))
    report.append("")

    report.append("PER SYMBOL RESULTS")
    report.append("-" * 75)

    for x in symbol_reports:
        report.append(
            f"{x['symbol']} | API rows={x['api_rows']} | "
            f"events={x['valid_events']} | "
            f"clean_match={x['clean_match_type']} | "
            f"clean_rows={x['clean_rows']} | "
            f"best={x.get('best_candidate', '')}"
        )

        for key in (
            "pClosing_direct",
            "pClosing_inverse",
            "pDrCotVal_direct",
            "pDrCotVal_inverse"
        ):
            report.append(
                f"  {key}: n={x.get(key+'_n', 0)} "
                f"median_rel_error={x.get(key+'_median_rel_error')} "
                f"mean_rel_error={x.get(key+'_mean_rel_error')}"
            )

    report.append("")
    report.append("ERRORS")
    report.extend(errors if errors else ["None"])

    report.append("")
    report.append("INTERPRETATION LIMITATIONS")
    report.append("- Clean V3 may have been built using the same adjustment logic.")
    report.append("- Therefore this comparison is not independent proof.")
    report.append("- Exact symbol matching is weaker than verified insCode matching.")
    report.append("- pClosing and pDrCotVal are different price concepts.")
    report.append("- A lower median error does not alone prove correct event semantics.")
    report.append("- No production data, Builder, or model was modified.")

    with open(os.path.join(OUT, "v5_5_report.txt"), "w",
              encoding="utf-8") as f:
        f.write("\n".join(report))

    print("\n".join(report))
    print("\nOUTPUT FILES:")
    for x in sorted(os.listdir(OUT)):
        print(x)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FATAL:", type(e).__name__, str(e))
        raise
