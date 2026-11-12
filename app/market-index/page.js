'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown, LineChart, AlertTriangle } from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function MarketIndex() {
  const [idx, setIdx] = useState(null);
  const [range, setRange] = useState(90);

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/data/index_data.json'); setIdx(await r.json()); }
      catch {}
    })();
  }, []);

  if (!idx) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const rows = idx.rows || [];
  const sliced = rows.slice(-range);
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const change = prev ? ((latest.c - prev.c) / prev.c * 100) : 0;
  const high52 = Math.max(...rows.slice(-250).map(r => r.c));
  const low52 = Math.min(...rows.slice(-250).map(r => r.c));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">شاخص کل</span>
      </div>

      <div className="glass-strong p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-2 text-sm text-slate-400">
          <LineChart className="w-4 h-4 text-primary" />
          شاخص کل بورس تهران
        </div>
        <div className="flex flex-wrap items-baseline gap-3 mb-6">
          <span className="num text-4xl md:text-6xl font-bold text-white">{fmt(latest.c)}</span>
          <span className={`num text-sm font-bold flex items-center gap-1 ${change >= 0 ? 'text-success' : 'text-danger'}`}>
            {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {change >= 0 ? '+' : ''}{change.toFixed(2)}٪
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          {[30, 90, 250, 1000].map(d => (
            <button key={d} onClick={() => setRange(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                range === d ? 'bg-primary text-bg' : 'glass text-slate-300'
              }`}>
              {d === 30 ? '۱ ماه' : d === 90 ? '۳ ماه' : d === 250 ? '۱ سال' : '۴ سال'}
            </button>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50">
          <IndexChart data={sliced} height={380} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="glass p-3 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 mb-1">بالاترین ۱ سال</div>
            <div className="num text-lg font-bold text-success">{fmt(high52)}</div>
          </div>
          <div className="glass p-3 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 mb-1">پایین‌ترین ۱ سال</div>
            <div className="num text-lg font-bold text-danger">{fmt(low52)}</div>
          </div>
          <div className="glass p-3 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 mb-1">تاریخچه</div>
            <div className="num text-lg font-bold text-white">{fmt(rows.length)} روز</div>
          </div>
          <div className="glass p-3 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 mb-1">موقعیت</div>
            <div className="num text-lg font-bold text-primary">
              {((latest.c - low52) / (high52 - low52) * 100).toFixed(0)}٪
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/5 border border-danger/20">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90">این تحلیل صرفاً آموزشی است و نه توصیه معاملاتی.</p>
      </div>
    </div>
  );
}
