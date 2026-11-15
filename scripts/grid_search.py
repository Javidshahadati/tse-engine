"""Grid search backtest - tests all combinations."""
import json, itertools, os
import numpy as np
import pandas as pd
from pathlib import Path

DATA = Path('data')
OUT = Path('grid_results')
OUT.mkdir(exist_ok=True)

COMMISSION = 0.017
SLIPPAGE = 0.006
TOTAL_COST = COMMISSION + SLIPPAGE

# Load charts
print("Loading charts...")
with open(DATA / 'charts.json') as f:
    charts = json.load(f)

print(f"Loaded {len(charts)} stocks")

# Load predictions for model_portfolio
try:
    with open('public/data/predictions_today.json') as f:
        predictions = json.load(f)
    predictions_map = {s['symbol']: s.get('prob', 0.5) for s in predictions.get('signals', [])}
except:
    predictions_map = {}

# Filter valid stocks
symbols = [s for s in charts if len(charts[s]) >= 200]
print(f"Valid stocks (200+ days): {len(symbols)}")


def calc_sma(arr, p):
    return pd.Series(arr).rolling(p).mean().values


def calc_ema(arr, p):
    return pd.Series(arr).ewm(span=p, adjust=False).mean().values


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


# Pre-compute indicators
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
        'ma10': calc_sma(closes, 10),
        'ma20': calc_sma(closes, 20),
        'ma50': calc_sma(closes, 50),
        'avgVol20': calc_sma(vols, 20),
        'atr': calc_atr(highs, lows, closes),
        'mom20': np.array([(closes[i] - closes[i-20]) / closes[i-20] if i >= 20 and closes[i-20] > 0 else 0 for i in range(len(closes))]),
    }

# Market breadth
print("Computing breadth...")
max_len = max(len(x['closes']) for x in ind.values())
min_len = min(len(x['closes']) for x in ind.values())
breadth = {}
for d in range(60, max_len):
    above = 0
    total = 0
    for x in ind.values():
        if d < len(x['closes']) and x['ma20'][d] is not None and not np.isnan(x['ma20'][d]):
            if x['closes'][d] > x['ma20'][d]:
                above += 1
            total += 1
    if total > 0:
        breadth[d] = above / total


def run_backtest(strategy, n_stocks, hold_days, use_risk_mgmt=True):
    start_day = 60
    end_day = max_len - hold_days - 1
    capital = 10_000_000
    initial = capital
    trades = []
    equity = [capital]
    day = start_day

    while day < end_day:
        candidates = []
        day_breadth = breadth.get(day, 0.5)
        if day_breadth < 0.20:
            day += hold_days
            continue

        for sym in symbols:
            x = ind[sym]
            if day >= len(x['closes']):
                continue
            rsi_v = x['rsi'][day]
            hist = x['hist'][day]
            price = x['closes'][day]
            ma10 = x['ma10'][day] if not np.isnan(x['ma10'][day]) else None
            ma20 = x['ma20'][day] if not np.isnan(x['ma20'][day]) else None
            ma50 = x['ma50'][day] if not np.isnan(x['ma50'][day]) else None
            vol = x['vols'][day]
            avg_v = x['avgVol20'][day] if not np.isnan(x['avgVol20'][day]) else 0
            atr = x['atr'][day] if not np.isnan(x['atr'][day]) else 0
            mom = x['mom20'][day]
            high20 = max(x['highs'][max(0, day-19):day+1]) if day >= 20 else None
            low20 = min(x['lows'][max(0, day-19):day+1]) if day >= 20 else None

            pass_ = False
            score = 0

            if strategy == 'breakout':
                vr = vol / avg_v if avg_v > 0 else 0
                pass_ = high20 and price >= high20 * 0.99 and vr > 1.5 and rsi_v > 55 and hist > 0
                score = (min((price/high20 - 0.99)*10, 0.3) if high20 else 0) + min(vr/3, 0.3) + (0.3 if hist > 0 else 0) + (0.2 if rsi_v > 60 else 0.1)
            elif strategy == 'pullback':
                near = abs(price - ma20)/ma20 if ma20 else 1
                pass_ = ma20 and ma50 and ma20 > ma50 and price > ma50 and near < 0.03 and 40 < rsi_v < 55 and hist > 0
                score = 1 - min(near*30, 0.5) + (0.2 if rsi_v > 45 else 0) + (0.3 if hist > 0 else 0)
            elif strategy == 'meanrev':
                near_low = (price - low20)/low20 if low20 else 1
                pass_ = rsi_v < 35 and near_low < 0.05
                score = 1 - min(near_low*10, 0.5) + ((35 - rsi_v)/35)*0.3
            elif strategy == 'momentum':
                vr = vol / avg_v if avg_v > 0 else 0
                pass_ = 55 < rsi_v < 75 and hist > 0 and vr > 1.2 and ma20 and price > ma20
                score = (0.3 if rsi_v > 65 else 0.15) + min(vr/3, 0.3) + (0.3 if mom > 0.05 else 0.1) + (0.2 if hist > 0 else 0)
            elif strategy == 'trend':
                pass_ = ma20 and ma50 and ma20 > ma50 and price > ma20 and hist > 0
                score = min(((ma20-ma50)/ma50)*10, 0.4) + min((price/ma20-1)*5, 0.3) + (0.3 if hist > 0 else 0)
            elif strategy == 'multifactor':
                s = 0
                if rsi_v: s += 0.25 if 50 < rsi_v < 70 else 0.15 if rsi_v < 40 else 0.05
                if hist > 0: s += 0.2
                if ma20 and price > ma20: s += 0.15
                if ma50 and price > ma50: s += 0.15
                if avg_v and vol > avg_v * 1.2: s += 0.1
                if mom > 0: s += 0.15
                score = s
                pass_ = s >= 0.5
            elif strategy == 'model_portfolio':
                pass_ = ma20 and ma50 and price > ma20 and ma20 > ma50 and hist > 0 and mom > 0
                score = 0.5 + min(mom*3, 0.4) + (0.1 if hist > 0 else 0)
            elif strategy == 'buy_hold':
                pass_ = ma20 and price > ma20 and hist > 0
                score = predictions_map.get(sym, 0.5) + (0.1 if mom > 0 else 0)

            if pass_ and atr > 0:
                candidates.append({'sym': sym, 'score': min(max(score, 0), 1), 'price': price, 'atr': atr})

        candidates.sort(key=lambda x: -x['score'])
        picks = candidates[:n_stocks]

        if picks:
            per_trade = capital / len(picks)
            for p in picks:
                x = ind[p['sym']]
                entry = p['price']
                atr = p['atr']
                sl = entry - 2*atr
                tp = entry + 3*atr
                trail_active = False
                trail_stop = sl
                exit_day = -1
                exit_price = None
                exit_reason = None

                for d in range(day+1, min(day+hold_days, len(x['closes'])-1)):
                    low = x['lows'][d]
                    high = x['highs'][d]
                    close = x['closes'][d]

                    if use_risk_mgmt:
                        hit_sl = not trail_active and low <= sl
                        hit_tp = high >= tp
                        hit_trail = trail_active and low <= trail_stop

                        if hit_sl and hit_tp:
                            if close >= entry:
                                exit_day = d; exit_price = tp; exit_reason = 'TP'
                            else:
                                exit_day = d; exit_price = min(sl, close); exit_reason = 'SL'
                            break
                        if hit_sl:
                            exit_day = d; exit_price = min(sl, close); exit_reason = 'SL'
                            break
                        if hit_tp:
                            exit_day = d; exit_price = tp; exit_reason = 'TP'
                            break
                        if hit_trail:
                            exit_day = d; exit_price = trail_stop; exit_reason = 'TRAIL'
                            break
                        if not trail_active and high >= entry + atr:
                            trail_active = True
                            trail_stop = high - 1.5*atr
                        if trail_active and high - 1.5*atr > trail_stop:
                            trail_stop = high - 1.5*atr

                if exit_day == -1:
                    exit_day = min(day + hold_days, len(x['closes'])-1)
                    exit_price = x['closes'][exit_day]
                    exit_reason = 'TIME'

                if not exit_price or exit_price <= 0:
                    continue

                gross = (exit_price - entry)/entry
                net = gross - TOTAL_COST
                capital += per_trade * net
                trades.append({'ret': net*100, 'reason': exit_reason})

        equity.append(capital)
        day += hold_days

    if not trades:
        return None

    rets = [t['ret'] for t in trades]
    wins = sum(1 for r in rets if r > 0)
    total_ret = (capital - initial)/initial * 100

    # Sharpe
    daily = [(equity[i]-equity[i-1])/equity[i-1] for i in range(1, len(equity))]
    if len(daily) > 1:
        avg = np.mean(daily)
        std = np.std(daily)
        periods = 252 / hold_days
        sharpe = (avg/std)*np.sqrt(periods) if std > 0 else 0
    else:
        sharpe = 0

    # Max DD
    peak = initial
    max_dd = 0
    for e in equity:
        if e > peak: peak = e
        dd = (e - peak)/peak
        if dd < max_dd: max_dd = dd

    # Benchmark: picked stocks buy&hold
    picked = set()
    # Track picked symbols from trades
    # (Simplified - use all stocks for now)

    return {
        'total_return': round(total_ret, 2),
        'winrate': round(wins/len(trades)*100, 1),
        'avg_trade': round(np.mean(rets), 2),
        'n_trades': len(trades),
        'sharpe': round(sharpe, 2),
        'max_dd': round(max_dd*100, 2),
    }


# ═══ Grid ═══
strategies = ['breakout', 'pullback', 'meanrev', 'momentum', 'trend', 'multifactor', 'model_portfolio', 'buy_hold']
n_stocks_list = [3, 5, 10, 15, 20]
hold_days_list = [5, 10, 20, 30]

results = []
total = len(strategies) * len(n_stocks_list) * len(hold_days_list)
i = 0

for strat in strategies:
    for n in n_stocks_list:
        for h in hold_days_list:
            i += 1
            print(f"[{i}/{total}] {strat} x {n} x {h}...", end=' ', flush=True)
            try:
                r = run_backtest(strat, n, h)
                if r:
                    r['strategy'] = strat
                    r['n_stocks'] = n
                    r['hold_days'] = h
                    results.append(r)
                    print(f"ret={r['total_return']:+.1f}% wr={r['winrate']}%")
                else:
                    print("no trades")
            except Exception as e:
                print(f"error: {e}")

# Save
results.sort(key=lambda x: -x['total_return'])
with open(OUT / 'grid_results.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n✅ {len(results)} combinations tested")
print(f"Top 10:")
for r in results[:10]:
    print(f"  {r['strategy']:18} x {r['n_stocks']:2} x {r['hold_days']:2} = {r['total_return']:+.1f}% (Sharpe {r['sharpe']})")
