"""24 price action features."""
import numpy as np
import pandas as pd


def build_pa_features(df):
    o = df['o'].astype(float)
    h = df['h'].astype(float)
    l = df['l'].astype(float)
    c = df['c'].astype(float)
    v = df['v'].astype(float)

    body = (c - o).abs()
    upper = h - pd.concat([c, o], axis=1).max(axis=1)
    lower = pd.concat([c, o], axis=1).min(axis=1) - l
    candle_range = (h - l).replace(0, np.nan)

    out = pd.DataFrame(index=df.index)

    # ─── Candlestick patterns (7)
    out['Doji'] = (body / candle_range < 0.1).astype(np.int8)
    out['Hammer'] = ((lower > 2 * body) & (upper < body)).astype(np.int8)
    out['ShootingStar'] = ((upper > 2 * body) & (lower < body)).astype(np.int8)
    out['BullEngulf'] = ((c > o) & (c.shift(1) < o.shift(1)) &
                         (c > o.shift(1)) & (o < c.shift(1))).astype(np.int8)
    out['BearEngulf'] = ((c < o) & (c.shift(1) > o.shift(1)) &
                         (c < o.shift(1)) & (o > c.shift(1))).astype(np.int8)
    out['InsideBar'] = ((h < h.shift(1)) & (l > l.shift(1))).astype(np.int8)
    out['OutsideBar'] = ((h > h.shift(1)) & (l < l.shift(1))).astype(np.int8)

    # ─── Body/wick ratios (4)
    out['Body_pct'] = body / candle_range
    out['UpperWick_pct'] = upper / candle_range
    out['LowerWick_pct'] = lower / candle_range
    out['ClosePosition'] = (c - l) / candle_range

    # ─── Limit up/down (2) — TSETMC ~5% daily cap
    daily_ret = c.pct_change()
    out['IsLimitUp'] = (daily_ret > 0.045).astype(np.int8)
    out['IsLimitDown'] = (daily_ret < -0.045).astype(np.int8)

    # ─── Support/resistance (6)
    h20 = h.rolling(20).max()
    l20 = l.rolling(20).min()
    h50 = h.rolling(50).max()
    l50 = l.rolling(50).min()
    out['DistToHigh20'] = (h20 - c) / c.replace(0, np.nan)
    out['DistToLow20'] = (c - l20) / c.replace(0, np.nan)
    out['DistToHigh50'] = (h50 - c) / c.replace(0, np.nan)
    out['DistToLow50'] = (c - l50) / c.replace(0, np.nan)
    out['RangePos20'] = (c - l20) / (h20 - l20).replace(0, np.nan)
    # placeholder sixth — replaced below with body range ratio
    body_5 = body.rolling(5).mean()
    out['BodyRange_ratio'] = body / body_5.replace(0, np.nan)

    # ─── Market structure (2)
    ema20 = c.ewm(span=20, adjust=False).mean()
    ema50 = c.ewm(span=50, adjust=False).mean()
    out['Uptrend'] = ((c > ema20) & (ema20 > ema50)).astype(np.int8)
    out['Downtrend'] = ((c < ema20) & (ema20 < ema50)).astype(np.int8)

    # ─── Breakouts (4)
    out['BreakHigh20'] = (c > h20.shift(1)).astype(np.int8)
    out['BreakLow20'] = (c < l20.shift(1)).astype(np.int8)
    out['BreakHigh50'] = (c > h50.shift(1)).astype(np.int8)
    out['BreakLow50'] = (c < l50.shift(1)).astype(np.int8)

    # ─── Consolidation + trend (3)
    out['Consolidation'] = ((h20 - l20) / c.replace(0, np.nan) < 0.05).astype(np.int8)
    out['ConsecUp_3'] = ((c > c.shift(1)) & (c.shift(1) > c.shift(2)) &
                         (c.shift(2) > c.shift(3))).astype(np.int8)
    out['ConsecDown_3'] = ((c < c.shift(1)) & (c.shift(1) < c.shift(2)) &
                           (c.shift(2) < c.shift(3))).astype(np.int8)

    return out


FEATURE_NAMES = [
    'Doji', 'Hammer', 'ShootingStar', 'BullEngulf', 'BearEngulf',
    'InsideBar', 'OutsideBar',
    'Body_pct', 'UpperWick_pct', 'LowerWick_pct', 'ClosePosition',
    'IsLimitUp', 'IsLimitDown',
    'DistToHigh20', 'DistToLow20', 'DistToHigh50', 'DistToLow50',
    'RangePos20', 'BodyRange_ratio',
    'Uptrend', 'Downtrend',
    'BreakHigh20', 'BreakLow20', 'BreakHigh50', 'BreakLow50',
    'Consolidation', 'ConsecUp_3', 'ConsecDown_3',
]
