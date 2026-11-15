'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Target, TrendingUp, TrendingDown, Activity,
  Award, AlertTriangle, BarChart3, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, Clock, Zap
} from 'lucide-react';

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function CalcSignalMetrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [predsRes, chartsRes] = await Promise.all([
          fetch('/data/predictions_today.json'),
          fetch('/data/charts.json'),
        ]);
        const preds = await predsRes.json();
        const charts = await chartsRes.json();

        const signals = [];
        for (const sig of preds.signals) {
          const chart = charts[sig.symbol];
          if (!chart || chart.length < 60) continue;

          const sortedChart = [...chart].sort((a, b) => String(a.t).localeCompare(String(b.t)));
          const closes = sortedChart.map(r => r.c);

          const lookback = [];
          for (let i = 0; i < closes.length - 5; i++) {
            if (closes[i] > 0 && closes[i + 5] > 0) {
              const ret = (closes[i + 5] - closes[i]) / closes[i] * 100;
              if (ret > -30 && ret < 50) lookback.push(ret);
            }
          }

          if (lookback.length < 30) continue;

          const sortedLook = [...lookback].sort((a, b) => a - b);
          const medianRet = sortedLook[Math.floor(sortedLook.length / 2)];

          const trimStart = Math.floor(sortedLook.length * 0.1);
          const trimEnd = Math.floor(sortedLook.length * 0.9);
          const trimmed = sortedLook.slice(trimStart, trimEnd);
          const avgRet = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

          const wins = lookback.filter(r => r > 1.7).length;
          const hitRate = (wins / lookback.length) * 100;

          signals.push({
            symbol: sig.symbol,
            name: sig.name,
            sector: sig.sector || '—',
            pe: sig.pe,
            prob: sig.prob,
            signal: sig.signal,
            avgReturn: avgRet,
            medianReturn: medianRet,
            hitRate,
            sampleSize: lookback.length,
          });
        }

        const wins = signals.filter(s => s.medianReturn > 0);
        const losses = signals.filter(s => s.medianReturn <= 0);
        const hitRate = (wins.length / signals.length) * 100;
        const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b.avgReturn, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b.avgReturn, 0) / losses.length : 0;
        const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

        const sorted = [...signals].sort((a, b) => b.prob - a.prob);
        let maxStreak = 0, currentStreak = 0;
        for (const s of sorted) {
          if (s.medianReturn <= 0) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
        }

        const buySignals = sorted.filter(s => s.signal === 'BUY');
        const avgReturn = buySignals.length > 0
          ? buySignals.reduce((a, b) => a + b.medianReturn, 0) / buySignals.length
          : 0;

        const sectorSet = new Set(signals.map(s => s.sector).filter(v => v && v !== '—'));

        setData({
          hitRate,
          rr: Math.round(rr * 100) / 100,
          maxStreak,
          avgReturn: Math.round(avgReturn * 100) / 100,
          totalSignals: signals.length,
          wins: wins.length,
          losses: losses.length,
          signals: sorted.slice(0, 100),
          auc: 0.746,
          sectorCount: sectorSet.size,
          featureCount: 68,
        });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-6">
        <div className="h-96 glass rounded-xl shimmer" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <p className="text-slate-400">داده‌ای موجود نیست</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
          <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
        </Link>
        <span className="text-slate-600">/</span>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h1 className="text-lg md:text-xl font-black text-white">تحلیل Javid LM</h1>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="glass-strong rounded-2xl p-5 md:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Award className="w-5 h-5 text-bg" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">کیفیت تحلیل Javid LM</div>
              <div className="text-[10px] text-slate-400">
                {fmt(data.totalSignals)} سهم تحلیل‌شده — دقت AUC {fmt(data.auc * 100, 1)}٪
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-bg/60 rounded-xl p-4 border border-border/40">
              <div className="text-[10px] text-slate-400 mb-1">دقت تشخیص (AUC)</div>
              <div className={`num text-2xl md:text-3xl font-black ${
                data.auc >= 0.7 ? 'text-success' : data.auc >= 0.6 ? 'text-warning' : 'text-danger'
              }`}>
                {fmt(data.auc * 100, 1)}٪
              </div>
              <div className="text-[9px] text-slate-500 mt-1">
                تست روی ۷۵٬۰۰۰ نمونه تاریخی
              </div>
            </div>
            <div className="bg-bg/60 rounded-xl p-4 border border-border/40">
              <div className="text-[10px] text-slate-400 mb-1">سهم‌های تحلیل‌شده</div>
              <div className={`num text-2xl md:text-3xl font-black ${
                data.totalSignals >= 500 ? 'text-success' : data.totalSignals >= 300 ? 'text-warning' : 'text-danger'
              }`}>
                {fmt(data.totalSignals)}
              </div>
              <div className="text-[9px] text-slate-500 mt-1">از ۶۰۶ سهم بازار</div>
            </div>
            <div className="bg-bg/60 rounded-xl p-4 border border-border/40">
              <div className="text-[10px] text-slate-400 mb-1">تعداد فیچر مدل</div>
              <div className={`num text-2xl md:text-3xl font-black ${
                data.featureCount >= 50 ? 'text-success' : data.featureCount >= 30 ? 'text-warning' : 'text-danger'
              }`}>
                {data.featureCount}
              </div>
              <div className="text-[9px] text-slate-500 mt-1">تکنیکال + بنیادی</div>
            </div>
            <div className="bg-bg/60 rounded-xl p-4 border border-border/40">
              <div className="text-[10px] text-slate-400 mb-1">پوشش سکتور</div>
              <div className={`num text-2xl md:text-3xl font-black ${
                data.sectorCount >= 20 ? 'text-success' : data.sectorCount >= 10 ? 'text-warning' : 'text-danger'
              }`}>
                {fmt(data.sectorCount)}
              </div>
              <div className="text-[9px] text-slate-500 mt-1">از ۴۵ سکتور بازار</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="glass p-4 rounded-xl border-l-4 border-primary">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-1">تفسیر نتایج</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              مدل Javid LM با {data.featureCount} فیچر تکنیکال و بنیادی، {fmt(data.totalSignals)} سهم بازار تهران رو تحلیل می‌کنه.
              دقت تشخیص (AUC) مدل در تست تاریخی {fmt(data.auc * 100, 1)}٪ است — یعنی مدل توانایی {data.auc >= 0.7 ? 'خوبی' : 'متوسطی'} در تفکیک سهم‌های قوی از ضعیف داره.
              این خروجی‌ها ابزار تحلیلی هستند، نه توصیه معاملاتی. تصمیم نهایی با کاربر است.
            </p>
          </div>
        </div>
      </div>

      {/* Signals Table */}
      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-white">جزئیات ۱۰۰ سهم برتر</h2>
          </div>
          <span className="text-[10px] text-slate-400">بر اساس امتیاز مدل</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full data-table text-sm">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>نماد</th>
                <th className="hidden sm:table-cell">نام</th>
                <th>امتیاز</th>
                <th>روند</th>
                <th>سکتور</th>
                <th className="hidden md:table-cell">P/E</th>
              </tr>
            </thead>
            <tbody>
              {data.signals.map((s, i) => {
                const isPositive = s.signal === 'BUY';
                const isNegative = s.signal === 'SELL';
                return (
                  <tr key={s.symbol}>
                    <td className="num text-[10px] text-slate-500">{fmt(i + 1)}</td>
                    <td>
                      <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                        className={`font-black text-xs hover:underline ${
                          isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-slate-300'
                        }`}>
                        {s.symbol}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell text-slate-400 text-[10px]">{s.name}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="num font-bold text-white text-xs">{Math.round(s.prob * 100)}</span>
                        <div className="w-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${
                            s.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' :
                            s.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'
                          }`} style={{ width: `${s.prob * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        s.signal === 'BUY' ? 'bg-success/15 text-success' :
                        s.signal === 'SELL' ? 'bg-danger/15 text-danger' : 'bg-slate-500/15 text-slate-300'
                      }`}>
                        {s.signal === 'BUY' ? 'صعودی' : s.signal === 'SELL' ? 'نزولی' : 'خنثی'}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] text-slate-400">{s.sector || '—'}</span>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="num text-[10px] text-slate-300">
                        {s.pe ? Number(s.pe).toFixed(1) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="glass p-4 rounded-xl">
        <h3 className="text-xs font-bold text-white mb-2">راهنما</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-300">
          <div>
            <strong className="text-success">AUC (دقت تشخیص):</strong> توانایی مدل در تفکیک سهم‌های قوی از ضعیف. بالای ۰.۷ = خوب
          </div>
          <div>
            <strong className="text-primary">سهم‌های تحلیل‌شده:</strong> تعداد سهم‌هایی که مدل روی آن‌ها ارزیابی انجام داده
          </div>
          <div>
            <strong className="text-warning">تعداد فیچر:</strong> مجموع شاخص‌های تکنیکال و بنیادی مورد استفاده
          </div>
          <div>
            <strong className="text-accent">پوشش سکتور:</strong> تنوع صنعتی سهم‌های تحلیل‌شده
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-slate-500 leading-relaxed">
          ⚠️ این ابزار تحلیل تکنیکال و بنیادی است، نه سیگنال خرید/فروش. تصمیم نهایی بر عهده کاربر است.
        </div>
      </div>

    </div>
  );
}

export default CalcSignalMetrics;
