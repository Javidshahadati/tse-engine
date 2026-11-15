"""Walk-Forward Validation for Breakout strategy."""
import json
import numpy as np
import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT = Path('walk_forward')
OUT.mkdir(exist_ok=True)

COMMISSION = 0.017
SLIPPAGE = 0.006
TOTAL_COST = COMMISSION + SLIPPAGE

with open(DATA / 'charts.json') as f:
    charts = json.load(f)

print(f"Loaded {len(charts)} stocks")

symbols = [s for s in charts if len(charts[s]) >= 200]
print(f"Valid: {len(symbols)}")


def calc_sma(arr, p):
    return pd.Series(arr).rolling(p).mean().values


def calc_rsi(arr, p=14):
    delta = np.diff(arr, prepend=arr[0])
    gain = pd.Series(np.where(delta > 0, delta, 0))
    loss = pd.Series(np.where(delta < 0, -delta, 0))
    ag = gain.ewm(alpha=1/p, adjust=False).mean()
    al = loss.ewm(alpha=1/p, adjust=False).mean()
    rs = ag / al.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).values


def calc_atr(highs, lows, closes, p=14):
    tr1 = highs - lows
    tr2 = np.abs(highs - np.roll(closes, 1))
    tr3 = np.abs(lows - np.roll(closes, 1))
    tr = np.maximum(np.maximum(tr1, tr2), tr3)
    return pd.Series(tr).ewm(alpha=1/p, adjust=False).mean().values


def calc_macd_hist(closes):
    e12 = pd.Series(closes).ewm(span=12, adjust=False).mean()
    e26 = pd.Series(closes).ewm(span=26, adjust=False).mean()
    macd = e12 - e26
    sig = macd.ewm(span=9, adjust=False).mean()
    return (macd - sig).values


print("Computing indicators...")
ind = {}
for sym in symbols:
    c = list(reversed(charts[sym]))
    closes = np.array([r['c'] for r in c], dtype=float)
    highs = np.array([r['h'] if r.get('h', 0) > 0 else r['c'] for r in c], dtype=float)
    lows = np.array([r['l'] if r.get('l', 0) > 0 else r['c'] for r in c], dtype=float)
    vols = np.array([r['v'] for r in c], dtype=float)
    dates = [r['t'] for r in c]

    ind[sym] = {
        'closes': closes, 'highs': highs, 'lows': lows, 'vols': vols, 'dates': dates,
        'rsi': calc_rsi(closes),
        'hist': calc_macd_hist(closes),
        'ma20': calc_sma(closes, 20),
        'avgVol20': calc_sma(vols, 20),
        'atr': calc_atr(highs, lows, closes),
    }


def run_breakout(start_day, end_day, n_stocks, hold_days):
    capital = 10_000_000
    initial = capital
    trades = []
    equity = [capital]
    day = start_day

    while day < end_day:
        candidates = []
        for sym in symbols:
            x = ind[sym]
            if day >= len(x['closes']):
                continue
            rsi_v = x['rsi'][day]
            hist = x['hist'][day]
            price = x['closes'][day]
            vol = x['vols'][day]
            avg_v = x['avgVol20'][day] if not np.isnan(x['avgVol20'][day]) else 0
            atr = x['atr'][day] if not np.isnan(x['atr'][day]) else 0
            high20 = max(x['highs'][max(0, day-19):day+1]) if day >= 20 else None

            if high20 and price >= high20 * 0.99 and avg_v > 0 and (vol / avg_v) > 1.5 and rsi_v > 55 and hist > 0 and atr > 0:
                candidates.append({'sym': sym, 'price': price, 'atr': atr})

        if candidates:
            per_trade = capital / min(len(candidates), n_stocks)
            for c in candidates[:n_stocks]:
                x = ind[c['sym']]
                entry = c['price']
                atr = c['atr']
                sl = entry - 2*atr
                tp = entry + 3*atr
                trail_active = False
                trail_stop = sl
                exit_day = -1
                exit_price = None

                for d in range(day+1, min(day+hold_days, len(x['closes'])-1)):
                    low = x['lows'][d]
                    high = x['highs'][d]
                    close = x['closes'][d]

                    if not trail_active and low <= sl:
                        exit_day = d; exit_price = min(sl, close); break
                    if high >= tp:
                        exit_day = d; exit_price = tp; break
                    if trail_active and low <= trail_stop:
                        exit_day = d; exit_price = trail_stop; break
                    if not trail_active and high >= entry + atr:
                        trail_active = True
                        trail_stop = high - 1.5*atr
                    if trail_active and high - 1.5*atr > trail_stop:
                        trail_stop = high - 1.5*atr

                if exit_day == -1:
                    exit_day = min(day + hold_days, len(x['closes'])-1)
                    exit_price = x['closes'][exit_day]

                if exit_price and exit_price > 0:
                    gross = (exit_price - entry)/entry
                    net = gross - TOTAL_COST
                    capital += per_trade * net
                    trades.append(net*100)

        equity.append(capital)
        day += hold_days

    if not trades:
        return None

    rets = trades
    wins = sum(1 for r in rets if r > 0)
    total_ret = (capital - initial)/initial * 100
    daily = [(equity[i]-equity[i-1])/equity[i-1] for i in range(1, len(equity))]
    avg = np.mean(daily) if daily else 0
    std = np.std(daily) if daily else 0
    sharpe = (avg/std)*np.sqrt(252/hold_days) if std > 0 else 0
    peak = initial
    max_dd = 0
    for e in equity:
        if e > peak: peak = e
        dd = (e - peak)/peak
        if dd < max_dd: max_dd = dd

    return {
        'total_return': round(total_ret, 2),
        'winrate': round(wins/len(rets)*100, 1),
        'n_trades': len(rets),
        'sharpe': round(sharpe, 2),
        'max_dd': round(max_dd*100, 2),
        'n_days': len(equity) * hold_days,
    }


# ═══ محاسبه max_len ═══
max_len = max(len(x['closes']) for x in ind.values())
print(f"Max days: {max_len}")

# ═══ ۳ بازه Walk-Forward ═══
# تقسیم: 50%-62.5% / 62.5%-75% / 75%-87.5% / 87.5%-100%
# ولی برای walk-forward، هر بازه ۱۲.۵٪ = ~۳۰ روز
splits = [
    (int(max_len * 0.50), int(max_len * 0.625)),  # ~۱۲۵-۱۵۶
    (int(max_len * 0.625), int(max_len * 0.75)),  # ~۱۵۶-۱۸۷
    (int(max_len * 0.75), int(max_len * 0.875)),  # ~۱۸۷-۲۱۸
]

print(f"\n{'='*60}")
print("Walk-Forward Validation (Breakout 5 stocks x 5 days)")
print(f"{'='*60}")

results = []
for i, (start, end) in enumerate(splits, 1):
    print(f"\nFold {i}: days {start} to {end} (~{(end-start)*5} calendar days)")
    r = run_breakout(start, end, 5, 5)
    if r:
        results.append({'fold': i, 'start': start, 'end': end, **r})
        print(f"  Return:   {r['total_return']:+.2f}%")
        print(f"  Winrate:  {r['winrate']:.1f}%")
        print(f"  Sharpe:   {r['sharpe']:.2f}")
        print(f"  Max DD:   {r['max_dd']:.2f}%")
        print(f"  Trades:   {r['n_trades']}")
    else:
        print(f"  No trades")

# آمار
if results:
    avg_ret = np.mean([r['total_return'] for r in results])
    avg_sharpe = np.mean([r['sharpe'] for r in results])
    avg_dd = np.mean([r['max_dd'] for r in results])
    std_ret = np.std([r['total_return'] for r in results])

    print(f"\n{'='*60}")
    print("SUMMARY:")
    print(f"  Avg Return:   {avg_ret:+.2f}%")
    print(f"  Std Return:   {std_ret:.2f}%")
    print(f"  Avg Sharpe:   {avg_sharpe:.2f}")
    print(f"  Avg Max DD:   {avg_dd:.2f}%")
    print(f"{'='*60}")

    # verdict
    if avg_sharpe > 3 and std_ret < 20:
        verdict = "EXCELLENT - consistent across periods"
    elif avg_sharpe > 2 and std_ret < 30:
        verdict = "GOOD - reliable but some volatility"
    elif avg_sharpe > 1:
        verdict = "MARGINAL - works but high variance"
    else:
        verdict = "POOR - not reliable"

    print(f"\nVERDICT: {verdict}")

    with open(OUT / 'results.json', 'w') as f:
        json.dump({
            'results': results,
            'summary': {
                'avg_return': round(avg_ret, 2),
                'std_return': round(std_ret, 2),
                'avg_sharpe': round(avg_sharpe, 2),
                'avg_dd': round(avg_dd, 2),
                'verdict': verdict,
            }
        }, f, indent=2)
