"""Step 16: test different BULL weights (70/30 vs 85/15 vs 90/10)."""
import json
import numpy as np
import pandas as pd
from pathlib import Path

OUT = Path('outputs')

# Load pre-trained predictions (from step 14 D_all_4)
preds = pd.read_parquet(OUT / 'predictions.parquet')
feats = pd.read_parquet(OUT / 'features.parquet')

with open(OUT / 'metrics.json') as f:
    best = json.load(f)['aggregate']['best_model']
prob_col = {'xgb':'prob_xgb','lgbm':'prob_lgbm','avg':'prob_avg'}[best]

with open(OUT / 'fold_bounds.json') as f:
    fold_bounds = json.load(f)

# Regime (same as before)
feats['above20'] = (feats['close'] > feats.groupby('symbol')['close'].transform(lambda x: x.rolling(20).mean())).astype(float)
breadth = feats.groupby('date')['above20'].mean()
feats['daily_ret'] = feats.groupby('symbol')['close'].pct_change()
mkt_daily = feats.groupby('date')['daily_ret'].mean()
mkt5d = mkt_daily.rolling(5).sum()
regime_df = pd.DataFrame({'breadth': breadth, 'mkt5d': mkt5d, 'mkt_ret': mkt_daily}).reset_index()
def classify(r):
    if r['breadth'] > 0.65 and r['mkt5d'] > 0.02: return 2
    elif r['breadth'] < 0.35: return 0
    return 1
regime_df['regime'] = regime_df.apply(classify, axis=1)
regime_map = dict(zip(regime_df['date'], regime_df['regime']))
mkt_ret_map = dict(zip(regime_df['date'], regime_df['mkt_ret'].fillna(0)))

COMMISSION = 0.017; SLIPPAGE = 0.015; MAX_RET = 0.25
INIT = 1_000_000; HOLD = 5; TDPY = 252

POS = {'BULL': 10, 'MIXED': 10, 'BEAR': 5}
THR = {'BULL': 0.60, 'MIXED': 0.65, 'BEAR': 0.70}

# ─── سه نسخه وزن ───
CONFIGS = {
    'W70_30': {2:{'m':0.70,'s':0.30}, 1:{'m':0.40,'s':0.60}, 0:{'m':0.10,'s':0.90}},
    'W85_15': {2:{'m':0.85,'s':0.15}, 1:{'m':0.40,'s':0.60}, 0:{'m':0.10,'s':0.90}},
    'W90_10': {2:{'m':0.90,'s':0.10}, 1:{'m':0.40,'s':0.60}, 0:{'m':0.10,'s':0.90}},
}

def met(e_df):
    tr = e_df['equity'].iloc[-1]/INIT - 1
    nd = len(e_df); yr = nd/TDPY
    cagr = (1+tr)**(1/yr)-1 if yr>0 else 0
    dd = (e_df['equity']/e_df['peak']-1).min()
    dm = e_df['ret'].mean(); ds = e_df['ret'].std()
    sh = dm/ds*np.sqrt(TDPY) if ds>0 else 0
    return {'total_ret':round(float(tr),4),'sharpe':round(float(sh),2),'max_dd':round(float(dd),4)}


def run_fold(te, weights):
    te = te.copy()
    te['prob'] = te[prob_col]
    te['fut_capped'] = te['future_ret_5d'].clip(upper=MAX_RET)
    te = te.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)
    ud = sorted(te['date'].unique())
    price_lookup = te.set_index(['symbol','date'])['close'].to_dict()
    grouped = te.groupby('date')

    cash = float(INIT); positions = []; model_equity = {}
    for i,d in enumerate(ud):
        regime = regime_map.get(int(d),1)
        # نام رژیم برای POS/THR
        rname = 'BULL' if regime==2 else ('BEAR' if regime==0 else 'MIXED')
        max_pos = POS[rname]; thresh = THR[rname]; per = INIT/max_pos
        for p in positions:
            cp = price_lookup.get((p['sym'],d))
            if cp: p['mv'] = p['size']*cp/p['entry_price']
        still=[]
        for p in positions:
            if i>=p['exit_idx']:
                cash += p['size']*(1 + p['fr'] - COMMISSION - 2*SLIPPAGE)
            else: still.append(p)
        positions = still
        avail = max_pos - len(positions)
        if avail>0 and d in grouped.groups:
            day = grouped.get_group(d)
            sigs = day[day['prob']>thresh]
            held = {p['sym'] for p in positions}
            new = sigs[~sigs['symbol'].isin(held)]
            for _,r in new.head(avail).iterrows():
                if cash < per*0.1: break
                sz = min(per,cash); cash-=sz
                positions.append({'sym':r['symbol'],'entry_price':float(r['close']),
                                  'exit_idx':i+HOLD,'size':sz,'fr':float(r['fut_capped']),'mv':sz})
        model_equity[int(d)] = cash + sum(p['mv'] for p in positions)
    model_ret = pd.Series(model_equity).pct_change().fillna(0)

    bc = []; eq = INIT
    for d in ud:
        regime = regime_map.get(int(d),1); w = weights[regime]
        mr = mkt_ret_map.get(int(d),0); sr = model_ret.get(int(d),0)
        eq *= (1 + w['m']*mr + w['s']*sr)
        bc.append({'date':int(d),'equity':eq})
    bc = pd.DataFrame(bc); bc['ret'] = bc['equity'].pct_change().fillna(0); bc['peak'] = bc['equity'].cummax()

    mm_eq = INIT; mc = []
    for d in ud:
        mm_eq *= (1 + mkt_ret_map.get(int(d),0))
        mc.append({'date':int(d),'equity':mm_eq})
    mc = pd.DataFrame(mc); mc['ret'] = mc['equity'].pct_change().fillna(0); mc['peak'] = mc['equity'].cummax()

    return met(bc), met(mc)


print('=' * 70)
print('TEST BULL WEIGHTS - Step 16')
print('=' * 70)
print(f'Model: {prob_col}')

all_results = {}
for name, weights in CONFIGS.items():
    print(f'\n─── {name} ───')
    folds_res = []
    for fb in fold_bounds:
        k = fb['fold']; s = fb['test_start']; e = fb['test_end']
        te = preds[(preds['date']>=s)&(preds['date']<e)].copy()
        sm, mm = run_fold(te, weights)
        alpha = round(sm['total_ret'] - mm['total_ret'], 4)
        folds_res.append({'fold':k,'strategy':sm,'benchmark':mm,'alpha':alpha})
        print(f'  Fold {k}: {sm["total_ret"]:+.1%} vs {mm["total_ret"]:+.1%} | {alpha:+.1%}')

    avg_a = round(float(np.mean([r['alpha'] for r in folds_res])),4)
    n_wins = sum(1 for r in folds_res if r['alpha']>0)
    avg_sh = round(float(np.mean([r['strategy']['sharpe'] for r in folds_res])),2)
    all_results[name] = {
        'avg_alpha': avg_a, 'n_wins': n_wins,
        'avg_sharpe': avg_sh, 'folds': folds_res,
    }
    print(f'  → Avg Alpha: {avg_a:+.2%} | Wins: {n_wins}/4 | Sharpe: {avg_sh}')

# Verdict
print('\n' + '=' * 70)
print('SUMMARY:')
print('=' * 70)
for name, r in all_results.items():
    print(f"  {name}: Alpha={r['avg_alpha']:+.2%} | Wins={r['n_wins']}/4 | Sharpe={r['avg_sharpe']}")

best_name = max(all_results, key=lambda k: all_results[k]['avg_alpha'])
print(f"\n🏆 WINNER: {best_name} (Alpha={all_results[best_name]['avg_alpha']:+.2%})")
print('=' * 70)

final = {'step':'16','prob_col':prob_col,'results':all_results,'winner':best_name}
with open(OUT / 'weights_comparison.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)
