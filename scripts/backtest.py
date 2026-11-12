"""Portfolio backtest + overfitting analysis - Step 7."""
import json
import numpy as np
import pandas as pd
from pathlib import Path

OUT = Path('outputs')

COMMISSION = 0.017
MAX_POSITIONS = 10
INITIAL_CAPITAL = 1_000_000
THRESHOLD_BUY = 0.60
HOLD_DAYS = 5
TDPY = 252

print('=' * 55)
print('TSE.Engine Backtest - Step 7')
print('=' * 55)

print('\n[1/6] Loading...')
preds = pd.read_parquet(OUT / 'predictions.parquet')
feats = pd.read_parquet(OUT / 'features.parquet')
print(f'  Predictions: {len(preds):,}')
print(f'  Features: {len(feats):,}')

close_lookup = feats.set_index(['symbol', 'date'])['close'].to_dict()

unique_dates = sorted(preds['date'].unique())
date_to_idx = {d: i for i, d in enumerate(unique_dates)}

def get_exit_date(entry_date):
    idx = date_to_idx[entry_date]
    exit_idx = min(idx + HOLD_DAYS, len(unique_dates) - 1)
    return unique_dates[exit_idx]

cash = INITIAL_CAPITAL
positions = []
trades = []
equity_curve = []

preds = preds.sort_values(['date', 'prob'], ascending=[True, False]).reset_index(drop=True)
date_groups = preds.groupby('date')

print('\n[2/6] Simulating portfolio...')
total_days = len(unique_dates)

for i, d in enumerate(unique_dates):
    # Mark-to-market
    for pos in positions:
        cur_close = close_lookup.get((pos['symbol'], d))
        if cur_close is not None and pos['entry_price'] > 0:
            pos['market_value'] = pos['size'] * cur_close / pos['entry_price']

    # Close expired
    still_open = []
    for pos in positions:
        if pos['exit_date'] <= d and d > pos['entry_date']:
            realized_ret = pos['future_ret_5d'] - COMMISSION
            proceeds = pos['size'] * (1 + realized_ret)
            cash += proceeds
            trades.append({
                'symbol': pos['symbol'],
                'entry_date': pos['entry_date'], 'exit_date': d,
                'entry_price': pos['entry_price'], 'entry_prob': pos['prob'],
                'size': pos['size'],
                'gross_ret': pos['future_ret_5d'], 'net_ret': realized_ret,
                'pnl': proceeds - pos['size'],
            })
        else:
            still_open.append(pos)
    positions = still_open

    # Open new
    available = MAX_POSITIONS - len(positions)
    if available > 0 and d in date_groups.groups:
        day_preds = date_groups.get_group(d)
        signals = day_preds[day_preds['prob'] > THRESHOLD_BUY]
        if len(signals) > 0:
            per_pos = INITIAL_CAPITAL / MAX_POSITIONS
            held = {p['symbol'] for p in positions}
            new_sigs = signals[~signals['symbol'].isin(held)]
            for _, sig in new_sigs.head(available).iterrows():
                if cash < per_pos * 0.1: break
                size = min(per_pos, cash)
                cash -= size
                positions.append({
                    'symbol': sig['symbol'],
                    'entry_date': int(d),
                    'exit_date': get_exit_date(int(d)),
                    'entry_price': float(sig['close']),
                    'size': size, 'prob': float(sig['prob']),
                    'future_ret_5d': float(sig['future_ret_5d']),
                    'market_value': size,
                })

    pv = cash + sum(p['market_value'] for p in positions)
    equity_curve.append({'date': int(d), 'equity': pv, 'cash': cash, 'n_positions': len(positions)})

    if (i + 1) % 50 == 0:
        print(f'  {i+1}/{total_days} days | equity={pv:,.0f} | pos={len(positions)}')

print('\n[3/6] Metrics...')
eq = pd.DataFrame(equity_curve).sort_values('date').reset_index(drop=True)
tr = pd.DataFrame(trades)

eq['daily_ret'] = eq['equity'].pct_change().fillna(0)
eq['peak'] = eq['equity'].cummax()
eq['drawdown'] = eq['equity'] / eq['peak'] - 1

total_return = eq['equity'].iloc[-1] / INITIAL_CAPITAL - 1
n_days = len(eq); years = n_days / TDPY
cagr = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
max_dd = float(eq['drawdown'].min())
d_mean = eq['daily_ret'].mean(); d_std = eq['daily_ret'].std()
sharpe = (d_mean / d_std * np.sqrt(TDPY)) if d_std > 0 else 0
down = eq.loc[eq['daily_ret'] < 0, 'daily_ret'].std()
sortino = (d_mean / down * np.sqrt(TDPY)) if down and down > 0 else 0

if len(tr) > 0:
    twr = (tr['net_ret'] > 0).mean()
    tar = tr['net_ret'].mean()
    taw = tr.loc[tr['net_ret'] > 0, 'net_ret'].mean() if (tr['net_ret'] > 0).any() else 0
    tal = tr.loc[tr['net_ret'] <= 0, 'net_ret'].mean() if (tr['net_ret'] <= 0).any() else 0
    trr = abs(taw / tal) if tal != 0 else 0
else:
    twr = tar = trr = 0

metrics = {
    'step': '7', 'initial_capital': INITIAL_CAPITAL,
    'final_equity': round(float(eq['equity'].iloc[-1]), 2),
    'total_return': round(float(total_return), 4),
    'cagr': round(float(cagr), 4),
    'max_drawdown': round(float(max_dd), 4),
    'sharpe': round(float(sharpe), 2),
    'sortino': round(float(sortino), 2),
    'n_days': n_days, 'n_trades': len(tr),
    'trade_winrate': round(float(twr), 4),
    'trade_avg_ret': round(float(tar), 4),
    'trade_avg_win': round(float(taw), 4),
    'trade_avg_loss': round(float(tal), 4),
    'trade_rr': round(float(trr), 2),
    'threshold_buy': THRESHOLD_BUY,
    'max_positions': MAX_POSITIONS,
    'commission': COMMISSION,
    'date_min': int(eq['date'].min()), 'date_max': int(eq['date'].max()),
}

print('\n[4/6] Overfit analysis...')
with open(OUT / 'metrics.json') as f:
    tm = json.load(f)
gaps = [{'fold': f['fold'], 'gap': round(f['auc_train'] - f['auc_test'], 4)} for f in tm['folds']]
feat_names = tm.get('feature_names', [])
suspicious = [f for f in feat_names if 'Chikou' in f]
overfit = {
    'auc_gaps': gaps,
    'mean_gap': round(sum(g['gap'] for g in gaps) / len(gaps), 4),
    'suspicious_features': suspicious,
    'warning': 'Ichimoku_Chikou uses future data via c.shift(-26) - LOOK-AHEAD LEAK' if suspicious else 'none',
}

print('\n[5/6] Saving...')
eq.to_parquet(OUT / 'equity_curve.parquet', index=False)
if len(tr) > 0: tr.to_parquet(OUT / 'trades.parquet', index=False)
with open(OUT / 'backtest_metrics.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
with open(OUT / 'overfit_analysis.json', 'w', encoding='utf-8') as f:
    json.dump(overfit, f, ensure_ascii=False, indent=2)

print('\n[6/6] Summary')
print('=' * 55)
print(f'  Final equity:   {metrics["final_equity"]:,.0f}')
print(f'  Total return:   {metrics["total_return"]:.2%}')
print(f'  CAGR:           {metrics["cagr"]:.2%}')
print(f'  Max drawdown:   {metrics["max_drawdown"]:.2%}')
print(f'  Sharpe:         {metrics["sharpe"]:.2f}')
print(f'  Sortino:        {metrics["sortino"]:.2f}')
print(f'  Trades:         {metrics["n_trades"]}')
print(f'  Trade winrate:  {metrics["trade_winrate"]:.2%}')
print(f'  Trade RR:       {metrics["trade_rr"]:.2f}')
print('=' * 55)
print(f'⚠️  Mean AUC gap: {overfit["mean_gap"]:.4f}')
print(f'⚠️  Leak: {overfit["warning"]}')
