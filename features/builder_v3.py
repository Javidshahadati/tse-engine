"""Builder v3 - 59 features (54 + 5 flow)"""
import json, gzip
import numpy as np
import pandas as pd
from pathlib import Path

DATA_PATH = Path("data/ohlc_clean_v3_20d.json.gz")
FUND_PATH = Path("data/fundamentals.json")
FLOW_PATH = Path("data/flow_full.json.gz")
OUT = Path("javid_v3"); OUT.mkdir(exist_ok=True)

with gzip.open(DATA_PATH, "rt", encoding="utf-8") as f:
    data = json.load(f)
with open(FUND_PATH, encoding="utf-8") as f:
    fundamentals = json.load(f)
with gzip.open(FLOW_PATH, "rt", encoding="utf-8") as f:
    flow_data = json.load(f)
print(f"Loaded: {len(data)} segments | {len(flow_data)} flow symbols")

sector_map = {sym: meta.get('sector', 'unknown') for sym, meta in fundamentals.items()}

def compute_base(df):
    out = pd.DataFrame(index=df.index)
    c = df['c'].astype(float); h = df['h'].astype(float)
    l = df['l'].astype(float); v = df['v'].astype(float)
    ret = c.pct_change()
    ema20 = c.ewm(span=20, adjust=False).mean()
    ema50 = c.ewm(span=50, adjust=False).mean()
    ema200 = c.ewm(span=200, adjust=False).mean()
    out['EMA20'] = ema20; out['EMA50'] = ema50; out['EMA200'] = ema200
    out['SMA20'] = c.rolling(20).mean()
    out['Price_EMA50_ratio'] = c / ema50
    out['Price_EMA200_ratio'] = c / ema200
    out['EMA50_slope_20d'] = ema50.pct_change(20)
    out['EMA200_slope_20d'] = ema200.pct_change(20)
    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    out['MACD_Hist'] = macd - macd.ewm(span=9, adjust=False).mean()
    up_move = h.diff(); down_move = -l.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    tr = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    atr14 = tr.rolling(14).mean()
    pdi = 100 * pd.Series(plus_dm, index=df.index).rolling(14).mean() / atr14.replace(0, np.nan)
    mdi = 100 * pd.Series(minus_dm, index=df.index).rolling(14).mean() / atr14.replace(0, np.nan)
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    out['ADX'] = dx.rolling(14).mean()
    out['ADX_60'] = out['ADX'].rolling(60).mean()
    out['ATR_pct'] = atr14 / c
    bb_mid = c.rolling(20).mean(); bb_std = c.rolling(20).std()
    out['BB_width'] = (2 * bb_std) / bb_mid
    out['Volatility_20d'] = ret.rolling(20).std()
    out['Volatility_60d'] = ret.rolling(60).std()
    out['Volatility_120d'] = ret.rolling(120).std()
    out['Return_20d'] = c.pct_change(20); out['Return_60d'] = c.pct_change(60)
    out['Return_120d'] = c.pct_change(120); out['Return_250d'] = c.pct_change(250)
    out['Mom_10'] = c.pct_change(10); out['Mom_20'] = c.pct_change(20)
    out['Mom_60'] = c.pct_change(60); out['Mom_120'] = c.pct_change(120)
    out['DistToHigh20'] = (h.rolling(20).max() - c) / c
    out['DistToHigh50'] = (h.rolling(50).max() - c) / c
    out['DistToLow20'] = (c - l.rolling(20).min()) / c
    out['DistToLow50'] = (c - l.rolling(50).min()) / c
    out['DistTo52W_High'] = (h.rolling(250).max() - c) / c
    out['DistTo52W_Low'] = (c - l.rolling(250).min()) / c
    obv = (np.sign(ret).fillna(0) * v).cumsum()
    out['OBV_slope'] = obv.diff(10) / obv.abs().rolling(10).mean().replace(0, np.nan)
    tp = (h + l + c) / 3
    mf = tp * v
    pmf = mf.where(tp > tp.shift(), 0); nmf = mf.where(tp < tp.shift(), 0)
    mfr = pmf.rolling(14).sum() / nmf.rolling(14).sum().replace(0, np.nan)
    out['MFI'] = 100 - 100 / (1 + mfr)
    vwap20 = (c * v).rolling(20).sum() / v.rolling(20).sum().replace(0, np.nan)
    out['VWAP_dist'] = (c - vwap20) / vwap20.replace(0, np.nan)
    out['Vol_trend'] = v.rolling(5).mean() / v.rolling(20).mean().replace(0, np.nan)
    out['Volume_ratio'] = v / v.rolling(20).mean().replace(0, np.nan)
    out['High_Low_range'] = (h - l) / c
    out['BreakHigh50'] = (c > h.rolling(50).max().shift()).astype(float)
    out['BreakLow50'] = (c < l.rolling(50).min().shift()).astype(float)
    out['Consolidation'] = ((h.rolling(20).max() - l.rolling(20).min()) / c < 0.10).astype(float)
    out['Uptrend'] = (c > ema50).astype(float); out['Downtrend'] = (c < ema50).astype(float)
    ret1 = c.pct_change()
    out['IsLimitUp'] = (ret1 > 0.045).astype(float)
    out['IsLimitDown'] = (ret1 < -0.045).astype(float)
    delta = c.diff()
    gain = delta.clip(lower=0).rolling(70).mean()
    loss = (-delta.clip(upper=0)).rolling(70).mean()
    out['weekly_RSI'] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))
    wema12 = c.ewm(span=60, adjust=False).mean()
    wema26 = c.ewm(span=130, adjust=False).mean()
    wmacd = wema12 - wema26
    out['weekly_MACD_hist'] = wmacd - wmacd.ewm(span=45, adjust=False).mean()
    return out

def compute_flow(df, flow_rows):
    out = pd.DataFrame(0.0, index=df.index, columns=[
        'flow_ratio_5d','flow_ratio_20d','flow_momentum','smart_money','retail_dominance'])
    if not flow_rows: return out
    fdf = pd.DataFrame(flow_rows).sort_values('d').reset_index(drop=True)
    fdf['total_val'] = fdf['buy_I_Val'] + fdf['buy_N_Val'] + fdf['sell_I_Val'] + fdf['sell_N_Val']
    fdf['net_retail'] = (fdf['buy_N_Val'] - fdf['sell_N_Val']) / fdf['total_val'].replace(0, np.nan)
    fdf['net_inst'] = (fdf['buy_I_Val'] - fdf['sell_I_Val']) / fdf['total_val'].replace(0, np.nan)
    fdf['retail_dom'] = fdf['buy_N_Vol'] / (fdf['buy_N_Vol'] + fdf['buy_I_Vol']).replace(0, np.nan)
    merged = df[['date']].merge(fdf[['d','net_retail','net_inst','retail_dom']], left_on='date', right_on='d', how='left')
    s = pd.Series(merged['net_retail'].values, index=df.index)
    si = pd.Series(merged['net_inst'].values, index=df.index)
    sr = pd.Series(merged['retail_dom'].values, index=df.index)
    out['flow_ratio_5d'] = s.rolling(5).mean().fillna(0)
    out['flow_ratio_20d'] = s.rolling(20).mean().fillna(0)
    out['flow_momentum'] = out['flow_ratio_5d'] - out['flow_ratio_20d']
    out['smart_money'] = si.rolling(5).mean().fillna(0)
    out['retail_dominance'] = sr.rolling(20).mean().fillna(0)
    return out

print(f"Building {len(data)} segments...")
all_frames = []
for i, (key, stock) in enumerate(data.items(), 1):
    df = pd.DataFrame(stock['r']).sort_values('d').reset_index(drop=True)
    if len(df) < 300: continue
    df = df.assign(date=df['d'].values)
    f = compute_base(df)
    base_sym = key.split('_seg')[0]
    flow_rows = flow_data.get(base_sym, {}).get('r', [])
    ff = compute_flow(df, flow_rows)
    f = pd.concat([f, ff], axis=1)
    f['symbol'] = key
    f['sector'] = sector_map.get(base_sym, 'unknown')
    f['date'] = df['d'].values
    f['close'] = df['c'].values
    all_frames.append(f)
    if i % 100 == 0: print(f"  {i}/{len(data)}")

combined = pd.concat(all_frames, ignore_index=True)
print(f"Combined: {len(combined):,} rows")
combined = combined.sort_values(['date', 'symbol']).reset_index(drop=True)
combined['ret_20d'] = combined.groupby('symbol')['close'].pct_change(20)
combined['ret_60d'] = combined.groupby('symbol')['close'].pct_change(60)
combined['sector_ret_20d'] = combined.groupby(['date', 'sector'])['ret_20d'].transform('mean')
combined['sector_ret_60d'] = combined.groupby(['date', 'sector'])['ret_60d'].transform('mean')
combined['stock_vs_sector_20d'] = combined['ret_20d'] - combined['sector_ret_20d']
combined['stock_vs_sector_60d'] = combined['ret_60d'] - combined['sector_ret_60d']
combined['sector_rank_20d'] = combined.groupby(['date', 'sector'])['ret_20d'].rank(pct=True)
combined['sector_rank_60d'] = combined.groupby(['date', 'sector'])['ret_60d'].rank(pct=True)
combined['is_bull_market'] = (combined['sector_ret_20d'] > 0.02).astype(float)
combined['is_bear_market'] = (combined['sector_ret_20d'] < -0.02).astype(float)
combined['is_sideways'] = ((combined['sector_ret_20d'] >= -0.02) & (combined['sector_ret_20d'] <= 0.02)).astype(float)

def sf(x):
    try: return float(str(x).replace(',', '').strip() or 0)
    except: return 0.0

combined['_p'] = combined['symbol'].str.split('_seg').str[0]
combined['_eps'] = combined['_p'].map(lambda s: sf(fundamentals.get(s, {}).get('estimatedEPS')))
combined['_spe'] = combined['_p'].map(lambda s: sf(fundamentals.get(s, {}).get('sectorPE')))
combined['eps_yield'] = np.where(combined['_eps'] > 0, combined['_eps'] / combined['close'], 0.0)
combined['pe_relative'] = np.where((combined['_eps'] > 0) & (combined['_spe'] > 0),
                                    (combined['close'] / combined['_eps']) / combined['_spe'], 0.0)
combined['eps_to_sector'] = np.where(combined['_spe'] > 0, combined['_eps'] / combined['_spe'], 0.0)
combined = combined.drop(columns=['_p', '_eps', '_spe', 'ret_20d', 'ret_60d'])

feat_cols = [c for c in combined.columns if c not in ['symbol', 'sector', 'date', 'close']]
print(f"Features: {len(feat_cols)}")
combined = combined.dropna(subset=['EMA200', 'Volatility_120d', 'DistTo52W_High'])
combined[feat_cols] = combined[feat_cols].replace([np.inf, -np.inf], np.nan).fillna(0)
print(f"After clean: {len(combined):,} rows")

combined[['symbol', 'date', 'close'] + feat_cols].to_parquet(OUT / 'features_v3_20d.parquet', index=False)
summary = {
    'version': 'v3', 'horizon': '20d',
    'segments': int(combined['symbol'].nunique()),
    'rows': len(combined), 'features': len(feat_cols),
    'feature_names': feat_cols,
    'date_min': int(combined['date'].min()),
    'date_max': int(combined['date'].max()),
}
with open(OUT / 'summary_v3_20d.json', 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"✅ DONE: {len(combined):,} rows, {len(feat_cols)} features")
