
import requests, csv, json, os, statistics, time
from collections import defaultdict

OUT = "v5_2_output"
os.makedirs(OUT, exist_ok=True)

INSTRUMENTS = [
    ("وبملت", "بانک ملت", "778253364357513"),
    ("حکشتی", "کشتیرانی جمهوری اسلامی ایران", "60610861509165508"),
    ("فارس", "صنایع پتروشیمی خلیج فارس", "25244329144808274"),
    ("کگل", "معدنی و صنعتی گل گهر", "35700344742885862"),
    ("وبصادر", "بانک صادرات ایران", "28320293733348826"),
    ("شپنا", "پالایش نفت اصفهان", "7745894403636165"),
]

URL = "https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{}\/0"
all_rows = []
errors = []
summary = []

def num(x):
    try:
        return float(x or 0)
    except:
        return 0.0

def pct(values, p):
    if not values:
        return None
    a = sorted(values)
    pos = (len(a)-1)*p
    lo = int(pos)
    hi = min(lo+1, len(a)-1)
    return a[lo] + (a[hi]-a[lo])*(pos-lo)

for symbol, name, ins in INSTRUMENTS:
    print("Fetching:", symbol, ins)
    try:
        url = URL.format(ins).replace("\\/", "/")
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        payload = r.json()
        daily = payload.get("closingPriceDaily", [])

        if not isinstance(daily, list):
            raise ValueError("closingPriceDaily is not a list")

        count = 0
        for x in daily:
            o = num(x.get("priceFirst"))
            h = num(x.get("priceMax"))
            l = num(x.get("priceMin"))
            pc = num(x.get("pClosing"))
            pd = num(x.get("pDrCotVal"))
            trades = num(x.get("zTotTran"))
            volume = num(x.get("qTotTran5J"))
            date = str(x.get("dEven", ""))

            valid = h > 0 and l > 0 and h >= l
            traded = trades > 0 and volume > 0

            pc_out = valid and (pc < l or pc > h)
            pd_out = valid and (pd < l or pd > h)
            op_out = valid and o > 0 and (o < l or o > h)

            row = {
                "symbol": symbol,
                "name": name,
                "insCode": ins,
                "date": date,
                "open": o,
                "high": h,
                "low": l,
                "pClosing": pc,
                "pDrCotVal": pd,
                "difference": pd-pc,
                "abs_difference": abs(pd-pc),
                "difference_pct_of_pClosing": (
                    (pd-pc)/pc*100 if pc else None
                ),
                "trades": int(trades),
                "volume": int(volume),
                "traded": traded,
                "valid_range": valid,
                "pClosing_outside": pc_out,
                "pDrCotVal_outside": pd_out,
                "open_outside": op_out,
            }
            all_rows.append(row)
            count += 1

        print("Rows:", count)

    except Exception as e:
        errors.append({
            "symbol": symbol,
            "insCode": ins,
            "error": repr(e)
        })
        print("ERROR:", repr(e))

    time.sleep(0.5)

FIELDS = [
    "symbol", "name", "insCode", "date", "open", "high", "low",
    "pClosing", "pDrCotVal", "difference", "abs_difference",
    "difference_pct_of_pClosing", "trades", "volume", "traded",
    "valid_range", "pClosing_outside", "pDrCotVal_outside",
    "open_outside"
]

def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

write_csv(os.path.join(OUT, "v5_2_all_rows.csv"), all_rows)

for symbol, name, ins in INSTRUMENTS:
    rows = [x for x in all_rows if x["symbol"] == symbol]
    traded = [x for x in rows if x["traded"]]
    valid_traded = [x for x in traded if x["valid_range"]]
    diffs = [x["difference"] for x in valid_traded]
    absdiff = [abs(x["difference"]) for x in valid_traded]
    rel = [
        abs(x["difference_pct_of_pClosing"])
        for x in valid_traded
        if x["difference_pct_of_pClosing"] is not None
    ]

    item = {
        "symbol": symbol,
        "name": name,
        "insCode": ins,
        "rows": len(rows),
        "traded_rows": len(traded),
        "valid_traded_rows": len(valid_traded),
        "pClosing_outside": sum(x["pClosing_outside"] for x in traded),
        "pDrCotVal_outside": sum(x["pDrCotVal_outside"] for x in traded),
        "open_outside": sum(x["open_outside"] for x in traded),
        "different_prices": sum(x["difference"] != 0 for x in valid_traded),
        "same_prices": sum(x["difference"] == 0 for x in valid_traded),
        "mean_signed_difference": statistics.mean(diffs) if diffs else None,
        "median_signed_difference": statistics.median(diffs) if diffs else None,
        "mean_absolute_difference": statistics.mean(absdiff) if absdiff else None,
        "median_absolute_difference": statistics.median(absdiff) if absdiff else None,
        "abs_difference_p95": pct(absdiff, .95),
        "abs_difference_p99": pct(absdiff, .99),
        "absolute_percent_difference_p95": pct(rel, .95),
    }
    summary.append(item)

    # نمونه‌های مهم
    bad_pc = [x for x in rows if x["traded"] and x["pClosing_outside"]]
    bad_pd = [x for x in rows if x["traded"] and x["pDrCotVal_outside"]]
    different = [
        x for x in valid_traded
        if x["difference"] != 0
    ]

    write_csv(os.path.join(OUT, symbol + "_pClosing_outside.csv"), bad_pc)
    write_csv(os.path.join(OUT, symbol + "_pDrCotVal_outside.csv"), bad_pd)
    write_csv(os.path.join(OUT, symbol + "_different_prices.csv"),
              sorted(different, key=lambda x: x["abs_difference"], reverse=True)[:300])

# تحلیل اختلاف بر اساس حجم و تعداد معاملات
buckets = defaultdict(list)
for x in all_rows:
    if not x["traded"] or not x["valid_range"]:
        continue

    if x["trades"] <= 100:
        tb = "trades_1_100"
    elif x["trades"] <= 1000:
        tb = "trades_101_1000"
    elif x["trades"] <= 10000:
        tb = "trades_1001_10000"
    else:
        tb = "trades_over_10000"

    if x["volume"] <= 100000:
        vb = "volume_1_100k"
    elif x["volume"] <= 1000000:
        vb = "volume_100k_1m"
    elif x["volume"] <= 10000000:
        vb = "volume_1m_10m"
    else:
        vb = "volume_over_10m"

    buckets[("trades", tb)].append(x)
    buckets[("volume", vb)].append(x)

bucket_report = []
for (kind, label), rows in sorted(buckets.items()):
    bucket_report.append({
        "type": kind,
        "bucket": label,
        "rows": len(rows),
        "different_prices": sum(x["difference"] != 0 for x in rows),
        "pClosing_outside": sum(x["pClosing_outside"] for x in rows),
        "pDrCotVal_outside": sum(x["pDrCotVal_outside"] for x in rows),
        "mean_abs_difference": (
            statistics.mean(x["abs_difference"] for x in rows)
            if rows else None
        )
    })

report = {
    "audit": "TSE OHLC V5.2",
    "rows": len(all_rows),
    "instruments_requested": len(INSTRUMENTS),
    "instruments_with_data": len(set(x["symbol"] for x in all_rows)),
    "errors": errors,
    "summary": summary,
    "volume_trade_buckets": bucket_report
}

with open(os.path.join(OUT, "v5_2_summary.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

with open(os.path.join(OUT, "v5_2_report.txt"), "w", encoding="utf-8") as f:
    f.write("TSE ENGINE - OHLC V5.2 AUDIT\n")
    f.write("="*75 + "\n")
    f.write("Total rows: %s\n" % len(all_rows))
    f.write("Instruments with data: %s\n" % report["instruments_with_data"])
    f.write("Errors: %s\n\n" % len(errors))

    for x in summary:
        f.write("-"*65 + "\n")
        for k, v in x.items():
            f.write(f"{k}: {v}\n")

    f.write("\nVOLUME / TRADES BUCKETS\n")
    for x in bucket_report:
        f.write(json.dumps(x, ensure_ascii=False) + "\n")

    f.write("\nERRORS\n")
    for e in errors:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")

print("\n========== V5.2 SUMMARY ==========")
print("Total rows:", len(all_rows))
for x in summary:
    print(
        x["symbol"],
        "| rows:", x["rows"],
        "| traded:", x["traded_rows"],
        "| different:", x["different_prices"],
        "| pClosing outside:", x["pClosing_outside"],
        "| pDrCotVal outside:", x["pDrCotVal_outside"],
        "| median abs diff:", x["median_absolute_difference"]
    )
print("Errors:", len(errors))
print("OUTPUT:", OUT)
