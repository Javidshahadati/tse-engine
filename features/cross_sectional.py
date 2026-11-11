"""12 cross-sectional (market-relative) features."""
import numpy as np
import pandas as pd


def build_cross_sectional(df_all):
    """Given combined panel with symbol/date/close, compute market-relative features.
    Returns df with same index, columns = CS features."""
    df = df_all[['symbol', 'date', 'close']].copy()
    df = df.sort_values(['date', 'symbol']).reset_index(drop=True)

    # Per-symbol returns
    df['ret'] = df.groupby('symbol')['close'].pct_change()
    df['ret5'] = df.groupby('symbol')['close'].pct_change(5)
    df['ret20'] = df.groupby('symbol')['close'].pct_change(20)
    df['vol20'] = df.groupby('symbol')['ret'].transform(lambda x: x.rolling(20).std())

    # Market return (equal-weight cross-sectional mean per date)
    market = df.groupby('date')['ret'].mean().rename('market_ret')
    df = df.merge(market, left_on='date', right_index=True, how='left')

    # 1-3: Ranks (per date)
    df['Rank_Ret5'] = df.groupby('date')['ret5'].rank(pct=True)
    df['Rank_Ret20'] = df.groupby('date')['ret20'].rank(pct=True)
    df['Rank_Vol20'] = df.groupby('date')['vol20'].rank(pct=True)

    # 4-5: Alpha = stock return - market return (cumulative)
    df['alpha_ret'] = df['ret'] - df['market_ret']
    df['Alpha_20d'] = df.groupby('symbol')['alpha_ret'].transform(lambda x: x.rolling(20).sum())
    df['Alpha_60d'] = df.groupby('symbol')['alpha_ret'].transform(lambda x: x.rolling(60).sum())

    # 6: Beta = cov(stock_ret, mkt_ret) / var(mkt_ret) over 60d
    def roll_beta(g):
        cov = g['ret'].rolling(60).cov(g['market_ret'])
        var = g['market_ret'].rolling(60).var()
        return cov / var.replace(0, np.nan)
    df['Beta_60d'] = df.groupby('symbol', group_keys=False).apply(roll_beta)

    # 7: Corr with market 60d
    df['Corr_Market_60d'] = df.groupby('symbol', group_keys=False).apply(
        lambda g: g['ret'].rolling(60).corr(g['market_ret'])
    )

    # 8: Placeholder for industry corr (no sector data yet) -> use market corr * 0.5
    df['Corr_Industry_60d'] = df['Corr_Market_60d'] * 0.5

    # 9-10: Breadth (% stocks above MA20/MA50 per date) — fill every row of that date
    # We need MA per symbol
    df['ma20'] = df.groupby('symbol')['close'].transform(lambda x: x.rolling(20).mean())
    df['ma50'] = df.groupby('symbol')['close'].transform(lambda x: x.rolling(50).mean())
    df['above20'] = (df['close'] > df['ma20']).astype(float)
    df['above50'] = (df['close'] > df['ma50']).astype(float)
    breadth20 = df.groupby('date')['above20'].mean().rename('Breadth_MA20')
    breadth50 = df.groupby('date')['above50'].mean().rename('Breadth_MA50')
    df = df.merge(breadth20, left_on='date', right_index=True, how='left')
    df = df.merge(breadth50, left_on='date', right_index=True, how='left')

    # 11: AD ratio (advancing / declining per date)
    df['is_up'] = (df['ret'] > 0).astype(int)
    df['is_down'] = (df['ret'] < 0).astype(int)
    ad = df.groupby('date').agg(up=('is_up','sum'), down=('is_down','sum'))
    ad['AD_Ratio'] = ad['up'] / ad['down'].replace(0, 1)
    df = df.merge(ad['AD_Ratio'], left_on='date', right_index=True, how='left')

    # 12: Market 5d return (rolling sum of market_ret)
    m5 = df.groupby('date')['market_ret'].first().rolling(5).sum().rename('Market_Ret_5d')
    df = df.merge(m5, left_on='date', right_index=True, how='left')

    out = df[['Rank_Ret5','Rank_Ret20','Rank_Vol20','Alpha_20d','Alpha_60d',
              'Beta_60d','Corr_Market_60d','Corr_Industry_60d',
              'Breadth_MA20','Breadth_MA50','AD_Ratio','Market_Ret_5d']].copy()

    return out


FEATURE_NAMES = [
    'Rank_Ret5', 'Rank_Ret20', 'Rank_Vol20',
    'Alpha_20d', 'Alpha_60d', 'Beta_60d',
    'Corr_Market_60d', 'Corr_Industry_60d',
    'Breadth_MA20', 'Breadth_MA50', 'AD_Ratio', 'Market_Ret_5d',
]
