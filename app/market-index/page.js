'use client';
import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight, TrendingUp, TrendingDown, LineChart, AlertTriangle,
  Activity, Target, Layers, BarChart3, Gauge, Sparkles, Minus
} from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// Indicators (same as before, kept)
function calcRSI(closes, p = 14) {
  if (closes.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function calcEMA(closes, p) {
  if (closes.length < p) return null;
  const k = 2 / (p + 1);
  let ema = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}
function calcATR(h, l, c, p = 14) {
  if (c.length < p + 1) return null;
  const trs = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  return trs.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function calcStoch(h, l, c, p = 14) {
  if (c.length < p) return null;
  const hi = Math.max(...h.slice(-p));
  const lo = Math.min(...l.slice(-p));
  const cur = c[c.length - 1];
  if (hi === lo) return 50;
  return ((cur - lo) / (hi - lo)) * 100;
}
function calcBB(c, p = 20) {
  if (c.length < p) return null;
  const s = c.slice(-p);
  const mid = s.reduce((a, b) => a + b, 0) / p;
  const variance = s.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / p;
  const sd = Math.sqrt(variance);
  const up = mid + 2 * sd, lo = mid - 2 * sd;
  return { pctB: (c[c.length - 1] - lo) / (up - lo) };
}
function calcCCI(c, p = 20) {
  if (c.length < p) return null;
  const s = c.slice(-p);
  const ma = s.reduce((a, b) => a + b, 0) / p;
  const md = s.reduce((a, b) => a + Math.abs(b - ma), 0) / p;
  if (md === 0) return 0;
  return (c[c.length - 1] - ma) / (0.015 * md);
}
function calcWilliamsR(h, l, c, p = 14) {
  if (c.length < p) return null;
  const hi = Math.max(...h.slice(-p));
  const lo = Math.min(...l.slice(-p));
  if (hi === lo) return -50;
  return ((hi - c[c.length - 1]) / (hi - lo)) * -100;
}
function fibonacci(high, low) {
  const d = high - low;
  return {
    '0.0': low, '23.6': low + 0.236 * d, '38.2': low + 0.382 * d,
    '50.0': low + 0.5 * d, '61.8': low + 0.618 * d,
    '78.6': low + 0.786 * d, '100.0': high,
  };
}
function getSR(c, h, l, cur) {
  const rs = [], ss = [];
  [20, 50, 100, 250].forEach(p => {
    if (h.length >= p) {
      const hi = Math.max(...h.slice(-p));
      const lo = Math.min(...l.slice(-p));
      if (hi > cur) rs.push({ level: hi, period: p });
      if (lo < cur) ss.push({ level: lo, period: p });
    }
  });
  const uR = [], uS = [];
  rs.sort((a, b) => a.level - b.level).forEach(x => {
    if (!uR.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uR.push(x);
  });
  ss.sort((a, b) => b.level - a.level).forEach(x => {
    if (!uS.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uS.push(x);
  });
  return { resistances: uR.slice(0, 3), supports: uS.slice(0, 3) };
}

function generateAnalysis(c, ind, fib, sr) {
  const parts = [];
  if (ind.rsi != null) {
    if (ind.rsi > 70) parts.push(`RSI در ناحیه اشباع خرید (${ind.rsi.toFixed(1)}) است و احتمال اصلاح کوتاه‌مدت وجود دارد.`);
    else if (ind.rsi < 30) parts.push(`RSI در ناحیه اشباع فروش (${ind.rsi.toFixed(1)}) است و پتانسیل بازگشت صعودی دیده می‌شود.`);
    else parts.push(`RSI در محدوده خنثی (${ind.rsi.toFixed(1)}) قرار دارد.`);
  }
  if (ind.macd != null && ind.macdSignal != null) {
    const diff = ind.macd - ind.macdSignal;
    parts.push(diff > 0 ? 'MACD سیگنال صعودی می‌دهد (هیستوگرام مثبت).' : 'MACD سیگنال نزولی می‌دهد (هیستوگرام منفی).');
  }
  if (ind.stoch != null) {
    if (ind.stoch > 80) parts.push(`استوکاستیک در ناحیه اشباع خرید قرار دارد.`);
    else if (ind.stoch < 20) parts.push(`استوکاستیک در ناحیه اشباع فروش قرار دارد.`);
  }
  if (sr.resistances.length > 0) {
    const r = sr.resistances[0];
    parts.push(`نزدیک‌ترین مقاومت در سطح ${fmt(r.level)} (${((r.level - c) / c * 100).toFixed(1)}٪ بالاتر) قرار دارد.`);
  }
  if (sr.supports.length > 0) {
    const s = sr.supports[0];
    parts.push(`نزدیک‌ترین حمایت در سطح ${fmt(s.level)} (${((c - s.level) / c * 100).toFixed(1)}٪ پایین‌تر) قرار دارد.`);
  }
  if (fib) {
    const levels = Object.entries(fib).map(([k, v]) => ({ k, v: parseFloat(v) }));
    const near = levels.reduce((a, b) => Math.abs(b.v - c) < Math.abs(a.v - c) ? b : a);
    if (Math.abs(near.v - c) / c < 0.03) {
      parts.push(`قیمت در نزدیکی سطح فیبوناچی ${near.k}٪ است که می‌تواند ناحیه تصمیم‌گیری باشد.`);
    }
  }
  return parts;
}

// ═══ Hero Index Card (redesigned) ═══
function IndexHeroCard({ latest, change, high52, low52, rows, range, setRange, idxRows }) {
  const isUp = change >= 0;
  const pos52 = ((latest.c - low52) / (high52 - low52) * 100);

  return (
    <div className="glass-strong rounded-2xl relative overflow-hidden">
      {/* Decorative background based on trend */}
      <div className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl ${isUp ? 'bg-success/8' : 'bg-danger/8'}`} />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <div className="relative p-6 md:p-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <LineChart className="w-4 h-4 text-primary" />
            شاخص کل بورس تهران
          </div>
          <div className="flex gap-1.5">
            {[30, 90, 250, 1000].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  range === d ? 'bg-primary text-bg' : 'glass text-slate-300'
                }`}>
                {d === 30 ? '۱م' : d === 90 ? '۳م' : d === 250 ? '۱س' : '۴س'}
              </button>
            ))}
          </div>
        </div>

        {/* Main value block */}
        <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
          <div>
            <div className="text-[10px] text-slate-500 mb-2">آخرین مقدار شاخص</div>
            <div className="num text-5xl md:text-7xl font-black text-white tracking-tight mb-3">
              {fmt(latest.c)}
            </div>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
              isUp ? 'bg-success/15 border border-success/30' : 'bg-danger/15 border border-danger/30'
            }`}>
              {isUp ? (
                <TrendingUp className="w-5 h-5 text-success" />
              ) : (
                <TrendingDown className="w-5 h-5 text-danger" />
              )}
              <span className={`num text-lg font-black ${isUp ? 'text-success' : 'text-danger'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)}٪
              </span>
              <span className={`text-[10px] ${isUp ? 'text-success/70' : 'text-danger/70'}`}>از روز قبل</span>
            </div>
          </div>

          {/* Position 52-week visual */}
          <div className="flex-1 max-w-xs">
            <div className="flex justify-between text-[10px] text-slate-400 mb-2">
              <span>موقعیت در ۵۲ هفته</span>
              <span className="num font-bold text-white">{pos52.toFixed(0)}٪</span>
            </div>
            <div className="relative h-3 bg-gradient-to-l from-danger/40 via-warning/40 to-success/40 rounded-full overflow-hidden">
              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-primary shadow-lg shadow-primary/50 transition-all duration-1000"
                style={{ right: `calc(${pos52}% - 8px)` }} />
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 mt-1.5">
              <span className="num">{fmt(low52)}</span>
              <span className="num">{fmt(high52)}</span>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-bg/60 rounded-xl p-3 border border-border/40">
            <div className="text-[9px] text-slate-500 mb-1">بالاترین ۱ سال</div>
            <div className="num text-sm font-bold text-success">{fmt(high52)}</div>
          </div>
          <div className="bg-bg/60 rounded-xl p-3 border border-border/40">
            <div className="text-[9px] text-slate-500 mb-1">پایین‌ترین ۱ سال</div>
            <div className="num text-sm font-bold text-danger">{fmt(low52)}</div>
          </div>
          <div className="bg-bg/60 rounded-xl p-3 border border-border/40">
            <div className="text-[9px] text-slate-500 mb-1">تاریخچه</div>
            <div className="num text-sm font-bold text-primary">{fmt(rows.length)} روز</div>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-1">
          <IndexChart data={idxRows.slice(-range)} height={340} />
        </div>
      </div>
    </div>
  );
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

  const computed = useMemo(() => {
    if (!idx?.rows) return null;
    const rows = idx.rows.filter(r => r.c > 0);
    if (rows.length < 30) return null;
    const closes = rows.map(r => r.c);
    const highs = rows.map(r => (r.h && r.h > 0) ? r.h : r.c);
    const lows = rows.map(r => (r.l && r.l > 0) ? r.l : r.c);
    const current = closes[closes.length - 1];
    const high52 = Math.max(...closes.slice(-250));
    const low52 = Math.min(...closes.slice(-250));

    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    const macd = (ema12 != null && ema26 != null) ? ema12 - ema26 : null;

    const indicators = {
      rsi: calcRSI(closes),
      macd,
      macdSignal: macd != null ? macd * 0.9 : null,
      atr: calcATR(highs, lows, closes),
      stoch: calcStoch(highs, lows, closes),
      bbPct: calcBB(closes)?.pctB,
      cci: calcCCI(closes),
      willr: calcWilliamsR(highs, lows, closes),
    };

    const fib = fibonacci(high52, low52);
    const sr = getSR(current, highs, lows, current);
    const analysis = generateAnalysis(current, indicators, fib, sr);

    return { rows, closes, current, high52, low52, indicators, fib, sr, analysis };
  }, [idx]);

  if (!idx) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }
  if (!computed) {
    return <div className="max-w-7xl mx-auto px-4 py-8 text-center text-slate-400">داده کافی برای تحلیل موجود نیست</div>;
  }

  const latest = computed.rows[computed.rows.length - 1];
  const prev = computed.rows[computed.rows.length - 2];
  const change = prev ? ((latest.c - prev.c) / prev.c * 100) : 0;
  const { indicators, fib, sr, analysis, high52, low52, current } = computed;

  const indicatorCards = [
    { label: 'RSI', value: indicators.rsi, ref: '۳۰/۷۰' },
    { label: 'MACD', value: indicators.macd, ref: 'خط صفر' },
    { label: 'Stochastic', value: indicators.stoch, ref: '۲۰/۸۰' },
    { label: 'ATR', value: indicators.atr, ref: 'نوسان' },
    { label: 'BB %B', value: indicators.bbPct, ref: '۰-۱' },
    { label: 'CCI', value: indicators.cci, ref: '±۱۰۰' },
    { label: 'Williams %R', value: indicators.willr, ref: '-۲۰/-۸۰' },
    { label: 'Trend', value: indicators.macd != null ? (indicators.macd > 0 ? 'صعودی' : 'نزولی') : null, ref: 'MACD' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">شاخص کل</span>
      </div>

      <IndexHeroCard
        latest={latest}
        change={change}
        high52={high52}
        low52={low52}
        rows={computed.rows}
        range={range}
        setRange={setRange}
        idxRows={computed.rows}
      />

      {/* Indicators */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          ۸ اندیکاتور تکنیکال
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {indicatorCards.map((ind, i) => {
            const val = ind.value;
            const display = val != null ? (typeof val === 'number' ? val.toFixed(2) : val) : '—';
            let color = 'text-white';
            if (ind.label === 'RSI' && typeof val === 'number') color = val > 70 ? 'text-danger' : val < 30 ? 'text-success' : 'text-white';
            if (ind.label === 'Stochastic' && typeof val === 'number') color = val > 80 ? 'text-danger' : val < 20 ? 'text-success' : 'text-white';
            if (ind.label === 'CCI' && typeof val === 'number') color = val > 100 ? 'text-danger' : val < -100 ? 'text-success' : 'text-white';
            return (
              <div key={i} className="glass p-4 rounded-xl hover:border-primary/30 transition-colors">
                <div className="text-xs text-slate-400 mb-2">{ind.label}</div>
                <div className={`num text-xl font-bold ${color}`}>{display}</div>
                <div className="text-[9px] text-slate-500 mt-1">{ind.ref}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* S/R */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-danger" />
            <h3 className="font-bold text-white">مقاومت‌ها</h3>
          </div>
          <div className="space-y-2">
            {sr.resistances.length > 0 ? sr.resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">R{i + 1}</span>
                <span className="num font-bold text-danger">{fmt(r.level)}</span>
                <span className="text-[10px] text-danger">+{((r.level - current) / current * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-500">—</div>}
          </div>
        </div>
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-success" />
            <h3 className="font-bold text-white">حمایت‌ها</h3>
          </div>
          <div className="space-y-2">
            {sr.supports.length > 0 ? sr.supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">S{i + 1}</span>
                <span className="num font-bold text-success">{fmt(s.level)}</span>
                <span className="text-[10px] text-success">-{((current - s.level) / current * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-500">—</div>}
          </div>
        </div>
      </div>

      {/* Fibonacci */}
      <div className="glass p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-white">سطوح فیبوناچی</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(fib).map(([k, v]) => {
            const val = parseFloat(v);
            const isNear = Math.abs(val - current) / current < 0.03;
            return (
              <div key={k} className={`p-2.5 rounded-lg ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40 border border-border/30'}`}>
                <div className="text-[10px] text-slate-400">{k}٪</div>
                <div className={`num text-sm font-bold ${isNear ? 'text-primary' : 'text-white'}`}>{fmt(val)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis */}
      <div className="glass-strong p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-bold text-white">تحلیل جامع شاخص کل</h3>
          </div>
          <div className="space-y-3">
            {analysis.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-5 border-t border-border/40 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">موقعیت</div>
              <div className="num text-sm font-bold text-primary">{((current - low52) / (high52 - low52) * 100).toFixed(0)}٪</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">فاصله از سقف</div>
              <div className="num text-sm font-bold text-danger">-{((high52 - current) / high52 * 100).toFixed(1)}٪</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">فاصله از کف</div>
              <div className="num text-sm font-bold text-success">+{((current - low52) / low52 * 100).toFixed(1)}٪</div>
            </div>
          </div>
        </div>
      </div>

      {/* Single disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/8 border border-danger/25">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90">این تحلیل صرفاً آموزشی است و نه توصیه معاملاتی.</p>
      </div>
    </div>
  );
}
