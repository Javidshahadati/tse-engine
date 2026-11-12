"""Step 15: A_baseline (64 feat) full backtest - compare to D_all_4."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path('outputs'); MODELS = Path('models_a64'); MODELS.mkdir(exist_ok=True)
THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65

TECH_FEATURES = [
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

print('=' * 65)
print('TEST A_baseline (64 feat) with NEW dropna fix')
print('Compare to D_all_4 (68 feat) alpha=+6.88%')
print('=' * 65)

print('\n[1/5] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
pos_rate = df['label'].mean()
feat_cols = [c for c in TECH_FEATURES if c in df.columns]
print(f'  Rows: {len(df):,} | Features: {len(feat_cols)}')

print('\n[2/5] Folds...')
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]
fold_bounds = []; folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy(); te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    fold_bounds.append({'fold':k,'test_start':int(s),'test_end':int(e)})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')
with open(OUT / 'fold_bounds_a64.json','w') as f:
    json.dump(fold_bounds, f, indent=2)

xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}
lgb_params = {
    'n_estimators': 300, 'num_leaves': 31, 'max_depth': 6,
    'learning_rate': 0.05, 'min_data_in_leaf': 50,
    'feature_fraction': 0.8, 'bagging_fraction': 0.8, 'bagging_freq': 5,
    'lambda_l2': 1.0, 'objective': 'binary', 'metric': 'auc',
    'is_unbalance': True, 'n_jobs': -1, 'random_state': 42, 'verbose': -1,
}

print('\n[3/5] Train A_baseline (64)...')
fold_results = []
for f in folds:
    k = f['fold']
    tr = f['train']; te = f['test']
    Xtr = tr[feat_cols].values; ytr = tr['label'].values
    Xte = te[feat_cols].values; yte = te['label'].values

    mx = xgb.XGBClassifier(**xgb_params); mx.fit(Xtr, ytr, verbose=False)
    px = mx.predict_proba(Xte)[:,1]
    ml = lgb.LGBMClassifier(**lgb_params); ml.fit(Xtr, ytr)
    pl = ml.predict_proba(Xte)[:,1]
    p_avg = (px + pl) / 2

    auc_x = roc_auc_score(yte, px); auc_l = roc_auc_score(yte, pl)
    auc_avg = roc_auc_score(yte, p_avg)
    def wr(p):
        s = p > THRESHOLD_BUY
        return float(yte[s].mean()) if s.sum() > 0 else 0

    fm = {'fold':k,'auc_xgb':round(float(auc_x),4),'auc_lgbm':round(float(auc_l),4),
          'auc_avg':round(float(auc_avg),4),'wr_avg':round(wr(p_avg),4)}
    fold_results.append(fm)
    print(f'  Fold {k}: AUC={auc_avg:.4f} WR={wr(p_avg):.1%}')

    p = te[['symbol','date','close','label','future_ret_5d']].copy()
    p['prob_xgb'] = px; p['prob_lgbm'] = pl; p['prob_avg'] = p_avg; p['fold'] = k
    p.to_parquet(OUT / f'preds_a64_fold{k}.parquet', index=False)

print('\n[4/5] Backtest with smart beta...')
preds = pd.concat([pd.read_parquet(OUT / f'preds_a64_fold{k}.parquet') for k in range(1,5)], ignore_index=True)
feats = pd.read_parquet(OUT / 'features.parquet')

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
WEIGHTS = {2:{'m':0.70,'s':0.30,'n':'BULL'}, 1:{'m':0.40,'s':0.60,'n':'MIXED'}, 0:{'m':0.10,'s':0.90,'n':'BEAR'}}
POS = {'BULL': 10, 'MIXED': 10, 'BEAR': 5}
THR = {'BULL': 0.60, 'MIXED': 0.65, 'BEAR': 0.70}

def met(e_df):
    tr = e_df['equity'].iloc[-1]/INIT - 1
    nd = len(e_df); yr = nd/TDPY
    cagr = (1+tr)**(1/yr)-1 if yr>0 else 0
    dd = (e_df['equity']/e_df['peak']-1).min()
    dm = e_df['ret'].mean(); ds = e_df['ret'].std()
    sh = dm/ds*np.sqrt(TDPY) if ds>0 else 0
    return {'total_ret':round(float(tr),4),'sharpe':round(float(sh),2),'max_dd':round(float(dd),4)}

all_res = []
for fb in fold_bounds:
    k = fb['fold']; s = fb['test_start']; e = fb['test_end']
    te = preds[(preds['date']>=s)&(preds['date']<e)].copy()
    te['prob'] = te['prob_avg']
    te['fut_capped'] = te['future_ret_5d'].clip(upper=MAX_RET)
    te = te.sort_values(['date','prob'], ascending=[True,False]).reset_index(drop=True)
    ud = sorted(te['date'].unique())
    price_lookup = te.set_index(['symbol','date'])['close'].to_dict()
    grouped = te.groupby('date')
    cash = float(INIT); positions = []; model_equity = {}
    for i,d in enumerate(ud):
        regime = regime_map.get(int(d),1); rname = WEIGHTS[regime]['n']
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
        regime = regime_map.get(int(d),1); w = WEIGHTS[regime]
        mr = mkt_ret_map.get(int(d),0); sr = model_ret.get(int(d),0)
        eq *= (1 + w['m']*mr + w['s']*sr)
        bc.append({'date':int(d),'equity':eq})
    bc = pd.DataFrame(bc); bc['ret'] = bc['equity'].pct_change().fillna(0); bc['peak'] = bc['equity'].cummax()

    mm_eq = INIT
    mc = []
    for d in ud:
        mm_eq *= (1 + mkt_ret_map.get(int(d),0))
        mc.append({'date':int(d),'equity':mm_eq})
    mc = pd.DataFrame(mc); mc['ret'] = mc['equity'].pct_change().fillna(0); mc['peak'] = mc['equity'].cummax()

    sm = met(bc); mm = met(mc)
    alpha = round(sm['total_ret'] - mm['total_ret'], 4)
    all_res.append({'fold':k,'strategy':sm,'benchmark':mm,'alpha':alpha})
    print(f'  Fold {k}: {sm["total_ret"]:+.1%} vs {mm["total_ret"]:+.1%} | ALPHA={alpha:+.1%}')

avg_a = round(float(np.mean([r['alpha'] for r in all_res])),4)
n_wins = sum(1 for r in all_res if r['alpha']>0)
avg_sh = round(float(np.mean([r['strategy']['sharpe'] for r in all_res])),2)

print('\n[5/5] Saving...')
final = {
    'step': '15', 'config': 'A_baseline_64feat',
    'avg_alpha': avg_a, 'n_wins': n_wins, 'avg_sharpe': avg_sh,
    'folds': all_res,
    'comparison': {
        'D_all_4_alpha': 0.0688,
        'A_baseline_alpha': avg_a,
        'fundamental_contribution': round(0.0688 - avg_a, 4),
    },
}
with open(OUT / 'backtest_metrics_a64.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print('COMPARISON:')
print(f'  A_baseline (64 feat): Alpha={avg_a:+.2%} (wins {n_wins}/4)')
print(f'  D_all_4    (68 feat): Alpha=+6.88% (wins 2/4)')
print(f'  Fundamental contribution: {0.0688 - avg_a:+.2%}')
print('=' * 65)
