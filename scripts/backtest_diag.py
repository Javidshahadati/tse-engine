"""Regime-Adaptive Backtest - Step 9."""
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
COMMISSION = 0.017
SLIPPAGE_PER_SIDE = 0.015
MAX_RETURN_PER_TRADE = 0.25
INITIAL_CAPITAL = 1_000_000
HOLD_DAYS = 5
TDPY = 252

print('=' * 65)
print('REGIME-ADAPTIVE BACKTEST - Step 9')
print('=' * 65)

print('\n[1/4] Loading + computing market breadth...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()

# Compute market breadth per date (from features we already have)
df['above20'] = (df['close'] > df.groupby('symbol')['close'].transform(lambda x: x.rolling(20).mean())).astype(float)
breadth = df.groupby('date')['above20'].mean().rename('breadth20')

# Market 5d return
market_ret = df.groupby('date')['close'].apply(lambda x: x.pct_change().mean()).rename('mkt_ret')
mkt_5d = market_ret.rolling(5).sum().rename('mkt_ret_5d')

regime_df = pd.concat([breadth, mkt_5d], axis=1).reset_index()
regime_df.columns = ['date', 'breadth20', 'mkt_ret_5d']

def classify_regime(b, m):
    """0=bear, 1=mixed, 2=bull"""
    if b > 0.65 and m > 0.02:
        return 2
    elif b < 0.35:
        return 0
    else:
        return 1

regime_df['regime'] = regime_df.apply(lambda r: classify_regime(r['breadth20'], r['mkt_ret_5d']), axis=1)
regime_map = dict(zip(regime_df['date'], regime_df['regime']))
print(f'  Breadth computed for {len(regime_df)} dates')
print(f'  Regime distribution: {regime_df["regime"].value_counts().to_dict()}')


def get_regime_params(regime):
    """Adaptive parameters per regime."""
    if regime == 2:   # bull - go wide, track market
        return {'max_pos': 20, 'threshold': 0.55, 'name': 'BULL'}
    elif regime == 0: # bear - concentrate, defensive
        return {'max_pos': 5, 'threshold': 0.72, 'name': 'BEAR'}
    else:             # mixed - balanced
        return {'max_pos': 10, 'threshold': 0.65, 'name': 'MIXED'}


def run_backtest_adaptive(test_df, probs, fold_id):
    test_df = test_df.copy()
    test_df['prob'] = probs
    test_df['fut_ret_capped'] = test_df['future_ret_5d'].clip(upper=MAX_RETURN_PER_TRADE)
    test_df = test_df.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)

    unique_dates = sorted(test_df['date'].unique())
    price_lookup = test_df.set_index(['symbol','date'])['close'].to_dict()
    grouped = test_df.groupby('date')

    cash = float(INITIAL_CAPITAL)
    positions = []; trades = []; equity = []
    regime_log = {'BULL': 0, 'MIXED': 0, 'BEAR': 0}
    regime_trades = {'BULL': 0, 'MIXED': 0, 'BEAR': 0}
    regime_returns = {'BULL': [], 'MIXED': [], 'BEAR': []}

    for i, d in enumerate(unique_dates):
        regime = regime_map.get(int(d), 1)
        params = get_regime_params(regime)
        regime_log[params['name']] += 1
        max_pos = params['max_pos']
        thresh = params['threshold']
        per_pos = INITIAL_CAPITAL / max_pos

        # Mark to market
        for pos in positions:
            cp = price_lookup.get((pos['sym'], d))
            if cp is not None and pos['entry_price'] > 0:
                pos['mv'] = pos['size'] * cp / pos['entry_price']

        # Close expired
        still = []
        for pos in positions:
            if i >= pos['exit_idx']:
                net = pos['fut_ret'] - COMMISSION - 2*SLIPPAGE_PER_SIDE
                proceeds = pos['size'] * (1 + net); cash += proceeds
                trades.append({'net': net, 'gross': pos['fut_ret'], 'regime': pos['regime']})
                regime_trades[pos['regime']] += 1
                regime_returns[pos['regime']].append(net)
            else:
                still.append(pos)
        positions = still

        # Open
        available = max_pos - len(positions)
        if available > 0 and d in grouped.groups:
            day = grouped.get_group(d)
            sigs = day[day['prob'] > thresh]
            held = {p['sym'] for p in positions}
            new = sigs[~sigs['symbol'].isin(held)]
            for _, r in new.head(available).iterrows():
                if cash < per_pos * 0.1: break
                size = min(per_pos, cash); cash -= size
                positions.append({
                    'sym': r['symbol'], 'entry_price': float(r['close']),
                    'entry_idx': i, 'exit_idx': i + HOLD_DAYS,
                    'size': size, 'fut_ret': float(r['fut_ret_capped']),
                    'mv': size, 'regime': params['name'],
                })

        equity.append({'date': int(d), 'equity': cash + sum(p['mv'] for p in positions), 'regime': params['name']})

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

    per_regime = {}
    for name in ['BULL','MIXED','BEAR']:
        rets = regime_returns[name]
        per_regime[name] = {
            'days': regime_log[name],
            'trades': regime_trades[name],
            'avg_return': round(float(np.mean(rets)),4) if rets else 0,
            'winrate': round(float(np.mean([r>0 for r in rets])),4) if rets else 0,
        }

    return {
        'n_trades': len(tr), 'total_return': round(total_ret,4),
        'cagr': round(cagr,4), 'sharpe': round(sharpe,2),
        'max_dd': round(max_dd,4), 'winrate': round(wr,4),
        'avg_ret_net': round(ar,4), 'rr': round(rr,2),
        'per_regime': per_regime,
    }


def compute_benchmark(test_df):
    test_df = test_df.sort_values(['symbol','date'])
    first_close = test_df.groupby('symbol').first()['close']
    last_close = test_df.groupby('symbol').last()['close']
    rets = (last_close / first_close - 1).dropna()
    ew_return = float(rets.mean())
    unique_dates = sorted(test_df['date'].unique())
    n_days = len(unique_dates)
    years = n_days / TDPY
    bench_cagr = float((1+ew_return)**(1/years)-1) if years > 0 else 0
    return {'ew_return': round(ew_return,4), 'bench_cagr': round(bench_cagr,4)}


print('\n[2/4] Walk-forward with adaptive strategy...')
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

    bt = run_backtest_adaptive(te, prob, k)
    bench = compute_benchmark(te)
    alpha = round(bt['cagr'] - bench['bench_cagr'], 4)
    alpha_ret = round(bt['total_return'] - bench['ew_return'], 4)

    result = {**bt, **bench, 'fold': k, 'auc': round(float(auc),4),
              'alpha_cagr': alpha, 'alpha_return': alpha_ret}
    all_results.append(result)

    print(f'    Adaptive: CAGR={bt["cagr"]:.1%} Sharpe={bt["sharpe"]:.2f} WR={bt["winrate"]:.1%} trades={bt["n_trades"]}')
    print(f'    Bench:    CAGR={bench["bench_cagr"]:.1%}')
    print(f'    Alpha:    {alpha:+.1%}  | Return alpha: {alpha_ret:+.1%}')
    print(f'    Regime days: {bt["per_regime"]}')

print('\n[3/4] Computing overall...')
avg_alpha_cagr = round(float(np.mean([r['alpha_cagr'] for r in all_results])),4)
avg_alpha_ret = round(float(np.mean([r['alpha_return'] for r in all_results])),4)
avg_sharpe = round(float(np.mean([r['sharpe'] for r in all_results])),2)

if avg_alpha_ret > 0.03:
    verdict = 'ADAPTIVE_BEATS_BENCH'
elif avg_alpha_ret > -0.03:
    verdict = 'NEUTRAL'
else:
    verdict = 'BENCH_STILL_WINS'

final = {
    'diagnostic': 'regime_adaptive',
    'avg_alpha_cagr': avg_alpha_cagr,
    'avg_alpha_return': avg_alpha_ret,
    'avg_sharpe': avg_sharpe,
    'verdict': verdict,
    'folds': all_results,
}
with open(OUT / 'backtest_diag.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print('\n[4/4] Summary:')
print('=' * 65)
for r in all_results:
    print(f"  Fold {r['fold']}: ADAPT_CAGR={r['cagr']:>7.1%} BENCH={r['bench_cagr']:>7.1%} ALPHA={r['alpha_return']:>+7.1%}")
print(f"  Avg Alpha Return: {avg_alpha_ret:+.1%}")
print(f"  Avg Sharpe: {avg_sharpe:.2f}")
print(f"  VERDICT: {verdict}")
print('=' * 65)
