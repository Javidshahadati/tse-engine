
import os
import json
import gzip

OUT = "audit_v3_report.txt"

DATA_PATH = "data/ohlc_clean_v3_20d.json.gz"
FUND_PATH = "data/fundamentals.json"

report = []

def log(message=""):
    print(message)
    report.append(str(message))

def save_report():
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(report))

def read_json(path, compressed=False):
    if compressed:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(path, encoding="utf-8") as f:
        return json.load(f)

log("TSE ENGINE V3 DATA AUDIT")
log("=" * 60)

for path in [DATA_PATH, FUND_PATH]:
    log(path + ": " + ("FOUND" if os.path.isfile(path) else "MISSING"))

if not os.path.isfile(DATA_PATH):
    log("FATAL: OHLC dataset not found.")
    save_report()
    raise SystemExit(1)

if not os.path.isfile(FUND_PATH):
    log("FATAL: fundamentals file not found.")
    save_report()
    raise SystemExit(1)

# OHLC
try:
    data = read_json(DATA_PATH, True)
except Exception as e:
    log("OHLC READ ERROR: " + str(e))
    save_report()
    raise SystemExit(1)

log("\n[OHLC]")
log("Symbols: " + str(len(data)))

all_dates = set()
total_rows = 0
duplicates = 0
invalid = 0
future_end = {}

for symbol, stock in data.items():
    rows = stock.get("r", []) if isinstance(stock, dict) else []
    parsed = []

    for row in rows:
        try:
            d = str(row["d"]).strip()
            c = float(row["c"])

            if not d or c <= 0:
                invalid += 1
                continue

            parsed.append((d, c))

        except Exception:
            invalid += 1

    parsed.sort(key=lambda x: x[0])
    dates = [x[0] for x in parsed]

    duplicates += len(dates) - len(set(dates))
    total_rows += len(parsed)
    all_dates.update(dates)

    for i, item in enumerate(parsed):
        if i + 20 < len(parsed):
            future_end[(symbol, item[0])] = parsed[i + 20][0]

log("Valid rows: " + str(total_rows))
log("Unique dates: " + str(len(all_dates)))
log("Duplicate dates: " + str(duplicates))
log("Invalid rows: " + str(invalid))

if all_dates:
    sorted_dates = sorted(all_dates)
    log("First date: " + sorted_dates[0])
    log("Last date: " + sorted_dates[-1])

# Label overlap
log("\n[20-DAY LABEL PURGING]")

dates = sorted(all_dates)
n = len(dates)

if n >= 10:
    boundaries = [dates[int(n * p)] for p in
                  [0.5, 0.6, 0.7, 0.8, 0.9]]

    for k in range(len(boundaries)):
        start = boundaries[k]
        end = boundaries[k + 1] if k + 1 < len(boundaries) else None

        raw_train = 0
        valid_train = 0
        purged = 0
        test_count = 0

        for symbol, stock in data.items():
            rows = stock.get("r", []) if isinstance(stock, dict) else []

            for row in rows:
                try:
                    d = str(row["d"]).strip()
                except Exception:
                    continue

                if d < start:
                    raw_train += 1
                    label_end = future_end.get((symbol, d))

                    if label_end is None or label_end >= start:
                        purged += 1
                    else:
                        valid_train += 1

                elif d >= start and (end is None or d < end):
                    if (symbol, d) in future_end:
                        test_count += 1

        ratio = purged / raw_train if raw_train else 0

        log(
            "Fold " + str(k + 1) +
            " | start=" + start +
            " | end=" + str(end) +
            " | train=" + str(raw_train) +
            " | valid=" + str(valid_train) +
            " | purged=" + str(purged) +
            " | test=" + str(test_count) +
            " | purge_ratio=" + str(round(ratio, 4))
        )

# Fundamentals
log("\n[FUNDAMENTALS]")

try:
    fund = read_json(FUND_PATH)
except Exception as e:
    log("FUNDAMENTALS READ ERROR: " + str(e))
    save_report()
    raise SystemExit(1)

log("Symbols: " + str(len(fund)))

eps_count = 0
sector_pe_count = 0
date_fields = set()

for symbol, meta in fund.items():
    if not isinstance(meta, dict):
        continue

    if meta.get("estimatedEPS") not in (None, ""):
        eps_count += 1

    if meta.get("sectorPE") not in (None, ""):
        sector_pe_count += 1

    for key in meta:
        key_lower = str(key).lower()

        if any(x in key_lower for x in
               ["date", "publish", "updated", "report", "period"]):
            date_fields.add(str(key))

log("estimatedEPS available: " + str(eps_count))
log("sectorPE available: " + str(sector_pe_count))
log("Date fields: " + str(sorted(date_fields)))

if not date_fields:
    log("WARNING: No obvious publication date field found.")

# Builder source
log("\n[BUILDER SOURCE]")

builder = "features/builder_v3.py"

if os.path.isfile(builder):
    with open(builder, encoding="utf-8") as f:
        source = f.read()

    for name in [
        "estimatedEPS",
        "sectorPE",
        "eps_yield",
        "pe_relative",
        "eps_to_sector"
    ]:
        log(name + ": " + ("PRESENT" if name in source else "NOT FOUND"))
else:
    log("Builder source not found.")

log("\n[CONCLUSION]")
log("This audit does not prove zero data leakage.")
log("Training should purge samples whose label end date reaches test start.")
log("Fundamental features require historical publication dates.")
log("No original data or model was modified.")

save_report()
print("\nREPORT CREATED:", OUT)
