
import gzip, json, csv, os, math, statistics
from collections import defaultdict

SOURCE = "data/ohlc_clean_v3_20d.json.gz"
OUT = "zero_volume_audit"
os.makedirs(OUT, exist_ok=True)

def getv(row, keys, default=None):
    for k in keys:
        if k in row and row[k] is not None:
            return row[k]
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
    return isinstance(r, dict) and getv(r, ["d", "date", "Date"]) is not None and getv(r, ["c", "close", "Close"]) is not None

# استخراج انعطاف‌پذیر ساختار نمادها
symbols = defaultdict(list)

def walk(obj, hint=""):
    if isinstance(obj, dict):
        if valid_row(obj) and getv(obj, ["symbol", "s", "insCode"]) is not None:
            sym = str(getv(obj, ["symbol", "s", "insCode"]))
            symbols[sym].append(obj)
            return
        for k, v in obj.items():
            if isinstance(v, list) and v and all(valid_row(x) for x in v if isinstance(x, dict)):
                rows = [x for x in v if valid_row(x)]
                if rows:
                    symbols[str(k)].extend(rows)
                    continue
            walk(v, str(k))
    elif isinstance(obj, list):
        if obj and all(isinstance(x, dict) and valid_row(x) for x in obj):
            for x in obj:
                sym = getv(x, ["symbol", "s", "insCode"])
                if sym is not None:
                    symbols[str(sym)].append(x)
            return
        for x in obj:
            walk(x, hint)

with gzip.open(SOURCE, "rt", encoding="utf-8") as f:
    raw = json.load(f)

walk(raw)

# حذف تکرارهای دقیق در استخراج، اما گزارش duplicate date جداگانه می‌ماند.
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
            "o": num(getv(r, ["o", "open"])),
            "h": num(getv(r, ["h", "high"])),
            "l": num(getv(r, ["l", "low"])),
            "c": c,
            "v": num(getv(r, ["v", "volume", "vol", "qTotTran5J"]))
        })
    cleaned.sort(key=lambda x: x["date"])
    if cleaned:
        data[sym] = cleaned

if not data:
    raise RuntimeError("No OHLC symbols parsed. Source JSON schema needs inspection.")

summary = []
events = []
totals = {
    "symbols": len(data), "rows": 0, "zero_volume": 0,
    "zero_volume_flat": 0, "zero_volume_changed": 0,
    "nonpositive_close": 0, "duplicate_dates": 0,
    "daily_jump_30": 0, "daily_jump_50": 0, "daily_jump_90": 0,
    "legacy_20_zero_endpoint": 0, "legacy_60_zero_endpoint": 0,
    "tradable_rows": 0
}
label_sensitivity = {
    "20": {"matched": 0, "legacy_positive": 0, "tradable_positive": 0,
          "same": 0, "different": 0},
    "60": {"matched": 0, "legacy_positive": 0, "tradable_positive": 0,
          "same": 0, "different": 0}
}

for sym, rows in data.items():
    n = len(rows)
    closes = [r["c"] for r in rows]
    vols = [r["v"] for r in rows]
    zero = [v is None or v <= 0 for v in vols]
    traded_idx = [i for i, r in enumerate(rows)
                  if r["v"] is not None and r["v"] > 0 and r["c"] > 0]
    traded_pos = {idx: j for j, idx in enumerate(traded_idx)}

    dates = [r["date"] for r in rows]
    duplicate_dates = len(dates) - len(set(dates))
    zero_count = sum(zero)
    flat_zero = 0
    changed_zero = 0
    max_flat_streak = 0
    streak = 0

    for i, r in enumerate(rows):
        if r["c"] <= 0:
            totals["nonpositive_close"] += 1

        if zero[i]:
            if i > 0 and closes[i] == closes[i-1]:
                flat_zero += 1
                streak += 1
                max_flat_streak = max(max_flat_streak, streak)
            else:
                streak = 1
                if i > 0:
                    changed_zero += 1
                    events.append({
                        "symbol": sym, "date": r["date"],
                        "type": "zero_volume_price_change",
                        "previous_close": closes[i-1],
                        "close": closes[i],
                        "return": closes[i] / closes[i-1] - 1 if closes[i-1] else ""
                    })
        else:
            streak = 0

        if i > 0 and closes[i-1] > 0:
            dr = closes[i] / closes[i-1] - 1
            if abs(dr) >= 0.30:
                events.append({"symbol": sym, "date": r["date"],
                    "type": "daily_jump_30pct", "previous_close": closes[i-1],
                    "close": closes[i], "return": dr})
                totals["daily_jump_30"] += 1
            if abs(dr) >= 0.50:
                totals["daily_jump_50"] += 1
            if abs(dr) >= 0.90:
                totals["daily_jump_90"] += 1

    # بازده legacy: فاصله 20/60 ردیف موجود در فایل
    # بازده تشخیصی traded-only: فاصله 20/60 مشاهده با حجم مثبت
    for h, threshold in [(20, 0.03), (60, 0.08)]:
        key = str(h)
        for i in range(n - h):
            start, end = rows[i], rows[i+h]
            if start["c"] <= 0 or end["c"] <= 0:
                continue
            legacy_ret = end["c"] / start["c"] - 1
            if zero[i] or zero[i+h]:
                totals[f"legacy_{h}_zero_endpoint"] += 1

            # برای مقایسه، تنها نقاطی را نگه می‌داریم که نقطه شروع و پایان
            # هر دو در مجموعه معاملات دارای حجم مثبت قابل شناسایی باشند.
            if i not in traded_pos:
                continue
            j = traded_pos[i] + h
            if j >= len(traded_idx):
                continue
            traded_end_i = traded_idx[j]
            traded_ret = rows[traded_end_i]["c"] / start["c"] - 1

            label_sensitivity[key]["matched"] += 1
            lp = legacy_ret > threshold
            tp = traded_ret > threshold
            label_sensitivity[key]["legacy_positive"] += int(lp)
            label_sensitivity[key]["tradable_positive"] += int(tp)
            label_sensitivity[key]["same"] += int(lp == tp)
            label_sensitivity[key]["different"] += int(lp != tp)

    summary.append({
        "symbol": sym, "rows": n,
        "zero_volume_rows": zero_count,
        "zero_volume_pct": zero_count / n if n else 0,
        "zero_volume_flat_rows": flat_zero,
        "zero_volume_price_change_rows": changed_zero,
        "max_zero_volume_flat_streak": max_flat_streak,
        "duplicate_dates": duplicate_dates,
        "nonpositive_close": sum(1 for x in closes if x <= 0),
        "tradable_rows": len(traded_idx),
        "daily_jumps_abs_30pct": sum(
            1 for i in range(1,n) if closes[i-1] > 0 and
            abs(closes[i]/closes[i-1]-1) >= .30)
    })

    totals["rows"] += n
    totals["zero_volume"] += zero_count
    totals["zero_volume_flat"] += flat_zero
    totals["zero_volume_changed"] += changed_zero
    totals["duplicate_dates"] += duplicate_dates
    totals["tradable_rows"] += len(traded_idx)

# CSV خروجی
with open(f"{OUT}/symbol_summary.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(summary[0].keys()))
    w.writeheader()
    w.writerows(sorted(summary, key=lambda x: x["zero_volume_rows"], reverse=True))

with open(f"{OUT}/suspicious_events.csv", "w", newline="", encoding="utf-8-sig") as f:
    fields = ["symbol","date","type","previous_close","close","return"]
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(events)

result = {
    "source": SOURCE,
    "symbols_parsed": len(data),
    "totals": totals,
    "label_sensitivity": label_sensitivity,
    "notes": [
        "No source data was modified.",
        "Zero-volume rows were flagged, not deleted.",
        "Legacy horizons are row offsets in the original series.",
        "Tradable-only horizons count positive-volume observations, not calendar days.",
        "Label comparison is diagnostic and does not define a final trading methodology.",
        "A price jump is a flag, not proof of a bad price."
    ]
}
with open(f"{OUT}/summary.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

with open(f"{OUT}/audit_report.txt", "w", encoding="utf-8") as f:
    f.write("TSE ENGINE - GLOBAL ZERO VOLUME / OHLC AUDIT\n")
    f.write("="*55 + "\n")
    f.write(json.dumps(result, ensure_ascii=False, indent=2))
    f.write("\n\nTOP 30 SYMBOLS BY ZERO-VOLUME ROWS\n")
    for x in sorted(summary, key=lambda x: x["zero_volume_rows"], reverse=True)[:30]:
        f.write(
            f'{x["symbol"]}: rows={x["rows"]}, zero={x["zero_volume_rows"]}, '
            f'zero_pct={x["zero_volume_pct"]:.2%}, '
            f'flat_zero={x["zero_volume_flat_rows"]}, '
            f'changed_zero={x["zero_volume_price_change_rows"]}, '
            f'max_flat_streak={x["max_zero_volume_flat_streak"]}\n'
        )

print("AUDIT COMPLETED")
print("Symbols:", len(data))
print("Rows:", totals["rows"])
print("Zero-volume rows:", totals["zero_volume"])
print("Zero-volume price changes:", totals["zero_volume_changed"])
print("Events:", len(events))
print("Output:", OUT)
