"""Grid search with fundamental features."""
import json
import numpy as np
import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT = Path('fundamental_results')
OUT.mkdir(exist_ok=True)

COMMISSION = 0.017
SLIPPAGE = 0.006
TOTAL_COST = COMMISSION + SLIPPAGE

with open(DATA / 'charts.json') as f:
    charts = json.load(f)
with open(DATA / 'fundamentals.json') as f:
    fund = json.load(f)

print(f"Loaded {len(charts)} stocks, {len(fund)} fundamentals")

# ═══ Fundamental features ═══
print("Computing fundamental features...")
fund_feats = {}
for sym, f in fund.items():
    try:
        eps = float(f.get('estimatedEPS') or 0)
        sector_pe = float(f.get('sectorPE') or 0)
        psr = float(f.get('psr') or 0)
        sector = f.get('sector', '')
        
        fund_feats[sym] = {
            'eps': eps,
            'sector_pe': sector_pe,
            'psr': psr,
            'sector': sector,
        }
    except:
        pass

# Rank EPS in sector
from collections import defaultdict
sector_stocks = defaultdict(list)
for sym, ff in fund_feats.items():
    sector_stocks[ff['sector']].append((sym, ff['eps']))

for sector, stocks_list in sector_stocks.items():
    stocks_sorted = sorted(stocks_list, key=lambda x: -x[1])
    for rank, (sym, eps) in enumerate(stocks_sorted):
        fund_feats[sym]['sector_rank'] = rank / len(stocks_sorted)

# Rank EPS in market
all_eps = sorted([(sym, ff['eps']) for sym, ff in fund_feats.items()], key=lambda x: -x[1])
for rank, (sym, eps) in enumerate(all_eps):
    fund_feats[sym]['market_rank'] = rank / len(all_eps)


# ═══ Indicators ═══
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


symbols = [s for s in charts if len(charts[s]) >= 200 and s in fund_feats]
print(f"Valid: {len(symbols)}")

ind = {}
for sym in symbols:
    c = list(reversed(charts[sym]))
    closes = np.array([r['c'] for r in c], dtype=float)
    highs = np.array([r['h'] if r.get('h', 0) > 0 else r['c'] for r in c], dtype=float)
    lows = np.array([r['l'] if r.get('l', 0) > 0 else r['c'] for r in c], dtype=float)
    vols = np.array([r['v'] for r in c], dtype=float)
    
    ff = fund_feats[sym]
    # eps_yield = EPS / close (dynamic — با تغییر قیمت عوض می‌شه)
    eps_yield = np.where(closes > 0, ff['eps'] / closes, 0)
    # pe_relative = (close/EPS) / sector_PE
    pe_relative = np.where(eps_yield > 0, (1 / eps_yield) / ff['sector_pe'], 0) if ff['sector_pe'] > 0 else np.zeros_like(closes)
    
    ind[sym] = {
        'closes': closes, 'highs': highs, 'lows': lows, 'vols': vols,
        'rsi': calc_rsi(closes),
        'hist': calc_macd_hist(closes),
        'ma20': calc_sma(closes, 20),
        'ma50': calc_sma(closes, 50),
        'avgVol20': calc_sma(vols, 20),
        'atr': calc_atr(highs, lows, closes),
        'eps': ff['eps'],
        'sector_pe': ff['sector_pe'],
        'psr': ff['psr'],
        'sector_rank': ff['sector_rank'],
        'market_rank': ff['market_rank'],
        'eps_yield': eps_yield,
        'pe_relative': pe_relative,
    }

max_len = max(len(x['closes']) for x in ind.values())


def run_fund_backtest(min_eps_yield, max_pe_relative, min_market_rank, n_stocks, hold_days):
    """Breakout + Fundamental filters."""
    start_day = 60
    end_day = max_len - hold_days - 1
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
            
            eps_y = x['eps_yield'][day]
            pe_rel = x['pe_relative'][day] if not np.isnan(x['pe_relative'][day]) else 0
            
            # Breakout condition
            pass_breakout = (high20 and price >= high20 * 0.99 and avg_v > 0 and (vol / avg_v) > 1.5 and rsi_v > 55 and hist > 0 and atr > 0)
            
            # Fundamental filter
            pass_fund = (eps_y >= min_eps_yield and 
                         (pe_rel <= max_pe_relative if pe_rel > 0 else True) and
                         x['market_rank'] <= min_market_rank)
            
            if pass_breakout and pass_fund:
                # Score = ترکیب breakout + fundamental
                vr = vol / avg_v if avg_v > 0 else 0
                score = (min(eps_y * 50, 0.3) +  # eps_yield بالا = ارزون
                        (1 - x['market_rank']) * 0.3 +  # EPS بالا
                        min(vr / 3, 0.2) +
                        (1 - min(pe_rel, 2) / 2) * 0.2)  # PE پایین‌تر بهتر
                candidates.append({'sym': sym, 'score': score, 'price': price, 'atr': atr})

        candidates.sort(key=lambda x: -x['score'])
        picks = candidates[:n_stocks]

        if picks:
            per_trade = capital / len(picks)
            for c in picks:
                x = ind[c['sym']]
                entry = c['price']
                atr = c['atr']
                sl = entry - 2*atr
                tp = entry + 3*atr
                exit_day = -1
                exit_price = None

                for d in range(day+1, min(day+hold_days, len(x['closes'])-1)):
                    low = x['lows'][d]
                    high = x['highs'][d]
                    close = x['closes'][d]
                    if low <= sl:
                        exit_day = d; exit_price = min(sl, close); break
                    if high >= tp:
                        exit_day = d; exit_price = tp; break

                if exit_day == -1:
                    exit_day = min(day + hold_days, len(x['closes'])-1)
                    exit_price = x['closes'][exit_day]

                if exit_price and exit_price > 0:
                    net = ((exit_price - entry) / entry) - TOTAL_COST
                    capital += per_trade * net
                    trades.append(net * 100)

        equity.append(capital)
        day += hold_days

    if not trades:
        return None

    rets = trades
    wins = sum(1 for r in rets if r > 1.7)
    total_ret = (capital - initial) / initial * 100
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
    }


# ═══ Grid ═══
results = []
configs = [
    # (min_eps_yield, max_pe_relative, min_market_rank, label)
    (0.0, 0, 0.5, 'no_fund'),           # baseline (بدون فیلتر)
    (0.05, 0, 0.3, 'eps_y>5%'),         # EPS yield > 5٪
    (0.10, 0, 0.3, 'eps_y>10%'),
    (0.15, 0, 0.2, 'eps_y>15%'),
    (0.05, 1.5, 0.3, 'eps+pe<1.5'),
    (0.10, 1.5, 0.2, 'eps+pe<1.5'),
    (0.05, 1.0, 0.3, 'eps+pe<1.0'),
    (0.10, 1.0, 0.2, 'eps+pe<1.0'),
]

for min_eps, max_pe, min_rank, label in configs:
    print(f"\n[{label}] eps_yield>={min_eps} pe<={max_pe} rank<={min_rank}")
    for n in [5, 10]:
        for h in [10, 20]:
            r = run_fund_backtest(min_eps, max_pe, min_rank, n, h)
            if r:
                r['label'] = label
                r['n_stocks'] = n
                r['hold_days'] = h
                results.append(r)
                print(f"  {n}x{h}: ret={r['total_return']:+.1f}% wr={r['winrate']}% sharpe={r['sharpe']}")

results.sort(key=lambda x: -x['total_return'])

with open(OUT / 'results.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\n✅ {len(results)} combos tested")
print(f"\n🏆 TOP 10:")
for r in results[:10]:
    print(f"  {r['label']:15} x {r['n_stocks']} x {r['hold_days']} = {r['total_return']:+.1f}% (WR {r['winrate']}%, Sharpe {r['sharpe']})")
