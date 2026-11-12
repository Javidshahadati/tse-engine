"""Walk-Forward XGBoost training - Step 6."""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from pathlib import Path
from sklearn.metrics import (
    roc_auc_score, precision_score, accuracy_score, confusion_matrix
)

OUT = Path('outputs')
MODELS = Path('models'); MODELS.mkdir(exist_ok=True)

THRESHOLD_LABEL = 0.017   # 1.7% net profit
THRESHOLD_BUY = 0.60      # model confidence to take trade

print('=' * 55)
print('TSE.Engine Trainer - Step 6 (XGBoost Walk-Forward)')
print('=' * 55)

# 1. Load features
print('\n[1/6] Loading features...')
df = pd.read_parquet(OUT / 'features.parquet')
print(f'  Rows: {len(df):,} | Stocks: {df["symbol"].nunique()}')

# 2. Create label
print('\n[2/6] Creating labels...')
df = df.sort_values(['symbol', 'date']).reset_index(drop=True)
df['future_ret_5d'] = df.groupby('symbol')['close'].shift(-5) / df['close'] - 1
df['label'] = (df['future_ret_5d'] > THRESHOLD_LABEL).astype(int)
df = df.dropna(subset=['future_ret_5d']).reset_index(drop=True)

pos_rate = df['label'].mean()
print(f'  Rows after label: {len(df):,}')
print(f'  Positive rate: {pos_rate:.2%}')
print(f'  Date: {int(df["date"].min())} -> {int(df["date"].max())}')

# 3. Feature columns
with open(OUT / 'summary.json') as f:
    feat_names = json.load(f)['feature_names']
feat_cols = [c for c in feat_names if c in df.columns]
print(f'  Features used: {len(feat_cols)}')

# 4. Walk-Forward folds
print('\n[3/6] Setting up 4 walk-forward folds...')
df = df.sort_values('date').reset_index(drop=True)
unique_dates = sorted(df['date'].unique())
n = len(unique_dates)
fold_boundaries = [unique_dates[int(n * p)] for p in [0.5, 0.625, 0.75, 0.875]]
fold_tests = [
    (fold_boundaries[0], fold_boundaries[1]),
    (fold_boundaries[1], fold_boundaries[2]),
    (fold_boundaries[2], fold_boundaries[3]),
    (fold_boundaries[3], unique_dates[-1] + 1),
]

folds = []
for k, (test_start, test_end) in enumerate(fold_tests, 1):
    train_mask = df['date'] < test_start
    test_mask = (df['date'] >= test_start) & (df['date'] < test_end)
    train_df = df[train_mask].copy()
    test_df = df[test_mask].copy()
    folds.append({'fold': k, 'train': train_df, 'test': test_df,
                  'test_start': int(test_start), 'test_end': int(test_end)})
    print(f'  Fold {k}: train={len(train_df):>6,} test={len(test_df):>6,} '
          f'({test_start} -> {test_end})')

# 5. Train XGB per fold
print('\n[4/6] Training XGBoost...')
all_predictions = []
fold_metrics = []

xgb_params = {
    'n_estimators': 150,
    'max_depth': 5,
    'learning_rate': 0.07,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'reg_lambda': 1.0,
    'tree_method': 'hist',
    'objective': 'binary:logistic',
    'eval_metric': 'auc',
    'scale_pos_weight': (1 - pos_rate) / pos_rate,  # handle imbalance
    'n_jobs': -1,
    'random_state': 42,
}

for f in folds:
    k = f['fold']
    print(f'  Fold {k}...', end=' ', flush=True)
    X_train = f['train'][feat_cols].values
    y_train = f['train']['label'].values
    X_test = f['test'][feat_cols].values
    y_test = f['test']['label'].values

    model = xgb.XGBClassifier(**xgb_params)
    model.fit(X_train, y_train, verbose=False)

    prob_train = model.predict_proba(X_train)[:, 1]
    prob_test = model.predict_proba(X_test)[:, 1]

    auc_train = roc_auc_score(y_train, prob_train)
    auc_test = roc_auc_score(y_test, prob_test)

    # Buy signals: prob > THRESHOLD_BUY
    signal_mask = prob_test > THRESHOLD_BUY
    n_signals = int(signal_mask.sum())

    if n_signals > 0:
        signal_returns = f['test']['future_ret_5d'].values[signal_mask]
        signal_labels = y_test[signal_mask]
        winrate = signal_labels.mean()
        avg_ret = signal_returns.mean()
        wins = signal_returns[signal_returns > 0]
        losses = signal_returns[signal_returns <= 0]
        avg_win = wins.mean() if len(wins) > 0 else 0
        avg_loss = losses.mean() if len(losses) > 0 else 0
        rr = abs(avg_win / avg_loss) if avg_loss != 0 else 0
    else:
        winrate = avg_ret = avg_win = avg_loss = rr = 0.0

    fm = {
        'fold': k,
        'train_size': len(y_train), 'test_size': len(y_test),
        'auc_train': round(auc_train, 4), 'auc_test': round(auc_test, 4),
        'n_signals': n_signals,
        'signal_rate': round(n_signals / len(y_test), 4),
        'winrate': round(float(winrate), 4),
        'avg_return': round(float(avg_ret), 4),
        'avg_win': round(float(avg_win), 4),
        'avg_loss': round(float(avg_loss), 4),
        'rr': round(float(rr), 2),
    }
    fold_metrics.append(fm)
    print(f'AUC={auc_test:.3f} signals={n_signals} winrate={winrate:.1%} RR={rr:.2f}')

    # Save predictions
    preds = f['test'][['symbol', 'date', 'close', 'label', 'future_ret_5d']].copy()
    preds['prob'] = prob_test
    preds['fold'] = k
    all_predictions.append(preds)

    # Save model
    model.save_model(str(MODELS / f'xgb_fold{k}.json'))

# 6. Aggregate metrics
print('\n[5/6] Aggregate metrics...')
all_preds = pd.concat(all_predictions, ignore_index=True)
auc_all = roc_auc_score(all_preds['label'], all_preds['prob'])

signal_all = all_preds[all_preds['prob'] > THRESHOLD_BUY]
if len(signal_all) > 0:
    winrate_all = signal_all['label'].mean()
    avg_ret_all = signal_all['future_ret_5d'].mean()
    wins_a = signal_all[signal_all['future_ret_5d'] > 0]['future_ret_5d']
    losses_a = signal_all[signal_all['future_ret_5d'] <= 0]['future_ret_5d']
    avg_win_all = wins_a.mean() if len(wins_a) > 0 else 0
    avg_loss_all = losses_a.mean() if len(losses_a) > 0 else 0
    rr_all = abs(avg_win_all / avg_loss_all) if avg_loss_all != 0 else 0
else:
    winrate_all = avg_ret_all = rr_all = 0.0

metrics = {
    'step': '6',
    'model': 'XGBoost',
    'threshold_label': THRESHOLD_LABEL,
    'threshold_buy': THRESHOLD_BUY,
    'positive_rate': round(float(pos_rate), 4),
    'n_rows': len(df),
    'n_features': len(feat_cols),
    'n_stocks': int(df['symbol'].nunique()),
    'date_min': int(df['date'].min()),
    'date_max': int(df['date'].max()),
    'auc_overall': round(float(auc_all), 4),
    'n_signals_total': int(len(signal_all)),
    'winrate_overall': round(float(winrate_all), 4),
    'avg_return': round(float(avg_ret_all), 4),
    'avg_win': round(float(avg_win_all), 4),
    'avg_loss': round(float(avg_loss_all), 4),
    'rr_overall': round(float(rr_all), 2),
    'folds': fold_metrics,
}

with open(OUT / 'metrics.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

# 7. Save predictions
print('\n[6/6] Saving predictions...')
all_preds.to_parquet(OUT / 'predictions.parquet', index=False)
print(f'  predictions.parquet: {len(all_preds):,} rows')

print('\n' + '=' * 55)
print('✅ TRAINING DONE')
print('=' * 55)
print(f'  AUC (overall):  {auc_all:.4f}')
print(f'  Signals total:  {len(signal_all):,}')
print(f'  Winrate:        {winrate_all:.2%}')
print(f'  Avg return:     {avg_ret_all:.2%}')
print(f'  R:R:            {rr_all:.2f}')
print('=' * 55)
print('\nFold breakdown:')
for fm in fold_metrics:
    print(f'  Fold {fm["fold"]}: AUC={fm["auc_test"]:.3f} '
          f'signals={fm["n_signals"]} winrate={fm["winrate"]:.1%} RR={fm["rr"]:.2f}')
