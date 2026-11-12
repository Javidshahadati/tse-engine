"""Walk-Forward XGBoost training - Step 8 (post-leak-fix)."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import roc_auc_score

OUT = Path('outputs')
MODELS = Path('models'); MODELS.mkdir(exist_ok=True)

THRESHOLD_LABEL = 0.017
THRESHOLD_BUY = 0.60
print('=' * 55)
print('TSE.Engine Trainer - Step 8 (post-leak-fix)')
print('=' * 55)

print('\n[1/6] Loading...')
df = pd.read_parquet(OUT / 'features.parquet')
print(f'  Rows: {len(df):,} | Stocks: {df["symbol"].nunique()}')

print('\n[2/6] Labels...')
df = df.sort_values(['symbol','date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)
pos_rate = df['label'].mean()
print(f'  Rows: {len(df):,} | Pos rate: {pos_rate:.2%}')

with open(OUT / 'summary.json') as f:
    feat_names = json.load(f)['feature_names']
feat_cols = [c for c in feat_names if c in df.columns]
print(f'  Features: {len(feat_cols)}')

print('\n[3/6] Walk-forward folds...')
df = df.sort_values('date').reset_index(drop=True)
udates = sorted(df['date'].unique()); n = len(udates)
bounds = [udates[int(n*p)] for p in [0.5, 0.625, 0.75, 0.875]]
tests = [(bounds[0],bounds[1]),(bounds[1],bounds[2]),(bounds[2],bounds[3]),(bounds[3],udates[-1]+1)]
folds = []
for k,(s,e) in enumerate(tests,1):
    tr = df[df['date']<s].copy(); te = df[(df['date']>=s)&(df['date']<e)].copy()
    folds.append({'fold':k,'train':tr,'test':te})
    print(f'  Fold {k}: train={len(tr):>6,} test={len(te):>6,}')

print('\n[4/6] Training...')
xgb_params = {
    'n_estimators': 150, 'max_depth': 5, 'learning_rate': 0.07,
    'subsample': 0.8, 'colsample_bytree': 0.8, 'reg_lambda': 1.0,
    'tree_method': 'hist', 'objective': 'binary:logistic',
    'eval_metric': 'auc', 'scale_pos_weight': (1-pos_rate)/pos_rate,
    'n_jobs': -1, 'random_state': 42,
}

all_preds, fold_metrics = [], []
for f in folds:
    k = f['fold']; print(f'  Fold {k}...', end=' ', flush=True)
    Xtr, ytr = f['train'][feat_cols].values, f['train']['label'].values
    Xte, yte = f['test'][feat_cols].values, f['test']['label'].values
    m = xgb.XGBClassifier(**xgb_params); m.fit(Xtr, ytr, verbose=False)
    ptr = m.predict_proba(Xtr)[:,1]; pte = m.predict_proba(Xte)[:,1]
    auc_tr = roc_auc_score(ytr, ptr); auc_te = roc_auc_score(yte, pte)
    sig = pte > THRESHOLD_BUY; ns = int(sig.sum())
    if ns > 0:
        sr = f['test']['future_ret_5d'].values[sig]; sl = yte[sig]
        wr = sl.mean(); ar = sr.mean()
        w = sr[sr>0]; ls = sr[sr<=0]
        aw = w.mean() if len(w)>0 else 0
        al = ls.mean() if len(ls)>0 else 0
        rr = abs(aw/al) if al!=0 else 0
    else: wr=ar=aw=al=rr=0
    fm = {'fold':k,'train_size':len(ytr),'test_size':len(yte),
          'auc_train':round(float(auc_tr),4),'auc_test':round(float(auc_te),4),
          'auc_gap':round(float(auc_tr-auc_te),4),
          'n_signals':ns,'signal_rate':round(ns/len(yte),4),
          'winrate':round(float(wr),4),'avg_return':round(float(ar),4),
          'avg_win':round(float(aw),4),'avg_loss':round(float(al),4),
          'rr':round(float(rr),2)}
    fold_metrics.append(fm)
    print(f'AUC={auc_te:.3f} gap={auc_tr-auc_te:.3f} signals={ns} winrate={wr:.1%} RR={rr:.2f}')
    p = f['test'][['symbol','date','close','label','future_ret_5d']].copy()
    p['prob']=pte; p['fold']=k; all_preds.append(p)
    m.save_model(str(MODELS/f'xgb_fold{k}.json'))

print('\n[5/6] Aggregate...')
ap = pd.concat(all_preds, ignore_index=True)
auc_all = roc_auc_score(ap['label'], ap['prob'])
sa = ap[ap['prob']>THRESHOLD_BUY]
if len(sa)>0:
    wr_all = sa['label'].mean(); ar_all = sa['future_ret_5d'].mean()
    w=sa[sa['future_ret_5d']>0]['future_ret_5d']; ls=sa[sa['future_ret_5d']<=0]['future_ret_5d']
    aw=w.mean() if len(w)>0 else 0; al=ls.mean() if len(ls)>0 else 0
    rr_all = abs(aw/al) if al!=0 else 0
else: wr_all=ar_all=rr_all=0

metrics = {
    'step':'8','model':'XGBoost (leak-fixed)',
    'threshold_label':THRESHOLD_LABEL,'threshold_buy':THRESHOLD_BUY,
    'positive_rate':round(float(pos_rate),4),'n_rows':len(df),
    'n_features':len(feat_cols),'feature_names':feat_cols,
    'n_stocks':int(df['symbol'].nunique()),
    'date_min':int(df['date'].min()),'date_max':int(df['date'].max()),
    'auc_overall':round(float(auc_all),4),
    'mean_auc_gap':round(float(np.mean([f['auc_gap'] for f in fold_metrics])),4),
    'n_signals_total':int(len(sa)),
    'winrate_overall':round(float(wr_all),4),
    'avg_return':round(float(ar_all),4),
    'avg_win':round(float(aw),4),'avg_loss':round(float(al),4),
    'rr_overall':round(float(rr_all),2),
    'folds':fold_metrics,
}
with open(OUT/'metrics.json','w',encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print('\n[6/6] Save predictions...')
ap.to_parquet(OUT/'predictions.parquet', index=False)
print(f'  {len(ap):,} rows')

print('\n'+'='*55)
print(f'✅ DONE')
print(f'  AUC overall:    {auc_all:.4f}')
print(f'  Mean AUC gap:   {metrics["mean_auc_gap"]:.4f}')
print(f'  Signals:        {len(sa):,}')
print(f'  Winrate:        {wr_all:.2%}')
print(f'  R:R:            {rr_all:.2f}')
print('='*55)
