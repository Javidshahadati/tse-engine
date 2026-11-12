"""Backtest vs Benchmark - Step 8.8 (alpha test)."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path('outputs')

SAFE_FEATURES = [
    'RSI','RSI_slope','MACD','MACD_Sig','MACD_Hist','MACD_slope',
    'EMA20','EMA50','EMA200','SMA20','BB_pct','BB_width','ATR_pct',
    'Stoch','Stoch_D','WillR','CCI','MFI','OBV_slope','ADX',
    'Return_1d','Return_5d','Return_20d','Volatility_20d',
    'Price_EMA50_ratio','Price_EMA200_ratio','Volume_ratio',
    'High_Low_range','Close_Open','Gap',
    'BOS_Bull','BOS_Bear','CHoCH_Bull','CHoCH_Bear','FVG_Bull','FVG_Bear',
    'Doji','Hammer','ShootingStar','BullEngulf','BearEngulf',
    'InsideBar','OutsideBar',
    'Body_pct','UpperWick_pct','LowerWick_pct','ClosePosition',
    'IsLimitUp','IsLimitDown',
    'DistToHigh20','DistToLow20','DistToHigh50','DistToLow50',
    'RangePos20','BodyRange_ratio',
    'Uptrend','Downtrend',
    'BreakHigh20','BreakLow20','BreakHigh50','BreakLow50',
    'Consolidation','ConsecUp_3','ConsecDown_3',
]

THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.70
COMMISSION = 0.017
SLIPPAGE_PER_SIDE = 0.015
MAX_RETURN_PER_TRADE = 0.25
MAX_POSITIONS = 5
INITIAL_CAPITAL = 1_000_000
HOLD_DAYS = 5
TDPY = 252

print('=' * 65)
print('BACKTEST vs BENCHMARK - Step 8.8')
print('=' * 65)

print('\n[1/3] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,}')


def run_backtest(test_df, probs, fold_id):
    test_df = test_df.copy()
    test_df['prob'] = probs
    test_df['fut_ret_capped'] = test_df['future_ret_5d'].clip(upper=MAX_RETURN_PER_TRADE)
    test_df = test_df.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)

    unique_dates = sorted(test_df['date'].unique())
    price_lookup = test_df.set_index(['symbol','date'])['close'].to_dict()
    grouped = test_df.groupby('date')

    cash = float(INITIAL_CAPITAL)
    positions = []; trades = []; equity = []
    per_pos = INITIAL_CAPITAL / MAX_POSITIONS

    for i, d in enumerate(unique_dates):
        for pos in positions:
            cp = price_lookup.get((pos['sym'], d))
            if cp is not None and pos['entry_price'] > 0:
                pos['mv'] = pos['size'] * cp / pos['entry_price']
        still = []
        for pos in positions:
            if i >= pos['exit_idx']:
                net = pos['fut_ret'] - COMMISSION - 2*SLIPPAGE_PER_SIDE
                proceeds = pos['size'] * (1 + net); cash += proceeds
                trades.append({'net': net, 'gross': pos['fut_ret']})
            else:
                still.append(pos)
        positions = still
        available = MAX_POSITIONS - len(positions)
        if available > 0 and d in grouped.groups:
            day = grouped.get_group(d)
            sigs = day[day['prob'] > THRESHOLD_BUY]
            held = {p['sym'] for p in positions}
            new = sigs[~sigs['symbol'].isin(held)]
            for _, r in new.head(available).iterrows():
                if cash < per_pos * 0.1: break
                size = min(per_pos, cash); cash -= size
                positions.append({
                    'sym': r['symbol'], 'entry_price': float(r['close']),
                    'entry_idx': i, 'exit_idx': i + HOLD_DAYS,
                    'size': size, 'fut_ret': float(r['fut_ret_capped']), 'mv': size,
                })
        equity.append({'date': int(d), 'equity': cash + sum(p['mv'] for p in positions)})

    eq = pd.DataFrame(equity)
    eq['ret'] = eq['equity'].pct_change().fillna(0)
    total_ret = float(eq['equity'].iloc[-1] / INITIAL_CAPITAL - 1)
    n_days = len(eq); years = n_days / TDPY
    cagr = float((1+total_ret)**(1/years)-1) if years > 0 else 0
    eq['peak'] = eq['equity'].cummax()
    max_dd = float((eq['equity']/eq['peak']-1).min())
    dm = eq['ret'].mean(); ds = eq['ret'].std()
    sharpe = float(dm/ds*np.sqrt(TDPY)) if ds > 0 else 0
    tr = pd.DataFrame(trades)
    if len(tr) > 0:
        wr = float((tr['net']>0).mean())
        ar = float(tr['net'].mean())
        w = tr.loc[tr['net']>0, 'net']; ls = tr.loc[tr['net']<=0, 'net']
        aw = float(w.mean()) if len(w)>0 else 0
        al = float(ls.mean()) if len(ls)>0 else 0
        rr = abs(aw/al) if al != 0 else 0
    else: wr = ar = rr = 0
    return {
        'n_trades': len(tr), 'total_return': round(total_ret,4),
        'cagr': round(cagr,4), 'sharpe': round(sharpe,2),
        'max_dd': round(max_dd,4), 'winrate': round(wr,4),
        'avg_ret_net': round(ar,4), 'rr': round(rr,2),
    }


def compute_benchmark(test_df):
    """Equal-weight market: buy every stock at first day, hold till end."""
    test_df = test_df.sort_values(['symbol','date'])
    first_close = test_df.groupby('symbol').first()['close']
    last_close = test_df.groupby('symbol').last()['close']
    rets = (last_close / first_close - 1).dropna()
    ew_return = float(rets.mean())
    ew_median = float(rets.median())
    pct_positive = float((rets > 0).mean())

    # Benchmark equity curve: simulate buy-and-hold all stocks, equal weight
    unique_dates = sorted(test_df['date'].unique())
    n_days = len(unique_dates)
    first_day = unique_dates[0]

    # Get first-day close per symbol
    day0 = test_df[test_df['date'] == first_day].set_index('symbol')['close']

    # For each date, compute average normalized price
    equity = []
    for d in unique_dates:
        day_d = test_df[test_df['date'] == d].set_index('symbol')['close']
        common = day0.index.intersection(day_d.index)
        if len(common) == 0: continue
        norm = (day_d[common] / day0[common]).mean()
        equity.append({'date': int(d), 'equity': norm * INITIAL_CAPITAL})

    eq = pd.DataFrame(equity)
    if len(eq) < 2:
        return {'ew_return': 0, 'ew_median': 0, 'pct_positive': 0,
                'bench_cagr': 0, 'bench_sharpe': 0, 'bench_max_dd': 0}
    eq['ret'] = eq['equity'].pct_change().fillna(0)
    years = n_days / TDPY
    bench_cagr = float((1+ew_return)**(1/years)-1) if years > 0 else 0
    dm = eq['ret'].mean(); ds = eq['ret'].std()
    bench_sharpe = float(dm/ds*np.sqrt(TDPY)) if ds > 0 else 0
    eq['peak'] = eq['equity'].cummax()
    bench_dd = float((eq['equity']/eq['peak']-1).min())

    return {
        'ew_return': round(ew_return,4),
        'ew_median': round(ew_median,4),
        'pct_positive': round(pct_positive,4),
        'bench_cagr': round(bench_cagr,4),
        'bench_sharpe': round(bench_sharpe,2),
        'bench_max_dd': round(bench_dd,4),
    }


print('\n[2/3] Walk-forward + benchmark...')
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]

xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}

all_results = []
for k, (s, e) in enumerate(tests, 1):
    print(f'\n  Fold {k}: {s} -> {e}')
    tr = df[df['date'] < s].copy()
    te = df[(df['date'] >= s) & (df['date'] < e)].copy()

    m = xgb.XGBClassifier(**xgb_params)
    m.fit(tr[feat_cols].values, tr['label'].values, verbose=False)
    prob = m.predict_proba(te[feat_cols].values)[:, 1]
    auc = roc_auc_score(te['label'].values, prob)

    bt = run_backtest(te, prob, k)
    bench = compute_benchmark(te)
    alpha_cagr = round(bt['cagr'] - bench['bench_cagr'], 4)
    alpha_sharpe = round(bt['sharpe'] - bench['bench_sharpe'], 2)
    alpha_return = round(bt['total_return'] - bench['ew_return'], 4)

    result = {**bt, **bench, 'fold': k, 'auc': round(float(auc),4),
              'alpha_cagr': alpha_cagr, 'alpha_sharpe': alpha_sharpe,
              'alpha_return': alpha_return}
    all_results.append(result)

    print(f'    Model: CAGR={bt["cagr"]:.1%} Sharpe={bt["sharpe"]:.2f} WR={bt["winrate"]:.1%}')
    print(f'    Bench: CAGR={bench["bench_cagr"]:.1%} Sharpe={bench["bench_sharpe"]:.2f} positive={bench["pct_positive"]:.0%}')
    print(f'    ALPHA: CAGR={alpha_cagr:+.1%} Sharpe={alpha_sharpe:+.2f} Return={alpha_return:+.1%}')

print('\n[3/3] Saving...')
# Overall verdict based on average alpha
avg_alpha_cagr = round(float(np.mean([r['alpha_cagr'] for r in all_results])),4)
avg_alpha_sharpe = round(float(np.mean([r['alpha_sharpe'] for r in all_results])),2)

if avg_alpha_cagr > 0.20 and avg_alpha_sharpe > 0.5:
    verdict = 'STRONG_ALPHA'
elif avg_alpha_cagr > 0.05 and avg_alpha_sharpe > 0:
    verdict = 'MODERATE_ALPHA'
elif avg_alpha_cagr > -0.05:
    verdict = 'BETA_ONLY'
else:
    verdict = 'UNDERPERFORMS'

final = {
    'diagnostic': 'benchmark_comparison',
    'avg_alpha_cagr': avg_alpha_cagr,
    'avg_alpha_sharpe': avg_alpha_sharpe,
    'verdict': verdict,
    'folds': all_results,
}
with open(OUT / 'backtest_diag.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
for r in all_results:
    print(f"  Fold {r['fold']}: Model_CAGR={r['cagr']:>7.1%} | Bench={r['bench_cagr']:>7.1%} | ALPHA={r['alpha_cagr']:>+7.1%}")
print(f"  Avg Alpha CAGR: {avg_alpha_cagr:+.1%}")
print(f"  Avg Alpha Sharpe: {avg_alpha_sharpe:+.2f}")
print(f"  VERDICT: {verdict}")
print('=' * 65)
