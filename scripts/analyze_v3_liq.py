
import json, os, time
import numpy as np
import pandas as pd
import lightgbm as lgb

COST = 0.023
COST_STRESS = 0.035
HORIZON = 20
OUT = "javid_v3"


def parse_dates(s):
    if pd.api.types.is_numeric_dtype(s):
        v = s.dropna().astype("int64")
        mx = int(v.max())
        if 19000101 <= mx <= 21001231:
            return pd.to_datetime(s.astype("int64").astype(str), format="%Y%m%d")
        if mx > 10**17:
            return pd.to_datetime(s)
        if mx > 10**11:
            return pd.to_datetime(s, unit="ms")
        if mx > 10**8:
            return pd.to_datetime(s, unit="s")
        raise SystemExit("unknown numeric date format: " + str(mx))
    return pd.to_datetime(s)


def load():
    df = pd.read_parquet(OUT + "/features_v3_20d.parquet")
    print("columns:", list(df.columns), flush=True)
    df["date"] = parse_dates(df["date"])
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    info = {
        "columns": [str(c) for c in df.columns],
        "sample_symbols": [str(s) for s in df["symbol"].drop_duplicates().head(15)],
    }
    value_col = None
    for c in ("value", "Value", "trade_value", "tradeValue", "qTotCap"):
        if c in df.columns:
            value_col = c
            break
    vol_col = None
    for c in ("volume", "Volume", "vol", "Vol", "qTotTran5J"):
        if c in df.columns:
            vol_col = c
            break
    if value_col is not None:
        tv = df[value_col].astype("float64")
        info["liquidity_source"] = value_col
    elif vol_col is not None:
        tv = df[vol_col].astype("float64") * df["close"].astype("float64")
        info["liquidity_source"] = vol_col + " * close"
    else:
        info["error"] = "no volume or value column found"
        with open(OUT + "/liq_info.json", "w") as f:
            json.dump(info, f, indent=1)
        raise SystemExit("no volume/value column; see liq_info.json")
    df["adv60"] = tv.groupby(df["symbol"]).transform(lambda s: s.rolling(60, min_periods=30).mean())
    df["future_ret_20d"] = df.groupby("symbol")["close"].shift(-HORIZON) / df["close"] - 1
    df = df.dropna(subset=["future_ret_20d"]).reset_index(drop=True)
    with open(OUT + "/summary_v3_20d.json") as f:
        names = json.load(f)["feature_names"]
    feats = [c for c in names if c in df.columns]
    df["rank_pct"] = df.groupby("date")["future_ret_20d"].rank(pct=True) * 100
    df["weight"] = (df["rank_pct"] - 50).abs() / 50 + 0.3
    lim = np.zeros(len(df), dtype=bool)
    for c in ("IsLimitUp", "IsLimitDown"):
        if c in df.columns:
            lim |= (df[c].fillna(0).values == 1)
    df["limit"] = lim
    with open(OUT + "/liq_info.json", "w") as f:
        json.dump(info, f, indent=1)
    print("liquidity source:", info["liquidity_source"], flush=True)
    return df, feats


def walk_forward(df, feats, gap=25, n_folds=5, min_train_frac=0.4, train_frac=0.5, seed=42):
    dates = np.sort(df["date"].unique())
    n = len(dates)
    edges = np.linspace(int(n * min_train_frac), n, n_folds + 1).astype(int)
    outs = []
    for k in range(n_folds):
        a, b = edges[k], edges[k + 1]
        tr = df[df["date"].isin(dates[:max(a - gap, 0)])].sample(frac=train_frac, random_state=seed)
        te = df[df["date"].isin(dates[a:b])]
        m = lgb.LGBMRegressor(
            n_estimators=300, learning_rate=0.05, num_leaves=63,
            min_child_samples=200, subsample=0.7, subsample_freq=1,
            colsample_bytree=0.7, reg_lambda=5.0, n_jobs=-1, verbose=-1,
            random_state=seed)
        m.fit(tr[feats].astype("float32"), tr["rank_pct"].values, sample_weight=tr["weight"].values)
        o = te[["date", "symbol", "future_ret_20d", "adv60", "limit"]].copy()
        o["pred"] = m.predict(te[feats].astype("float32"))
        outs.append(o)
        print("  fold", k + 1, "done", flush=True)
    return pd.concat(outs, ignore_index=True)


def ic_mean(x):
    n = x.groupby("date")["pred"].transform("size")
    x = x[n >= 30]
    if x.empty:
        return None
    g = x.groupby("date")
    pr = g["pred"].rank(pct=True)
    yr = g["future_ret_20d"].rank(pct=True)
    pc = pr - pr.groupby(x["date"]).transform("mean")
    yc = yr - yr.groupby(x["date"]).transform("mean")
    num = (pc * yc).groupby(x["date"]).sum()
    den = np.sqrt((pc ** 2).groupby(x["date"]).sum() * (yc ** 2).groupby(x["date"]).sum())
    ic = (num / den).replace([np.inf, -np.inf], np.nan).dropna()
    return round(float(ic.mean()), 4)


def backtest(oos, oos_f, uni_all, n_hold, buffer, min_univ):
    groups = dict(tuple(oos_f.groupby("date")))
    dates = list(pd.to_datetime(np.sort(oos["date"].unique())[::HORIZON]))
    held = set()
    rows = []
    for d in dates:
        x = groups.get(d)
        if x is None or len(x) < min_univ:
            continue
        x = x.sort_values("pred", ascending=False)
        syms = x["symbol"].tolist()
        rank = {s: i for i, s in enumerate(syms)}
        keep = sorted([s for s in held if s in rank and rank[s] < buffer], key=lambda s: rank[s])[:n_hold]
        cand = [s for s in syms if s not in keep][: n_hold - len(keep)]
        new = keep + cand
        turnover = len(set(new) - held) / float(n_hold)
        port = x[x["symbol"].isin(new)]["future_ret_20d"].mean()
        rows.append({
            "date": d, "port": port, "uni": x["future_ret_20d"].mean(),
            "uni_all": uni_all.loc[d], "turnover": turnover, "n_univ": len(x)})
        held = set(new)
    return pd.DataFrame(rows)


def bt_summary(r):
    if len(r) < 5:
        return {"error": "few periods", "periods": int(len(r))}
    net = r["port"] - r["uni"] - r["turnover"] * COST
    net_s = r["port"] - r["uni"] - r["turnover"] * COST_STRESS
    net_all = r["port"] - r["uni_all"] - r["turnover"] * COST
    t = net.mean() / (net.std() / np.sqrt(len(r)))
    return {
        "periods": int(len(r)),
        "median_universe": int(r["n_univ"].median()),
        "avg_turnover": round(float(r["turnover"].mean()), 3),
        "gross_excess_vs_own_universe": round(float((r["port"] - r["uni"]).mean()), 4),
        "net_excess_per_20d": round(float(net.mean()), 4),
        "net_excess_stress_cost_3.5pct": round(float(net_s.mean()), 4),
        "net_excess_vs_full_market": round(float(net_all.mean()), 4),
        "net_t_stat": round(float(t), 2),
        "net_hit_rate": round(float((net > 0).mean()), 3),
        "avg_port_ret_20d": round(float(r["port"].mean()), 4),
    }


def by_year(r):
    net = r["port"] - r["uni"] - r["turnover"] * COST
    yrs = pd.to_datetime(r["date"]).dt.year
    return {int(y): round(float(net[yrs == y].mean()), 4) for y in sorted(set(yrs))}


def main():
    t0 = time.time()
    df, feats = load()
    print("Rows:", len(df), "Features:", len(feats), flush=True)
    oos = walk_forward(df, feats)
    oos["liq_pct"] = oos.groupby("date")["adv60"].rank(pct=True)
    uni_all = oos.groupby("date")["future_ret_20d"].mean()
    variants = {
        "all_raw": np.ones(len(oos), dtype=bool),
        "all_nolimit": (~oos["limit"]).values,
        "liq_top50_nolimit": ((oos["liq_pct"] >= 0.5) & (~oos["limit"])).values,
        "liq_top30_nolimit": ((oos["liq_pct"] >= 0.7) & (~oos["limit"])).values,
    }
    res = {}
    for name, mask in variants.items():
        sub = oos[mask]
        entry = {"rows": int(len(sub)), "IC_mean": ic_mean(sub)}
        for buf in (60, 100):
            r = backtest(oos, sub, uni_all, 30, buf, 60)
            key = "buffer%d" % buf
            entry[key] = bt_summary(r)
            if buf == 100 and len(r) >= 5:
                entry["net_excess_by_year_buffer100"] = by_year(r)
        res[name] = entry
        print(name, json.dumps(entry, ensure_ascii=False), flush=True)
    with open(OUT + "/analysis_v3_20d_liq.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print("minutes:", round((time.time() - t0) / 60, 1))


main()
