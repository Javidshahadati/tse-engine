
import json, os, sys, time
import numpy as np
import pandas as pd
import lightgbm as lgb

COST = 0.023
HORIZON = 20
MIN_STOCKS = 30
OUT = "javid_v3"


def load():
    df = pd.read_parquet(OUT + "/features_v3_20d.parquet")
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    df["future_ret_20d"] = df.groupby("symbol")["close"].shift(-HORIZON) / df["close"] - 1
    df = df.dropna(subset=["future_ret_20d"]).reset_index(drop=True)
    with open(OUT + "/summary_v3_20d.json") as f:
        names = json.load(f)["feature_names"]
    feats = [c for c in names if c in df.columns]
    df["rank_pct"] = df.groupby("date")["future_ret_20d"].rank(pct=True) * 100
    df["weight"] = (df["rank_pct"] - 50).abs() / 50 + 0.3
    return df, feats


def walk_forward(df, feats, gap=25, n_folds=5, min_train_frac=0.4, train_frac=0.5, seed=42):
    dates = np.sort(df["date"].unique())
    n = len(dates)
    edges = np.linspace(int(n * min_train_frac), n, n_folds + 1).astype(int)
    outs, imps = [], []
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
        o = te[["date", "symbol", "future_ret_20d"]].copy()
        o["pred"] = m.predict(te[feats].astype("float32"))
        outs.append(o)
        imp = m.booster_.feature_importance("gain")
        imps.append(imp / imp.sum())
        print("  fold", k + 1, "done", flush=True)
    return pd.concat(outs, ignore_index=True), np.mean(imps, axis=0)


def date_stats(oos):
    oos = oos.copy()
    n = oos.groupby("date")["pred"].transform("size")
    oos = oos[n >= MIN_STOCKS]
    g = oos.groupby("date")
    pr = g["pred"].rank(pct=True)
    yr = g["future_ret_20d"].rank(pct=True)
    pc = pr - pr.groupby(oos["date"]).transform("mean")
    yc = yr - yr.groupby(oos["date"]).transform("mean")
    num = (pc * yc).groupby(oos["date"]).sum()
    den = np.sqrt((pc ** 2).groupby(oos["date"]).sum() * (yc ** 2).groupby(oos["date"]).sum())
    ic = (num / den).replace([np.inf, -np.inf], np.nan).dropna()
    dec = np.clip(np.ceil(pr * 10).astype(int) - 1, 0, 9)
    ret = oos["future_ret_20d"]
    top = ret[dec == 9].groupby(oos["date"][dec == 9]).mean()
    bot = ret[dec == 0].groupby(oos["date"][dec == 0]).mean()
    uni = ret.groupby(oos["date"]).mean()
    return pd.DataFrame({"ic": ic, "top": top, "bot": bot, "uni": uni}).dropna()


def summarize(oos):
    d = date_stats(oos)
    if len(d) < 10:
        return {"error": "not enough data"}
    no = d.iloc[::HORIZON]
    ex = (no["top"] - no["uni"]).mean()
    return {
        "IC_mean": round(float(d["ic"].mean()), 4),
        "ICIR": round(float(d["ic"].mean() / d["ic"].std()), 3),
        "top_excess_gross": round(float(ex), 4),
        "top_excess_net_full_rebalance": round(float(ex - COST), 4),
    }


def by_year(oos):
    d = date_stats(oos)
    no = d.iloc[::HORIZON]
    res = {}
    for y in sorted(set(d.index.year)):
        dy = d[d.index.year == y]
        ny = no[no.index.year == y]
        res[int(y)] = {
            "IC": round(float(dy["ic"].mean()), 4),
            "IC_pos_rate": round(float((dy["ic"] > 0).mean()), 3),
            "excess_gross": round(float((ny["top"] - ny["uni"]).mean()), 4) if len(ny) else None,
            "periods": int(len(ny)),
        }
    return res


def factor_ics(df, feats):
    dates = np.sort(df["date"].unique())[::5]
    s = df[df["date"].isin(dates)]
    yr = s.groupby("date")["future_ret_20d"].rank(pct=True)
    yc = yr - yr.groupby(s["date"]).transform("mean")
    ysq = (yc ** 2).groupby(s["date"]).sum()
    res = {}
    for f in feats:
        x = s[f].astype("float64")
        xr = x.groupby(s["date"]).rank(pct=True)
        xc = xr - xr.groupby(s["date"]).transform("mean")
        num = (xc * yc).groupby(s["date"]).sum()
        den = np.sqrt((xc ** 2).groupby(s["date"]).sum() * ysq)
        ic = (num / den).replace([np.inf, -np.inf], np.nan).dropna()
        if len(ic) > 10:
            res[f] = round(float(ic.mean()), 4)
    return res


def backtest(oos, n_hold=30, buffer=30):
    dates = sorted(oos["date"].unique())[::HORIZON]
    held = set()
    rows = []
    for d in dates:
        x = oos[oos["date"] == d]
        if len(x) < MIN_STOCKS:
            continue
        x = x.sort_values("pred", ascending=False)
        syms = list(x["symbol"])
        rank = {s: i for i, s in enumerate(syms)}
        keep = [s for s in held if s in rank and rank[s] < buffer]
        keep = sorted(keep, key=lambda s: rank[s])[:n_hold]
        cand = [s for s in syms if s not in keep][: n_hold - len(keep)]
        new = keep + cand
        f = len(set(new) - held) / float(n_hold)
        port = x[x["symbol"].isin(new)]["future_ret_20d"].mean()
        uni = x["future_ret_20d"].mean()
        rows.append({"date": d, "port": port, "uni": uni, "turnover": f})
        held = set(new)
    r = pd.DataFrame(rows)
    r["gross_ex"] = r["port"] - r["uni"]
    r["net_ex"] = r["gross_ex"] - r["turnover"] * COST
    return r


def bt_summary(r):
    n = len(r)
    t = r["net_ex"].mean() / (r["net_ex"].std() / np.sqrt(n)) if n > 2 else None
    return {
        "periods": int(n),
        "avg_turnover": round(float(r["turnover"].mean()), 3),
        "gross_excess_per_20d": round(float(r["gross_ex"].mean()), 4),
        "net_excess_per_20d": round(float(r["net_ex"].mean()), 4),
        "net_t_stat": round(float(t), 2) if t is not None else None,
        "net_hit_rate": round(float((r["net_ex"] > 0).mean()), 3),
        "net_cum_sum": round(float(r["net_ex"].sum()), 3),
    }


def main():
    t0 = time.time()
    df, feats = load()
    print("Rows:", len(df), "Features:", len(feats), flush=True)
    res = {}

    print("1) walk-forward", flush=True)
    oos, imp = walk_forward(df, feats)
    res["model_overall"] = summarize(oos)
    res["model_by_year"] = by_year(oos)
    order = np.argsort(-imp)
    res["feature_importance_top15"] = {feats[i]: round(float(imp[i]), 4) for i in order[:15]}
    res["importance_top5_share"] = round(float(imp[order[:5]].sum()), 3)
    print(res["model_overall"], flush=True)

    print("2) single factors", flush=True)
    fic = factor_ics(df, feats)
    srt = sorted(fic.items(), key=lambda kv: -abs(kv[1]))
    res["single_factor_IC_top15"] = dict(srt[:15])
    oos_dates = set(oos["date"].unique())
    bench = {}
    for f, ic in srt[:5]:
        o = df[["date", "symbol", "future_ret_20d"]].copy()
        o["pred"] = np.sign(ic) * df[f]
        o = o[o["date"].isin(oos_dates)]
        bench[f] = summarize(o)
    res["single_factor_benchmarks_oos"] = bench

    print("3) low-turnover backtest", flush=True)
    bts = {}
    for name, buf in [("full_rebalance_top30", 30), ("buffer60_top30", 60), ("buffer100_top30", 100)]:
        r = backtest(oos, 30, buf)
        bts[name] = bt_summary(r)
        if name == "buffer60_top30":
            r["year"] = pd.to_datetime(r["date"]).dt.year
            res["buffer60_by_year_net_excess"] = {
                int(y): round(float(g["net_ex"].mean()), 4) for y, g in r.groupby("year")}
    res["backtest"] = bts

    os.makedirs(OUT, exist_ok=True)
    with open(OUT + "/analysis_v3_20d.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print("minutes:", round((time.time() - t0) / 60, 1))


main()
