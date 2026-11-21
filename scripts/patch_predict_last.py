from pathlib import Path
p = Path('scripts/train_v3_unified.py')
src = p.read_text(encoding='utf-8')

old = """# Last date for prediction (before dropping future_ret NaN)
last_date = int(df['date'].max())
today_df = df[df['date'] == last_date].copy().reset_index(drop=True)
print(f"Today ({last_date}): {len(today_df)} rows")"""

new = """# Load full data for prediction BEFORE dropna
df_full_for_pred = pd.read_parquet(OUT / 'features_v3_20d.parquet')
df_full_for_pred = df_full_for_pred.sort_values(['symbol', 'date']).reset_index(drop=True)
# Take each stock's last available row
last_idx = df_full_for_pred.groupby('symbol')['date'].idxmax()
today_df = df_full_for_pred.loc[last_idx].copy().reset_index(drop=True)
last_date = int(today_df['date'].max())
print(f"Predictions for {len(today_df)} stocks (latest per stock)")"""

if old in src:
    src = src.replace(old, new)
    p.write_text(src, encoding='utf-8')
    print("PATCHED")
else:
    print("NO MATCH - file content:")
    for i, line in enumerate(src.split('\n'), 1):
        if 'last_date' in line or 'today_df' in line:
            print(f"  L{i}: {line}")
