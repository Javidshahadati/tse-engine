import os
import json
import requests
from datetime import datetime, timezone

SYMBOLS = {
    "webملت": "778253364357513",
    "فولاد": "46348559193224090",
    "شپنا": "7745894403636165",
    "شستا": "2400322364771558",
}

BASE = "https://cdn.tsetmc.com/api"
OUT = "audit_output"

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 TSE-Readonly-Audit",
    "Accept": "*/*",
})

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    root = os.path.join(OUT, timestamp)
    os.makedirs(root, exist_ok=True)

    manifest = {
        "timestamp_utc": timestamp,
        "read_only": True,
        "symbols": {},
    }

    for name, ins_code in SYMBOLS.items():
        folder = os.path.join(root, ins_code)
        os.makedirs(folder, exist_ok=True)

        endpoints = {
            "daily": f"{BASE}/ClosingPrice/GetClosingPriceDailyList/{ins_code}/0",
            "price_adjust": f"{BASE}/ClosingPrice/GetPriceAdjustList/{ins_code}",
            "share_change": f"{BASE}/Instrument/GetInstrumentShareChange/{ins_code}",
            "legacy": f"https://www.tsetmc.com/Loader.aspx?i={ins_code}&Top=100&A=0",
        }

        symbol_info = {
            "name": name,
            "ins_code": ins_code,
            "requests": {},
        }

        for key, url in endpoints.items():
            try:
                response = session.get(url, timeout=30)

                record = {
                    "url": url,
                    "status_code": response.status_code,
                    "content_type": response.headers.get("Content-Type"),
                }

                # Save exact response text
                ext = "html" if key == "legacy" else "txt"
                raw_path = os.path.join(folder, f"{key}_raw.{ext}")

                with open(raw_path, "w", encoding="utf-8") as f:
                    f.write(response.text)

                record["raw_file"] = raw_path

                # Save parsed JSON when applicable
                if key != "legacy":
                    try:
                        parsed = response.json()
                        json_path = os.path.join(folder, f"{key}.json")
                        save_json(json_path, parsed)
                        record["json_file"] = json_path
                        record["json_parse"] = "success"
                    except Exception as e:
                        record["json_parse"] = str(e)

                symbol_info["requests"][key] = record

                print(name, key, response.status_code)

            except Exception as e:
                symbol_info["requests"][key] = {
                    "url": url,
                    "error": str(e),
                }
                print(name, key, "ERROR:", e)

        manifest["symbols"][ins_code] = symbol_info

    save_json(os.path.join(root, "manifest.json"), manifest)
    print("Audit completed:", root)

if __name__ == "__main__":
    main()
