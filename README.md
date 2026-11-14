# TSE.Engine

**موتور تحلیل هوشمند بورس تهران**

> Powered by **Javid Quant** — ساخته شده توسط جاوید شهادتی

---

## درباره

سیستم تحلیل تکنیکال و بنیادی بورس تهران با موتور یادگیری ماشین.

## ساختار

- `data/`
  - `companies_final.json` — لیست ۶۰۶ شرکت سهامی بورس و فرابورس
  - `all_history.json.gz` — تاریخچه ۵۰۰ روزه OHLCV (فشرده، ~۷MB)

## موتور (فازهای بعدی)

- XGBoost + LightGBM Stacking
- Regime Detection
- ATR-based Risk Management

## منبع دیتا

API عمومی TSETMC (`cdn.tsetmc.com`)

## وضعیت

🟡 فاز ۱: جمع‌آوری دیتا — تکمیل شده
⏳ فاز ۲: ساخت ۶۲ فیچر تکنیکال
⏳ فاز ۳: آموزش مدل‌ها
   
