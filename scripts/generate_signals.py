"""Step 17.2: production signals - FIXED models/ mkdir."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import lightgbm as lgb
import joblib
from pathlib import Path

OUT = Path('outputs')
PUBLIC = Path('public/data'); PUBLIC.mkdir(parents=True, exist_ok=True)
MODELS = Path('models'); MODELS.mkdir(parents=True, exist_ok=True)  # ← FIX

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
FUND_FEATURES = ['eps_yield', 'pe_relative', 'psr', 'eps_log']
ALL_F = TECH_FEATURES + FUND_FEATURES

THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.65
THRESHOLD_SELL = 0.40

print('=' * 65)
print('PRODUCTION SIGNALS - Step 17.2')
print('=' * 65)

print('\n[1/5] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
with open('data/companies_final.json', 'r', encoding='utf-8') as f:
    companies = {c['symbol']: c for c in json.load(f)}
print(f'  {len(df):,} rows')

print('\n[2/5] Latest per stock...')
latest = df.sort_values('date').groupby('symbol').tail(1).copy()
latest = latest.sort_values('date', ascending=False).reset_index(drop=True)
latest_date = int(latest['date'].max())
print(f'  {len(latest)} stocks | {latest_date}')

print('\n[3/5] Training data...')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
train_df = df.dropna(subset=['future_ret_5d']).copy()

feat_cols = [c for c in ALL_F if c in df.columns]
X_train = train_df[feat_cols].values
y_train = train_df['label'].values
pos_rate = y_train.mean()
print(f'  Train rows: {len(train_df):,} | Features: {len(feat_cols)}')

feats = df.copy()
feats['above20'] = (feats['close'] > feats.groupby('symbol')['close'].transform(lambda x: x.rolling(20).mean())).astype(float)
latest_breadth = float(feats[feats['date'] == latest_date]['above20'].mean())
recent_breadth_5d = feats[feats['date'] >= latest_date - 10].groupby('date')['above20'].mean().tail(5).mean()

if latest_breadth > 0.65 and recent_breadth_5d > 0.55: regime = 'BULL'
elif latest_breadth < 0.35: regime = 'BEAR'
else: regime = 'MIXED'
print(f'  Breadth: {latest_breadth:.1%} | Regime: {regime}')

print('\n[4/5] Train...')
xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': 1, 'random_state': 42,
}
lgb_params = {
    'n_estimators': 300, 'num_leaves': 31, 'max_depth': 6,
    'learning_rate': 0.05, 'min_data_in_leaf': 50,
    'feature_fraction': 0.8, 'bagging_fraction': 0.8, 'bagging_freq': 5,
    'lambda_l2': 1.0, 'objective': 'binary', 'metric': 'auc',
    'is_unbalance': True, 'n_jobs': 1, 'random_state': 42, 'verbose': -1,
}
mx = xgb.XGBClassifier(**xgb_params); mx.fit(X_train, y_train, verbose=False)
print('  XGB trained')
ml = lgb.LGBMClassifier(**lgb_params); ml.fit(X_train, y_train)
print('  LGBM trained')

print('\n[5/5] Predict + save...')
X_latest = latest[feat_cols].values
px = mx.predict_proba(X_latest)[:,1]
pl = ml.predict_proba(X_latest)[:,1]
prob = (px + pl) / 2

WEIGHTS = {'BULL': {'market': 0.90, 'model': 0.10},
           'MIXED': {'market': 0.40, 'model': 0.60},
           'BEAR': {'market': 0.10, 'model': 0.90}}
w = WEIGHTS[regime]

signals = []
for i, row in latest.iterrows():
    sym = row['symbol']
    p = float(prob[i])
    if p >= THRESHOLD_BUY:
        sig = 'BUY'; conf = 'HIGH' if p >= 0.75 else 'MEDIUM'
    elif p <= THRESHOLD_SELL:
        sig = 'SELL'; conf = 'HIGH' if p <= 0.30 else 'MEDIUM'
    else:
        sig = 'HOLD'; conf = 'LOW'
    comp = companies.get(sym, {})
    signals.append({
        'symbol': sym, 'name': comp.get('name', ''),
        'sector': comp.get('industry', ''),
        'signal': sig, 'confidence': conf,
        'prob': round(p, 4), 'close': float(row['close']),
    })

order = {'BUY': 0, 'HOLD': 1, 'SELL': 2}
signals.sort(key=lambda x: (order[x['signal']], -x['prob'] if x['signal']=='BUY' else x['prob']))

from collections import Counter
cnt = Counter(s['signal'] for s in signals)

output = {
    'date': latest_date,
    'generated_at': str(pd.Timestamp.now()),
    'model': {'name': 'TSE.Engine', 'version': '17.2',
              'features': len(feat_cols), 'ensemble': ['XGBoost', 'LightGBM'],
              'threshold_buy': THRESHOLD_BUY, 'threshold_sell': THRESHOLD_SELL},
    'market': {'regime': regime, 'breadth': round(latest_breadth, 4), 'weights': w},
    'summary': {'total': len(signals), 'buy': cnt.get('BUY', 0),
                'hold': cnt.get('HOLD', 0), 'sell': cnt.get('SELL', 0),
                'high_confidence': sum(1 for s in signals if s['confidence'] == 'HIGH')},
    'top_buys': [s for s in signals if s['signal']=='BUY'][:20],
    'signals': signals,
}

out_path = PUBLIC / 'predictions_today.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=1)

joblib.dump(mx, MODELS / 'production_xgb.pkl')
joblib.dump(ml, MODELS / 'production_lgbm.pkl')
with open(MODELS / 'production_meta.json', 'w') as f:
    json.dump({'features': feat_cols, 'thresholds': {
        'label': THRESHOLD_LABEL, 'buy': THRESHOLD_BUY, 'sell': THRESHOLD_SELL
    }}, f, indent=2)

print('\n' + '=' * 65)
print(f'✅ DONE')
print(f'  Date:   {latest_date} | Regime: {regime}')
print(f'  BUY:    {cnt.get("BUY", 0)}')
print(f'  HOLD:   {cnt.get("HOLD", 0)}')
print(f'  SELL:   {cnt.get("SELL", 0)}')
print(f'  High:   {output["summary"]["high_confidence"]}')
print(f'  File:   {out_path} ({out_path.stat().st_size/1024:.0f} KB)')
print('=' * 65)
