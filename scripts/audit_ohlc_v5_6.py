
import os
import csv
import json
import gzip
import time
import math
import requests
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "v5_6_output"
OUT.mkdir(exist_ok=True)

CLEAN_FILE = ROOT / "data" / "ohlc_clean_v3_20d.json.gz"

BASE_URL = "https://cdn.tsetmc.com/api/ClosingPrice"
DAILY_URL = BASE_URL + "/GetClosingPriceDailyList/{}" + "/0"
EVENT_URL = BASE_URL + "/GetPriceAdjustList/{}"

MAX_WORKERS = 6
TIMEOUT = 35

def write_csv(path, rows):
    rows = list(rows)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = sorted(set().union(*(r.keys() for r in rows)))
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

def request_json(url):
    last_error = None
    for attempt in range(5):
        try:
            r = requests.get(
                url,
                timeout=TIMEOUT,
                headers={"User-Agent": "TSE-V5.6-Audit"}
            )
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(2 ** attempt, 20))
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_error = str(e)
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(last_error or "Request failed")

def first_value(obj, names):
    for name in names:
        if name in obj and obj[name] is not None:
            return obj[name]
    return None

def number(x):
    try:
        v = float(x)
        if math.isfinite(v):
            return v
    except Exception:
        pass
    return None

def date_value(x):
    if x is None:
        return None
    s = str(x).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s

def load_instruments():
    if not CLEAN_FILE.exists():
        raise FileNotFoundError(str(CLEAN_FILE))

    with gzip.open(CLEAN_FILE, "rt", encoding="utf-8") as f:
        data = json.load(f)

    instruments = {}

    if not isinstance(data, dict):
        raise ValueError("Clean V3 top-level structure is not a dict")

    for ticker, obj in data.items():
        if not isinstance(obj, dict):
            continue

        ins = first_value(obj, ["i", "insCode", "inscode"])
        if ins is None:
            continue

        ins = str(ins)
        entry = instruments.setdefault(ins, {
            "insCode": ins,
            "symbols": set(),
            "names": set(),
            "segments": 0
        })

        entry["symbols"].add(str(ticker))
        entry["segments"] += 1

        name = first_value(obj, ["n", "name"])
        if name:
            entry["names"].add(str(name))

    result = []
    for item in instruments.values():
        item["symbols"] = sorted(item["symbols"])
        item["names"] = sorted(item["names"])
        result.append(item)

    return result

def parse_events(payload):
    if isinstance(payload, dict):
        rows = payload.get("priceAdjust", [])
    else:
        rows = []

    result = []
    for r in rows or []:
        if not isinstance(r, dict):
            continue

        d = date_value(first_value(
            r, ["dEven", "date", "eventDate", "dDate"]
        ))
        pc = number(first_value(r, ["pClosing", "closingPrice"]))
        raw = number(first_value(
            r, ["pClosingNotAdjusted", "closingPriceNotAdjusted"]
        ))

        if d is None or pc is None or raw is None or raw == 0:
            continue

        result.append({
            "date": d,
            "pClosing": pc,
            "pClosingNotAdjusted": raw,
            "direct_factor": pc / raw
        })

    return result

def parse_daily(payload):
    if isinstance(payload, dict):
        rows = payload.get("closingPriceDaily", [])
    else:
        rows = []

    result = []
    for r in rows or []:
        if not isinstance(r, dict):
            continue

        d = date_value(first_value(r, ["dEven", "date"]))
        close = number(first_value(r, ["pClosing"]))
        if d is None or close is None:
            continue

        result.append({"date": d, "close": close})

    result.sort(key=lambda x: x["date"])
    return result

def chain_audit(rows):
    """
    Edges are pClosingNotAdjusted -> pClosing.
    A valid chain must form one directed path using every record.
    """
    if len(rows) <= 1:
        return {
            "status": "SINGLE_EVENT",
            "valid": True,
            "ordered_indices": list(range(len(rows)))
        }

    def eq(a, b):
        return abs(a - b) <= max(1e-6, abs(a) * 1e-9)

    starts = []
    for i, row in enumerate(rows):
        source = row["pClosingNotAdjusted"]
        incoming = any(
            eq(other["pClosing"], source)
            for j, other in enumerate(rows) if j != i
        )
        if not incoming:
            starts.append(i)

    if len(starts) != 1:
        return {
            "status": "INVALID_START_COUNT",
            "valid": False,
            "ordered_indices": []
        }

    ordered = []
    used = set()
    current = starts[0]

    while current not in used:
        used.add(current)
        ordered.append(current)

        target = rows[current]["pClosing"]
        candidates = [
            j for j, other in enumerate(rows)
            if j not in used
            and eq(other["pClosingNotAdjusted"], target)
        ]

        if len(candidates) == 0:
            break
        if len(candidates) > 1:
            return {
                "status": "AMBIGUOUS_NEXT_EDGE",
                "valid": False,
                "ordered_indices": ordered
            }
        current = candidates[0]

    if len(used) != len(rows):
        return {
            "status": "DISCONNECTED_OR_CYCLIC",
            "valid": False,
            "ordered_indices": ordered
        }

    return {
        "status": "VALID",
        "valid": True,
        "ordered_indices": ordered
    }

def factor_for(date, events):
    result = 1.0
    for e in events:
        if e["date"] > date:
            result *= e["direct_factor"]
    return result

def fetch_one(inst):
    ins = inst["insCode"]

    event_payload = request_json(EVENT_URL.format(ins))
    daily_payload = request_json(DAILY_URL.format(ins))

    events = parse_events(event_payload)
    daily = parse_daily(daily_payload)

    return inst, events, daily

def main():
    print("=" * 72)
    print("TSE ENGINE - V5.6 FULL UNIVERSE EVENT AUDIT")
    print("=" * 72)

    instruments = load_instruments()
    print("Unique instruments:", len(instruments))

    all_events = []
    symbol_rows = []
    chain_rows = []
    boundary_rows = []
    errors = []

    completed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(fetch_one, inst): inst
            for inst in instruments
        }

        for future in as_completed(futures):
            inst = futures[future]
            completed += 1

            try:
                inst, events, daily = future.result()
                ins = inst["insCode"]
                symbols = "|".join(inst["symbols"])
                names = "|".join(inst["names"])

                for e in events:
                    all_events.append({
                        "insCode": ins,
                        "symbols": symbols,
                        "date": e["date"],
                        "pClosing": e["pClosing"],
                        "pClosingNotAdjusted": e["pClosingNotAdjusted"],
                        "direct_factor": e["direct_factor"],
                        "factor_gt_1": e["direct_factor"] > 1,
                    })

                grouped = {}
                for e in events:
                    grouped.setdefault(e["date"], []).append(e)

                valid_groups = 0
                invalid_groups = 0
                multi_groups = 0
                duplicate_rows = 0

                for d, group in sorted(grouped.items()):
                    if len(group) > 1:
                        multi_groups += 1

                    signatures = [
                        (x["pClosing"], x["pClosingNotAdjusted"])
                        for x in group
                    ]
                    duplicate_rows += len(signatures) - len(set(signatures))

                    audit = chain_audit(group)
                    if audit["valid"]:
                        valid_groups += 1
                    else:
                        invalid_groups += 1

                    net_factor = 1.0
                    for e in group:
                        net_factor *= e["direct_factor"]

                    chain_rows.append({
                        "insCode": ins,
                        "symbols": symbols,
                        "date": d,
                        "records": len(group),
                        "net_direct_factor": net_factor,
                        "factor_gt_1_count": sum(
                            e["direct_factor"] > 1 for e in group
                        ),
                        "chain_status": audit["status"],
                        "chain_valid": audit["valid"],
                        "ordered_indices": "|".join(
                            map(str, audit["ordered_indices"])
                        )
                    })

                    # Nearest available daily observations around event date
                    before = [x for x in daily if x["date"] < d]
                    after = [x for x in daily if x["date"] > d]
                    on_day = [x for x in daily if x["date"] == d]

                    before_row = before[-1] if before else None
                    after_row = after[0] if after else None
                    on_row = on_day[-1] if on_day else None

                    boundary_rows.append({
                        "insCode": ins,
                        "symbols": symbols,
                        "event_date": d,
                        "event_records": len(group),
                        "daily_rows": len(daily),
                        "before_date": before_row["date"] if before_row else "",
                        "before_close": before_row["close"] if before_row else "",
                        "event_day_close": on_row["close"] if on_row else "",
                        "after_date": after_row["date"] if after_row else "",
                        "after_close": after_row["close"] if after_row else "",
                        "factor_before_event_date": factor_for(
                            d, events
                        ),
                        "factor_on_event_date": factor_for(
                            d, events
                        ),
                        "factor_after_nearest_date": (
                            factor_for(after_row["date"], events)
                            if after_row else ""
                        )
                    })

                symbol_rows.append({
                    "insCode": ins,
                    "symbols": symbols,
                    "names": names,
                    "clean_segments": inst["segments"],
                    "daily_rows": len(daily),
                    "event_rows": len(events),
                    "event_dates": len(grouped),
                    "multi_event_dates": multi_groups,
                    "valid_chain_dates": valid_groups,
                    "invalid_chain_dates": invalid_groups,
                    "exact_duplicate_event_rows": duplicate_rows,
                    "events_factor_gt_1": sum(
                        e["direct_factor"] > 1 for e in events
                    ),
                    "events_factor_lt_1": sum(
                        e["direct_factor"] < 1 for e in events
                    ),
                    "status": "OK"
                })

            except Exception as e:
                errors.append({
                    "insCode": inst["insCode"],
                    "symbols": "|".join(inst["symbols"]),
                    "error": str(e)
                })
                symbol_rows.append({
                    "insCode": inst["insCode"],
                    "symbols": "|".join(inst["symbols"]),
                    "names": "|".join(inst["names"]),
                    "clean_segments": inst["segments"],
                    "status": "ERROR",
                    "error": str(e)
                })

            if completed % 25 == 0 or completed == len(instruments):
                print(
                    f"Progress: {completed}/{len(instruments)} | "
                    f"events: {len(all_events)} | errors: {len(errors)}"
                )

    write_csv(OUT / "v5_6_events.csv", all_events)
    write_csv(OUT / "v5_6_symbol_summary.csv", symbol_rows)
    write_csv(OUT / "v5_6_event_chains.csv", chain_rows)
    write_csv(OUT / "v5_6_event_boundaries.csv", boundary_rows)
    write_csv(OUT / "v5_6_errors.csv", errors)

    total_groups = len(chain_rows)
    valid_groups = sum(x["chain_valid"] for x in chain_rows)
    invalid_groups = total_groups - valid_groups
    multi_groups = sum(x["records"] > 1 for x in chain_rows)
    gt1 = sum(x["factor_gt_1"] for x in all_events)
    lt1 = sum(x["direct_factor"] < 1 for x in all_events)

    ok_symbols = sum(x.get("status") == "OK" for x in symbol_rows)

    report = []
    report.append("=" * 76)
    report.append("TSE ENGINE V5.6 - FULL UNIVERSE FORENSIC AUDIT")
    report.append("=" * 76)
    report.append("Generated UTC: " + datetime.utcnow().isoformat())
    report.append("")
    report.append("[UNIVERSE]")
    report.append(f"Clean V3 instruments: {len(instruments)}")
    report.append(f"Successfully fetched: {ok_symbols}")
    report.append(f"Fetch errors: {len(errors)}")
    report.append("")
    report.append("[EVENTS]")
    report.append(f"Total adjustment events: {len(all_events)}")
    report.append(f"Event dates/groups: {total_groups}")
    report.append(f"Same-date multi-event groups: {multi_groups}")
    report.append(f"Factors greater than 1: {gt1}")
    report.append(f"Factors less than 1: {lt1}")
    report.append("")
    report.append("[CHAIN VALIDATION]")
    report.append(f"Valid groups: {valid_groups}")
    report.append(f"Invalid groups: {invalid_groups}")
    report.append(
        "Valid percentage: " +
        (f"{100*valid_groups/total_groups:.4f}%" if total_groups else "N/A")
    )
    report.append("")
    report.append("[IMPORTANT LIMITATIONS]")
    report.append(
        "This audit checks API event structure, chain continuity, "
        "and event-boundary observations."
    )
    report.append(
        "It does NOT independently prove adjustment direction or "
        "historical adjusted-price correctness."
    )
    report.append(
        "Daily and adjustment data are from the same TSETMC API family."
    )
    report.append(
        "No Clean V3 data, Builder, training data, or models were modified."
    )
    report.append("")
    report.append("[OUTPUT FILES]")
    for p in sorted(OUT.glob("*.csv")):
        report.append(f"{p.name}: {p.stat().st_size} bytes")
    report.append("=" * 76)

    text = "\n".join(report)
    (OUT / "v5_6_report.txt").write_text(text, encoding="utf-8")

    print(text)

if __name__ == "__main__":
    main()
