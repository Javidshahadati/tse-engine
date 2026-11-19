
import gzip
import json
import csv
import os
import math
import re
from collections import defaultdict

SOURCE = "data/ohlc_clean_v3_20d.json.gz"
OUT = "ohlc_deep_audit"
os.makedirs(OUT, exist_ok=True)

MIN_SYMBOLS = 500
MAX_SYMBOLS = 1200
MIN_ROWS = 500000
MAX_ROWS = 2000000


def getv(obj, keys, default=None):
    if not isinstance(obj, dict):
        return default
    for k in keys:
        if k in obj and obj[k] is not None:
            return obj[k]
    return default


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except:
        return None


def dateval(x):
    return str(x or "").replace("-", "").replace("/", "").strip()


def valid_row(r):
    return (
        isinstance(r, dict)
        and getv(r, ["d", "date", "Date"]) is not None
        and num(getv(r, ["c", "close", "Close"])) is not None
    )


def explicit_symbol(obj):
    value = getv(
        obj,
        ["symbol", "symbolName", "ticker", "n", "name", "s"]
    )
    if value is None:
        return None
    value = str(value).strip()
    if value.lower() in {"r", "data", "rows", "items"}:
        return None
    return value or None


WRAPPERS = {
    "data", "r", "rows", "history",
    "prices", "ohlc", "items", "symbols"
}

symbols = defaultdict(list)
parse_stats = {
    "price_lists_found": 0,
    "unidentified_price_lists": 0
}


def add_rows(name, rows):
    if not name:
        parse_stats["unidentified_price_lists"] += 1
        return
    valid = [r for r in rows if valid_row(r)]
    if valid:
        symbols[str(name)].extend(valid)
        parse_stats["price_lists_found"] += 1


def walk(obj, hint=None):
    if isinstance(obj, dict):

        if valid_row(obj):
            name = explicit_symbol(obj) or hint
            if name:
                symbols[str(name)].append(obj)
            else:
                parse_stats["unidentified_price_lists"] += 1
            return

        rvalue = obj.get("r")

        if isinstance(rvalue, list) and rvalue:
            rows = [
                x for x in rvalue
                if isinstance(x, dict) and valid_row(x)
            ]
            if rows and len(rows) == len(rvalue):
                add_rows(explicit_symbol(obj) or hint, rows)
                return

        for key, value in obj.items():
            next_hint = hint if key in WRAPPERS else str(key)
            if isinstance(value, (dict, list)):
                walk(value, next_hint)

    elif isinstance(obj, list):

        if obj and all(
            isinstance(x, dict) and valid_row(x) for x in obj
        ):
            names = [explicit_symbol(x) for x in obj]

            if any(names):
                grouped = defaultdict(list)
                for row, name in zip(obj, names):
                    if name:
                        grouped[name].append(row)
                for name, rows in grouped.items():
                    add_rows(name, rows)
            elif hint:
                add_rows(hint, obj)
            else:
                parse_stats["unidentified_price_lists"] += 1
            return

        for item in obj:
            name = explicit_symbol(item) if isinstance(item, dict) else None
            walk(item, name or hint)


print("Reading source...")
with gzip.open(SOURCE, "rt", encoding="utf-8") as f:
    raw = json.load(f)

print("Parsing instruments...")
walk(raw)

data = {}

for name, rows in symbols.items():
    cleaned = []

    for r in rows:
        d = dateval(getv(r, ["d", "date", "Date"]))
        c = num(getv(r, ["c", "close", "Close"]))
        if not d or c is None:
            continue

        cleaned.append({
            "date": d,
            "o": num(getv(r, ["o", "open", "Open"])),
            "h": num(getv(r, ["h", "high", "High"])),
            "l": num(getv(r, ["l", "low", "Low"])),
            "c": c,
            "v": num(getv(
                r, ["v", "volume", "vol", "qTotTran5J"]
            ))
        })

    cleaned.sort(key=lambda x: x["date"])

    if cleaned:
        data[str(name)] = cleaned

total_rows = sum(len(v) for v in data.values())

print("Symbols:", len(data))
print("Rows:", total_rows)

if not MIN_SYMBOLS <= len(data) <= MAX_SYMBOLS:
    raise RuntimeError(
        f"Invalid symbol count: {len(data)}. Audit stopped."
    )

if not MIN_ROWS <= total_rows <= MAX_ROWS:
    raise RuntimeError(
        f"Invalid row count: {total_rows}. Audit stopped."
    )

# =====================================================
# HELPERS
# =====================================================

def close_enough(a, b, tol=1e-8):
    if a is None or b is None:
        return False
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def normalize_name(name):
    s = str(name).strip().lower()
    s = re.sub(r"\s*\(seg\d+\)\s*$", "", s)
    s = re.sub(r"\s+", "", s)
    s = s.replace("\u200c", "").replace("\u200f", "")
    s = s.replace("‌", "")
    return s


# =====================================================
# GLOBAL TOTALS
# =====================================================

totals = defaultdict(int)
symbol_report = []
events = []
segment_report = []
label_report = {
    "20": {
        "matched": 0, "legacy_positive": 0,
        "tradable_positive": 0, "same": 0, "different": 0
    },
    "60": {
        "matched": 0, "legacy_positive": 0,
        "tradable_positive": 0, "same": 0, "different": 0
    }
}

totals["symbols"] = len(data)
totals["rows"] = total_rows

# =====================================================
# PER-SYMBOL OHLC AUDIT
# =====================================================

for name, rows in data.items():

    n = len(rows)
    dates = [r["date"] for r in rows]
    closes = [r["c"] for r in rows]
    duplicate_dates = n - len(set(dates))

    zero_idx = []
    zero_flat_close = 0
    zero_close_changed = 0
    zero_full_ohlc_copied = 0
    zero_full_ohlc_changed = 0
    missing_volume = 0
    positive_volume = 0

    invalid_ohlc = 0
    missing_ohlc = 0
    nonpositive_ohlc = 0
    high_low_invalid = 0
    open_outside_range = 0
    close_outside_range = 0

    flat_close_all = 0
    max_flat_close_streak = 0
    max_zero_volume_streak = 0
    flat_streak = 0
    zero_streak = 0

    jumps_10 = 0
    jumps_20 = 0
    jumps_30 = 0

    for i, r in enumerate(rows):

        o, h, l, c, v = (
            r["o"], r["h"], r["l"], r["c"], r["v"]
        )

        if v is None:
            missing_volume += 1
        elif v > 0:
            positive_volume += 1
        elif v <= 0:
            zero_idx.append(i)

        vals = [o, h, l, c]

        if any(x is None for x in vals):
            missing_ohlc += 1
        else:
            if any(x <= 0 for x in vals):
                nonpositive_ohlc += 1

            bad = False

            if h < l:
                high_low_invalid += 1
                bad = True

            if h < max(o, c) or l > min(o, c):
                bad = True

            if o < l or o > h:
                open_outside_range += 1
                bad = True

            if c < l or c > h:
                close_outside_range += 1
                bad = True

            if bad:
                invalid_ohlc += 1

        if i > 0:
            prev = rows[i - 1]

            if close_enough(c, prev["c"]):
                flat_close_all += 1
                flat_streak += 1
                max_flat_close_streak = max(
                    max_flat_close_streak, flat_streak
                )
            else:
                flat_streak = 0

            if c > 0 and prev["c"] > 0:
                daily_ret = c / prev["c"] - 1

                if abs(daily_ret) >= .10:
                    jumps_10 += 1
                if abs(daily_ret) >= .20:
                    jumps_20 += 1
                if abs(daily_ret) >= .30:
                    jumps_30 += 1

            if v is not None and v <= 0:
                zero_streak += 1
                max_zero_volume_streak = max(
                    max_zero_volume_streak, zero_streak
                )

                if close_enough(c, prev["c"]):
                    zero_flat_close += 1
                else:
                    zero_close_changed += 1
                    events.append({
                        "symbol": name,
                        "date": r["date"],
                        "type": "zero_volume_close_changed",
                        "previous_close": prev["c"],
                        "close": c,
                        "return": (
                            c / prev["c"] - 1
                            if prev["c"] > 0 else ""
                        )
                    })

                prev_ohlc = [prev["o"], prev["h"], prev["l"], prev["c"]]
                curr_ohlc = [o, h, l, c]

                if all(x is not None for x in prev_ohlc + curr_ohlc):
                    if all(
                        close_enough(a, b)
                        for a, b in zip(prev_ohlc, curr_ohlc)
                    ):
                        zero_full_ohlc_copied += 1
                    else:
                        zero_full_ohlc_changed += 1

            else:
                zero_streak = 0

        elif v is not None and v <= 0:
            zero_streak = 1

    # =================================================
    # Label sensitivity: existing rows vs traded rows
    # =================================================

    traded_idx = [
        i for i, r in enumerate(rows)
        if r["v"] is not None and r["v"] > 0 and r["c"] > 0
    ]
    traded_pos = {idx: j for j, idx in enumerate(traded_idx)}

    for horizon, threshold in [(20, .03), (60, .08)]:
        key = str(horizon)

        for i in range(n - horizon):
            start = rows[i]
            end = rows[i + horizon]

            if start["c"] <= 0 or end["c"] <= 0:
                continue

            if i not in traded_pos:
                continue

            future_pos = traded_pos[i] + horizon

            if future_pos >= len(traded_idx):
                continue

            traded_end_i = traded_idx[future_pos]
            traded_end = rows[traded_end_i]

            legacy_ret = end["c"] / start["c"] - 1
            traded_ret = traded_end["c"] / start["c"] - 1

            lp = legacy_ret > threshold
            tp = traded_ret > threshold

            label_report[key]["matched"] += 1
            label_report[key]["legacy_positive"] += int(lp)
            label_report[key]["tradable_positive"] += int(tp)
            label_report[key]["same"] += int(lp == tp)
            label_report[key]["different"] += int(lp != tp)

    # =================================================
    # Per-symbol summary
    # =================================================

    zero_count = len(zero_idx)

    row = {
        "symbol": name,
        "rows": n,
        "zero_volume": zero_count,
        "zero_volume_pct": zero_count / n if n else 0,
        "positive_volume": positive_volume,
        "missing_volume": missing_volume,
        "zero_volume_flat_close": zero_flat_close,
        "zero_volume_close_changed": zero_close_changed,
        "zero_volume_full_ohlc_copied": zero_full_ohlc_copied,
        "zero_volume_full_ohlc_changed": zero_full_ohlc_changed,
        "max_zero_volume_streak": max_zero_volume_streak,
        "flat_close_all_rows": flat_close_all,
        "max_flat_close_streak": max_flat_close_streak,
        "missing_ohlc_rows": missing_ohlc,
        "nonpositive_ohlc_rows": nonpositive_ohlc,
        "invalid_ohlc_rows": invalid_ohlc,
        "high_low_invalid_rows": high_low_invalid,
        "open_outside_range_rows": open_outside_range,
        "close_outside_range_rows": close_outside_range,
        "duplicate_dates": duplicate_dates,
        "jumps_abs_10pct": jumps_10,
        "jumps_abs_20pct": jumps_20,
        "jumps_abs_30pct": jumps_30,
        "tradable_rows": len(traded_idx)
    }

    symbol_report.append(row)

    for key in [
        "zero_volume", "positive_volume", "missing_volume",
        "zero_volume_flat_close", "zero_volume_close_changed",
        "zero_volume_full_ohlc_copied",
        "zero_volume_full_ohlc_changed",
        "missing_ohlc_rows", "nonpositive_ohlc_rows",
        "invalid_ohlc_rows", "high_low_invalid_rows",
        "open_outside_range_rows", "close_outside_range_rows",
        "duplicate_dates", "jumps_abs_10pct",
        "jumps_abs_20pct", "jumps_abs_30pct"
    ]:
        totals[key] += row[key]

# =====================================================
# SEGMENT / ORIGINAL SYMBOL OVERLAP
# =====================================================

groups = defaultdict(list)

for name in data:
    groups[normalize_name(name)].append(name)

for normalized, names in groups.items():

    if len(names) < 2:
        continue

    # Compare every pair sharing normalized name.
    for i in range(len(names)):
        for j in range(i + 1, len(names)):

            a_name = names[i]
            b_name = names[j]

            a = {r["date"]: r["c"] for r in data[a_name]}
            b = {r["date"]: r["c"] for r in data[b_name]}

            common = sorted(set(a) & set(b))

            exact = 0
            different = 0
            pct_diffs = []

            for d in common:
                av, bv = a[d], b[d]

                if close_enough(av, bv):
                    exact += 1
                else:
                    different += 1
                    if av != 0:
                        pct_diffs.append(bv / av - 1)

            segment_report.append({
                "symbol_a": a_name,
                "symbol_b": b_name,
                "overlap_dates": len(common),
                "exact_close_matches": exact,
                "different_close_dates": different,
                "exact_match_pct": (
                    exact / len(common) if common else ""
                ),
                "mean_close_difference_pct": (
                    sum(pct_diffs) / len(pct_diffs)
                    if pct_diffs else ""
                ),
                "first_overlap": common[0] if common else "",
                "last_overlap": common[-1] if common else ""
            })

# =====================================================
# SAVE CSV FILES
# =====================================================

def save_csv(path, rows):
    if not rows:
        with open(path, "w", encoding="utf-8-sig") as f:
            f.write("")
        return

    fields = list(rows[0].keys())

    with open(
        path, "w", newline="", encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


save_csv(
    f"{OUT}/symbol_ohlc_quality.csv",
    sorted(
        symbol_report,
        key=lambda x: (
            x["zero_volume"],
            x["invalid_ohlc_rows"]
        ),
        reverse=True
    )
)

save_csv(
    f"{OUT}/zero_volume_price_changes.csv",
    events
)

save_csv(
    f"{OUT}/segment_overlap.csv",
    segment_report
)

# =====================================================
# GLOBAL REPORT
# =====================================================

hundred_pct_zero = [
    x for x in symbol_report
    if x["rows"] > 0 and x["zero_volume"] == x["rows"]
]

high_zero_symbols = [
    x for x in symbol_report
    if x["zero_volume_pct"] >= .90
]

result = {
    "source": SOURCE,
    "symbols": len(data),
    "rows": total_rows,
    "parser_statistics": parse_stats,
    "totals": dict(totals),
    "symbols_100pct_zero_volume": len(hundred_pct_zero),
    "symbols_at_least_90pct_zero_volume": len(high_zero_symbols),
    "segment_overlap_pairs": len(segment_report),
    "label_sensitivity": label_report,
    "notes": [
        "No original data was changed.",
        "No rows were deleted.",
        "OHLC consistency tests are structural checks, not proof of exchange errors.",
        "Zero volume is not automatically proof that a price is invalid.",
        "Segment name matching is a candidate match only, not proof of instrument identity.",
        "Tradable-only labels count positive-volume observations.",
        "Model prediction changes cannot be calculated without matching prediction files."
    ]
}

with open(
    f"{OUT}/summary.json", "w", encoding="utf-8"
) as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

with open(
    f"{OUT}/audit_report.txt", "w", encoding="utf-8"
) as f:

    f.write("TSE ENGINE - DEEP OHLC QUALITY AUDIT V3\n")
    f.write("=" * 65 + "\n\n")
    f.write(json.dumps(result, ensure_ascii=False, indent=2))

    f.write("\n\nTOP SYMBOLS BY INVALID OHLC ROWS\n")
    f.write("=" * 65 + "\n")

    for x in sorted(
        symbol_report,
        key=lambda x: x["invalid_ohlc_rows"],
        reverse=True
    )[:30]:
        f.write(
            f'{x["symbol"]}: '
            f'invalid={x["invalid_ohlc_rows"]}, '
            f'missing={x["missing_ohlc_rows"]}, '
            f'zero_volume={x["zero_volume"]}, '
            f'zero_full_copied={x["zero_volume_full_ohlc_copied"]}\n'
        )

    f.write("\n\nSYMBOLS WITH 100% ZERO VOLUME\n")
    f.write("=" * 65 + "\n")

    for x in hundred_pct_zero:
        f.write(
            f'{x["symbol"]}: rows={x["rows"]}\n'
        )

    f.write("\n\nTOP ZERO-VOLUME PRICE CHANGES\n")
    f.write("=" * 65 + "\n")

    for x in events[:100]:
        f.write(
            f'{x["symbol"]} {x["date"]}: '
            f'{x["previous_close"]} -> {x["close"]}, '
            f'return={x["return"]}\n'
        )

    f.write("\n\nSEGMENT OVERLAP CANDIDATES\n")
    f.write("=" * 65 + "\n")

    for x in segment_report:
        f.write(
            f'{x["symbol_a"]} <> {x["symbol_b"]}: '
            f'overlap={x["overlap_dates"]}, '
            f'exact={x["exact_close_matches"]}, '
            f'different={x["different_close_dates"]}\n'
        )

print("DEEP OHLC AUDIT COMPLETED")
print("Symbols:", len(data))
print("Rows:", total_rows)
print("Invalid OHLC rows:", totals["invalid_ohlc_rows"])
print("Zero-volume full OHLC copied:", totals["zero_volume_full_ohlc_copied"])
print("Zero-volume close changed:", totals["zero_volume_close_changed"])
print("100% zero-volume symbols:", len(hundred_pct_zero))
print("Segment overlap pairs:", len(segment_report))
print("Output:", OUT)
