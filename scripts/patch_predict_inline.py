from pathlib import Path
p = Path('scripts/train_v3_unified.py')
src = p.read_text(encoding='utf-8')

# Add prediction at end of 20d training (before metrics save)
old_end = '''
metrics = {'horizon': HORIZON, 'n_features': len(feat_cols),
           'excluded_count': len(excluded), 'excluded': excluded,
           'folds': fold_results, 'overall_ic': float(overall_ic),
           'threshold_sweep': thr_results,
           'best': {'up': best['up'], 'down': best['down'], 'f1': best['f1']}}
with open(OUT / f'metrics_v3_{HORIZON}.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)
print(f"✅ DONE {HORIZON}")
'''

new_end = '''
metrics = {'horizon': HORIZON, 'n_features': len(feat_cols),
           'excluded_count': len(excluded), 'excluded': excluded,
           'folds': fold_results, 'overall_ic': float(overall_ic),
           'threshold_sweep': thr_results,
           'best': {'up': best['up'], 'down': best['down'], 'f1': best['f1']}}
with open(OUT / f'metrics_v3_{HORIZON}.json', 'w', encoding='utf-8') as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

# PREDICT today (in same session, using reg_final already in memory)
if HORIZON == '20d':
    print("\nGenerating predictions...")
    from datetime import datetime
    from pathlib import Path as _P
    PUB = _P("public/data"); PUB.mkdir(exist_ok=True, parents=True)
    last_date = int(df['date'].max())
    today_df = df[df['date'] == last_date].copy().reset_index(drop=True)
    X_today = today_df[feat_cols].values.astype(np.float32)
    scores = reg_final.predict(X_today)
    today_df['score'] = scores
    today_df['rank'] = today_df['score'].rank(pct=True) * 100
    result = {}
    for _, r in today_df.iterrows():
        sym = r['symbol'].split('_seg')[0]
        if sym in result: continue
        result[sym] = {
            'symbol': sym,
            'rank_20d': round(float(r['rank']), 1),
            'score_20d': round(float(r['score']), 2),
            'signal_20d': 'UP' if r['rank'] >= 65 else ('DOWN' if r['rank'] <= 35 else 'NEUTRAL'),
            'date': last_date,
        }
    sorted_preds = dict(sorted(result.items(), key=lambda x: -x[1]['rank_20d']))
    with open(PUB / 'predictions_v3.json', 'w', encoding='utf-8') as f:
        json.dump({
            'generated_at': datetime.utcnow().isoformat(),
            'date': last_date,
            'version': 'v3-20d',
            'total': len(sorted_preds),
            'predictions': sorted_preds,
        }, f, ensure_ascii=False, indent=2)
    print(f"✅ Predictions: {len(sorted_preds)} saved")
    for sym, d in list(sorted_preds.items())[:5]:
        print(f"  {sym}: rank={d['rank_20d']} {d['signal_20d']}")

print(f"✅ DONE {HORIZON}")
'''

if old_end in src:
    src = src.replace(old_end, new_end)
    p.write_text(src, encoding='utf-8')
    print("PATCHED")
else:
    print("NO MATCH")
    print("Looking for:", old_end[:200])
