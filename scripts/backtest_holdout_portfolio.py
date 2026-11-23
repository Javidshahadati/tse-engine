#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


def simulate(frame, horizon, initial_capital, max_positions, threshold):
    d = frame[frame.horizon == horizon].copy()

    for col in ("date", "probability", "target_return"):
        d[col] = pd.to_numeric(d[col], errors="coerce")

    d = d.dropna(
        subset=["date", "probability", "target_return"]
    )
    d["date"] = d.date.astype("int64")
    d["symbol"] = d.symbol.astype(str)

    if d.empty:
        raise RuntimeError(f"H{horizon}: no valid predictions")

    if d.duplicated(["date", "symbol"]).any():
        raise RuntimeError(f"H{horizon}: duplicate symbol/date rows")

    dates = np.array(sorted(d.date.unique()), dtype=np.int64)
    grouped = {
        int(day): part.sort_values(
            ["probability", "symbol"],
            ascending=[False, True]
        )
        for day, part in d.groupby("date")
    }

    cash = float(initial_capital)
    positions = []
    trades = []
    daily = []
    peak = float(initial_capital)
    max_dd = 0.0

    for i, day in enumerate(dates):

        # Settle positions at their scheduled exit session.
        remaining = []

        for pos in positions:
            if pos["exit_i"] <= i:
                proceeds = pos["capital"] * (
                    1.0 + pos["net_return"]
                )
                pnl = proceeds - pos["capital"]
                cash += proceeds

                trades.append({
                    "horizon": horizon,
                    "symbol": pos["symbol"],
                    "signal_date": pos["signal_date"],
                    "exit_date": int(day),
                    "probability": pos["probability"],
                    "capital_rial": pos["capital"],
                    "net_return_pct": pos["net_return"] * 100,
                    "pnl_rial": pnl,
                })
            else:
                remaining.append(pos)

        positions = remaining

        # Do not open new positions in the final H dates:
        # every selected position must mature inside the holdout.
        opened = 0

        if i + horizon < len(dates):
            available = max_positions - len(positions)
            active = {p["symbol"] for p in positions}
            candidates = grouped.get(int(day))

            if available > 0 and candidates is not None:
                candidates = candidates[
                    (candidates.probability >= threshold) &
                    (~candidates.symbol.isin(active))
                ]

                equity_basis = cash + sum(
                    p["capital"] for p in positions
                )
                slot_budget = equity_basis / max_positions

                for row in candidates.itertuples(index=False):
                    if opened >= available:
                        break

                    if cash < slot_budget * 0.999:
                        break

                    ret = float(row.target_return)

                    if not np.isfinite(ret) or ret <= -1:
                        continue

                    size = min(slot_budget, cash)
                    if size <= 0:
                        break

                    cash -= size

                    positions.append({
                        "symbol": str(row.symbol),
                        "signal_date": int(day),
                        "exit_i": i + horizon,
                        "probability": float(row.probability),
                        "capital": size,
                        "net_return": ret,
                    })

                    active.add(str(row.symbol))
                    opened += 1

        # Open positions are recorded at cost, not market value.
        equity = cash + sum(p["capital"] for p in positions)
        peak = max(peak, equity)
        max_dd = min(max_dd, equity / peak - 1)

        market = grouped.get(int(day))
        market_mean = (
            float(market.target_return.mean())
            if market is not None else None
        )

        daily.append({
            "date": int(day),
            "cash_rial": cash,
            "open_positions": len(positions),
            "new_positions": opened,
            "equity_at_cost_rial": equity,
            "universe_mean_return_pct": (
                market_mean * 100 if market_mean is not None else None
            ),
        })

    if positions:
        raise RuntimeError(
            f"H{horizon}: unsettled positions remain at end"
        )

    t = pd.DataFrame(trades)
    q = pd.DataFrame(daily)

    final_equity = cash
    total_return = final_equity / initial_capital - 1
    years = len(dates) / 252
    cagr = (
        (final_equity / initial_capital) ** (1 / years) - 1
        if years > 0 else None
    )

    if len(t):
        win_rate = float((t.net_return_pct > 0).mean() * 100)
        avg_ret = float(t.net_return_pct.mean())
        median_ret = float(t.net_return_pct.median())
        total_pnl = float(t.pnl_rial.sum())
        best = float(t.net_return_pct.max())
        worst = float(t.net_return_pct.min())
    else:
        win_rate = avg_ret = median_ret = None
        total_pnl = best = worst = None

    signal_dates = (
        sorted(t.signal_date.unique()) if len(t) else []
    )

    benchmark = []
    for day in signal_dates:
        g = grouped.get(int(day))
        if g is not None and len(g):
            benchmark.append(float(g.target_return.mean()))

    report = {
        "horizon_sessions": horizon,
        "initial_capital_rial": initial_capital,
        "final_equity_rial": round(final_equity, 2),
        "net_profit_rial": round(final_equity - initial_capital, 2),
        "total_return_pct": total_return * 100,
        "cagr_pct": cagr * 100 if cagr is not None else None,
        "realized_only_max_drawdown_pct": max_dd * 100,
        "trade_count": len(t),
        "win_rate_pct": win_rate,
        "mean_trade_net_return_pct": avg_ret,
        "median_trade_net_return_pct": median_ret,
        "best_trade_pct": best,
        "worst_trade_pct": worst,
        "total_realized_pnl_rial": total_pnl,
        "average_open_positions": (
            float(q.open_positions.mean()) if len(q) else 0
        ),
        "max_positions": max_positions,
        "signal_threshold": threshold,
        "trading_dates": len(dates),
        "start_date": int(dates[0]),
        "end_date": int(dates[-1]),
        "benchmark_universe_mean_pct": (
            float(np.mean(benchmark) * 100) if benchmark else None
        ),
        "cost_note": (
            "Target already includes assumed 0.2% round-trip cost; "
            "no second deduction."
        ),
        "drawdown_note": (
            "Cost-basis / realized-only drawdown. "
            "No daily mark-to-market prices were available."
        ),
    }

    return report, t, q


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--out", default="portfolio_results")
    p.add_argument("--initial-capital", type=float, default=100_000_000)
    p.add_argument("--max-positions", type=int, default=10)
    p.add_argument("--threshold", type=float, default=0.60)
    a = p.parse_args()

    if a.initial_capital <= 0 or a.max_positions < 1:
        raise ValueError("Invalid capital or max positions")

    if not 0 < a.threshold < 1:
        raise ValueError("Invalid probability threshold")

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    frame = pd.read_csv(a.input)
    reports = {}
    trades_all = []
    daily_all = []

    for h in (20, 40, 60):
        print(f"\\n========== H{h} ==========", flush=True)

        report, trades, daily = simulate(
            frame,
            h,
            a.initial_capital,
            a.max_positions,
            a.threshold,
        )

        reports[str(h)] = report
        trades_all.append(trades)
        daily_all.append(daily)

        print(json.dumps(
            report, ensure_ascii=False, indent=2
        ), flush=True)

    pd.concat(trades_all, ignore_index=True).to_csv(
        out / "portfolio_trades.csv", index=False
    )

    pd.concat(daily_all, ignore_index=True).to_csv(
        out / "portfolio_daily.csv", index=False
    )

    result = {
        "simulation": "holdout_capital_constrained_portfolio",
        "holdout_only": True,
        "initial_capital_rial": a.initial_capital,
        "max_positions": a.max_positions,
        "probability_threshold": a.threshold,
        "position_sizing": "Equal 10% slots, limited by available cash",
        "execution": (
            "Signal after close[t], entry open[t+1], "
            "exit after H market sessions"
        ),
        "limitations": [
            "No daily mark-to-market prices in prediction file.",
            "Drawdown is cost-basis / realized-only.",
            "A common market calendar is assumed for holding duration.",
            "Corporate-action point-in-time adjustment is unverified.",
            "Survivorship bias remains unresolved.",
            "Research only; not a live trading recommendation."
        ],
        "horizons": reports,
    }

    (out / "portfolio_backtest_report.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\\nPORTFOLIO BACKTEST COMPLETE", flush=True)


if __name__ == "__main__":
    main()
