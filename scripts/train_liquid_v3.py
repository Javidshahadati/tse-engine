
import gzip, json, os, time
import numpy as np
import pandas as pd
import lightgbm as lgb

HORIZON = 20
OUT = "javid_v3"
FUND = ["eps_yield", "pe_relative", "eps_to_sector"]
COSTS = [0.015, 0.023, 0.035]
CONFIGS = [(20, 50), (30, 60), (30, 100)]


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


def load_adv():
    with gzip.open("data/ohlc_clean_v3_20d.json.gz", "rt", encoding="utf-8") as f:
        raw = json.load(f)
    parts = []
    for key, st in raw.items():
        r = pd.DataFrame(st["r"])
        if len(r) < 300:
            continue
        r = r.sort_values("d").reset_index(drop=True)
        val = r["c"].astype(float) * r["v"].astype(float)
        adv = val.rolling(60, min_periods=30).mean()
        parts.append(pd.DataFrame({"symbol": key, "date": r["d"].values, "adv60": adv.values}))
    a = pd.concat(parts, ignore_index=True)
    a["date"] = parse_dates(a["date"])
    return a


def load():
    df = pd.read_parquet(OUT + "/features_v3_20d.parquet")
    df["date"] = parse_dates(df["date"])
    df = df.merge(load_adv(), on=["symbol", "date"], how="left")
    with open("data/fundamentals.json", encoding="utf-8") as f:
        fund = json.load(f)
    smap = {k: (v.get("sector", "unknown") if isinstance(v, dict) else "unknown") for k, v in fund.items()}
    df["sector"] = df["symbol"].str.split("_seg").str[0].map(smap).fillna("unknown")
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    df["liq_pct"] = df.groupby("date")["adv60"].rank(pct=True)
    df["future_ret_20d"] = df.groupby("symbol")["close"].shift(-HORIZON) / df["close"] - 1
    df = df.dropna(subset=["future_ret_20d"]).reset_index(drop=True)
    lim = np.zeros(len(df), dtype=bool)
    for c in ("IsLimitUp", "IsLimitDown"):
        if c in df.columns:
            lim |= (df[c].fillna(0).values == 1)
    df["limit"] = lim
    with open(OUT + "/summary_v3_20d.json") as f:
        names = json.load(f)["feature_names"]
    feats = [c for c in names if c in df.columns and c not in FUND]
    print("sectors:", df["sector"].nunique(), "| unknown share:",
          round(float((df["sector"] == "unknown").mean()), 3), flush=True)
    return df, feats


def add_targets(d):
    d = d.copy()
    g = d.groupby("date")["future_ret_20d"]
    d["y_raw"] = g.rank(pct=True) * 100
    mkt = g.transform("mean")
    sm = d.groupby(["date", "sector"])["future_ret_20d"].transform("mean")
    sn = d.groupby(["date", "sector"])["future_ret_20d"].transform("size")
    d["rel"] = d["future_ret_20d"] - np.where(sn >= 3, sm, mkt)
    d["y_sec"] = d.groupby("date")["rel"].rank(pct=True) * 100
    return d


def walk_forward(d, feats, target, gap=25, n_folds=5, min_train_frac=0.4, seed=42):
    dates = np.sort(d["date"].unique())
    n = len(dates)
    edges = np.linspace(int(n * min_train_frac), n, n_folds + 1).astype(int)
    outs = []
    for k in range(n_folds):
        a, b = edges[k], edges[k + 1]
        tr = d[d["date"].isin(dates[:max(a - gap, 0)])]
        te = d[d["date"].isin(dates[a:b])]
        y = tr[target].values
        w = np.abs(y - 50) / 50.0 + 0.3
        m = lgb.LGBMRegressor(
            n_estimators=300, learning_rate=0.05, num_leaves=63,
            min_child_samples=200, subsample=0.7, subsample_freq=1,
            colsample_bytree=0.7, reg_lambda=5.0, n_jobs=-1, verbose=-1,
            random_state=seed)
        m.fit(tr[feats].astype("float32"), y, sample_weight=w)
        o = te[["date", "symbol", "future_ret_20d", "liq_pct"]].copy()
        o["pred"] = m.predict(te[feats].astype("float32"))
        outs.append(o)
        print("    fold", k + 1, "train", len(tr), "test", len(te), flush=True)
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


def backtest(x_all, n_hold, buffer, min_univ=30):
    groups = dict(tuple(x_all.groupby("date")))
    dates = list(pd.to_datetime(np.sort(x_all["date"].unique())[::HORIZON]))
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
        sel = x[x["symbol"].isin(new)]
        rows.append({"date": d, "port": sel["future_ret_20d"].mean(),
                     "uni": x["future_ret_20d"].mean(), "turnover": turnover, "n_univ": len(x)})
        held = set(new)
    return pd.DataFrame(rows)


def summ(r):
    if len(r) < 5:
        return {"error": "few periods", "periods": int(len(r))}
    out = {
        "periods": int(len(r)),
        "median_universe": int(r["n_univ"].median()),
        "avg_turnover": round(float(r["turnover"].mean()), 3),
        "gross_excess": round(float((r["port"] - r["uni"]).mean()), 4),
        "avg_port_ret": round(float(r["port"].mean()), 4),
    }
    for c in COSTS:
        net = r["port"] - r["uni"] - r["turnover"] * c
        t = net.mean() / (net.std() / np.sqrt(len(r)))
        out["net_cost_%.1fpct" % (c * 100)] = {
            "excess": round(float(net.mean()), 4),
            "t": round(float(t), 2),
            "hit": round(float((net > 0).mean()), 3)}
    return out


def by_year(r, cost):
    net = r["port"] - r["uni"] - r["turnover"] * cost
    yrs = pd.to_datetime(r["date"]).dt.year
    return {int(y): round(float(net[yrs == y].mean()), 4) for y in sorted(set(yrs))}


def evaluate(oos):
    res = {"rows": int(len(oos)), "IC_mean": ic_mean(oos)}
    for nh, buf in CONFIGS:
        r = backtest(oos, nh, buf)
        res["top%d_buf%d" % (nh, buf)] = summ(r)
        if (nh, buf) == (30, 100) and len(r) >= 5:
            res["by_year_net_2.3pct_top30_buf100"] = by_year(r, 0.023)
    return res


def main():
    t0 = time.time()
    df, feats = load()
    print("Rows:", len(df), "Features:", len(feats), flush=True)
    res = {"features_used": len(feats)}

    base = df[~df["limit"]]
    base = add_targets(base)
    print("A: train on all", flush=True)
    oosA = walk_forward(base, feats, "y_raw")
    for thr in (0.5, 0.7):
        key = "A_train_all__test_top%d" % int(thr * 100)
        res[key] = evaluate(oosA[oosA["liq_pct"] >= thr])
        print(key, json.dumps(res[key], ensure_ascii=False), flush=True)

    for thr in (0.5, 0.7):
        sub = add_targets(df[(~df["limit"]) & (df["liq_pct"] >= thr)])
        for target, tname in (("y_raw", "raw"), ("y_sec", "sector_rel")):
            key = "train_top%d__target_%s" % (int(thr * 100), tname)
            print("RUN", key, flush=True)
            oos = walk_forward(sub, feats, target)
            res[key] = evaluate(oos)
            print(key, json.dumps(res[key], ensure_ascii=False), flush=True)

    os.makedirs(OUT, exist_ok=True)
    with open(OUT + "/liquid_universe_results.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print("minutes:", round((time.time() - t0) / 60, 1))


main()
