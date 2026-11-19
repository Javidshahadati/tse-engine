
import os, json, csv, gzip, time, math, requests
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "v5_6_output"
OUT.mkdir(exist_ok=True)

CLEAN = ROOT / "data" / "ohlc_clean_v3_20d.json.gz"
BASE = "https://cdn.tsetmc.com/api/ClosingPrice"
DAILY = BASE + "/GetClosingPriceDailyList/{}/0"
EVENT = BASE + "/GetPriceAdjustList/{}"

TIMEOUT = (10, 15)
WORKERS = 6

def log(x):
    print(x, flush=True)

def save_csv(name, rows):
    rows = list(rows)
    p = OUT / name
    if not rows:
        p.write_text("", encoding="utf-8")
        return
    fields = sorted(set().union(*(r.keys() for r in rows)))
    with open(p, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

def load_universe():
    if not CLEAN.exists():
        raise RuntimeError("Clean V3 file not found: " + str(CLEAN))

    with gzip.open(CLEAN, "rt", encoding="utf-8") as f:
        data = json.load(f)

    found = {}
    for ticker, obj in data.items():
        if not isinstance(obj, dict):
            continue
        ins = obj.get("i")
        if ins is None:
            continue
        ins = str(ins)
        x = found.setdefault(ins, {
            "insCode": ins,
            "symbols": set(),
            "segments": 0
        })
        x["symbols"].add(str(ticker))
        x["segments"] += 1

    result = []
    for x in found.values():
        x["symbols"] = sorted(x["symbols"])
        result.append(x)
    return result

def get_json(url):
    # No retry for 403: likely access restriction.
    # Retry only transient server/rate-limit/network failures.
    last = None
    for attempt in range(3):
        try:
            r = requests.get(
                url,
                timeout=TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0 TSE-Audit"}
            )
            if r.status_code == 403:
                raise RuntimeError("HTTP_403_ACCESS_DENIED")
            if r.status_code in (401, 404):
                raise RuntimeError("HTTP_" + str(r.status_code))
            if r.status_code == 429 or r.status_code >= 500:
                last = "HTTP_" + str(r.status_code)
                time.sleep(2 + attempt * 3)
                continue
            r.raise_for_status()
            return r.json()
        except RuntimeError:
            raise
        except Exception as e:
            last = str(e)
            time.sleep(2 + attempt * 2)
    raise RuntimeError("REQUEST_FAILED: " + str(last))

def parse_events(payload):
    rows = payload.get("priceAdjust", []) if isinstance(payload, dict) else []
    out = []
    for x in rows or []:
        try:
            d = str(x.get("dEven", x.get("date", "")))
            pc = float(x["pClosing"])
            raw = float(x["pClosingNotAdjusted"])
            if d and raw != 0 and math.isfinite(pc/raw):
                out.append({
                    "date": d,
                    "pClosing": pc,
                    "pClosingNotAdjusted": raw,
                    "direct_factor": pc/raw
                })
        except Exception:
            pass
    return out

def parse_daily(payload):
    rows = payload.get("closingPriceDaily", []) if isinstance(payload, dict) else []
    out = []
    for x in rows or []:
        try:
            d = str(x.get("dEven", x.get("date", "")))
            c = float(x["pClosing"])
            if d and math.isfinite(c):
                out.append({"date": d, "close": c})
        except Exception:
            pass
    return sorted(out, key=lambda x: x["date"])

def chain_check(rows):
    if len(rows) <= 1:
        return "SINGLE_EVENT"

    def eq(a, b):
        return abs(a-b) <= max(1e-6, abs(a)*1e-9)

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
        return "INVALID_START_COUNT"

    used = set()
    current = starts[0]

    while current not in used:
        used.add(current)
        target = rows[current]["pClosing"]
        nxt = [
            j for j, other in enumerate(rows)
            if j not in used
            and eq(other["pClosingNotAdjusted"], target)
        ]
        if len(nxt) == 0:
            break
        if len(nxt) > 1:
            return "AMBIGUOUS_NEXT_EDGE"
        current = nxt[0]

    return "VALID" if len(used) == len(rows) else "DISCONNECTED_OR_CYCLIC"

def fetch(inst):
    ins = inst["insCode"]
    ep = get_json(EVENT.format(ins))
    dp = get_json(DAILY.format(ins))
    return parse_events(ep), parse_daily(dp)

def write_report(status, lines):
    report = [
        "TSE ENGINE V5.6.1 - ACCESS AND FULL AUDIT REPORT",
        "=" * 70,
        "UTC: " + datetime.utcnow().isoformat(),
        "STATUS: " + status,
        ""
    ] + lines
    (OUT / "v5_6_report.txt").write_text(
        "\n".join(report), encoding="utf-8"
    )
    log("\n".join(report))

def main():
    log("=" * 65)
    log("TSE V5.6.1 - FAST ACCESS PROBE")
    log("=" * 65)

    universe = load_universe()
    log("Unique Clean V3 instruments: " + str(len(universe)))

    if not universe:
        raise RuntimeError("No instruments found.")

    # -----------------------------------------------------
    # PHASE 1: PROBE ONLY THREE INSTRUMENTS
    # -----------------------------------------------------
    probe_ok = 0
    probe_rows = []
    probe_errors = []

    for i, inst in enumerate(universe[:3], 1):
        ins = inst["insCode"]
        log(f"PROBE {i}/3 | insCode={ins} | {inst['symbols']}")

        try:
            events, daily = fetch(inst)
            probe_ok += 1
            probe_rows.append({
                "insCode": ins,
                "symbols": "|".join(inst["symbols"]),
                "daily_rows": len(daily),
                "event_rows": len(events),
                "status": "OK"
            })
            log(
                f"  OK | daily={len(daily)} | events={len(events)}"
            )
        except Exception as e:
            msg = str(e)
            probe_errors.append({
                "insCode": ins,
                "symbols": "|".join(inst["symbols"]),
                "error": msg
            })
            log("  FAILED: " + msg)

            if "403" in msg or "401" in msg:
                save_csv("v5_6_probe.csv", probe_rows)
                save_csv("v5_6_errors.csv", probe_errors)
                write_report("ACCESS_BLOCKED", [
                    "Probe instruments: 3",
                    f"Successful probes: {probe_ok}",
                    "Access error: " + msg,
                    "Full universe audit was NOT started.",
                    "No production data or models were changed."
                ])
                return

    save_csv("v5_6_probe.csv", probe_rows)

    if probe_ok == 0:
        save_csv("v5_6_errors.csv", probe_errors)
        write_report("PROBE_FAILED", [
            "All probe requests failed.",
            "Full universe audit was NOT started."
        ])
        return

    log("PROBE PASSED. Starting full universe audit.")

    # -----------------------------------------------------
    # PHASE 2: FULL AUDIT
    # -----------------------------------------------------
    all_events = []
    symbols_out = []
    chains_out = []
    boundaries_out = []
    errors = []

    done = 0
    total = len(universe)

    def process(inst):
        events, daily = fetch(inst)
        return inst, events, daily

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(process, x): x for x in universe}

        for future in as_completed(futures):
            inst = futures[future]
            done += 1
            ins = inst["insCode"]
            sym = "|".join(inst["symbols"])

            try:
                inst, events, daily = future.result()

                for e in events:
                    all_events.append({
                        "insCode": ins,
                        "symbols": sym,
                        **e,
                        "factor_gt_1": e["direct_factor"] > 1
                    })

                grouped = {}
                for e in events:
                    grouped.setdefault(e["date"], []).append(e)

                valid = 0
                invalid = 0
                multi = 0

                for d, group in sorted(grouped.items()):
                    status = chain_check(group)
                    if status in ("VALID", "SINGLE_EVENT"):
                        valid += 1
                    else:
                        invalid += 1

                    if len(group) > 1:
                        multi += 1

                    net = 1.0
                    for e in group:
                        net *= e["direct_factor"]

                    before = [x for x in daily if x["date"] < d]
                    onday = [x for x in daily if x["date"] == d]
                    after = [x for x in daily if x["date"] > d]

                    b = before[-1] if before else {}
                    o = onday[-1] if onday else {}
                    a = after[0] if after else {}

                    boundaries_out.append({
                        "insCode": ins,
                        "symbols": sym,
                        "event_date": d,
                        "records": len(group),
                        "before_date": b.get("date", ""),
                        "before_close": b.get("close", ""),
                        "event_day_close": o.get("close", ""),
                        "after_date": a.get("date", ""),
                        "after_close": a.get("close", ""),
                        "net_direct_factor": net
                    })

                    chains_out.append({
                        "insCode": ins,
                        "symbols": sym,
                        "date": d,
                        "records": len(group),
                        "net_direct_factor": net,
                        "chain_status": status
                    })

                symbols_out.append({
                    "insCode": ins,
                    "symbols": sym,
                    "segments": inst["segments"],
                    "daily_rows": len(daily),
                    "event_rows": len(events),
                    "event_dates": len(grouped),
                    "multi_event_dates": multi,
                    "valid_chain_dates": valid,
                    "invalid_chain_dates": invalid,
                    "factor_gt_1": sum(
                        e["direct_factor"] > 1 for e in events
                    ),
                    "status": "OK"
                })

            except Exception as e:
                errors.append({
                    "insCode": ins,
                    "symbols": sym,
                    "error": str(e)
                })
                symbols_out.append({
                    "insCode": ins,
                    "symbols": sym,
                    "status": "ERROR",
                    "error": str(e)
                })

            if done % 10 == 0 or done == total:
                log(
                    f"PROGRESS {done}/{total} | "
                    f"events={len(all_events)} | errors={len(errors)}"
                )

    save_csv("v5_6_events.csv", all_events)
    save_csv("v5_6_symbol_summary.csv", symbols_out)
    save_csv("v5_6_event_chains.csv", chains_out)
    save_csv("v5_6_event_boundaries.csv", boundaries_out)
    save_csv("v5_6_errors.csv", errors)

    valid = sum(
        x["chain_status"] in ("VALID", "SINGLE_EVENT")
        for x in chains_out
    )
    invalid = len(chains_out) - valid
    ok_symbols = sum(x.get("status") == "OK" for x in symbols_out)

    write_report("FULL_AUDIT_COMPLETED", [
        f"Clean V3 unique instruments: {total}",
        f"Successfully fetched: {ok_symbols}",
        f"Fetch errors: {len(errors)}",
        f"Total adjustment events: {len(all_events)}",
        f"Event date groups: {len(chains_out)}",
        f"Valid chain groups: {valid}",
        f"Invalid chain groups: {invalid}",
        "",
        "Limitations:",
        "TSETMC daily and adjustment endpoints are from the same API family.",
        "This does not independently prove historical adjustment correctness.",
        "No Clean V3, Builder, training data, or models were modified."
    ])

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        (OUT / "v5_6_fatal_error.txt").write_text(
            str(e), encoding="utf-8"
        )
        log("FATAL ERROR: " + str(e))
        raise
