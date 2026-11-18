"""Test alilnvest_codal for 3 symbols"""
import sys
print("=== FUND TEST START ===", flush=True)

try:
    import alilnvest_codal as cp
    print(f"✅ imported alilnvest_codal", flush=True)
except Exception as e:
    print(f"❌ import failed: {type(e).__name__}: {e}", flush=True)
    sys.exit(1)

cp.configure(min_delay=2.0, max_delay=3.5, max_retries=2, symbol_min_delay=10, symbol_max_delay=15)
print("⚙️ configured", flush=True)

for sym in ["فولاد", "وبملت", "کگل"]:
    print(f"\n[{sym}] fetching...", flush=True)
    try:
        inc = cp.income_statement(sym, max_reports=1)
        bal = cp.balance_sheet(sym, max_reports=1)
        print(f"  income type: {type(inc).__name__}", flush=True)
        print(f"  income sample: {str(inc)[:300]}", flush=True)
        print(f"  balance sample: {str(bal)[:300]}", flush=True)
    except Exception as e:
        print(f"  ERR: {type(e).__name__}: {str(e)[:200]}", flush=True)

print("\n=== FUND TEST DONE ===", flush=True)
