
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

# نمادها و نام‌هایی که جست‌وجو می‌شوند
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

BANK_DATES = {
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

def norm(value):
    s = str(value or "")
    s = s.replace("ي", "ی").replace("ك", "ک")
    s = s.replace("ۀ", "ه").replace("ة", "ه")
    s = s.replace("\u200c", "")
    s = s.replace("‌", "")
    s = s.replace(" ", "")
    s = unicodedata.normalize("NFKC", s)
    return "".join(c for c in s if not c.isspace())

def get_json(url):
    r = requests.get(
        url,
        headers=HEADERS,
        timeout=60
    )
    r.raise_for_status()
    return r.json()

def search_instruments(query):
    url = (
        f"{BASE}/Instrument/GetInstrumentSearch/"
        f"{requests.utils.quote(query)}"
    )

    data = get_json(url)
    rows = data.get("instrumentSearch", [])

    if not isinstance(rows, list):
        raise ValueError(
            "Unexpected API response: " + str(data)[:1000]
        )

    target = norm(query)
    exact = []
    candidates = []

    for x in rows:
        ticker = norm(x.get("lVal18AFC", ""))
        name = norm(x.get("lVal30", ""))

        item = {
            "ticker": x.get("lVal18AFC"),
            "name": x.get("lVal30"),
            "insCode": str(x.get("insCode", "")),
            "raw": x
        }

        candidates.append(item)

        # تطبیق دقیق با نماد یا نام کامل
        if target == ticker or target == name:
            exact.append(item)

    # حذف InsCode تکراری
    unique = {}
    for x in exact:
        if x["insCode"]:
            unique[x["insCode"]] = x

    return list(unique.values()), candidates

def number(x):
    try:
        return float(x or 0)
    except:
        return 0.0

def integer(x):
    try:
        return int(float(x or 0))
    except:
        return 0

def analyze(row):
    low = number(row.get("priceMin"))
    high = number(row.get("priceMax"))
    op = number(row.get("priceFirst"))
    closing = number(row.get("pClosing"))
    last = number(row.get("pDrCotVal"))

    trades = integer(row.get("zTotTran"))
    volume = number(row.get("qTotTran5J"))

    valid_range = (
        low > 0 and high > 0 and low <= high
    )

    traded = trades > 0 and volume > 0

    close_bad = (
        valid_range and traded
        and not (low <= closing <= high)
    )

    last_bad = (
        valid_range and traded and last > 0
        and not (low <= last <= high)
    )

    open_bad = (
        valid_range and traded and op > 0
        and not (low <= op <= high)
    )

    return {
        "date": str(row.get("dEven", "")),
        "open": op,
        "high": high,
        "low": low,
        "pClosing": closing,
        "pDrCotVal": last,
        "trades": trades,
        "volume": volume,
        "traded": traded,
        "valid_range": valid_range,
        "pClosing_outside": close_bad,
        "pDrCotVal_outside": last_bad,
        "open_outside": open_bad,
        "difference": last - closing
    }

def main():
    all_rows = []
    summaries = []
    search_logs = []
    errors = []

    print("=" * 65)
    print("TSE ENGINE - OHLC V5.1")
    print("=" * 65)

    for query in SYMBOLS:
        print("\nSEARCH:", query)

        try:
            matches, candidates = search_instruments(query)

            search_logs.append({
                "query": query,
                "matches": [
                    {
                        "ticker": x["ticker"],
                        "name": x["name"],
                        "insCode": x["insCode"]
                    }
                    for x in matches
                ],
                "candidate_count": len(candidates),
                "candidates": [
                    {
                        "ticker": x["ticker"],
                        "name": x["name"],
                        "insCode": x["insCode"]
                    }
                    for x in candidates[:20]
                ]
            })

            if len(matches) == 0:
                print("NO EXACT MATCH")
                for x in candidates[:10]:
                    print(
                        x["ticker"],
                        "|",
                        x["name"],
                        "|",
                        x["insCode"]
                    )
                continue

            if len(matches) > 1:
                print("AMBIGUOUS MATCH:", len(matches))
                for x in matches:
                    print(
                        x["ticker"],
                        "|",
                        x["name"],
                        "|",
                        x["insCode"]
                    )
                errors.append({
                    "query": query,
                    "error": "Multiple exact matches; skipped"
                })
                continue

            inst = matches[0]
            ins = inst["insCode"]
            ticker = inst["ticker"]
            name = inst["name"]

            print("MATCH:", ticker, "|", name, "|", ins)

            url = (
                f"{BASE}/ClosingPrice/"
                f"GetClosingPriceDailyList/{ins}/0"
            )

            data = get_json(url)
            raw = data.get("closingPriceDaily", [])

            if not isinstance(raw, list):
                raise ValueError("Invalid closingPriceDaily response")

            records = [analyze(x) for x in raw]
            records.sort(key=lambda x: x["date"])

            traded_rows = [
                x for x in records if x["traded"]
            ]

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
                "query": query,
                "ticker": ticker,
                "name": name,
                "insCode": ins,
                "rows": len(records),
                "traded_rows": len(traded_rows),
                "pClosing_outside": pclose_bad,
                "pClosing_pct": (
                    100 * pclose_bad / len(traded_rows)
                    if traded_rows else 0
                ),
                "pDrCotVal_outside": last_bad,
                "pDrCotVal_pct": (
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
                all_rows.append(x)

            print(
                "Rows:", len(records),
                "| Traded:", len(traded_rows),
                "| pClosing invalid:", pclose_bad,
                "| pDrCotVal invalid:", last_bad
            )

            time.sleep(0.7)

        except Exception as e:
            print("ERROR:", query, str(e))
            errors.append({
                "query": query,
                "error": str(e)
            })

    # ==========================================
    # FULL CSV
    # ==========================================
    fields = [
        "symbol", "name", "insCode", "date",
        "open", "high", "low",
        "pClosing", "pDrCotVal",
        "trades", "volume", "traded",
        "valid_range",
        "pClosing_outside",
        "pDrCotVal_outside",
        "open_outside",
        "difference"
    ]

    with open(
        os.path.join(OUT, "v5_raw_comparison.csv"),
        "w", newline="", encoding="utf-8-sig"
    ) as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(all_rows)

    # ==========================================
    # SUMMARY CSV
    # ==========================================
    summary_fields = [
        "query", "ticker", "name", "insCode",
        "rows", "traded_rows",
        "pClosing_outside", "pClosing_pct",
        "pDrCotVal_outside", "pDrCotVal_pct",
        "open_outside"
    ]

    with open(
        os.path.join(OUT, "v5_summary.csv"),
        "w", newline="", encoding="utf-8-sig"
    ) as f:
        w = csv.DictWriter(f, fieldnames=summary_fields)
        w.writeheader()
        w.writerows(summaries)

    # ==========================================
    # BANK MELLAT SAMPLES
    # ==========================================
    bank_rows = [
        x for x in all_rows
        if norm(x["symbol"]) == norm("بانك ملت")
        and x["date"] in BANK_DATES
    ]

    bank_fields = [
        "symbol", "date", "open", "high", "low",
        "pClosing", "pDrCotVal",
        "trades", "volume",
        "pClosing_outside",
        "pDrCotVal_outside"
    ]

    with open(
        os.path.join(OUT, "bank_mellat_samples.csv"),
        "w", newline="", encoding="utf-8-sig"
    ) as f:
        w = csv.DictWriter(f, fieldnames=bank_fields)
        w.writeheader()
        w.writerows(bank_rows)

    # ==========================================
    # SEARCH LOG
    # ==========================================
    with open(
        os.path.join(OUT, "v5_search_log.json"),
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            search_logs,
            f,
            ensure_ascii=False,
            indent=2
        )

    with open(
        os.path.join(OUT, "v5_errors.json"),
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            errors,
            f,
            ensure_ascii=False,
            indent=2
        )

    # ==========================================
    # REPORT
    # ==========================================
    report = [
        "TSE ENGINE - OHLC V5.1 RAW API AUDIT",
        "=" * 65,
        f"Requested queries: {len(SYMBOLS)}",
        f"Matched instruments: {len(summaries)}",
        f"Total rows: {len(all_rows)}",
        f"Errors: {len(errors)}",
        ""
    ]

    for s in summaries:
        report.extend([
            f"{s['ticker']} | {s['name']} | {s['insCode']}",
            f"Rows={s['rows']} | Traded={s['traded_rows']}",
            (
                f"pClosing outside={s['pClosing_outside']} "
                f"({s['pClosing_pct']:.4f}%)"
            ),
            (
                f"pDrCotVal outside={s['pDrCotVal_outside']} "
                f"({s['pDrCotVal_pct']:.4f}%)"
            ),
            f"Open outside={s['open_outside']}",
            "-" * 50
        ])

    report.append("\nBANK MELLAT SELECTED DATES")

    for x in bank_rows:
        report.append(
            f"{x['date']} | "
            f"O={x['open']} H={x['high']} L={x['low']} | "
            f"C={x['pClosing']} LAST={x['pDrCotVal']} | "
            f"Trades={x['trades']} Volume={x['volume']}"
        )

    report.append("\nERRORS")
    for e in errors:
        report.append(str(e))

    text = "\n".join(report)

    with open(
        os.path.join(OUT, "v5_report.txt"),
        "w", encoding="utf-8"
    ) as f:
        f.write(text)

    with open(
        os.path.join(OUT, "v5_summary.json"),
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            {
                "summaries": summaries,
                "errors": errors,
                "matched": len(summaries),
                "total_rows": len(all_rows)
            },
            f,
            ensure_ascii=False,
            indent=2
        )

    print("\n" + text)

    print("\nFILES:")
    for name in os.listdir(OUT):
        print(name)

if __name__ == "__main__":
    main()
