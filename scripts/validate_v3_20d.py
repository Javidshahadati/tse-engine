#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse, json, os, sys, time
import numpy as np
import pandas as pd
import lightgbm as lgb

COST = 0.023
HORIZON = 20
MIN_STOCKS = 30
FUND_COLS = ["eps_yield", "pe_relative", "eps_to_sector"]
META_PREFIX = ("future_", "label", "rank", "weight", "ret_fwd")
META_COLS = {"date", "symbol", "close", "open", "high", "low", "volume"}


def load_dataset(path):
    if not os.path.exists(path):
        sys.exit("DATA FILE NOT FOUND: " + path)
    df = pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path)
    ren = {}
    for c in df.columns:
        lc = c.lower()
        if lc in ("date", "dt") and c != "date":
            ren[c] = "date"
        if lc in ("symbol", "sym", "ticker", "inscode", "series", "id") and "symbol" not in ren.values() and c != "symbol":
            ren[c] = "symbol"
    df = df.rename(columns=ren)
    for need in ("date", "symbol"):
        if need not in df.columns:
            sys.exit("MISSING COLUMN " + need + " | " + str(list(df.columns)[:15]))
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    if "future_ret_20d" not in df.columns:
        if "close" not in df.columns:
            sys.exit("no future_ret_20d and no close")
        df["future_ret_20d"] = df.groupby("symbol")["close"].shift(-HORIZON) / df["close"] - 1
    df = df.dropna(subset=["future_ret_20d"]).reset_index(drop=True)
    return df


def get_features(df):
    feats = []
    for c in df.columns:
        if c in META_COLS or c.startswith(META_PREFIX):
            continue
        if pd.api.types.is_numeric_dtype(df[c]):
            feats.append(c)
    return feats


def feature_groups(feats):
    fund = [c for c in feats if c in FUND_COLS]
    sector = [c for c in feats if c.startswith("sector_") or c.startswith("stock_vs_sector")]
    weekly = [c for c in feats if c.startswith("weekly_")]
    return fund, sector, weekly


def add_labels(df):
    g = df.groupby("date")["future_ret_20d"]
    df["rank_pct"] = g.rank(pct=True) * 100.0
    df["weight"] = (df["rank_pct"] - 50).abs() / 50.0 + 0.3
    return df


def make_folds(dates, n_folds, min_train_frac, gap):
    n = len(dates)
    start = int(n * min_train_frac)
    edges = np.linspace(start, n, n_folds + 1).astype(int)
    folds = []
    for i in range(n_folds):
        a, b = edges[i], edges[i + 1]
        train_end = max(a - gap, 0)
        folds.append((dates[:train_end], dates[a:b]))
    return folds


def run_cv(df, feats, gap, n_folds, min_train_frac, train_frac, shuffle=False, seed=42):
    dates = np.sort(df["date"].unique())
    folds = make_folds(dates, n_folds, min_train_frac, gap)
    rng = np.random.RandomState(seed)
    out = []
    for k, (tr_d, te_d) in enumerate(folds, 1):
        tr = df[df["date"].isin(tr_d)]
        te = df[df["date"].isin(te_d)]
        if train_frac < 1.0:
            tr = tr.sample(frac=train_frac, random_state=seed)
        y = tr["rank_pct"].values.copy()
        if shuffle:
            rng.shuffle(y)
        model = lgb.LGBMRegressor(
            n_estimators=300, learning_rate=0.05, num_leaves=63,
            min_child_samples=200, subsample=0.7, subsample_freq=1,
            colsample_bytree=0.7, reg_lambda=5.0, n_jobs=-1, verbose=-1,
            random_state=seed)
        model.fit(tr[feats].astype("float32"), y, sample_weight=tr["weight"].values)
        pred = model.predict(te[feats].astype("float32"))
        flags = [c for c in ("IsLimitUp", "IsLimitDown") if c in te.columns]
        o = te[["date", "symbol", "future_ret_20d"] + flags].copy()
        o["pred"] = pred
        o["fold"] = k
        out.append(o)
        print("    fold", k, "train=", len(tr), "test=", len(te), flush=True)
    return pd.concat(out, ignore_index=True)


def date_stats(oos):
    oos = oos.copy()
    n = oos.groupby("date")["pred"].transform("size")
    oos = oos[n >= MIN_STOCKS]
    if oos.empty:
        return None
    g = oos.groupby("date")
    pr = g["pred"].rank(pct=True)
    yr = g["future_ret_20d"].rank(pct=True)
    pc = pr - pr.groupby(oos["date"]).transform("mean")
    yc = yr - yr.groupby(oos["date"]).transform("mean")
    num = (pc * yc).groupby(oos["date"]).sum()
    den = np.sqrt((pc ** 2).groupby(oos["date"]).sum() * (yc ** 2).groupby(oos["date"]).sum())
    ic = (num / den).dropna()
    dec = np.clip(np.ceil(pr * 10).astype(int) - 1, 0, 9)
    ret = oos["future_ret_20d"]
    top = ret[dec == 9].groupby(oos["date"][dec == 9]).mean()
    bot = ret[dec == 0].groupby(oos["date"][dec == 0]).mean()
    uni = ret.groupby(oos["date"]).mean()
    return pd.DataFrame({"ic": ic, "top": top, "bot": bot, "uni": uni}).dropna()


def summarize(oos):
    d = date_stats(oos)
    if d is None or len(d) < 10:
        return {"error": "not enough data"}
    no = d.iloc[::HORIZON]
    ic_mean, ic_std = d["ic"].mean(), d["ic"].std()
    t_no = no["ic"].mean() / (no["ic"].std() / np.sqrt(len(no))) if len(no) > 2 else np.nan
    excess = (no["top"] - no["uni"]).mean()
    return {
        "dates": int(len(d)),
        "IC_mean": round(float(ic_mean), 4),
        "ICIR": round(float(ic_mean / ic_std), 3) if ic_std > 0 else None,
        "IC_pos_rate": round(float((d["ic"] > 0).mean()), 3),
        "IC_tstat_nonoverlap": round(float(t_no), 2),
        "top_decile_ret_20d": round(float(no["top"].mean()), 4),
        "universe_ret_20d": round(float(no["uni"].mean()), 4),
        "top_minus_bottom": round(float((no["top"] - no["bot"]).mean()), 4),
        "top_excess_gross": round(float(excess), 4),
        "top_excess_net_cost": round(float(excess - COST), 4),
    }


def survivorship_check(df):
    last = df.groupby("symbol")["date"].max()
    gmax = df["date"].max()
    dead = (last < gmax - pd.Timedelta(days=60)).mean()
    first = df.groupby("symbol")["date"].min()
    return {
        "series": int(len(last)),
        "share_ended_before_last_60d": round(float(dead), 4),
        "share_started_after_2010": round(float((first > "2010-01-01").mean()), 4),
    }


def verdict(res):
    msgs = []
    base = res.get("baseline_purged", {}).get("IC_mean")
    nop = res.get("no_purge", {}).get("IC_mean")
    nofund = res.get("no_fundamental", {}).get("IC_mean")
    shuf = res.get("shuffled_labels", {}).get("IC_mean")
    net = res.get("baseline_purged", {}).get("top_excess_net_cost")
    tstat = res.get("baseline_purged", {}).get("IC_tstat_nonoverlap")
    if base is None:
        return ["baseline not run"]
    if nop is not None and nop > 0 and (nop - base) / nop > 0.2:
        msgs.append("WARN purge: IC dropped %s -> %s (boundary leakage)" % (nop, base))
    if nofund is not None and base > 0 and (base - nofund) / base > 0.3:
        msgs.append("ALERT: without fundamentals IC %s -> %s (look-ahead suspected)" % (base, nofund))
    if shuf is not None and abs(shuf) > 0.01:
        msgs.append("ALERT: shuffled labels IC=%s (pipeline bug)" % shuf)
    if tstat is not None and tstat < 2:
        msgs.append("WARN: t-stat nonoverlap=%s (<2)" % tstat)
    if net is not None and net <= 0:
        msgs.append("FAIL: net excess after cost %s (not tradable)" % net)
    if not msgs:
        msgs.append("OK: no warnings. Still check survivorship manually.")
    return msgs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="javid_v3/features_v3_20d.parquet")
    ap.add_argument("--out", default="javid_v3/validation_v3_20d.json")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--gap", type=int, default=HORIZON + 5)
    ap.add_argument("--min-train-frac", type=float, default=0.4)
    ap.add_argument("--train-frac", type=float, default=0.5)
    ap.add_argument("--only", default="")
    a = ap.parse_args()

    t0 = time.time()
    df = add_labels(load_dataset(a.data))
    feats = get_features(df)
    try:
        with open('javid_v3/summary_v3_20d.json') as _f:
            _names = json.load(_f)['feature_names']
        feats = [c for c in _names if c in df.columns]
    except Exception as _e:
        print('summary not found, auto features:', _e)
    fund, sector, weekly = feature_groups(feats)
    print("Rows:", len(df), "| Symbols:", df["symbol"].nunique(), "| Features:", len(feats))
    print("  fund=", fund, "| sector=", len(sector), "| weekly=", len(weekly))

    def drop(cols):
        return [c for c in feats if c not in cols]

    configs = {
        "baseline_purged": dict(feats=feats, gap=a.gap, shuffle=False),
        "no_purge": dict(feats=feats, gap=0, shuffle=False),
        "no_fundamental": dict(feats=drop(fund), gap=a.gap, shuffle=False),
        "no_sector": dict(feats=drop(sector), gap=a.gap, shuffle=False),
        "no_weekly": dict(feats=drop(weekly), gap=a.gap, shuffle=False),
        "no_fund_no_sector": dict(feats=drop(fund + sector), gap=a.gap, shuffle=False),
        "shuffled_labels": dict(feats=feats, gap=a.gap, shuffle=True),
    }
    if a.only:
        keep = set(a.only.split(","))
        configs = {k: v for k, v in configs.items() if k in keep}

    results, base_oos = {}, None
    for name, cfg in configs.items():
        print("RUN", name, "features=", len(cfg["feats"]), "gap=", cfg["gap"], flush=True)
        oos = run_cv(df, cfg["feats"], cfg["gap"], a.folds, a.min_train_frac, a.train_frac, cfg["shuffle"])
        results[name] = summarize(oos)
        print("  ->", results[name], flush=True)
        if name == "baseline_purged":
            base_oos = oos

    if base_oos is not None:
        flags = [c for c in ("IsLimitUp", "IsLimitDown") if c in base_oos.columns]
        if flags:
            mask = np.ones(len(base_oos), bool)
            for c in flags:
                mask &= (base_oos[c].fillna(0).values == 0)
            results["baseline_tradable_only"] = summarize(base_oos[mask])
            print("baseline_tradable_only ->", results["baseline_tradable_only"])

    results["survivorship"] = survivorship_check(df)
    print("survivorship ->", results["survivorship"])
    results["verdict"] = verdict(results)
    print("=== VERDICT ===")
    for m in results["verdict"]:
        print(m)

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("saved:", a.out, "| minutes:", round((time.time() - t0) / 60, 1))


if __name__ == "__main__":
    main()
