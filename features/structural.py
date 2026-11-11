"""27 structural + advanced features."""
import numpy as np
import pandas as pd


def ichimoku(df):
    h = df['h'].astype(float)
    l = df['l'].astype(float)
    c = df['c'].astype(float)
    out = pd.DataFrame(index=df.index)
    tenkan = (h.rolling(9).max() + l.rolling(9).min()) / 2
    kijun = (h.rolling(26).max() + l.rolling(26).min()) / 2
    senkou_a = (tenkan + kijun) / 2
    senkou_b = (h.rolling(52).max() + l.rolling(52).min()) / 2
    out['Ichimoku_Tenkan'] = tenkan
    out['Ichimoku_Kijun'] = kijun
    out['Ichimoku_SenkouA'] = senkou_a
    out['Ichimoku_SenkouB'] = senkou_b
    out['Ichimoku_Chikou'] = c.shift(-26)
    return out


def lag_returns(df):
    c = df['c'].astype(float)
    out = pd.DataFrame(index=df.index)
    r = c.pct_change()
    out['LagRet_1'] = r.shift(1)
    out['LagRet_3'] = r.shift(3)
    out['LagRet_5'] = r.shift(5)
    out['LagRet_10'] = r.shift(10)
    return out


def momentum_multi(df):
    c = df['c'].astype(float)
    out = pd.DataFrame(index=df.index)
    out['Mom_10'] = c.pct_change(10)
    out['Mom_20'] = c.pct_change(20)
    out['Mom_60'] = c.pct_change(60)
    out['Mom_120'] = c.pct_change(120)
    return out


def volume_profile(df, window=20):
    h = df['h'].astype(float)
    l = df['l'].astype(float)
    c = df['c'].astype(float)
    v = df['v'].astype(float)
    out = pd.DataFrame(index=df.index)
    # Value area: 70% of volume between p15 and p85
    vwap20 = (c * v).rolling(window).sum() / v.rolling(window).sum().replace(0, np.nan)
    out['VWAP20'] = vwap20
    out['VWAP_dist'] = (c - vwap20) / vwap20.replace(0, np.nan)
    out['POC20'] = c.rolling(window).apply(lambda x: x.iloc[np.argmax(v.iloc[-window:].values)] if len(x) == window else np.nan, raw=False)
    out['POC_dist'] = (c - out['POC20']) / c.replace(0, np.nan)
    # Volume trend
    out['Vol_trend'] = v.rolling(5).mean() / v.rolling(20).mean().replace(0, np.nan)
    return out


def week52(df):
    h = df['h'].astype(float)
    l = df['l'].astype(float)
    c = df['c'].astype(float)
    out = pd.DataFrame(index=df.index)
    h52 = h.rolling(250).max()
    l52 = l.rolling(250).min()
    out['DistTo52W_High'] = (h52 - c) / c.replace(0, np.nan)
    out['DistTo52W_Low'] = (c - l52) / c.replace(0, np.nan)
    return out


def wavelet_features(df):
    """Wavelet decomposition (Haar — pure numpy)."""
    c = df['c'].astype(float).values
    n = len(c)
    out = pd.DataFrame(index=df.index)
    # Simple Haar wavelet: approximate = smooth, detail = noise
    def haar(x):
        if len(x) < 4: return 0.0, 0.0
        a = (x[0::2] + x[1::2]) / 2  # approx
        d = (x[0::2] - x[1::2]) / 2  # detail
        return a.mean(), d.std()

    approx = np.zeros(n)
    detail = np.zeros(n)
    for i in range(n):
        if i < 16:
            continue
        w = c[i-15:i+1]
        a, d = haar(w)
        approx[i] = a
        detail[i] = d
    out['Wavelet_approx'] = approx
    out['Wavelet_detail'] = detail
    out['Wavelet_ratio'] = approx / (c + 1e-9)
    # Multi-scale (2 levels)
    def haar2(x):
        if len(x) < 8: return 0.0, 0.0, 0.0
        a1 = (x[0::2] + x[1::2]) / 2
        d1 = (x[0::2] - x[1::2]) / 2
        a2 = (a1[0::2] + a1[1::2]) / 2
        return a2.mean(), d1.std(), a1.std()

    a2 = np.zeros(n)
    d1 = np.zeros(n)
    a1s = np.zeros(n)
    for i in range(n):
        if i < 32:
            continue
        w = c[i-31:i+1]
        aa, dd, a1 = haar2(w)
        a2[i] = aa
        d1[i] = dd
        a1s[i] = a1
    out['Wavelet_L2_approx'] = a2
    out['Wavelet_L1_detail'] = d1
    out['Wavelet_L1_approx_std'] = a1s
    return out


def hmm_regime(df):
    """Simple regime detection via volatility quantiles (no hmmlearn)."""
    c = df['c'].astype(float)
    ret = c.pct_change()
    vol = ret.rolling(20).std()
    mom = c.pct_change(20)
    out = pd.DataFrame(index=df.index)
    # 3 regimes via vol terciles (expanding)
    q33 = vol.expanding(min_periods=60).quantile(0.33)
    q66 = vol.expanding(min_periods=60).quantile(0.66)
    regime = np.where(vol < q33, 0, np.where(vol < q66, 1, 2))
    out['Regime_vol'] = pd.Series(regime, index=df.index)
    # Trend regime
    trend = np.where(mom > 0.03, 1, np.where(mom < -0.03, -1, 0))
    out['Regime_trend'] = pd.Series(trend, index=df.index)
    return out


def build_structural_features(df):
    parts = [
        ichimoku(df),
        lag_returns(df),
        momentum_multi(df),
        volume_profile(df),
        week52(df),
        wavelet_features(df),
        hmm_regime(df),
    ]
    return pd.concat(parts, axis=1)


FEATURE_NAMES = [
    'Ichimoku_Tenkan', 'Ichimoku_Kijun', 'Ichimoku_SenkouA',
    'Ichimoku_SenkouB', 'Ichimoku_Chikou',
    'LagRet_1', 'LagRet_3', 'LagRet_5', 'LagRet_10',
    'Mom_10', 'Mom_20', 'Mom_60', 'Mom_120',
    'VWAP20', 'VWAP_dist', 'POC20', 'POC_dist', 'Vol_trend',
    'DistTo52W_High', 'DistTo52W_Low',
    'Wavelet_approx', 'Wavelet_detail', 'Wavelet_ratio',
    'Wavelet_L2_approx', 'Wavelet_L1_detail', 'Wavelet_L1_approx_std',
    'Regime_vol', 'Regime_trend',
]
