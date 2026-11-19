
import os, json, csv, gzip, time, math, requests
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "v5_7_output"
OUT.mkdir(exist_ok=True)

CLEAN = ROOT / "data" / "ohlc_clean_v3_20d.json.gz"
BASE = "https://cdn.tsetmc.com/api/ClosingPrice"
DAILY = BASE + "/GetClosingPriceDailyList/{}/0"
EVENT = BASE + "/GetPriceAdjustList/{}"

TIMEOUT = (5, 12)
WORKERS = 3
CHECKPOINT_EVERY = 25
STOP_CODES = (401, 403, 429)

def log(x):
    print(str(x), flush=True)

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

def save_report(status, lines):
    content = [
        "TSE ENGINE V5.7 CONTROLLED AUDIT",
        "=" * 65,
        "UTC: " + datetime.now(timezone.utc).isoformat(),
        "STATUS: " + status,
        ""
    ] + list(lines)
    (OUT / "v5_7_report.txt").write_text(
        "\n".join(content), encoding="utf-8"
    )
    log("\n".join(content))

def load_universe():
    if not CLEAN.exists():
        raise RuntimeError("CLEAN_V3_FILE_NOT_FOUND")
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
            "insCode": ins, "symbols": set(), "segments": 0
        })
        x["symbols"].add(str(ticker))
        x["segments"] += 1

    result = []
    for x in found.values():
        x["symbols"] = sorted(x["symbols"])
        result.append(x)
    return result

def request_json(url):
    started = time.monotonic()
    try:
        r = requests.get(
            url,
            timeout=TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 TSE-Engine-V5.7"}
        )
        elapsed = round(time.monotonic() - started, 3)

        if r.status_code != 200:
            raise RuntimeError(
                f"HTTP_{r.status_code} | {elapsed}s | {r.text[:300]}"
            )

        try:
            payload = r.json()
        except Exception as e:
            raise RuntimeError(
                f"INVALID_JSON | {elapsed}s | {str(e)}"
            )

        return payload, {
            "http": r.status_code,
            "elapsed_sec": elapsed,
            "bytes": len(r.content)
        }

    except requests.exceptions.Timeout as e:
        elapsed = round(time.monotonic() - started, 3)
        raise RuntimeError(f"TIMEOUT | {elapsed}s | {str(e)}")
    except requests.exceptions.RequestException as e:
        elapsed = round(time.monotonic() - started, 3)
        raise RuntimeError(f"NETWORK_ERROR | {elapsed}s | {str(e)}")

def parse_events(payload):
    rows = payload.get("priceAdjust", []) if isinstance(payload, dict) else []
    out = []
    for x in rows or []:
        try:
            d = str(x.get("dEven", x.get("date", "")))
            pc = float(x["pClosing"])
            raw = float(x["pClosingNotAdjusted"])
            factor = pc / raw
            if d and raw != 0 and math.isfinite(factor):
                out.append({
                    "date": d,
                    "pClosing": pc,
                    "pClosingNotAdjusted": raw,
                    "direct_factor": factor
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

def fetch(inst):
    ins = inst["insCode"]
    ep, em = request_json(EVENT.format(ins))
    dp, dm = request_json(DAILY.format(ins))

    if not isinstance(ep, dict) or "priceAdjust" not in ep:
        raise RuntimeError("EVENT_SCHEMA_UNEXPECTED")
    if not isinstance(dp, dict) or "closingPriceDaily" not in dp:
        raise RuntimeError("DAILY_SCHEMA_UNEXPECTED")

    return parse_events(ep), parse_daily(dp), em, dm

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
        if not nxt:
            break
        if len(nxt) > 1:
            return "AMBIGUOUS_NEXT_EDGE"
        current = nxt[0]

    return "VALID" if len(used) == len(rows) else "DISCONNECTED_OR_CYCLIC"

def main():
    log("=" * 65)
    log("TSE V5.7 - CONTROLLED ACCESS PROBE")
    log("=" * 65)

    universe = load_universe()
    log("Unique instruments: " + str(len(universe)))
    if not universe:
        raise RuntimeError("EMPTY_UNIVERSE")

    # PHASE 1: ONE-INSTRUMENT PROBE
    inst = universe[0]
    ins = inst["insCode"]
    probe = []
    log(f"PROBE insCode={ins} symbols={inst['symbols']}")

    try:
        events, daily, em, dm = fetch(inst)
        probe = [{
            "insCode": ins,
            "symbols": "|".join(inst["symbols"]),
            "event_rows": len(events),
            "daily_rows": len(daily),
            "event_http": em["http"],
            "event_seconds": em["elapsed_sec"],
            "daily_http": dm["http"],
            "daily_seconds": dm["elapsed_sec"],
            "status": "OK"
        }]
        log("PROBE OK | events=" + str(len(events)) +
            " | daily=" + str(len(daily)))
        save_csv("v5_7_probe.csv", probe)

    except Exception as e:
        msg = str(e)
        log("PROBE FAILED: " + msg)
        save_csv("v5_7_probe.csv", [{
            "insCode": ins,
            "symbols": "|".join(inst["symbols"]),
            "status": "FAILED",
            "error": msg
        }])
        status = "ACCESS_BLOCKED" if any(
            f"HTTP_{c}" in msg for c in STOP_CODES
        ) else "PROBE_FAILED"
        save_report(status, [
            "One-instrument probe failed.",
            "Full universe audit was NOT started.",
            "Error: " + msg,
            "No production data or models were changed."
        ])
        return

    # PHASE 2: CONTROLLED FULL AUDIT
    log("PROBE PASSED. Starting controlled audit.")
    all_events, symbols_out = [], []
    chains_out, boundaries_out, errors = [], [], []
    done = 0
    total = len(universe)
    hard_stop = None

    def process(x):
        ev, dy, em, dm = fetch(x)
        return x, ev, dy, em, dm

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(process, x): x for x in universe}
        for future in as_completed(futures):
            inst = futures[future]
            ins = inst["insCode"]
            sym = "|".join(inst["symbols"])
            done += 1

            try:
                inst, events, daily, em, dm = future.result()

                for e in events:
                    all_events.append({
                        "insCode": ins, "symbols": sym, **e,
                        "factor_gt_1": e["direct_factor"] > 1
                    })

                grouped = {}
                for e in events:
                    grouped.setdefault(e["date"], []).append(e)

                valid = invalid = multi = 0
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
                        "insCode": ins, "symbols": sym,
                        "event_date": d, "records": len(group),
                        "before_date": b.get("date", ""),
                        "before_close": b.get("close", ""),
                        "event_day_close": o.get("close", ""),
                        "after_date": a.get("date", ""),
                        "after_close": a.get("close", ""),
                        "net_direct_factor": net
                    })

                    chains_out.append({
                        "insCode": ins, "symbols": sym, "date": d,
                        "records": len(group),
                        "net_direct_factor": net,
                        "chain_status": status
                    })

                symbols_out.append({
                    "insCode": ins, "symbols": sym,
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
                    "event_http": em["http"],
                    "daily_http": dm["http"],
                    "status": "OK"
                })

            except Exception as e:
                msg = str(e)
                errors.append({
                    "insCode": ins, "symbols": sym, "error": msg
                })
                symbols_out.append({
                    "insCode": ins, "symbols": sym,
                    "status": "ERROR", "error": msg
                })
                if any(f"HTTP_{c}" in msg for c in STOP_CODES):
                    hard_stop = msg

            if done % CHECKPOINT_EVERY == 0 or done == total or hard_stop:
                save_csv("v5_7_checkpoint_symbols.csv", symbols_out)
                save_csv("v5_7_checkpoint_errors.csv", errors)
                save_report("RUNNING" if not hard_stop else "STOPPED_ON_ACCESS_ERROR", [
                    f"Progress: {done}/{total}",
                    f"Events collected: {len(all_events)}",
                    f"Fetch errors: {len(errors)}",
                    f"Stop reason: {hard_stop or 'None'}",
                    "Checkpoint files saved."
                ])
                log(f"PROGRESS {done}/{total} | errors={len(errors)}")

            if hard_stop:
                log("STOPPING: API access/rate-limit error detected.")
                for f in futures:
                    f.cancel()
                break

    save_csv("v5_7_events.csv", all_events)
    save_csv("v5_7_symbol_summary.csv", symbols_out)
    save_csv("v5_7_event_chains.csv", chains_out)
    save_csv("v5_7_event_boundaries.csv", boundaries_out)
    save_csv("v5_7_errors.csv", errors)

    if hard_stop:
        final_status = "STOPPED_ON_ACCESS_ERROR"
    elif done >= total:
        final_status = "FULL_AUDIT_COMPLETED"
    else:
        final_status = "PARTIAL_AUDIT"

    valid = sum(
        x["chain_status"] in ("VALID", "SINGLE_EVENT")
        for x in chains_out
    )
    save_report(final_status, [
        f"Universe instruments: {total}",
        f"Processed futures: {done}",
        f"Successful symbols: {sum(x.get('status') == 'OK' for x in symbols_out)}",
        f"Fetch errors: {len(errors)}",
        f"Adjustment events: {len(all_events)}",
        f"Event date groups: {len(chains_out)}",
        f"Valid chain groups: {valid}",
        f"Invalid chain groups: {len(chains_out)-valid}",
        f"Stop reason: {hard_stop or 'None'}",
        "",
        "Limitations:",
        "Daily and adjustment endpoints belong to the same TSETMC API family.",
        "This audit does not independently prove adjustment direction.",
        "No Clean V3, Builder, training data, or models were modified."
    ])

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        (OUT / "v5_7_fatal_error.txt").write_text(
            str(e), encoding="utf-8"
        )
        log("FATAL ERROR: " + str(e))
        raise
