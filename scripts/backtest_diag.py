"""Smart Beta Backtest - Step 10: market + model blend by regime."""
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

# ─── SMART BETA WEIGHTS ───
WEIGHTS = {
    2: {'market': 0.70, 'model': 0.30, 'name': 'BULL'},   # 70% index + 30% model
    1: {'market': 0.40, 'model': 0.60, 'name': 'MIXED'},  # 40/60
    0: {'market': 0.10, 'model': 0.90, 'name': 'BEAR'},   # 10/90 defensive
}
MODEL_POSITIONS = {'BULL': 10, 'MIXED': 10, 'BEAR': 5}
MODEL_THRESHOLDS = {'BULL': 0.65, 'MIXED': 0.65, 'BEAR': 0.70}

print('=' * 65)
print('SMART BETA BACKTEST - Step 10')
print('  Weights: BULL=70/30, MIXED=40/60, BEAR=10/90')
print('=' * 65)

print('\n[1/4] Loading + market returns...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['daily_ret'] = df.groupby('symbol')['close'].pct_change()
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()

# Market equal-weight daily return
market_daily = df.groupby('date')['daily_ret'].mean().rename('mkt_ret')

# Breadth
df['above20'] = (df['close'] > df.groupby('symbol')['close'].transform(lambda x: x.rolling(20).mean())).astype(float)
breadth = df.groupby('date')['above20'].mean().rename('breadth20')
mkt_5d = market_daily.rolling(5).sum().rename('mkt_ret_5d')

regime_df = pd.concat([breadth, mkt_5d, market_daily], axis=1).reset_index()

def classify(b, m):
    if b > 0.65 and m > 0.02: return 2
    elif b < 0.35: return 0
    return 1

regime_df['regime'] = regime_df.apply(lambda r: classify(r['breadth20'], r['mkt_ret_5d']), axis=1)
regime_map = dict(zip(regime_df['date'], regime_df['regime']))
market_ret_map = dict(zip(regime_df['date'], regime_df['mkt_ret'].fillna(0)))
print(f'  Breadth dates: {len(regime_df)}')
print(f'  Regime dist: {regime_df["regime"].value_counts().to_dict()}')


def run_model_subportfolio(test_df, probs, fold_id):
    """Model active strategy -> daily returns curve."""
    test_df = test_df.copy()
    test_df['prob'] = probs
    test_df['fut_ret_capped'] = test_df['future_ret_5d'].clip(upper=MAX_RETURN_PER_TRADE)
    test_df = test_df.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)

    unique_dates = sorted(test_df['date'].unique())
    price_lookup = test_df.set_index(['symbol','date'])['close'].to_dict()
    grouped = test_df.groupby('date')

    cash = float(INITIAL_CAPITAL)
    positions = []
    daily_equity = {}
    regime_days = {'BULL':0,'MIXED':0,'BEAR':0}
    regime_trades = {'BULL':0,'MIXED':0,'BEAR':0}

    for i, d in enumerate(unique_dates):
        regime = regime_map.get(int(d), 1)
        w = WEIGHTS[regime]
        rname = w['name']
        regime_days[rname] += 1
        max_pos = MODEL_POSITIONS[rname]
        thresh = MODEL_THRESHOLDS[rname]
        per_pos = INITIAL_CAPITAL / max_pos

        for pos in positions:
            cp = price_lookup.get((pos['sym'], d))
            if cp is not None and pos['entry_price'] > 0:
                pos['mv'] = pos['size'] * cp / pos['entry_price']

        still = []
        for pos in positions:
            if i >= pos['exit_idx']:
                net = pos['fut_ret'] - COMMISSION - 2*SLIPPAGE_PER_SIDE
                proceeds = pos['size'] * (1 + net); cash += proceeds
                regime_trades[pos['regime']] += 1
            else:
                still.append(pos)
        positions = still

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
                    'mv': size, 'regime': rname,
                })

        daily_equity[int(d)] = cash + sum(p['mv'] for p in positions)

    # Convert to daily returns
    eqs = pd.Series(daily_equity).sort_index()
    daily_ret = eqs.pct_change().fillna(0)
    return daily_ret, regime_days, regime_trades


def blend_portfolios(test_df, model_daily_ret):
    """Blend market and model returns per regime weights."""
    unique_dates = sorted(test_df['date'].unique())
    equity = INITIAL_CAPITAL
    curve = []
    market_equity = INITIAL_CAPITAL
    curve_market = []

    for d in unique_dates:
        regime = regime_map.get(int(d), 1)
        w = WEIGHTS[regime]
        mkt_r = market_ret_map.get(int(d), 0)
        mod_r = model_daily_ret.get(int(d), 0)

        # Blend
        blended_r = w['market'] * mkt_r + w['model'] * mod_r
        equity *= (1 + blended_r)

        # Pure market curve for comparison
        market_equity *= (1 + mkt_r)

        curve.append({'date': int(d), 'equity': equity, 'blended_ret': blended_r,
                      'mkt_ret': mkt_r, 'mod_ret': mod_r, 'regime': w['name']})
        curve_market.append({'date': int(d), 'equity': market_equity})

    eq_df = pd.DataFrame(curve)
    mkt_df = pd.DataFrame(curve_market)
    return eq_df, mkt_df


def metrics_from_curve(eq_df):
    total_ret = float(eq_df['equity'].iloc[-1] / INITIAL_CAPITAL - 1)
    n_days = len(eq_df); years = n_days / TDPY
    cagr = float((1+total_ret)**(1/years)-1) if years > 0 else 0
    eq_df = eq_df.copy()
    eq_df['ret'] = eq_df['equity'].pct_change().fillna(0)
    eq_df['peak'] = eq_df['equity'].cummax()
    max_dd = float((eq_df['equity']/eq_df['peak']-1).min())
    dm = eq_df['ret'].mean(); ds = eq_df['ret'].std()
    sharpe = float(dm/ds*np.sqrt(TDPY)) if ds > 0 else 0
    return {
        'total_return': round(total_ret,4), 'cagr': round(cagr,4),
        'sharpe': round(sharpe,2), 'max_dd': round(max_dd,4),
        'final_equity': round(float(eq_df['equity'].iloc[-1]), 2),
    }


print('\n[2/4] Walk-forward with smart beta...')
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

    model_ret, reg_days, reg_trades = run_model_subportfolio(te, prob, k)
    eq_df, mkt_df = blend_portfolios(te, model_ret)
    strat_m = metrics_from_curve(eq_df)
    mkt_m = metrics_from_curve(mkt_df)

    alpha_ret = round(strat_m['total_return'] - mkt_m['total_return'], 4)
    alpha_cagr = round(strat_m['cagr'] - mkt_m['cagr'], 4)

    result = {
        'fold': k, 'auc': round(float(auc),4),
        'strategy': strat_m, 'benchmark': mkt_m,
        'alpha_return': alpha_ret, 'alpha_cagr': alpha_cagr,
        'regime_days': reg_days, 'regime_trades': reg_trades,
    }
    all_results.append(result)
    print(f'    Strategy:  CAGR={strat_m["cagr"]:.1%} Sharpe={strat_m["sharpe"]:.2f} DD={strat_m["max_dd"]:.1%}')
    print(f'    Bench:     CAGR={mkt_m["cagr"]:.1%} Sharpe={mkt_m["sharpe"]:.2f} DD={mkt_m["max_dd"]:.1%}')
    print(f'    ALPHA:     {alpha_ret:+.1%} return')
    print(f'    Days:      {reg_days}')

print('\n[3/4] Aggregate...')
avg_alpha = round(float(np.mean([r['alpha_return'] for r in all_results])),4)
avg_sharpe = round(float(np.mean([r['strategy']['sharpe'] for r in all_results])),2)
avg_bench_sharpe = round(float(np.mean([r['benchmark']['sharpe'] for r in all_results])),2)
n_wins = sum(1 for r in all_results if r['alpha_return'] > 0)

if n_wins >= 3 and avg_alpha > 0.02:
    verdict = 'SMART_BETA_WINS'
elif n_wins >= 2 and avg_alpha > 0:
    verdict = 'SMART_BETA_MARGINAL'
elif avg_alpha > -0.05:
    verdict = 'NEUTRAL'
else:
    verdict = 'BENCH_WINS'

final = {
    'diagnostic': 'smart_beta',
    'weights': {k: v for k, v in WEIGHTS.items()},
    'avg_alpha_return': avg_alpha,
    'avg_strategy_sharpe': avg_sharpe,
    'avg_benchmark_sharpe': avg_bench_sharpe,
    'n_wins': n_wins, 'n_total': len(all_results),
    'verdict': verdict,
    'folds': all_results,
}
with open(OUT / 'backtest_diag.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print('\n[4/4] Summary:')
print('=' * 65)
for r in all_results:
    print(f"  Fold {r['fold']}: STRAT={r['strategy']['total_return']:>+7.1%} BENCH={r['benchmark']['total_return']:>+7.1%} ALPHA={r['alpha_return']:>+7.1%}")
print(f"  Wins: {n_wins}/{len(all_results)}")
print(f"  Avg Alpha: {avg_alpha:+.1%}")
print(f"  Avg Sharpe: {avg_sharpe} (bench: {avg_bench_sharpe})")
print(f"  VERDICT: {verdict}")
print('=' * 65)
