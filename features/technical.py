"""32 classical technical indicators. Pure pandas/numpy, no TA-Lib."""
import numpy as np
import pandas as pd


def rsi(close, period=14):
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(close, fast=12, slow=26, signal=9):
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def ema(close, period):
    return close.ewm(span=period, adjust=False).mean()


def sma(close, period):
    return close.rolling(period).mean()


def bollinger(close, period=20, std_mult=2):
    mid = sma(close, period)
    std = close.rolling(period).std()
    upper = mid + std_mult * std
    lower = mid - std_mult * std
    pct_b = (close - lower) / (upper - lower).replace(0, np.nan)
    return upper, mid, lower, pct_b


def atr(high, low, close, period=14):
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()


def stochastic(high, low, close, k_period=14, d_period=3):
    lowest = low.rolling(k_period).min()
    highest = high.rolling(k_period).max()
    k = 100 * (close - lowest) / (highest - lowest).replace(0, np.nan)
    d = k.rolling(d_period).mean()
    return k, d


def williams_r(high, low, close, period=14):
    highest = high.rolling(period).max()
    lowest = low.rolling(period).min()
    return -100 * (highest - close) / (highest - lowest).replace(0, np.nan)


def cci(high, low, close, period=20):
    tp = (high + low + close) / 3
    ma = tp.rolling(period).mean()
    md = (tp - ma).abs().rolling(period).mean()
    return (tp - ma) / (0.015 * md.replace(0, np.nan))


def mfi(high, low, close, volume, period=14):
    tp = (high + low + close) / 3
    mf = tp * volume
    pos = mf.where(tp > tp.shift(), 0.0)
    neg = mf.where(tp < tp.shift(), 0.0)
    pos_sum = pos.rolling(period).sum()
    neg_sum = neg.rolling(period).sum()
    mr = pos_sum / neg_sum.replace(0, np.nan)
    return 100 - (100 / (1 + mr))


def obv(close, volume):
    direction = np.sign(close.diff())
    return (direction * volume).cumsum()


def adx(high, low, close, period=14):
    up = high.diff()
    down = -low.diff()
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=high.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=high.index)
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr_v = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1/period, adjust=False).mean() / atr_v.replace(0, np.nan))
    minus_di = 100 * (minus_dm.ewm(alpha=1/period, adjust=False).mean() / atr_v.replace(0, np.nan))
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(alpha=1/period, adjust=False).mean()


def build_technical_features(df):
    """Given a DataFrame with o,h,l,c,v columns, return 32 tech features."""
    o = df['o'].astype(float)
    h = df['h'].astype(float)
    l = df['l'].astype(float)
    c = df['c'].astype(float)
    v = df['v'].astype(float)

    out = pd.DataFrame(index=df.index)

    # RSI + slope
    r = rsi(c, 14)
    out['RSI'] = r
    out['RSI_slope'] = r.diff(3)

    # MACD
    m_line, m_sig, m_hist = macd(c)
    out['MACD'] = m_line
    out['MACD_Sig'] = m_sig
    out['MACD_Hist'] = m_hist
    out['MACD_slope'] = m_line.diff(3)

    # EMAs
    out['EMA20'] = ema(c, 20)
    out['EMA50'] = ema(c, 50)
    out['EMA200'] = ema(c, 200)
    out['SMA20'] = sma(c, 20)

    # Bollinger
    bb_u, bb_m, bb_l, bb_pct = bollinger(c)
    out['BB_pct'] = bb_pct
    out['BB_width'] = (bb_u - bb_l) / bb_m.replace(0, np.nan)

    # ATR %
    a = atr(h, l, c, 14)
    out['ATR_pct'] = a / c.replace(0, np.nan)

    # Stochastic
    k, d = stochastic(h, l, c)
    out['Stoch'] = k
    out['Stoch_D'] = d

    # Williams
    out['WillR'] = williams_r(h, l, c)

    # CCI
    out['CCI'] = cci(h, l, c)

    # MFI
    out['MFI'] = mfi(h, l, c, v)

    # OBV slope
    ob = obv(c, v)
    out['OBV_slope'] = ob.diff(5)

    # ADX
    out['ADX'] = adx(h, l, c)

    # Returns
    out['Return_1d'] = c.pct_change(1)
    out['Return_5d'] = c.pct_change(5)
    out['Return_20d'] = c.pct_change(20)
    out['Volatility_20d'] = c.pct_change().rolling(20).std()

    # Ratios
    out['Price_EMA50_ratio'] = c / out['EMA50'].replace(0, np.nan)
    out['Price_EMA200_ratio'] = c / out['EMA200'].replace(0, np.nan)

    # Volume
    out['Volume_ratio'] = v / v.rolling(20).mean().replace(0, np.nan)

    # Range
    out['High_Low_range'] = (h - l) / c.replace(0, np.nan)
    out['Close_Open'] = (c - o) / o.replace(0, np.nan)
    out['Gap'] = (o - c.shift(1)) / c.shift(1).replace(0, np.nan)

    return out


FEATURE_NAMES = [
    'RSI', 'RSI_slope',
    'MACD', 'MACD_Sig', 'MACD_Hist', 'MACD_slope',
    'EMA20', 'EMA50', 'EMA200', 'SMA20',
    'BB_pct', 'BB_width',
    'ATR_pct',
    'Stoch', 'Stoch_D',
    'WillR', 'CCI', 'MFI',
    'OBV_slope', 'ADX',
    'Return_1d', 'Return_5d', 'Return_20d', 'Volatility_20d',
    'Price_EMA50_ratio', 'Price_EMA200_ratio',
    'Volume_ratio',
    'High_Low_range', 'Close_Open', 'Gap',
]
