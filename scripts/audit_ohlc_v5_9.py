
import requests, csv, json, time, math, os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict, deque

BASE = Path("v5_9_output")
BASE.mkdir(exist_ok=True)

TARGET_FILE = "data/v5_9_targets.csv"
WORKERS = 4

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 TSE-Research-Audit/5.9",
    "Accept": "application/json, text/plain, */*"
})

def get_json(url):
    last = None
    for attempt in range(4):
        try:
            r = session.get(url, timeout=(12, 35))
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last = str(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(last or "request failed")

def digits(x):
    return "".join(c for c in str(x or "") if c.isdigit())

def date_of(row):
    for k in ("dEven", "date", "eventDate", "dDate"):
        if row.get(k) not in (None, ""):
            d = digits(row[k])
            if len(d) >= 8:
                return d[:8]
    return ""

def number(x):
    try:
        if x in (None, ""):
            return None
        return float(x)
    except Exception:
        return None

def pick(row, keys):
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return None

def write_csv(name, rows):
    rows = list(rows)
    fields = []
    for row in rows:
        for k in row:
            if k not in fields:
                fields.append(k)
    with open(BASE / name, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

with open(TARGET_FILE, encoding="utf-8-sig") as f:
    targets = list(csv.DictReader(f))

by_ins = {}
for t in targets:
    by_ins.setdefault(t["insCode"], []).append(t)

print("=" * 65, flush=True)
print("TSE V5.9 - MULTI EVENT FORENSIC AUDIT", flush=True)
print("Target groups:", len(targets), flush=True)
print("Unique instruments:", len(by_ins), flush=True)
print("=" * 65, flush=True)

def fetch_instrument(ins):
    daily_url = (
        "https://cdn.tsetmc.com/api/ClosingPrice/"
        f"GetClosingPriceDailyList/{ins}/0"
    )
    event_url = (
        "https://cdn.tsetmc.com/api/ClosingPrice/"
        f"GetPriceAdjustList/{ins}"
    )

    daily_json = get_json(daily_url)
    event_json = get_json(event_url)

    daily = daily_json.get("closingPriceDaily", [])
    events = event_json.get("priceAdjust", [])

    if not isinstance(daily, list):
        daily = []
    if not isinstance(events, list):
        events = []

    return ins, daily, events, None

def is_traded(row):
    # فقط فیلدهای متعارف تعداد معامله/حجم بررسی می‌شوند.
    # pDrCotVal به تنهایی اثبات معامله نیست.
    for k in ("zTotTran", "qTotTran5J", "volume", "trades"):
        v = number(row.get(k))
        if v is not None and v > 0:
            return True
    return False

def graph_analysis(records):
    edges = []
    for i, r in enumerate(records):
        a = number(r.get("pClosingNotAdjusted"))
        b = number(r.get("pClosing"))
        if a is None or b is None or a == 0:
            continue
        edges.append({
            "i": i,
            "src": round(a, 6),
            "dst": round(b, 6),
            "factor": b / a
        })

    if not edges:
        return {
            "graph_status": "NO_VALID_EDGES",
            "edge_count": 0,
            "weak_components": 0,
            "branch_nodes": 0,
            "start_nodes": 0,
            "end_nodes": 0,
            "full_chain_product": None,
            "path_endpoint_ratio": None,
            "reciprocal_pairs": 0
        }

    # گراف جهت‌دار از pClosingNotAdjusted به pClosing
    adj = defaultdict(list)
    indeg = defaultdict(int)
    outdeg = defaultdict(int)
    nodes = set()

    for e in edges:
        adj[e["src"]].append(e["dst"])
        outdeg[e["src"]] += 1
        indeg[e["dst"]] += 1
        nodes.update((e["src"], e["dst"]))

    # مؤلفه‌های متصل در گراف بدون جهت
    und = defaultdict(set)
    for e in edges:
        und[e["src"]].add(e["dst"])
        und[e["dst"]].add(e["src"])

    seen = set()
    components = 0
    for n in nodes:
        if n in seen:
            continue
        components += 1
        q = [n]
        seen.add(n)
        while q:
            x = q.pop()
            for y in und[x]:
                if y not in seen:
                    seen.add(y)
                    q.append(y)

    starts = [n for n in nodes if outdeg[n] - indeg[n] == 1]
    ends = [n for n in nodes if indeg[n] - outdeg[n] == 1]
    bad_degree = [
        n for n in nodes
        if abs(outdeg[n] - indeg[n]) > 1
    ]
    branch_nodes = sum(
        1 for n in nodes if indeg[n] > 1 or outdeg[n] > 1
    )

    product = 1.0
    for e in edges:
        product *= e["factor"]

    endpoint_ratio = None
    if len(starts) == 1 and len(ends) == 1:
        endpoint_ratio = ends[0] / starts[0] if starts[0] else None

    reciprocal = 0
    for i, a in enumerate(edges):
        for b in edges[i+1:]:
            if abs(a["src"] - b["dst"]) < 0.000001 and \
               abs(a["dst"] - b["src"]) < 0.000001:
                reciprocal += 1

    if components > 1:
        status = "DISCONNECTED"
    elif bad_degree:
        status = "DEGREE_INCONSISTENT"
    elif len(starts) == 1 and len(ends) == 1 and branch_nodes == 0:
        status = "LINEAR_CHAIN"
    elif branch_nodes > 0:
        status = "BRANCHED_OR_MERGED"
    elif len(starts) == 0 and len(ends) == 0:
        status = "CYCLE_OR_CLOSED_GRAPH"
    else:
        status = "AMBIGUOUS_TOPOLOGY"

    return {
        "graph_status": status,
        "edge_count": len(edges),
        "weak_components": components,
        "branch_nodes": branch_nodes,
        "start_nodes": len(starts),
        "end_nodes": len(ends),
        "full_chain_product": product,
        "path_endpoint_ratio": endpoint_ratio,
        "reciprocal_pairs": reciprocal
    }

def analyze_one(ins, daily, events, target):
    event_date = target["event_date"]

    matching = [
        r for r in events if date_of(r) == event_date
    ]

    # مرتب‌سازی صرفاً برای نمایش؛ ترتیب دریافتی API حفظ نمی‌شود
    # و هیچ معنای زمانی برای ترتیب رکوردها فرض نمی‌شود.
    graph = graph_analysis(matching)

    drows = []
    for r in daily:
        d = date_of(r)
        if d:
            rr = dict(r)
            rr["_date"] = d
            drows.append(rr)

    drows.sort(key=lambda x: x["_date"])

    before = [r for r in drows if r["_date"] < event_date]
    after = [r for r in drows if r["_date"] > event_date]
    onday = [r for r in drows if r["_date"] == event_date]

    # نزدیک‌ترین رکورد تقویمی قبل/بعد
    prev_cal = before[-1] if before else None
    next_cal = after[0] if after else None

    # نزدیک‌ترین روز دارای معامله قبل/بعد
    prev_traded = next(
        (r for r in reversed(before) if is_traded(r)), None
    )
    next_traded = next(
        (r for r in after if is_traded(r)), None
    )

    def close(r):
        return number(r.get("pClosing")) if r else None

    bc = close(prev_cal)
    ac = close(next_cal)
    ratio = ac / bc if bc not in (None, 0) and ac is not None else None

    result = {
        "insCode": ins,
        "event_date": event_date,
        "symbols": target.get("symbols", ""),
        "expected_records": target.get("expected_records"),
        "fetched_event_records": len(matching),
        "event_records_match": (
            len(matching) == int(target.get("expected_records") or 0)
        ),
        **graph,
        "before_date": prev_cal.get("_date") if prev_cal else "",
        "before_pClosing": bc,
        "after_date": next_cal.get("_date") if next_cal else "",
        "after_pClosing": ac,
        "calendar_close_ratio": ratio,
        "before_traded_date": prev_traded.get("_date") if prev_traded else "",
        "before_traded_pClosing": close(prev_traded),
        "after_traded_date": next_traded.get("_date") if next_traded else "",
        "after_traded_pClosing": close(next_traded),
        "event_day_rows": len(onday),
        "event_day_traded_rows": sum(1 for r in onday if is_traded(r))
    }

    record_rows = []
    for i, r in enumerate(matching):
        a = number(r.get("pClosingNotAdjusted"))
        b = number(r.get("pClosing"))
        record_rows.append({
            "insCode": ins,
            "event_date": event_date,
            "record_index": i,
            "pClosing": r.get("pClosing"),
            "pClosingNotAdjusted": r.get("pClosingNotAdjusted"),
            "direct_factor": b / a if a not in (None, 0) and b is not None else None,
            "raw_json": json.dumps(r, ensure_ascii=False)
        })

    # سه ردیف تقویمی قبل و بعد + روز رویداد
    selected = set()
    for r in before[-3:] + onday + after[:3]:
        selected.add(id(r))

    context_rows = []
    for r in drows:
        if id(r) not in selected:
            continue
        context_rows.append({
            "insCode": ins,
            "event_date": event_date,
            "daily_date": r.get("_date"),
            "is_event_day": r.get("_date") == event_date,
            "is_traded": is_traded(r),
            "pClosing": r.get("pClosing"),
            "pDrCotVal": r.get("pDrCotVal"),
            "zTotTran": r.get("zTotTran"),
            "qTotTran5J": r.get("qTotTran5J"),
            "priceFirst": r.get("priceFirst"),
            "priceMin": r.get("priceMin"),
            "priceMax": r.get("priceMax"),
            "priceYesterday": r.get("priceYesterday"),
            "raw_json": json.dumps(r, ensure_ascii=False)
        })

    return result, record_rows, context_rows

all_results = []
all_records = []
all_context = []
errors = []

def worker(ins):
    try:
        return fetch_instrument(ins)
    except Exception as e:
        return ins, [], [], str(e)

completed = 0
with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    futures = {
        pool.submit(worker, ins): ins for ins in by_ins
    }

    for future in as_completed(futures):
        ins = futures[future]
        _, daily, events, err = future.result()
        completed += 1

        if err:
            errors.append({
                "insCode": ins,
                "error": err
            })
            print(
                f"ERROR {completed}/{len(by_ins)} insCode={ins}: {err}",
                flush=True
            )
            continue

        for target in by_ins[ins]:
            try:
                result, records, context = analyze_one(
                    ins, daily, events, target
                )
                all_results.append(result)
                all_records.extend(records)
                all_context.extend(context)
            except Exception as e:
                errors.append({
                    "insCode": ins,
                    "event_date": target["event_date"],
                    "error": str(e)
                })

        if completed % 10 == 0 or completed == len(by_ins):
            print(
                f"PROGRESS {completed}/{len(by_ins)} "
                f"| groups={len(all_results)} "
                f"| errors={len(errors)}",
                flush=True
            )

write_csv("v5_9_group_analysis.csv", all_results)
write_csv("v5_9_event_records.csv", all_records)
write_csv("v5_9_daily_context.csv", all_context)
write_csv("v5_9_errors.csv", errors)

status_counts = defaultdict(int)
for r in all_results:
    status_counts[r.get("graph_status", "UNKNOWN")] += 1

matched = sum(1 for r in all_results if r.get("event_records_match"))
missing = len(all_results) - matched

report = []
report.append("=" * 65)
report.append("TSE V5.9 - MULTI EVENT FORENSIC AUDIT")
report.append("=" * 65)
report.append(f"Target groups: {len(targets)}")
report.append(f"Analyzed groups: {len(all_results)}")
report.append(f"Event record count matched: {matched}")
report.append(f"Event record count mismatch: {missing}")
report.append(f"Fetch/analysis errors: {len(errors)}")
report.append("")
report.append("GRAPH CLASSIFICATION")
for k, v in sorted(status_counts.items()):
    report.append(f"{k}: {v}")
report.append("")
report.append("IMPORTANT LIMITATIONS")
report.append("- Graph continuity does not prove adjustment semantics.")
report.append("- Full-chain product is diagnostic, not an automatic factor choice.")
report.append("- Before/after close ratio includes possible market movement.")
report.append("- pDrCotVal alone is not treated as proof of a trade.")
report.append("- No production data, builder, or model was modified.")
report.append("=" * 65)

(BASE / "v5_9_report.txt").write_text(
    "\n".join(report), encoding="utf-8"
)

print("\n".join(report), flush=True)
print("V5.9 AUDIT COMPLETED", flush=True)
