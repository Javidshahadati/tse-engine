"""Ablation test - Step 14.5: which fundamental features leak?"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path('outputs')
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

CONFIGS = {
    'A_baseline': TECH_FEATURES,
    'B_static_only': TECH_FEATURES + ['psr', 'eps_log'],
    'C_dynamic_only': TECH_FEATURES + ['eps_yield', 'pe_relative'],
    'D_all_4': TECH_FEATURES + ['eps_yield', 'pe_relative', 'psr', 'eps_log'],
}

print('=' * 65)
print('ABLATION TEST - Step 14.5')
print('=' * 65)

print('\n[1/4] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,} | Pos: {pos_rate:.2%}')

print('\n[2/4] Folds...')
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]
folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy(); te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')

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

print('\n[3/4] Running 4 configs...')
results = {}
for name, feat_list in CONFIGS.items():
    print(f'\n  ─── {name} ({len(feat_list)} features) ───')
    feat_cols = [c for c in feat_list if c in df.columns]
    missing = [c for c in feat_list if c not in df.columns]
    if missing:
        print(f'  ⚠️  Missing: {missing}')
    
    fold_metrics = []
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

        fold_metrics.append({
            'fold': k,
            'auc_xgb': round(float(auc_x),4), 'auc_lgbm': round(float(auc_l),4),
            'auc_avg': round(float(auc_avg),4),
            'wr_avg': round(wr(p_avg),4),
        })
        print(f'    Fold {k}: XGB={auc_x:.4f} LGBM={auc_l:.4f} AVG={auc_avg:.4f} WR={wr(p_avg):.1%}')

    agg = {
        'auc_xgb': round(float(np.mean([f['auc_xgb'] for f in fold_metrics])),4),
        'auc_lgbm': round(float(np.mean([f['auc_lgbm'] for f in fold_metrics])),4),
        'auc_avg': round(float(np.mean([f['auc_avg'] for f in fold_metrics])),4),
        'wr_avg': round(float(np.mean([f['wr_avg'] for f in fold_metrics])),4),
    }
    results[name] = {'n_features': len(feat_cols), 'aggregate': agg, 'folds': fold_metrics}
    print(f'  AGG: AUC_avg={agg["auc_avg"]:.4f} WR={agg["wr_avg"]:.1%}')

print('\n[4/4] Saving...')
final = {
    'step': '14.5',
    'description': 'ablation study on fundamental features',
    'configs': results,
}
with open(OUT / 'ablation_metrics.json','w',encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print('\n' + '=' * 65)
print('RESULTS:')
print('=' * 65)
for name, r in results.items():
    a = r['aggregate']
    print(f"  {name:20}: AUC={a['auc_avg']:.4f}  WR={a['wr_avg']:.1%}  ({r['n_features']}f)")
print('=' * 65)
print()
print('INTERPRETATION:')
print('  Baseline AUC = 0.6763')
print('  If B (static) ~ 0.72 → static features leak')
print('  If C (dynamic) ~ 0.72 → dynamic EPS features leak')
print('  If both ~ 0.72 → both leak, fundamental approach invalid without historical EPS')
print('  If both ~ 0.676 → combination is what helped (likely noise)')
