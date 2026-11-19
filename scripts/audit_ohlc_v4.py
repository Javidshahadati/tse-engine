
import os
import gzip
import json
import csv
import math
import re
from collections import defaultdict

SOURCE = "data/ohlc_clean_v3_20d.json.gz"
OUT = "v4_output"
os.makedirs(OUT, exist_ok=True)

def load_data(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)

def is_num(x):
    try:
        return x is not None and math.isfinite(float(x))
    except:
        return False

def norm_name(s):
    s = str(s).strip()
    s = re.sub(r"\s*\(seg\d+\)\s*$", "", s, flags=re.I)
    s = re.sub(r"[\u200c\u200f\u200e\s]+", "", s)
    return s

def parse(root):
    result = []
    stats = {"price_lists": 0, "unidentified": 0}

    def walk(obj, hint=None):
        if isinstance(obj, dict):
            name = None
            for k in ("n", "name", "symbol", "ticker"):
                v = obj.get(k)
                if isinstance(v, str) and v.strip():
                    name = v.strip()
                    break

            current = name or hint

            for key, value in obj.items():
                if isinstance(value, list) and value:
                    sample = value[0]
                    if (
                        isinstance(sample, dict)
                        and "d" in sample
                        and any(k in sample for k in ("c", "close"))
                    ):
                        symbol = current or str(key)
                        stats["price_lists"] += 1
                        if not symbol:
                            stats["unidentified"] += 1
                        for row in value:
                            if isinstance(row, dict):
                                result.append((symbol, row))
                    else:
                        walk(value, current or hint)
                elif isinstance(value, dict):
                    walk(value, current or hint)

        elif isinstance(obj, list):
            for x in obj:
                walk(x, hint)

    walk(root)
    return result, stats

def val(row, *keys):
    for k in keys:
        if k in row:
            return row[k]
    return None

def date_num(x):
    try:
        return int(str(x).replace("-", "")[:8])
    except:
        return 0

def close_value(row):
    return val(row, "c", "close", "pClosing")

def volume_value(row):
    return val(row, "v", "volume", "qTotTran5J")

def ohlc(row):
    return (
        val(row, "o", "open", "priceFirst"),
        val(row, "h", "high", "priceMax"),
        val(row, "l", "low", "priceMin"),
        val(row, "c", "close", "pClosing")
    )

def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

print("Loading source...")
root = load_data(SOURCE)
parsed, parser_stats = parse(root)

by_symbol = defaultdict(list)
for symbol, row in parsed:
    if symbol:
        by_symbol[symbol].append(row)

symbols = len(by_symbol)
total_rows = sum(len(x) for x in by_symbol.values())

if not (500 <= symbols <= 1200):
    raise RuntimeError(f"Unexpected symbol count: {symbols}")
if not (500000 <= total_rows <= 2000000):
    raise RuntimeError(f"Unexpected row count: {total_rows}")

print("Symbols:", symbols)
print("Rows:", total_rows)

# --------------------------------------------------
# 1. OHLC STRUCTURAL AUDIT
# --------------------------------------------------
invalid_samples = []
symbol_stats = []
invalid_total = 0
close_outside_total = 0
open_outside_total = 0
missing_total = 0
nonpositive_total = 0

for symbol, rows in by_symbol.items():
    rows = sorted(rows, key=lambda x: date_num(val(x, "d", "date")))
    invalid_count = 0

    for i, row in enumerate(rows):
        o, h, l, c = ohlc(row)
        missing = not all(is_num(x) for x in (o, h, l, c))
        nonpositive = (
            not missing and
            any(float(x) <= 0 for x in (o, h, l, c))
        )

        high_low_bad = (
            not missing and float(h) < float(l)
        )
        open_bad = (
            not missing and
            (float(o) < float(l) or float(o) > float(h))
        )
        close_bad = (
            not missing and
            (float(c) < float(l) or float(c) > float(h))
        )

        if missing:
            missing_total += 1
        if nonpositive:
            nonpositive_total += 1
        if open_bad:
            open_outside_total += 1
        if close_bad:
            close_outside_total += 1

        bad = missing or nonpositive or high_low_bad or open_bad or close_bad

        if bad:
            invalid_count += 1
            invalid_total += 1

            if len(invalid_samples) < 10000:
                previous = rows[i-1] if i > 0 else {}
                following = rows[i+1] if i+1 < len(rows) else {}

                invalid_samples.append({
                    "symbol": symbol,
                    "date": val(row, "d", "date"),
                    "o": o, "h": h, "l": l, "c": c,
                    "volume": volume_value(row),
                    "missing": missing,
                    "nonpositive": nonpositive,
                    "high_low_bad": high_low_bad,
                    "open_outside": open_bad,
                    "close_outside": close_bad,
                    "prev_date": val(previous, "d", "date"),
                    "prev_o": ohlc(previous)[0],
                    "prev_h": ohlc(previous)[1],
                    "prev_l": ohlc(previous)[2],
                    "prev_c": ohlc(previous)[3],
                    "next_date": val(following, "d", "date"),
                    "next_o": ohlc(following)[0],
                    "next_h": ohlc(following)[1],
                    "next_l": ohlc(following)[2],
                    "next_c": ohlc(following)[3],
                })

    symbol_stats.append({
        "symbol": symbol,
        "rows": len(rows),
        "invalid_ohlc": invalid_count
    })

write_csv(
    OUT + "/invalid_ohlc_samples.csv",
    invalid_samples,
    list(invalid_samples[0].keys()) if invalid_samples else
    ["symbol", "date", "o", "h", "l", "c"]
)

# --------------------------------------------------
# 2. SEGMENT BOUNDARIES
# --------------------------------------------------
groups = defaultdict(list)

for symbol, rows in by_symbol.items():
    groups[norm_name(symbol)].append((symbol, rows))

segment_report = []

for base, items in groups.items():
    if len(items) < 2:
        continue

    ordered = []
    for name, rows in items:
        dates = sorted(date_num(val(x, "d", "date")) for x in rows)
        if dates:
            ordered.append({
                "name": name,
                "first": dates[0],
                "last": dates[-1],
                "rows": len(rows),
                "dates": set(dates)
            })

    ordered.sort(key=lambda x: x["first"])

    for i, a in enumerate(ordered):
        for b in ordered[i+1:]:
            overlap = a["dates"] & b["dates"]
            gap = b["first"] - a["last"]

            segment_report.append({
                "base_name": base,
                "segment_a": a["name"],
                "segment_a_first": a["first"],
                "segment_a_last": a["last"],
                "segment_a_rows": a["rows"],
                "segment_b": b["name"],
                "segment_b_first": b["first"],
                "segment_b_last": b["last"],
                "segment_b_rows": b["rows"],
                "overlap_dates": len(overlap),
                "calendar_date_gap": gap,
                "same_boundary_close": ""
            })

write_csv(
    OUT + "/segment_boundaries.csv",
    segment_report,
    list(segment_report[0].keys()) if segment_report else
    ["base_name", "segment_a", "segment_b"]
)

# --------------------------------------------------
# 3. LEGACY VS POSITIVE-VOLUME LABELS
# --------------------------------------------------
label_summary = {}

for horizon in (20, 60):
    matched = 0
    legacy_positive = 0
    tradable_positive = 0
    same = 0
    different = 0

    for symbol, rows in by_symbol.items():
        rows = sorted(rows, key=lambda x: date_num(val(x, "d", "date")))

        closes = [close_value(x) for x in rows]
        volumes = [volume_value(x) for x in rows]

        valid = [
            is_num(c) and float(c) > 0
            for c in closes
        ]

        tradable_indices = [
            i for i in range(len(rows))
            if is_num(volumes[i]) and float(volumes[i]) > 0
            and valid[i]
        ]

        position = {idx: p for p, idx in enumerate(tradable_indices)}

        for i in tradable_indices:
            p = position[i]
            if i + horizon >= len(rows):
                continue
            if p + horizon >= len(tradable_indices):
                continue

            future_legacy = i + horizon
            future_tradable = tradable_indices[p + horizon]

            if not valid[future_legacy] or not valid[future_tradable]:
                continue

            base = float(closes[i])
            r1 = float(closes[future_legacy]) / base - 1
            r2 = float(closes[future_tradable]) / base - 1

            threshold = 0.03 if horizon == 20 else 0.08
            y1 = r1 > threshold
            y2 = r2 > threshold

            matched += 1
            legacy_positive += int(y1)
            tradable_positive += int(y2)

            if y1 == y2:
                same += 1
            else:
                different += 1

    label_summary[str(horizon)] = {
        "matched": matched,
        "legacy_positive": legacy_positive,
        "tradable_positive": tradable_positive,
        "same": same,
        "different": different,
        "different_pct": (
            round(100 * different / matched, 4) if matched else None
        )
    }

# --------------------------------------------------
# 4. INSTRUMENT ID / RAW SOURCE DISCOVERY
# --------------------------------------------------
# No raw comparison is claimed unless an instrument ID
# mapping is actually found in the repository.
mapping_candidates = []

for root_dir, dirs, files in os.walk("."):
    dirs[:] = [
        d for d in dirs
        if d not in (".git", ".venv", "__pycache__")
    ]
    for filename in files:
        low = filename.lower()
        if (
            low.endswith((".json", ".csv"))
            and any(k in low for k in ("instrument", "symbol", "inscode", "market"))
        ):
            mapping_candidates.append(
                os.path.join(root_dir, filename)
            )

# --------------------------------------------------
# REPORT
# --------------------------------------------------
summary = {
    "source": SOURCE,
    "symbols": symbols,
    "rows": total_rows,
    "parser_statistics": parser_stats,
    "ohlc": {
        "invalid_rows": invalid_total,
        "invalid_pct": round(100 * invalid_total / total_rows, 4),
        "missing_ohlc": missing_total,
        "nonpositive_ohlc": nonpositive_total,
        "open_outside_range": open_outside_total,
        "close_outside_range": close_outside_total,
        "invalid_samples_saved": len(invalid_samples)
    },
    "segments": {
        "candidate_groups": len(groups),
        "segment_pairs": len(segment_report)
    },
    "label_sensitivity": label_summary,
    "raw_source_mapping": {
        "candidate_files": mapping_candidates,
        "raw_comparison_performed": False,
        "reason": "Instrument ID mapping must be verified before raw API matching."
    },
    "notes": [
        "Original source data was not modified.",
        "No rows were deleted.",
        "OHLC structural flags do not prove exchange source errors.",
        "Segment name matching does not prove instrument identity.",
        "Tradable labels use positive-volume observations.",
        "This audit does not retrain models."
    ]
}

with open(OUT + "/summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

with open(OUT + "/audit_report.txt", "w", encoding="utf-8") as f:
    f.write("TSE ENGINE - DEEP OHLC AUDIT V4\n")
    f.write("=" * 65 + "\n\n")
    f.write(json.dumps(summary, ensure_ascii=False, indent=2))
    f.write("\n\nTOP INVALID SYMBOLS\n")
    for x in sorted(
        symbol_stats,
        key=lambda z: z["invalid_ohlc"],
        reverse=True
    )[:50]:
        f.write(
            f'{x["symbol"]}: {x["invalid_ohlc"]}/{x["rows"]}\n'
        )

print("V4 AUDIT COMPLETE")
print(json.dumps(summary, ensure_ascii=False, indent=2))
