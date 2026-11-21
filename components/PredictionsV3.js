"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function PredictionsV3() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("UP");
  const [horizon, setHorizon] = useState("20d");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/predictions_v3.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-slate-400">در حال بارگذاری پیش‌بینی‌ها...</p>
        </div>
      </div>
    );
  }

  const items = Object.values(data.predictions)
    .filter((p) => p[`signal_${horizon}`] === filter)
    .filter((p) => !search || p.symbol.includes(search))
    .sort((a, b) => (b[`rank_${horizon}`] || 0) - (a[`rank_${horizon}`] || 0));

  const counts = { UP: 0, NEUTRAL: 0, DOWN: 0 };
  Object.values(data.predictions).forEach((p) => {
    const s = p[`signal_${horizon}`];
    if (s) counts[s]++;
  });

  const signalStyle = (s) => {
    if (s === "UP") return { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "↗" };
    if (s === "DOWN") return { color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", icon: "↘" };
    return { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: "→" };
  };

  const signalLabel = (s) => s === "UP" ? "صعودی" : s === "DOWN" ? "نزولی" : "خنثی";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl">📊</div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                JavidLM v3
              </h1>
              <p className="text-sm text-slate-400">پیش‌بینی رتبه‌بندی سهام — مدل ۲۵ ساله</p>
            </div>
          </div>
          <div className="flex gap-3 text-xs text-slate-500 mt-3">
            <span>📅 داده: {data.date}</span>
            <span>📈 {data.total} سهم</span>
            <span>🔄 {new Date(data.generated_at).toLocaleDateString("fa-IR")}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { key: "UP", label: "صعودی", color: "emerald", icon: "↗" },
            { key: "NEUTRAL", label: "خنثی", color: "amber", icon: "→" },
            { key: "DOWN", label: "نزولی", color: "rose", icon: "↘" },
          ].map((s) => {
            const st = signalStyle(s.key);
            return (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`p-4 rounded-2xl border-2 transition-all ${filter === s.key ? `${st.bg} ${st.border} scale-105` : "bg-slate-800/50 border-slate-700 hover:border-slate-600"}`}
              >
                <div className={`text-3xl font-bold ${st.color}`}>{counts[s.key]}</div>
                <div className="text-sm text-slate-400 mt-1">{s.icon} {s.label}</div>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex bg-slate-800/50 rounded-xl p-1 border border-slate-700">
            <button
              onClick={() => setHorizon("20d")}
              className={`px-4 py-2 rounded-lg transition ${horizon === "20d" ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold" : "text-slate-400"}`}
            >
              افق ۱ ماهه
            </button>
            <button
              onClick={() => setHorizon("60d")}
              className={`px-4 py-2 rounded-lg transition ${horizon === "60d" ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold" : "text-slate-400"}`}
            >
              افق ۳ ماهه
            </button>
          </div>
          <input
            type="text"
            placeholder="جستجوی نماد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700 focus:border-amber-500 outline-none text-white placeholder-slate-500"
          />
        </div>

        {/* Results */}
        <div className="text-sm text-slate-400 mb-3">
          {items.length} سهم {signalLabel(filter)} — مرتب‌شده بر اساس رتبه
        </div>

        <div className="grid gap-2">
          {items.slice(0, 100).map((p, idx) => {
            const st = signalStyle(p[`signal_${horizon}`]);
            const rank = p[`rank_${horizon}`] || 0;
            const barWidth = Math.min(rank, 100);
            return (
              <Link
                key={p.symbol}
                href={`/predictions/${encodeURIComponent(p.symbol)}`}
                className={`block p-4 rounded-xl border ${st.border} ${st.bg} hover:scale-[1.01] transition-all`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${st.bg} border ${st.border} flex items-center justify-center text-lg font-bold ${st.color}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-lg">{p.symbol}</div>
                      <div className={`text-xs ${st.color}`}>{st.icon} {signalLabel(p[`signal_${horizon}`])}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${st.color}`}>{rank.toFixed(1)}</div>
                    <div className="text-xs text-slate-500">رتبه</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p[`signal_${horizon}`] === "UP" ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                      p[`signal_${horizon}`] === "DOWN" ? "bg-gradient-to-r from-rose-500 to-rose-400" :
                      "bg-gradient-to-r from-amber-500 to-amber-400"
                    }`}
                    style={{ width: `${barWidth}%` }}
                  ></div>
                </div>
              </Link>
            );
          })}
        </div>

        {items.length > 100 && (
          <div className="text-center py-6 text-slate-500 text-sm">
            نمایش ۱۰۰ سهم اول از {items.length} سهم
          </div>
        )}
      </div>
    </div>
  );
}
