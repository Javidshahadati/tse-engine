
import requests
import csv
import json
import os
import time
import unicodedata
from collections import Counter

BASE = "https://cdn.tsetmc.com/api"
OUT = "v5_output"
os.makedirs(OUT, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
}

SYMBOLS = [
    "بانك ملت",
    "داروسازي فارابي",
    "كشتيراني جمهوري اسلامي ايران",
    "بانك اقتصادنوين",
    "معدني و صنعتي چادرملو",
    "فولاد خوزستان",
    "پتروشيمي پرديس",
    "صنايع پتروشيمي خليج فارس",
    "نفت سپاهان",
    "معدني و صنعتي گل گهر",
    "بانك صادرات ايران",
    "پالايش نفت اصفهان"
]

BANK_MELLAT_DATES = {
    "20090303", "20090304", "20090307",
    "20090329", "20090330", "20090418",
    "20090421", "20090509", "20090510",
    "20090512", "20090602", "20090606",
    "20090623", "20090701", "20090704",
    "20090705", "20090707", "20090711",
    "20090712", "20090802", "20090906",
    "20090909", "20090916", "20090930",
    "20091003", "20091004", "20091024",
    "20091103", "20091104", "20091109"
}

def norm(s):
    s = str(s or "")
    s = s.replace("ي", "ی").replace("ك", "ک")
    s = s.replace("\u200c", "").replace(" ", "")
    return "".join(
        c for c in unicodedata.normalize("NFKC", s)
        if not c.isspace()
    )

def get_json(url):
    r = requests.get(url, headers=HEADERS, timeout=45)
    r.raise_for_status()
    return r.json()

def search_instruments(symbol):
    url = f"{BASE}/Instrument/GetInstrumentSearch/{requests.utils.quote(symbol)}"
    data = get_json(url)
    rows = data.get("instrumentSearch", [])

    target = norm(symbol)
    exact = []

    for x in rows:
        ticker = norm(x.get("lVal18AFC", ""))
        if ticker == target:
            exact.append(x)

    # فقط تطبیق دقیق نماد؛ از انتخاب نماد مشابه خودداری می‌کنیم.
    return exact

def analyze_record(row):
    low = float(row.get("priceMin") or 0)
    high = float(row.get("priceMax") or 0)
    op = float(row.get("priceFirst") or 0)
    closing = float(row.get("pClosing") or 0)
    last = float(row.get("pDrCotVal") or 0)

    trades = int(float(row.get("zTotTran") or 0))
    volume = float(row.get("qTotTran5J") or 0)

    valid_range = low > 0 and high > 0 and low <= high
    traded = trades > 0

    close_bad = (
        valid_range and traded and
        not (low <= closing <= high)
    )
    last_bad = (
        valid_range and traded and last > 0 and
        not (low <= last <= high)
    )
    open_bad = (
        valid_range and traded and op > 0 and
        not (low <= op <= high)
    )

    return {
        "date": str(row.get("dEven", "")),
        "open": op,
        "high": high,
        "low": low,
        "pClosing": closing,
        "pDrCotVal": last,
        "trades": trades,
        "volume_field": volume,
        "traded": traded,
        "pClosing_outside": close_bad,
        "pDrCotVal_outside": last_bad,
        "open_outside": open_bad,
        "last_close_difference": last - closing
    }

def main():
    all_results = []
    summaries = []
    errors = []

    print("TSE OHLC V5 AUDIT")
    print("=" * 60)

    for symbol in SYMBOLS:
        print("\nSearching:", symbol)

        try:
            instruments = search_instruments(symbol)

            if not instruments:
                print("EXACT SYMBOL NOT FOUND:", symbol)
                errors.append({
                    "symbol": symbol,
                    "error": "Exact instrument search returned no result"
                })
                continue

            print("Exact matches:", len(instruments))

            for inst in instruments:
                ins = str(inst.get("insCode", ""))
                ticker = inst.get("lVal18AFC", "")
                name = inst.get("lVal30", "")

                print("Fetching:", ticker, "|", name, "|", ins)

                url = (
                    f"{BASE}/ClosingPrice/"
                    f"GetClosingPriceDailyList/{ins}/0"
                )
                data = get_json(url)
                raw_rows = data.get("closingPriceDaily", [])

                records = [analyze_record(x) for x in raw_rows]
                records.sort(key=lambda x: x["date"])

                traded_rows = [x for x in records if x["traded"]]

                pclose_bad = sum(
                    x["pClosing_outside"] for x in traded_rows
                )
                last_bad = sum(
                    x["pDrCotVal_outside"] for x in traded_rows
                )
                open_bad = sum(
                    x["open_outside"] for x in traded_rows
                )

                summary = {
                    "requested_symbol": symbol,
                    "ticker": ticker,
                    "name": name,
                    "insCode": ins,
                    "rows": len(records),
                    "traded_rows": len(traded_rows),
                    "pClosing_outside": pclose_bad,
                    "pClosing_outside_pct": (
                        100 * pclose_bad / len(traded_rows)
                        if traded_rows else 0
                    ),
                    "pDrCotVal_outside": last_bad,
                    "pDrCotVal_outside_pct": (
                        100 * last_bad / len(traded_rows)
                        if traded_rows else 0
                    ),
                    "open_outside": open_bad
                }
                summaries.append(summary)

                for x in records:
                    x["symbol"] = ticker
                    x["name"] = name
                    x["insCode"] = ins
                    all_results.append(x)

                print(
                    "Rows:", len(records),
                    "| traded:", len(traded_rows),
                    "| pClosing invalid:", pclose_bad,
                    "| pDrCotVal invalid:", last_bad
                )

                time.sleep(0.8)

        except Exception as e:
            print("ERROR:", symbol, str(e))
            errors.append({
                "symbol": symbol,
                "error": str(e)
            })

    # Full CSV
    csv_path = os.path.join(OUT, "v5_raw_comparison.csv")
    fields = [
        "symbol", "name", "insCode", "date",
        "open", "high", "low",
        "pClosing", "pDrCotVal",
        "trades", "volume_field", "traded",
        "pClosing_outside", "pDrCotVal_outside",
        "open_outside", "last_close_difference"
    ]

    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_results)

    # Summary CSV
    with open(
        os.path.join(OUT, "v5_summary.csv"),
        "w", newline="", encoding="utf-8-sig"
    ) as f:
        fields2 = list(summaries[0].keys()) if summaries else ["status"]
        writer = csv.DictWriter(f, fieldnames=fields2)
        writer.writeheader()
        writer.writerows(summaries)

    # Bank Mellat selected dates
    bank_rows = [
        x for x in all_results
        if norm(x["symbol"]) == norm("بانك ملت")
        and x["date"] in BANK_MELLAT_DATES
    ]

    with open(
        os.path.join(OUT, "bank_mellat_samples.csv"),
        "w", newline="", encoding="utf-8-sig"
    ) as f:
        fields3 = [
            "symbol", "date", "open", "high", "low",
            "pClosing", "pDrCotVal", "trades",
            "pClosing_outside", "pDrCotVal_outside"
        ]
        writer = csv.DictWriter(f, fieldnames=fields3)
        writer.writeheader()
        writer.writerows(bank_rows)

    report = []
    report.append("TSE ENGINE - OHLC V5 RAW API AUDIT")
    report.append("=" * 65)
    report.append("Symbols requested: " + str(len(SYMBOLS)))
    report.append("Instrument matches: " + str(len(summaries)))
    report.append("Total rows: " + str(len(all_results)))
    report.append("Errors: " + str(len(errors)))
    report.append("")

    for s in summaries:
        report.append(
            f"{s['ticker']} | {s['name']} | InsCode={s['insCode']}"
        )
        report.append(
            f"Rows={s['rows']} | Traded={s['traded_rows']}"
        )
        report.append(
            f"pClosing outside={s['pClosing_outside']} "
            f"({s['pClosing_outside_pct']:.3f}%)"
        )
        report.append(
            f"pDrCotVal outside={s['pDrCotVal_outside']} "
            f"({s['pDrCotVal_outside_pct']:.3f}%)"
        )
        report.append(f"Open outside={s['open_outside']}")
        report.append("-" * 55)

    report.append("\nBANK MELLAT SELECTED DATES")
    for x in bank_rows:
        report.append(
            f"{x['date']} | O={x['open']} H={x['high']} "
            f"L={x['low']} C={x['pClosing']} "
            f"LAST={x['pDrCotVal']} "
            f"Trades={x['trades']}"
        )

    report.append("\nERROR DETAILS")
    for e in errors:
        report.append(str(e))

    report_text = "\n".join(report)

    with open(
        os.path.join(OUT, "v5_report.txt"),
        "w", encoding="utf-8"
    ) as f:
        f.write(report_text)

    with open(
        os.path.join(OUT, "v5_summary.json"),
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            {"summaries": summaries, "errors": errors},
            f, ensure_ascii=False, indent=2
        )

    print("\n" + report_text)

if __name__ == "__main__":
    main()
