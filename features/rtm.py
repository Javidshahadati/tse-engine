"""6 RTM features: BOS, CHoCH, FVG."""
import numpy as np
import pandas as pd


def build_rtm_features(df, swing=5):
    """RTM: break of structure, change of character, fair value gaps."""
    h = df['h'].astype(float).values
    l = df['l'].astype(float).values
    c = df['c'].astype(float).values
    n = len(c)

    # Swing highs / lows
    sh = np.full(n, False)
    sl = np.full(n, False)
    for i in range(swing, n - swing):
        if h[i] == max(h[i-swing:i+swing+1]):
            sh[i] = True
        if l[i] == min(l[i-swing:i+swing+1]):
            sl[i] = True

    # Forward-fill last swing values
    last_sh = np.full(n, np.nan)
    last_sl = np.full(n, np.nan)
    cur_sh, cur_sl = np.nan, np.nan
    for i in range(n):
        if sh[i]: cur_sh = h[i]
        if sl[i]: cur_sl = l[i]
        last_sh[i] = cur_sh
        last_sl[i] = cur_sl

    # BOS: close > last swing high / close < last swing low
    bos_bull = np.zeros(n, dtype=np.int8)
    bos_bear = np.zeros(n, dtype=np.int8)
    for i in range(1, n):
        if not np.isnan(last_sh[i-1]) and c[i] > last_sh[i-1] and c[i-1] <= last_sh[i-1]:
            bos_bull[i] = 1
        if not np.isnan(last_sl[i-1]) and c[i] < last_sl[i-1] and c[i-1] >= last_sl[i-1]:
            bos_bear[i] = 1

    # CHoCH: reversal of last BOS direction
    choch_bull = np.zeros(n, dtype=np.int8)
    choch_bear = np.zeros(n, dtype=np.int8)
    for i in range(1, n):
        if bos_bull[i] == 1 and i > 3 and bos_bear[i-1] == 1:
            choch_bull[i] = 1
        if bos_bear[i] == 1 and i > 3 and bos_bull[i-1] == 1:
            choch_bear[i] = 1

    # FVG: gap between candle i-2 high and candle i low (bullish)
    fvg_bull = np.zeros(n, dtype=np.int8)
    fvg_bear = np.zeros(n, dtype=np.int8)
    for i in range(2, n):
        if l[i] > h[i-2]:
            fvg_bull[i] = 1
        if h[i] < l[i-2]:
            fvg_bear[i] = 1

    return pd.DataFrame({
        'BOS_Bull': bos_bull,
        'BOS_Bear': bos_bear,
        'CHoCH_Bull': choch_bull,
        'CHoCH_Bear': choch_bear,
        'FVG_Bull': fvg_bull,
        'FVG_Bear': fvg_bear,
    }, index=df.index)
