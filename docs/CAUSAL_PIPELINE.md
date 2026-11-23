# Causal OHLCV research pipeline

This pipeline is isolated from the existing production/dashboard flow.

## Dataset

Use the verified 604-symbol, 1,842,402-row adjusted OHLCV dataset.
Preferred local input: `data/ohlc_full.json.gz`. The builder also accepts a
directory containing the six non-overlapping `*.json.gz` chunks. It rejects
overlapping symbols and duplicate dates rather than silently overwriting data.

The data file itself is not uploaded by these scripts. Place it locally or
pass its path to the builder.

## Build

`python scripts/build_features_causal.py --input data/ohlc_full.json.gz`

Or pass the directory containing the six chunks. The builder sorts each symbol
by ascending date, keeps all valid history, creates technical/price-action and
causal RTM features, preserves warm-up NaNs, and excludes undated fundamentals.

## Evaluate

`python scripts/train_walk_forward_causal.py --horizon 5 --round-trip-cost 0.03`

The cost is only an example. Supply a verified round-trip cost for the strategy.
The label is positive only when net forward return exceeds the configured
threshold. Training rows are purged unless their future label endpoint is
strictly before the test start. The script writes OOF predictions, fold models
and metrics; it does not publish production signals.

## Limitations

Adjusted-price methodology, point-in-time fundamentals, survivorship controls,
liquidity, execution, price limits and realistic fills still require separate
validation. OOF metrics do not guarantee future profitability.
