"""V3 Final - filter + risk + balanced 3-class"""
import json, os
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.utils.class_weight import compute_class_weight
from scipy.stats import spearmanr

OUT = Path("javid_v3")
COMMISSION = 0.008; SLIPPAGE = 0.005; COST = COMMISSION + 2*SLIPPAGE
MAX_FUT = 2.0; MIN_FUT = -0.80

def prepare(horizon):
    days = int(horizon.replace('d', ''))
    df = pd.read_parquet(OUT / 'features_v3_20d.parquet')
    df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
    df['future_ret'] = df.groupby('symbol')['close'].shift(-days) / df['close'] - 1
    df = df.dropna(subset=['future_ret']).reset_index(drop=True)
    # FILTER 1: split bug
    before = len(df)
    df = df[(df['future_ret'] <= MAX_FUT) & (df['future_ret'] >= MIN_FUT)].reset_index(drop=True)
    print(f"  [{horizon}] Split filter: {before:,} -> {len(df):,}")
    # FILTER 2: liquidity (min volume_ratio > 0.1)
    if 'Volume_ratio' in df.columns:
        before = len(df)
        df = df[df['Volume_ratio'] > 0.1].reset_index(drop=True)
        print(f"  [{horizon}] Liquidity filter: {before:,} -> {len(df):,}")
    df['rank_pct'] = df.groupby('date')['future_ret'].rank(pct=True) * 100
    with open(OUT / 'summary_v3_20d.json') as f:
        feat_cols = [c for c in json.load(f)['feature_names'] if c in df.columns]
    return df, feat_cols

def run(horizon):
    df, feat_cols = prepare(horizon)
    df = df.sort_values('date').reset_index(drop=True)
    udates = sorted(df['date'].unique()); n = len(udates)
    split = udates[int(n*0.7)]
    tr = df[df['date'] < split]; te = df[df['date'] >= split].copy()

    # REGRESSION (برای backtest)
    reg = xgb.XGBRegressor(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist', n_jobs=-1, random_state=42)
    reg.fit(tr[feat_cols].values, tr['rank_pct'].values,
            sample_weight=(np.abs(tr['rank_pct'].values-50)/50+0.3), verbose=False)
    te['score'] = reg.predict(te[feat_cols].values)
    ic, _ = spearmanr(te['score'], te['rank_pct'])

    # 3-CLASS با class_weight
    y_tr = np.where(tr['rank_pct'] >= 65, 2, np.where(tr['rank_pct'] <= 35, 0, 1))
    y_te = np.where(te['rank_pct'] >= 65, 2, np.where(te['rank_pct'] <= 35, 0, 1))
    cw = compute_class_weight('balanced', classes=np.array([0,1,2]), y=y_tr)
    sample_w = np.array([cw[y] for y in y_tr])
    clf = xgb.XGBClassifier(n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, tree_method='hist',
        objective='multi:softprob', num_class=3, n_jobs=-1, random_state=42)
    clf.fit(tr[feat_cols].values, y_tr, sample_weight=sample_w, verbose=False)
    p_clf = clf.predict(te[feat_cols].values)
    f1 = f1_score(y_te, p_clf, average='macro'); acc = (p_clf == y_te).mean()

    # BACKTEST top-N
    print(f"\n[{horizon}] Test {len(te):,} | IC={ic:.4f} | F1={f1:.4f} | Acc={acc:.4f}")
    bt = {}
    for top in [0.10, 0.20, 0.30]:
        te['rank_in_day'] = te.groupby('date')['score'].rank(pct=True, ascending=False)
        picks = te[te['rank_in_day'] <= top]
        if len(picks) == 0: continue
        gross = picks['future_ret'].mean(); net = gross - COST
        hit = (picks['future_ret'] > 0).mean()
        best = picks['future_ret'].max(); worst = picks['future_ret'].min()
        print(f"  Top {int(top*100)}%: n={len(picks):,} net={net:+.2%} hit={hit:.1%} best={best:+.2%} worst={worst:+.2%}")
        bt[f'top_{int(top*100)}'] = {'n': len(picks), 'gross': float(gross), 'net': float(net),
                                       'hit': float(hit), 'best': float(best), 'worst': float(worst)}
    mkt = te.groupby('date')['future_ret'].mean().mean()
    print(f"  Market: {mkt:+.2%}")
    bt['market'] = float(mkt)
    return {'horizon': horizon, 'ic': float(ic), 'f1': float(f1), 'acc': float(acc), 'backtest': bt}

res = {h: run(h) for h in ['20d', '60d']}
with open(OUT / 'final_v3.json', 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
print("\n✅ DONE")
