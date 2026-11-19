
import gzip
import json
import csv
import os
import math
from collections import defaultdict

SOURCE = "data/ohlc_clean_v3_20d.json.gz"
OUT = "zero_volume_audit"
os.makedirs(OUT, exist_ok=True)

# انتظار داریم فایل اصلی حدود 829 نماد داشته باشد.
MIN_SYMBOLS = 500
MAX_SYMBOLS = 1200
MIN_ROWS = 500000
MAX_ROWS = 2000000


def getv(obj, keys, default=None):
    if not isinstance(obj, dict):
        return default
    for key in keys:
        if key in obj and obj[key] is not None:
            return obj[key]
    return default


def num(x):
    try:
        v = float(x)
        if math.isfinite(v):
            return v
    except:
        pass
    return None


def dateval(x):
    return str(x or "").replace("-", "").replace("/", "").strip()


def valid_row(row):
    if not isinstance(row, dict):
        return False

    d = getv(row, ["d", "date", "Date"])
    c = getv(row, ["c", "close", "Close"])

    return d is not None and num(c) is not None


def explicit_symbol(obj):
    """
    نام نماد را از مشخصات ابزار استخراج می‌کند.
    در ساختارهایی مانند {i, n, r}، فیلد n معمولاً نام نماد است.
    """
    value = getv(
        obj,
        ["symbol", "symbolName", "ticker", "n", "name", "s"]
    )

    if value is not None:
        value = str(value).strip()
        if value and value.lower() not in {
            "r", "data", "rows", "items", "history"
        }:
            return value

    return None


WRAPPER_KEYS = {
    "data", "r", "rows", "history",
    "prices", "ohlc", "items", "symbols"
}

symbols = defaultdict(list)
parse_stats = {
    "price_lists_found": 0,
    "unidentified_price_lists": 0,
    "instrument_objects_found": 0
}


def add_rows(symbol, rows):
    if not symbol:
        parse_stats["unidentified_price_lists"] += 1
        return

    valid = [x for x in rows if valid_row(x)]

    if valid:
        symbols[str(symbol)].extend(valid)
        parse_stats["price_lists_found"] += 1


def walk(obj, hint=None):
    """
    ساختارهای پشتیبانی‌شده:
    1) {"نماد": [ردیف‌های OHLC]}
    2) {"نماد": {"r": [ردیف‌های OHLC]}}
    3) [{"n": "نماد", "i": "...", "r": [...]}]
    4) {"r": [{"n": "نماد", "i": "...", "r": [...]}]}
    5) ردیف‌های OHLC که خودشان فیلد symbol دارند.
    """

    if isinstance(obj, dict):

        # خود شیء یک ردیف قیمت باشد
        if valid_row(obj):
            sym = explicit_symbol(obj) or hint
            if sym:
                symbols[str(sym)].append(obj)
            else:
                parse_stats["unidentified_price_lists"] += 1
            return

        # شیء نماد با آرایه r
        r_value = obj.get("r")

        if isinstance(r_value, list) and r_value:
            valid_rows = [
                x for x in r_value
                if isinstance(x, dict) and valid_row(x)
            ]

            # اگر تمام اعضای r ردیف قیمت باشند
            if valid_rows and len(valid_rows) == len(r_value):
                sym = explicit_symbol(obj) or hint
                add_rows(sym, valid_rows)
                return

            # اگر r شامل اشیای نمادهای دیگر باشد
            if not valid_rows:
                parse_stats["instrument_objects_found"] += 1

        # سایر کلیدها را پیمایش کن
        for key, value in obj.items():

            if key in WRAPPER_KEYS:
                next_hint = hint
            else:
                next_hint = str(key)

            if isinstance(value, (dict, list)):
                walk(value, next_hint)

    elif isinstance(obj, list):

        if not obj:
            return

        # فهرست مستقیم ردیف‌های OHLC
        if all(
            isinstance(x, dict) and valid_row(x)
            for x in obj
        ):
            row_symbols = [
                explicit_symbol(x) for x in obj
            ]

            known = [x for x in row_symbols if x]

            if known:
                # گروه‌بندی بر اساس نماد داخل ردیف
                grouped = defaultdict(list)
                for row, sym in zip(obj, row_symbols):
                    if sym:
                        grouped[sym].append(row)

                for sym, rows in grouped.items():
                    add_rows(sym, rows)

            elif hint:
                add_rows(hint, obj)

            else:
                parse_stats["unidentified_price_lists"] += 1

            return

        # فهرست اشیای نماد یا سایر ساختارهای تو در تو
        for item in obj:
            item_hint = hint

            if isinstance(item, dict):
                item_hint = explicit_symbol(item) or hint

            walk(item, item_hint)


print("Reading source:", SOURCE)

with gzip.open(SOURCE, "rt", encoding="utf-8") as f:
    raw = json.load(f)

print("JSON loaded. Parsing symbols...")
walk(raw)

# =========================================================
# پاک‌سازی ساختاری و اعتبارسنجی اولیه
# =========================================================

data = {}

for sym, rows in symbols.items():
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
        data[str(sym)] = cleaned


total_rows = sum(len(x) for x in data.values())

print("Symbols parsed:", len(data))
print("Rows parsed:", total_rows)
print("Parser statistics:", parse_stats)

# مهم: اگر ساختار درست شناسایی نشده، گزارش نساز.
if not (MIN_SYMBOLS <= len(data) <= MAX_SYMBOLS):
    raise RuntimeError(
        "INVALID SYMBOL COUNT: "
        + str(len(data))
        + ". Expected between "
        + str(MIN_SYMBOLS)
        + " and "
        + str(MAX_SYMBOLS)
        + ". Audit stopped to prevent misleading results."
    )

if not (MIN_ROWS <= total_rows <= MAX_ROWS):
    raise RuntimeError(
        "INVALID ROW COUNT: "
        + str(total_rows)
        + ". Audit stopped."
    )

# =========================================================
# ممیزی سراسری
# =========================================================

summary = []
events = []

totals = {
    "symbols": len(data),
    "rows": 0,
    "zero_volume_rows": 0,
    "missing_volume_rows": 0,
    "positive_volume_rows": 0,
    "zero_volume_flat_rows": 0,
    "zero_volume_changed_rows": 0,
    "nonpositive_close": 0,
    "duplicate_dates": 0,
    "daily_jump_30": 0,
    "daily_jump_50": 0,
    "daily_jump_90": 0,
    "legacy_20_zero_endpoint": 0,
    "legacy_60_zero_endpoint": 0,
    "tradable_rows": 0
}

label_sensitivity = {
    "20": {
        "matched": 0,
        "legacy_positive": 0,
        "tradable_positive": 0,
        "same": 0,
        "different": 0
    },
    "60": {
        "matched": 0,
        "legacy_positive": 0,
        "tradable_positive": 0,
        "same": 0,
        "different": 0
    }
}

for sym, rows in data.items():

    n = len(rows)
    closes = [r["c"] for r in rows]
    volumes = [r["v"] for r in rows]

    zero = [
        v is not None and v <= 0
        for v in volumes
    ]

    missing = [v is None for v in volumes]

    traded_idx = [
        i for i, r in enumerate(rows)
        if r["v"] is not None
        and r["v"] > 0
        and r["c"] > 0
    ]

    traded_pos = {
        idx: j for j, idx in enumerate(traded_idx)
    }

    dates = [r["date"] for r in rows]
    duplicate_dates = len(dates) - len(set(dates))

    zero_count = sum(zero)
    missing_count = sum(missing)
    positive_count = sum(
        1 for v in volumes if v is not None and v > 0
    )

    flat_zero = 0
    changed_zero = 0
    max_flat_streak = 0
    streak = 0

    symbol_jumps_30 = 0
    symbol_jumps_50 = 0
    symbol_jumps_90 = 0

    for i, r in enumerate(rows):

        if r["c"] <= 0:
            totals["nonpositive_close"] += 1

        if zero[i]:

            if i > 0 and closes[i] == closes[i - 1]:
                flat_zero += 1
                streak += 1
                max_flat_streak = max(
                    max_flat_streak, streak
                )

            else:
                streak = 1

                if i > 0:
                    changed_zero += 1

                    previous = closes[i - 1]
                    current = closes[i]

                    ret = (
                        current / previous - 1
                        if previous > 0 else None
                    )

                    events.append({
                        "symbol": sym,
                        "date": r["date"],
                        "type": "zero_volume_price_change",
                        "previous_close": previous,
                        "close": current,
                        "return": ret
                    })

        else:
            streak = 0

        # جهش روزانه فقط در توالی همان نماد
        if i > 0 and closes[i - 1] > 0:
            dr = closes[i] / closes[i - 1] - 1

            if abs(dr) >= 0.30:
                symbol_jumps_30 += 1
                events.append({
                    "symbol": sym,
                    "date": r["date"],
                    "type": "daily_jump_30pct",
                    "previous_close": closes[i - 1],
                    "close": closes[i],
                    "return": dr
                })

            if abs(dr) >= 0.50:
                symbol_jumps_50 += 1

            if abs(dr) >= 0.90:
                symbol_jumps_90 += 1

    # =====================================================
    # مقایسه افق‌های 20 و 60 ردیفی
    # =====================================================

    for h, threshold in [(20, 0.03), (60, 0.08)]:

        key = str(h)

        for i in range(n - h):

            start = rows[i]
            end = rows[i + h]

            if start["c"] <= 0 or end["c"] <= 0:
                continue

            legacy_ret = end["c"] / start["c"] - 1

            if zero[i] or zero[i + h]:
                totals[
                    f"legacy_{h}_zero_endpoint"
                ] += 1

            # شروع باید یک مشاهده با حجم مثبت باشد
            if i not in traded_pos:
                continue

            future_position = traded_pos[i] + h

            if future_position >= len(traded_idx):
                continue

            traded_end_i = traded_idx[future_position]
            traded_end = rows[traded_end_i]

            if traded_end["c"] <= 0:
                continue

            traded_ret = (
                traded_end["c"] / start["c"] - 1
            )

            label_sensitivity[key]["matched"] += 1

            legacy_positive = legacy_ret > threshold
            traded_positive = traded_ret > threshold

            label_sensitivity[key][
                "legacy_positive"
            ] += int(legacy_positive)

            label_sensitivity[key][
                "tradable_positive"
            ] += int(traded_positive)

            label_sensitivity[key]["same"] += int(
                legacy_positive == traded_positive
            )

            label_sensitivity[key]["different"] += int(
                legacy_positive != traded_positive
            )

    summary.append({
        "symbol": sym,
        "rows": n,
        "zero_volume_rows": zero_count,
        "zero_volume_pct": zero_count / n if n else 0,
        "missing_volume_rows": missing_count,
        "positive_volume_rows": positive_count,
        "zero_volume_flat_rows": flat_zero,
        "zero_volume_price_change_rows": changed_zero,
        "max_zero_volume_flat_streak": max_flat_streak,
        "duplicate_dates": duplicate_dates,
        "nonpositive_close": sum(
            1 for x in closes if x <= 0
        ),
        "tradable_rows": len(traded_idx),
        "daily_jumps_abs_30pct": symbol_jumps_30,
        "daily_jumps_abs_50pct": symbol_jumps_50,
        "daily_jumps_abs_90pct": symbol_jumps_90
    })

    totals["rows"] += n
    totals["zero_volume_rows"] += zero_count
    totals["missing_volume_rows"] += missing_count
    totals["positive_volume_rows"] += positive_count
    totals["zero_volume_flat_rows"] += flat_zero
    totals["zero_volume_changed_rows"] += changed_zero
    totals["duplicate_dates"] += duplicate_dates
    totals["daily_jump_30"] += symbol_jumps_30
    totals["daily_jump_50"] += symbol_jumps_50
    totals["daily_jump_90"] += symbol_jumps_90
    totals["tradable_rows"] += len(traded_idx)

# =========================================================
# خروجی CSV
# =========================================================

summary_fields = list(summary[0].keys())

with open(
    f"{OUT}/symbol_summary.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f, fieldnames=summary_fields
    )
    writer.writeheader()

    writer.writerows(
        sorted(
            summary,
            key=lambda x: x["zero_volume_rows"],
            reverse=True
        )
    )


event_fields = [
    "symbol", "date", "type",
    "previous_close", "close", "return"
]

with open(
    f"{OUT}/suspicious_events.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f, fieldnames=event_fields
    )
    writer.writeheader()
    writer.writerows(events)

# =========================================================
# JSON و گزارش متنی
# =========================================================

result = {
    "source": SOURCE,
    "symbols_parsed": len(data),
    "total_rows": total_rows,
    "parser_statistics": parse_stats,
    "totals": totals,
    "label_sensitivity": label_sensitivity,
    "notes": [
        "Original source data was not modified.",
        "Zero-volume rows were flagged, not deleted.",
        "Missing volume is reported separately from zero volume.",
        "Legacy horizons are row offsets in the original series.",
        "Tradable-only horizons count positive-volume observations.",
        "A price jump is a flag, not proof of a bad price.",
        "Label sensitivity is diagnostic, not a final trading methodology."
    ]
}

with open(
    f"{OUT}/summary.json",
    "w",
    encoding="utf-8"
) as f:
    json.dump(
        result, f, ensure_ascii=False, indent=2
    )

with open(
    f"{OUT}/audit_report.txt",
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "TSE ENGINE - GLOBAL ZERO VOLUME / OHLC AUDIT V2\n"
    )
    f.write("=" * 60 + "\n\n")

    f.write(
        json.dumps(result, ensure_ascii=False, indent=2)
    )

    f.write("\n\nTOP 30 SYMBOLS BY ZERO-VOLUME ROWS\n")
    f.write("=" * 60 + "\n")

    for x in sorted(
        summary,
        key=lambda x: x["zero_volume_rows"],
        reverse=True
    )[:30]:

        f.write(
            f'{x["symbol"]}: '
            f'rows={x["rows"]}, '
            f'zero={x["zero_volume_rows"]}, '
            f'zero_pct={x["zero_volume_pct"]:.2%}, '
            f'flat_zero={x["zero_volume_flat_rows"]}, '
            f'changed_zero={x["zero_volume_price_change_rows"]}, '
            f'duplicates={x["duplicate_dates"]}, '
            f'max_flat_streak={x["max_zero_volume_flat_streak"]}\n'
        )

print("AUDIT V2 COMPLETED")
print("Symbols:", len(data))
print("Rows:", total_rows)
print("Zero-volume rows:", totals["zero_volume_rows"])
print("Missing-volume rows:", totals["missing_volume_rows"])
print("Zero-volume price changes:", totals["zero_volume_changed_rows"])
print("Duplicate dates:", totals["duplicate_dates"])
print("Suspicious events:", len(events))
print("Output:", OUT)
