"""Backtest with REALISTIC assumptions - Step 8.7."""
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

# ─── REALISTIC parameters ───
THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.70             # بالا بردن آستانه (از 0.60)
COMMISSION = 0.017               # کارمزد رفت و برگشت
SLIPPAGE_PER_SIDE = 0.015        # ۱.۵٪ هر طرف اسلیپیج
MAX_RETURN_PER_TRADE = 0.25      # سقف ۲۵٪ (۴-۵ روز limit up)
MAX_POSITIONS = 5                # کاهش از ۱۰ به ۵ (واقعی‌تر)
INITIAL_CAPITAL = 1_000_000
HOLD_DAYS = 5
TDPY = 252

print('=' * 65)
print('REALISTIC BACKTEST - Step 8.7')
print(f'  THRESHOLD_BUY: {THRESHOLD_BUY} (was 0.60)')
print(f'  SLIPPAGE: {SLIPPAGE_PER_SIDE*2:.1%} round-trip')
print(f'  MAX_RETURN: {MAX_RETURN_PER_TRADE:.0%} cap')
print(f'  MAX_POSITIONS: {MAX_POSITIONS} (was 10)')
print('=' * 65)

print('\n[1/3] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
feat_cols = [c for c in SAFE_FEATURES if c in df.columns]
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,} | Features: {len(feat_cols)}')


def run_backtest(test_df, probs, fold_id):
    test_df = test_df.copy()
    test_df['prob'] = probs
    test_df = test_df.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)

    # ─── Apply cap on future_ret ───
    test_df['fut_ret_capped'] = test_df['future_ret_5d'].clip(upper=MAX_RETURN_PER_TRADE)

    unique_dates = sorted(test_df['date'].unique())
    price_lookup = test_df.set_index(['symbol','date'])['close'].to_dict()
    grouped = test_df.groupby('date')

    cash = float(INITIAL_CAPITAL)
    positions = []
    trades = []
    equity = []
    per_pos = INITIAL_CAPITAL / MAX_POSITIONS

    for i, d in enumerate(unique_dates):
        for pos in positions:
            cp = price_lookup.get((pos['sym'], d))
            if cp is not None and pos['entry_price'] > 0:
                pos['mv'] = pos['size'] * cp / pos['entry_price']

        still = []
        for pos in positions:
            if i >= pos['exit_idx']:
                # ─── Realistic net return ───
                gross = pos['fut_ret']
                slippage = 2 * SLIPPAGE_PER_SIDE
                net = gross - COMMISSION - slippage
                proceeds = pos['size'] * (1 + net)
                cash += proceeds
                trades.append({
                    'fold': fold_id, 'gross': gross, 'net': net,
                    'pnl': proceeds - pos['size'],
                })
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
                    'size': size, 'fut_ret': float(r['fut_ret_capped']),
                    'mv': size,
                })

        pv = cash + sum(p['mv'] for p in positions)
        equity.append({'date': int(d), 'equity': pv})

    eq = pd.DataFrame(equity)
    eq['ret'] = eq['equity'].pct_change().fillna(0)
    total_ret = float(eq['equity'].iloc[-1] / INITIAL_CAPITAL - 1)
    n_days = len(eq); years = n_days / TDPY
    cagr = float((1+total_ret)**(1/years)-1) if years > 0 else 0
    eq['peak'] = eq['equity'].cummax()
    eq['dd'] = eq['equity'] / eq['peak'] - 1
    max_dd = float(eq['dd'].min())
    dm = eq['ret'].mean(); ds = eq['ret'].std()
    sharpe = float(dm/ds*np.sqrt(TDPY)) if ds > 0 else 0

    tr = pd.DataFrame(trades)
    if len(tr) > 0:
        wr = float((tr['net'] > 0).mean())
        ar = float(tr['net'].mean())
        w = tr.loc[tr['net']>0, 'net']; ls = tr.loc[tr['net']<=0, 'net']
        aw = float(w.mean()) if len(w) > 0 else 0
        al = float(ls.mean()) if len(ls) > 0 else 0
        rr = abs(aw/al) if al != 0 else 0
        gross_avg = float(tr['gross'].mean())
    else:
        wr = ar = rr = gross_avg = 0

    return {
        'n_days': n_days, 'n_trades': len(tr),
        'total_return': round(total_ret, 4),
        'cagr': round(cagr, 4),
        'sharpe': round(sharpe, 2),
        'max_dd': round(max_dd, 4),
        'winrate': round(wr, 4),
        'avg_ret_net': round(ar, 4),
        'avg_ret_gross': round(gross_avg, 4),
        'avg_win': round(aw, 4),
        'avg_loss': round(al, 4),
        'rr': round(rr, 2),
        'final_equity': round(float(eq['equity'].iloc[-1]), 2),
    }


print('\n[2/3] Walk-forward per-fold...')
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

all_fold_results = []
for k, (s, e) in enumerate(tests, 1):
    print(f'\n  Fold {k}: {s} -> {e}')
    tr = df[df['date'] < s].copy()
    te = df[(df['date'] >= s) & (df['date'] < e)].copy()

    m = xgb.XGBClassifier(**xgb_params)
    m.fit(tr[feat_cols].values, tr['label'].values, verbose=False)
    prob = m.predict_proba(te[feat_cols].values)[:, 1]
    auc = roc_auc_score(te['label'].values, prob)

    bt = run_backtest(te, prob, k)
    bt['fold'] = k
    bt['auc'] = round(float(auc), 4)
    all_fold_results.append(bt)
    print(f'    AUC={auc:.3f} | trades={bt["n_trades"]} WR={bt["winrate"]:.1%} '
          f'avg_net={bt["avg_ret_net"]:.2%} | Sharpe={bt["sharpe"]:.2f} '
          f'CAGR={bt["cagr"]:.1%} DD={bt["max_dd"]:.1%}')

print('\n[3/3] Saving...')
result = {
    'diagnostic': 'realistic_backtest',
    'params': {
        'threshold_buy': THRESHOLD_BUY,
        'slippage_round_trip': 2*SLIPPAGE_PER_SIDE,
        'max_return_cap': MAX_RETURN_PER_TRADE,
        'max_positions': MAX_POSITIONS,
        'commission': COMMISSION,
    },
    'folds': all_fold_results,
    'verdict': 'OK' if all(f['sharpe'] < 5 for f in all_fold_results) else 'STILL_BUG',
}
with open(OUT / 'backtest_diag.json','w',encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print('SUMMARY:')
for r in all_fold_results:
    print(f"  Fold {r['fold']}: Sharpe={r['sharpe']:>5} CAGR={r['cagr']:>8.1%} "
          f"WR={r['winrate']:.1%} avg_net={r['avg_ret_net']:.2%} trades={r['n_trades']}")
print(f"VERDICT: {result['verdict']}")
print('=' * 65)
print('\nFULL JSON:')
print(json.dumps(result, ensure_ascii=False, indent=2))
