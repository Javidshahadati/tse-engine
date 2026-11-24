# Causal OHLCV pipeline — authoritative 586-symbol version

The pipeline is isolated from production and the existing V1 backtest.

## Inputs

- OHLC source: TSE_FINAL/processing.sqlite, table clean
  with columns symbol,d,o,h,l,c,v.
- Universe and targets: TSE_FINAL_READY/final_training.sqlite,
  table dataset with symbol,date,target_20,target_40,target_60.

The dataset table is the sole authority for the app universe. The builder
requires exactly 586 symbols. The additional 18 symbols in the 604-symbol
chunk source must not be included.

Both SQLite files are opened read-only. The builder requires every
authoritative target key to match one OHLC feature row. Missing or duplicate
keys abort the build.

## Build

    python scripts/build_features_causal.py --ohlc-sqlite /storage/emulated/0/Download/TSE_FINAL/processing.sqlite --targets-sqlite /storage/emulated/0/Download/TSE_FINAL_READY/final_training.sqlite

## Train all horizons

    python scripts/train_walk_forward_causal.py --input outputs/features_causal_586.parquet --horizons 20 40 60

H20, H40 and H60 are trained independently in one invocation. Each horizon
has a separate output folder, models, OOF predictions and metrics.

The trainer reads the validated target columns directly. It does not
recalculate returns from OHLC and does not deduct transaction costs again.
The targets already include the validated 0.2% round-trip deduction.

Training rows are purged unless their target exit date is strictly before
the test fold start. This is research evaluation, not production training.

## Safety

- V1 backtest files and results are not changed.
- main and production/dashboard files are not changed.
- SQLite source databases are read-only.
- The universe remains exactly 586 symbols.
- Point-in-time corporate-action adjustment, survivorship, liquidity,
  execution and price-limit safety still require independent validation.
- OOF metrics do not guarantee future profitability.
