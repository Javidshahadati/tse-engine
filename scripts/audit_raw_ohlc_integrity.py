
import os
import json
import gzip
import time
import requests
import traceback
from pathlib import Path
from datetime import datetime, timezone

DATA = Path("data/ohlc_clean_v3_20d.json.gz")
FUND = Path("data/fundamentals.json")
OUT = Path("outputs/raw_ohlc_audit")
OUT.mkdir(parents=True, exist_ok=True)

TARGETS = ["مايكت", "فپرديس", "شپديس"]
CONTROLS = ["وبملت", "كگل", "شپنا"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 TSE-Engine-Audit/1.0",
    "Accept": "application/json"
}

REPORT = []

def log(x=""):
    x = str(x)
    print(x, flush=True)
    REPORT.append(x)

def get_json(url):
    r = requests.get(url, headers=HEADERS, timeout=45)
    r.raise_for_status()
    return r.json()

def fetch_daily(ins):
    url = (
        "https://cdn.tsetmc.com/api/ClosingPrice/"
        f"GetClosingPriceDailyList/{ins}/0"
    )
    return get_json(url).get("closingPriceDaily", [])

def fetch_adjust(ins):
    url = (
        "https://cdn.tsetmc.com/api/ClosingPrice/"
        f"GetPriceAdjustList/{ins}"
    )
    return get_json(url).get("priceAdjust", [])

def build_events(rows):
    events = []
    for a in rows:
        try:
            d = int(a["dEven"])
            pn = float(a["pClosing"])
            po = float(a["pClosingNotAdjusted"])
            if d > 0 and pn > 0 and po > 0:
                events.append({
                    "date": d,
                    "factor": pn / po,
                    "adjusted_close": pn,
                    "raw_close": po
                })
        except Exception:
            continue
    return sorted(events, key=lambda x: x["date"])

def factor_for(date, events):
    factor = 1.0
    for e in events:
        if e["date"] > date:
            factor *= e["factor"]
    return factor

def normalize_raw(rows, events):
    out = []
    for r in rows:
        try:
            d = int(r["dEven"])
            c = float(r["pClosing"])
            if d <= 0 or c <= 0:
                continue

            o = float(r.get("priceFirst") or c)
            h = float(r.get("priceMax") or c)
            l = float(r.get("priceMin") or c)
            v = float(r.get("qTotTran5J") or 0)

            f = factor_for(d, events)

            out.append({
                "date": d,
                "raw_o": o,
                "raw_h": h,
                "raw_l": l,
                "raw_c": c,
                "volume": v,
                "factor": f,
                "calc_adj_o": o * f,
                "calc_adj_h": h * f,
                "calc_adj_l": l * f,
                "calc_adj_c": c * f
            })
        except Exception:
            continue

    out.sort(key=lambda x: x["date"])
    return out

def add_forward_returns(rows):
    for i, r in enumerate(rows):
        for horizon in (20, 60):
            j = i + horizon
            if j < len(rows):
                future = rows[j]
                r[f"raw_ret_{horizon}"] = (
                    future["raw_c"] / r["raw_c"] - 1
                )
                r[f"adj_ret_{horizon}"] = (
                    future["calc_adj_c"] / r["calc_adj_c"] - 1
                )
                r[f"future_date_{horizon}"] = future["date"]
            else:
                r[f"raw_ret_{horizon}"] = None
                r[f"adj_ret_{horizon}"] = None
                r[f"future_date_{horizon}"] = None
    return rows

def clean_rows_for_symbol(stock):
    rows = stock.get("r", []) if isinstance(stock, dict) else []
    result = []

    for r in rows:
        try:
            result.append({
                "date": int(r["d"]),
                "o": float(r["o"]),
                "h": float(r["h"]),
                "l": float(r["l"]),
                "c": float(r["c"]),
                "v": float(r.get("v", 0) or 0)
            })
        except Exception:
            continue

    result.sort(key=lambda x: x["date"])
    return result

def returns_for_clean(rows):
    out = {}
    for i, r in enumerate(rows):
        for h in (20, 60):
            if i + h < len(rows):
                future = rows[i+h]
                out[(r["date"], h)] = (
                    future["c"] / r["c"] - 1,
                    future["date"]
                )
    return out

def find_clean_extremes(rows):
    result = []
    ret_map = returns_for_clean(rows)

    for r in rows:
        for h in (20, 60):
            item = ret_map.get((r["date"], h))
            if item is None:
                continue

            ret, future_date = item
            if ret > 0.50 or ret < -0.50:
                result.append({
                    "date": r["date"],
                    "horizon": h,
                    "return": ret,
                    "future_date": future_date
                })

    result.sort(key=lambda x: abs(x["return"]), reverse=True)
    return result[:30]

def write_csv(rows, path):
    import csv
    if not rows:
        return

    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)

    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)

def main():
    log("=" * 75)
    log("TSE ENGINE - RAW OHLC INTEGRITY AUDIT")
    log("=" * 75)
    log("UTC: " + datetime.now(timezone.utc).isoformat())

    if not DATA.exists() or not FUND.exists():
        raise RuntimeError("Required repository data files missing.")

    log("\nLoading Clean V3...")
    with gzip.open(DATA, "rt", encoding="utf-8") as f:
        clean = json.load(f)

    with open(FUND, encoding="utf-8") as f:
        fundamentals = json.load(f)

    log("Clean symbols: " + str(len(clean)))
    log("Fundamental symbols: " + str(len(fundamentals)))

    all_symbols = TARGETS + [
        x for x in CONTROLS if x not in TARGETS
    ]

    all_output = []
    summary = []

    for symbol in all_symbols:
        log("\n" + "=" * 65)
        log("SYMBOL: " + symbol)
        log("=" * 65)

        if symbol not in fundamentals:
            log("ERROR: Symbol absent from fundamentals.")
            continue

        meta = fundamentals[symbol]
        ins = meta.get("insCode")

        if not ins:
            log("ERROR: Missing insCode.")
            continue

        # Clean data
        stock = clean.get(symbol)
        if stock is None:
            log("WARNING: Exact symbol missing from Clean V3.")
            clean_rows = []
        else:
            clean_rows = clean_rows_for_symbol(stock)

        # TSETMC live raw data
        try:
            daily = fetch_daily(ins)
            time.sleep(1.5)
            adjustments = fetch_adjust(ins)
            time.sleep(1.5)
        except Exception as e:
            log("TSETMC FETCH ERROR: " + repr(e))
            continue

        events = build_events(adjustments)
        raw = normalize_raw(daily, events)
        raw = add_forward_returns(raw)

        clean_map = {
            r["date"]: r for r in clean_rows
        }
        raw_map = {
            r["date"]: r for r in raw
        }

        clean_returns = returns_for_clean(clean_rows)

        log("InsCode: " + str(ins))
        log("Clean rows: " + str(len(clean_rows)))
        log("Live raw rows: " + str(len(raw)))
        log("Adjustment events: " + str(len(events)))

        if raw:
            log(
                "Live date range: "
                + str(raw[0]["date"])
                + " -> "
                + str(raw[-1]["date"])
            )

        log("\nADJUSTMENT EVENTS:")
        for e in events[-15:]:
            log(
                f'{e["date"]} | factor={e["factor"]:.8f}'
                f' | raw={e["raw_close"]} | adjusted={e["adjusted_close"]}'
            )

        extremes = find_clean_extremes(clean_rows)

        # Add suspicious dates from prior audit
        special_dates = {
            "مايكت": [20261014, 20260818],
            "فپرديس": [20261006, 20260919, 20260818, 20260727],
            "شپديس": [20260228, 20260201, 20260101]
        }

        selected_dates = set(x["date"] for x in extremes)
        selected_dates.update(special_dates.get(symbol, []))

        # Dates of large adjustment events
        for e in events:
            if e["factor"] > 1.5 or e["factor"] < 0.67:
                selected_dates.add(e["date"])

        # Include nearest live dates for selected historical dates
        for d in list(selected_dates):
            if raw:
                nearest = min(raw, key=lambda x: abs(x["date"] - d))
                if abs(nearest["date"] - d) <= 30:
                    selected_dates.add(nearest["date"])

        selected_dates = sorted(selected_dates)

        symbol_rows = []

        for d in selected_dates:
            c = clean_map.get(d)
            r = raw_map.get(d)

            row = {
                "symbol": symbol,
                "date": d,
                "clean_close": c["c"] if c else None,
                "clean_volume": c["v"] if c else None,
                "raw_close": r["raw_c"] if r else None,
                "raw_open": r["raw_o"] if r else None,
                "raw_high": r["raw_h"] if r else None,
                "raw_low": r["raw_l"] if r else None,
                "raw_volume": r["volume"] if r else None,
                "adjustment_factor": r["factor"] if r else None,
                "calculated_adjusted_close": (
                    r["calc_adj_c"] if r else None
                ),
                "clean_vs_calculated_adjusted_pct": None,
                "raw_ret_20": r["raw_ret_20"] if r else None,
                "adjusted_ret_20": r["adj_ret_20"] if r else None,
                "raw_ret_60": r["raw_ret_60"] if r else None,
                "adjusted_ret_60": r["adj_ret_60"] if r else None,
                "clean_ret_20": None,
                "clean_ret_60": None,
                "future_date_20": r["future_date_20"] if r else None,
                "future_date_60": r["future_date_60"] if r else None
            }

            if c and r and r["calc_adj_c"] != 0:
                row["clean_vs_calculated_adjusted_pct"] = (
                    c["c"] / r["calc_adj_c"] - 1
                )

            for h in (20, 60):
                item = clean_returns.get((d, h))
                if item:
                    row[f"clean_ret_{h}"] = item[0]

            symbol_rows.append(row)
            all_output.append(row)

        log("\nSELECTED DATE COMPARISONS:")
        for r in symbol_rows:
            log(
                f'{r["date"]} | '
                f'clean={r["clean_close"]} | '
                f'raw={r["raw_close"]} | '
                f'adj_calc={r["calculated_adjusted_close"]} | '
                f'factor={r["adjustment_factor"]} | '
                f'clean_ret20={r["clean_ret_20"]} | '
                f'raw_ret20={r["raw_ret_20"]} | '
                f'adj_ret20={r["adjusted_ret_20"]} | '
                f'clean_ret60={r["clean_ret_60"]} | '
                f'raw_ret60={r["raw_ret_60"]} | '
                f'adj_ret60={r["adjusted_ret_60"]}'
            )

        # Daily full detail for each selected symbol
        write_csv(
            raw,
            OUT / f"{symbol}_live_raw_and_adjusted.csv"
        )

        write_csv(
            symbol_rows,
            OUT / f"{symbol}_comparison.csv"
        )

        summary.append({
            "symbol": symbol,
            "insCode": str(ins),
            "clean_rows": len(clean_rows),
            "live_rows": len(raw),
            "adjustment_events": len(events),
            "matched_dates": sum(
                1 for d in selected_dates
                if d in clean_map and d in raw_map
            )
        })

    write_csv(all_output, OUT / "all_symbol_comparisons.csv")

    with open(OUT / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    with open(OUT / "audit_report.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(REPORT))

    log("\n" + "=" * 75)
    log("AUDIT COMPLETED")
    log("Output: " + str(OUT))
    log("No source data or models were modified.")
    log("=" * 75)

    # Rewrite after final messages
    with open(OUT / "audit_report.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(REPORT))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
