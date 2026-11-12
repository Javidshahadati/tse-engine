'use client';
import { TrendingUp, TrendingDown, BarChart3, Clock, AlertTriangle, Activity } from 'lucide-react';

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function RiskProfile({ chart, close, sig }) {
  if (!chart || chart.length < 30 || !close) return null;

  const closes = chart.map(r => r.c);
  const returns = [];
  for (let i = 0; i < closes.length - 5; i++) {
    if (closes[i] > 0) {
      returns.push((closes[i + 5] - closes[i]) / closes[i]);
    }
  }
  if (returns.length < 10) return null;

  const positive = returns.filter(r => r > 0.017);
  const winRate = positive.length / returns.length;
  const avgWin = positive.length > 0 ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;
  const negative = returns.filter(r => r <= 0.017);
  const avgLoss = negative.length > 0 ? negative.reduce((a, b) => a + b, 0) / negative.length : 0;
  const best = Math.max(...returns);
  const worst = Math.min(...returns);

  // Percentile price bands
  const sorted = [...returns].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)] || 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0;

  const priceLow = close * (1 + worst);
  const price25 = close * (1 + p25);
  const price50 = close * (1 + p50);
  const price75 = close * (1 + p75);
  const priceHigh = close * (1 + best);

  // Validity (5 trading days = 7 calendar)
  const today = new Date();
  const validUntil = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const persianDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(validUntil);

  const winColor = winRate > 0.6 ? 'success' : winRate > 0.4 ? 'warning' : 'danger';

  return (
    <div className="glass-strong rounded-2xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-72 h-72 bg-accent/8 rounded-full blur-3xl" />
      <div className="relative p-4 md:p-6">

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-bg" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">پیشینه سیگنال‌های مشابه</div>
              <div className="text-[10px] text-slate-400">{fmt(returns.length)} نمونه تاریخی</div>
            </div>
          </div>
        </div>

        {/* Win rate */}
        <div className={`grid grid-cols-2 gap-2.5 md:gap-3 mb-3`}>
          <div className="bg-success/10 border border-success/30 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] font-bold text-success">موفق</span>
            </div>
            <div className="num text-xl md:text-2xl font-black text-white">{(winRate * 100).toFixed(0)}٪</div>
            <div className="text-[9px] text-success mt-0.5">میانگین +{(avgWin * 100).toFixed(1)}٪</div>
          </div>
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-danger" />
              <span className="text-[10px] font-bold text-danger">ناموفق</span>
            </div>
            <div className="num text-xl md:text-2xl font-black text-white">{((1 - winRate) * 100).toFixed(0)}٪</div>
            <div className="text-[9px] text-danger mt-0.5">میانگین {(avgLoss * 100).toFixed(1)}٪</div>
          </div>
        </div>

        {/* Best/worst */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-bg/40 rounded-lg p-2 text-center">
            <div className="text-[9px] text-slate-500 mb-0.5">بهترین</div>
            <div className="num text-sm font-bold text-success">+{(best * 100).toFixed(1)}٪</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-2 text-center">
            <div className="text-[9px] text-slate-500 mb-0.5">میانه</div>
            <div className={`num text-sm font-bold ${p50 >= 0 ? 'text-white' : 'text-danger'}`}>{(p50 * 100).toFixed(1)}٪</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-2 text-center">
            <div className="text-[9px] text-slate-500 mb-0.5">بدترین</div>
            <div className="num text-sm font-bold text-danger">{(worst * 100).toFixed(1)}٪</div>
          </div>
        </div>

        {/* Price bands */}
        <div className="bg-bg/40 rounded-xl p-3 mb-3">
          <div className="text-[10px] text-slate-400 mb-2">محدوده قیمتی ۵ روز آینده (توزیع تاریخی)</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">۲۵٪ (بدبینانه)</span>
              <span className="num text-danger font-bold">{fmt(price25)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">۵۰٪ (محتمل‌ترین)</span>
              <span className="num text-white font-bold">{fmt(price50)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">۷۵٪ (خوش‌بینانه)</span>
              <span className="num text-success font-bold">{fmt(price75)}</span>
            </div>
          </div>
        </div>

        {/* Validity */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/8 border border-primary/20 mb-3">
          <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 flex items-center justify-between">
            <span className="text-[10px] text-slate-300">اعتبار تحلیل</span>
            <span className="num text-[11px] font-bold text-white">تا {persianDate}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-warning/90 leading-relaxed">
            آمار بر اساس گذشته است، نه تضمین آینده. تصمیم نهایی با شماست.
          </p>
        </div>
      </div>
    </div>
  );
}
