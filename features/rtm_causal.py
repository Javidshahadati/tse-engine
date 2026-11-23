"""Causal RTM features: swings become available only on confirmation."""
import numpy as np
import pandas as pd


def build_rtm_features_causal(df, swing=5):
    """A swing centered at j is observable only at j+swing."""
    if swing < 1:
        raise ValueError("swing must be >= 1")

    h = df["h"].astype(float).to_numpy()
    low = df["l"].astype(float).to_numpy()
    close = df["c"].astype(float).to_numpy()
    n = len(close)

    last_sh = np.full(n, np.nan)
    last_sl = np.full(n, np.nan)
    current_sh = current_sl = np.nan
    bos_bull = np.zeros(n, dtype=np.int8)
    bos_bear = np.zeros(n, dtype=np.int8)
    choch_bull = np.zeros(n, dtype=np.int8)
    choch_bear = np.zeros(n, dtype=np.int8)
    fvg_bull = np.zeros(n, dtype=np.int8)
    fvg_bear = np.zeros(n, dtype=np.int8)
    previous_bos = 0

    for t in range(n):
        # At t, the swing centered at t-swing is fully confirmed.
        center = t - swing
        if center - swing >= 0:
            left = center - swing
            window_h = h[left:t + 1]
            window_l = low[left:t + 1]
            if h[center] == np.max(window_h):
                current_sh = h[center]
            if low[center] == np.min(window_l):
                current_sl = low[center]

        # Today's break uses only structure known at the previous close.
        if t > 0:
            prev_sh, prev_sl = last_sh[t - 1], last_sl[t - 1]
            if (not np.isnan(prev_sh) and close[t] > prev_sh
                    and close[t - 1] <= prev_sh):
                bos_bull[t] = 1
            if (not np.isnan(prev_sl) and close[t] < prev_sl
                    and close[t - 1] >= prev_sl):
                bos_bear[t] = 1

            current_bos = 1 if bos_bull[t] else (-1 if bos_bear[t] else 0)
            if current_bos == 1 and previous_bos == -1:
                choch_bull[t] = 1
            elif current_bos == -1 and previous_bos == 1:
                choch_bear[t] = 1
            if current_bos:
                previous_bos = current_bos

        # FVG uses candles no later than the current close.
        if t >= 2:
            if low[t] > h[t - 2]:
                fvg_bull[t] = 1
            if h[t] < low[t - 2]:
                fvg_bear[t] = 1

        last_sh[t], last_sl[t] = current_sh, current_sl

    return pd.DataFrame({
        "BOS_Bull": bos_bull, "BOS_Bear": bos_bear,
        "CHoCH_Bull": choch_bull, "CHoCH_Bear": choch_bear,
        "FVG_Bull": fvg_bull, "FVG_Bear": fvg_bear,
    }, index=df.index)
