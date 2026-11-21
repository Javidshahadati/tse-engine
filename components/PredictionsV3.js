"use client";
import { useEffect, useState } from "react";

export default function PredictionsV3() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("UP");
  const [horizon, setHorizon] = useState("20d");

  useEffect(() => {
    fetch("/data/predictions_v3.json")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) return <div className="p-6 text-center text-gray-400">در حال بارگذاری...</div>;

  const items = Object.values(data.predictions).filter((p) => {
    const sig = p[`signal_${horizon}`];
    return sig === filter;
  });

  const signalColor = (s) =>
    s === "UP" ? "text-green-400" : s === "DOWN" ? "text-red-400" : "text-yellow-400";

  const signalBg = (s) =>
    s === "UP" ? "bg-green-900/30" : s === "DOWN" ? "bg-red-900/30" : "bg-yellow-900/30";

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">پیش‌بینی JavidLM v3</h2>
        <span className="text-xs text-gray-400">
          به‌روزرسانی: {new Date(data.generated_at).toLocaleDateString("fa-IR")}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setHorizon("20d")}
          className={`px-3 py-1 rounded ${horizon === "20d" ? "bg-blue-600" : "bg-gray-700"}`}
        >
          ۱ ماهه
        </button>
        <button
          onClick={() => setHorizon("60d")}
          className={`px-3 py-1 rounded ${horizon === "60d" ? "bg-blue-600" : "bg-gray-700"}`}
        >
          ۳ ماهه
        </button>
      </div>

      <div className="flex gap-2">
        {["UP", "NEUTRAL", "DOWN"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded ${filter === s ? signalBg(s) : "bg-gray-800"} ${signalColor(s)}`}
          >
            {s === "UP" ? "صعودی" : s === "DOWN" ? "نزولی" : "خنثی"}
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-400">{items.length} سهم</div>

      <div className="space-y-2">
        {items.slice(0, 50).map((p) => (
          <div
            key={p.symbol}
            className={`flex justify-between items-center p-3 rounded ${signalBg(p[`signal_${horizon}`])}`}
          >
            <div className="flex gap-3 items-center">
              <span className="font-bold">{p.symbol}</span>
              <span className={`text-xs ${signalColor(p[`signal_${horizon}`])}`}>
                {p[`signal_${horizon}`]}
              </span>
            </div>
            <div className="flex gap-4 text-sm">
              <span>رتبه {p[`rank_${horizon}`]?.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
