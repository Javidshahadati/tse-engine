'use client';
import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight, TrendingUp, TrendingDown, LineChart, AlertTriangle,
  Activity, Target, Layers, BarChart3, Gauge, Info, Sparkles
} from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// ═══ Indicators ═══
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

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  return { macd: ema12 - ema26, signal: ema12 - ema26 };
}

function calcATR(highs, lows, closes, p = 14) {
  if (closes.length < p + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return trs.slice(-p).reduce((a, b) => a + b, 0) / p;
}

function calcStoch(highs, lows, closes, p = 14) {
  if (closes.length < p) return null;
  const h = Math.max(...highs.slice(-p));
  const l = Math.min(...lows.slice(-p));
  const c = closes[closes.length - 1];
  if (h === l) return 50;
  return ((c - l) / (h - l)) * 100;
}

function calcBB(closes, p = 20) {
  if (closes.length < p) return null;
  const slice = closes.slice(-p);
  const mid = slice.reduce((a, b) => a + b, 0) / p;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / p;
  const sd = Math.sqrt(variance);
  const upper = mid + 2 * sd, lower = mid - 2 * sd;
  const c = closes[closes.length - 1];
  return { upper, mid, lower, pctB: (c - lower) / (upper - lower) };
}

function calcCCI(closes, p = 20) {
  if (closes.length < p) return null;
  const slice = closes.slice(-p);
  const ma = slice.reduce((a, b) => a + b, 0) / p;
  const md = slice.reduce((a, b) => a + Math.abs(b - ma), 0) / p;
  if (md === 0) return 0;
  return (closes[closes.length - 1] - ma) / (0.015 * md);
}

function calcWilliamsR(highs, lows, closes, p = 14) {
  if (closes.length < p) return null;
  const h = Math.max(...highs.slice(-p));
  const l = Math.min(...lows.slice(-p));
  const c = closes[closes.length - 1];
  if (h === l) return -50;
  return ((h - c) / (h - l)) * -100;
}

function calcMFI(highs, lows, closes, p = 14) {
  if (closes.length < p + 1) return null;
  let pos = 0, neg = 0;
  for (let i = closes.length - p; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const tpPrev = (highs[i-1] + lows[i-1] + closes[i-1]) / 3;
    if (tp > tpPrev) pos += tp;
    else if (tp < tpPrev) neg += tp;
  }
  if (neg === 0) return 100;
  return 100 - 100 / (1 + pos / neg);
}

function fibonacci(high, low) {
  const diff = high - low;
  return {
    '0.0': low, '23.6': low + 0.236 * diff, '38.2': low + 0.382 * diff,
    '50.0': low + 0.5 * diff, '61.8': low + 0.618 * diff,
    '78.6': low + 0.786 * diff, '100.0': high,
  };
}

function getSR(closes, highs, lows, current) {
  const periods = [20, 50, 100, 250];
  const resistances = [];
  const supports = [];
  periods.forEach(p => {
    if (highs.length >= p) {
      const h = Math.max(...highs.slice(-p));
      const l = Math.min(...lows.slice(-p));
      if (h > current) resistances.push({ level: h, period: p });
      if (l < current) supports.push({ level: l, period: p });
    }
  });
  const uniqR = [];
  const uniqS = [];
  resistances.sort((a, b) => a.level - b.level).forEach(x => {
    if (!uniqR.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uniqR.push(x);
  });
  supports.sort((a, b) => b.level - a.level).forEach(x => {
    if (!uniqS.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uniqS.push(x);
  });
  return { resistances: uniqR.slice(0, 3), supports: uniqS.slice(0, 3) };
}

function generateAnalysis(data, indicators, fib, sr) {
  const parts = [];
  const c = data.c;

  if (indicators.rsi != null) {
    if (indicators.rsi > 70) parts.push(`RSI در ناحیه اشباع خرید (${indicators.rsi.toFixed(1)}) است و احتمال اصلاح کوتاه‌مدت وجود دارد.`);
    else if (indicators.rsi < 30) parts.push(`RSI در ناحیه اشباع فروش (${indicators.rsi.toFixed(1)}) است و پتانسیل بازگشت صعودی دیده می‌شود.`);
    else parts.push(`RSI در محدوده خنثی (${indicators.rsi.toFixed(1)}) قرار دارد و فشار خرید یا فروش غالب نیست.`);
  }

  if (indicators.macd != null && indicators.macdSignal != null) {
    const diff = indicators.macd - indicators.macdSignal;
    if (diff > 0) parts.push(`MACD سیگنال صعودی می‌دهد (هیستوگرام مثبت).`);
    else parts.push(`MACD سیگنال نزولی می‌دهد (هیستوگرام منفی).`);
  }

  if (indicators.stoch != null) {
    if (indicators.stoch > 80) parts.push(`استوکاستیک در ناحیه اشباع خرید قرار دارد.`);
    else if (indicators.stoch < 20) parts.push(`استوکاستیک در ناحیه اشباع فروش قرار دارد.`);
  }

  if (indicators.bbPct != null) {
    if (indicators.bbPct > 0.95) parts.push(`قیمت به باند بالای بولینگر نزدیک شده — احتمال بازگشت.`);
    else if (indicators.bbPct < 0.05) parts.push(`قیمت به باند پایین بولینگر رسیده — احتمال بازگشت.`);
  }

  if (sr.resistances.length > 0) {
    const r = sr.resistances[0];
    const pct = ((r.level - c) / c * 100).toFixed(1);
    parts.push(`نزدیک‌ترین مقاومت در سطح ${fmt(r.level)} (${pct}٪ بالاتر) قرار دارد.`);
  }
  if (sr.supports.length > 0) {
    const s = sr.supports[0];
    const pct = ((c - s.level) / c * 100).toFixed(1);
    parts.push(`نزدیک‌ترین حمایت در سطح ${fmt(s.level)} (${pct}٪ پایین‌تر) قرار دارد.`);
  }

  if (fib) {
    const levels = Object.entries(fib).map(([k, v]) => ({ k, v: parseFloat(v) }));
    const nearest = levels.reduce((a, b) => Math.abs(b.v - c) < Math.abs(a.v - c) ? b : a);
    if (Math.abs(nearest.v - c) / c < 0.03) {
      parts.push(`قیمت در نزدیکی سطح فیبوناچی ${nearest.k}٪ است که می‌تواند به‌عنوان ناحیه تصمیم‌گیری عمل کند.`);
    }
  }

  return parts;
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const values = data.map(r => r.c);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const w = 400, h = 80;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const last = values[values.length - 1];
  const first = values[0];
  const color = last >= first ? '#10b981' : '#f43f5e';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#grad-${color.replace('#', '')})`} />
    </svg>
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
    const highs = rows.map(r => r.h || r.c);
    const lows = rows.map(r => r.l || r.c);
    const current = closes[closes.length - 1];
    const high52 = Math.max(...closes.slice(-250));
    const low52 = Math.min(...closes.slice(-250));

    const indicators = {
      rsi: calcRSI(closes),
      macd: null, macdSignal: null,
      atr: calcATR(highs, lows, closes),
      stoch: calcStoch(highs, lows, closes),
      bb: calcBB(closes),
      bbPct: calcBB(closes)?.pctB,
      cci: calcCCI(closes),
      willr: calcWilliamsR(highs, lows, closes),
      mfi: calcMFI(highs, lows, closes),
    };

    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    if (ema12 != null && ema26 != null) {
      indicators.macd = ema12 - ema26;
      indicators.macdSignal = indicators.macd * 0.9;
    }

    const fib = fibonacci(high52, low52);
    const sr = getSR(closes, highs, lows, current);
    const analysis = generateAnalysis({ c: current }, indicators, fib, sr);

    return { rows, closes, highs, lows, current, high52, low52, indicators, fib, sr, analysis };
  }, [idx]);

  if (!idx) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  if (!computed) {
    return <div className="max-w-7xl mx-auto px-4 py-8 text-center text-slate-400">داده کافی برای تحلیل موجود نیست</div>;
  }

  const sliced = idx.rows.slice(-range);
  const latest = computed.rows[computed.rows.length - 1];
  const prev = computed.rows[computed.rows.length - 2];
  const change = prev ? ((latest.c - prev.c) / prev.c * 100) : 0;
  const { indicators, fib, sr, analysis, high52, low52, current } = computed;

  const indicatorCards = [
    { label: 'RSI', value: indicators.rsi, unit: '', ref: '۳۰/۷۰', desc: 'نسبت قدرت خریدار به فروشنده' },
    { label: 'MACD', value: indicators.macd, unit: '', ref: 'خط صفر', desc: 'واگرایی میانگین‌های متحرک' },
    { label: 'Stochastic', value: indicators.stoch, unit: '%', ref: '۲۰/۸۰', desc: 'موقعیت قیمت در محدوده ۱۴ روزه' },
    { label: 'ATR', value: indicators.atr, unit: '', ref: 'نوسان', desc: 'میانگین دامنه واقعی' },
    { label: 'BB %B', value: indicators.bbPct, unit: '', ref: '۰-۱', desc: 'موقعیت در باندهای بولینگر' },
    { label: 'CCI', value: indicators.cci, unit: '', ref: '±۱۰۰', desc: 'شاخص کانال کالا' },
    { label: 'MFI', value: indicators.mfi, unit: '', ref: '۲۰/۸۰', desc: 'جریان پول' },
    { label: 'Williams %R', value: indicators.willr, unit: '', ref: '-۲۰/-۸۰', desc: 'قدرت روند' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">شاخص کل</span>
      </div>

      {/* Hero */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-slate-400">
                <LineChart className="w-4 h-4 text-primary" />
                شاخص کل بورس تهران
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="num text-4xl md:text-6xl font-black text-white">{fmt(latest.c)}</span>
                <span className={`num text-base font-bold flex items-center gap-1 px-3 py-1 rounded-lg ${
                  change >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                }`}>
                  {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}٪
                </span>
              </div>
            </div>
            <div className="w-full md:w-64 h-20">
              <Sparkline data={sliced} />
            </div>
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
              <div className="num text-lg font-bold text-white">{fmt(computed.rows.length)} روز</div>
            </div>
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[10px] text-slate-400 mb-1">موقعیت</div>
              <div className="num text-lg font-bold text-primary">
                {((current - low52) / (high52 - low52) * 100).toFixed(0)}٪
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Indicators Grid */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          ۸ اندیکاتور تکنیکال
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {indicatorCards.map((ind, i) => {
            const val = ind.value;
            const displayVal = val != null ? (typeof val === 'number' ? val.toFixed(2) : val) : '—';
            let color = 'text-white';
            if (ind.label === 'RSI' && val != null) color = val > 70 ? 'text-danger' : val < 30 ? 'text-success' : 'text-white';
            if (ind.label === 'Stochastic' && val != null) color = val > 80 ? 'text-danger' : val < 20 ? 'text-success' : 'text-white';
            if (ind.label === 'CCI' && val != null) color = val > 100 ? 'text-danger' : val < -100 ? 'text-success' : 'text-white';
            return (
              <div key={i} className="glass p-4 rounded-xl hover:border-primary/30 transition-colors group">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-slate-400">{ind.label}</div>
                  <Gauge className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary transition-colors" />
                </div>
                <div className={`num text-xl font-bold ${color}`}>
                  {displayVal}<span className="text-xs text-slate-500 mr-0.5">{ind.unit}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{ind.ref}</div>
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
            <h3 className="font-bold text-white">مقاومت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {sr.resistances.length > 0 ? sr.resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">R{i+1}</span>
                  <span className="num font-bold text-danger">{fmt(r.level)}</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">{r.period} روزه</div>
                  <div className="text-[10px] text-danger">+{((r.level - current) / current * 100).toFixed(1)}٪</div>
                </div>
              </div>
            )) : <div className="text-sm text-slate-500">مقاومت نزدیکی وجود ندارد</div>}
          </div>
        </div>

        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-success" />
            <h3 className="font-bold text-white">حمایت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {sr.supports.length > 0 ? sr.supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">S{i+1}</span>
                  <span className="num font-bold text-success">{fmt(s.level)}</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">{s.period} روزه</div>
                  <div className="text-[10px] text-success">-{((current - s.level) / current * 100).toFixed(1)}٪</div>
                </div>
              </div>
            )) : <div className="text-sm text-slate-500">حمایت نزدیکی وجود ندارد</div>}
          </div>
        </div>
      </div>

      {/* Fibonacci */}
      <div className="glass p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-white">سطوح فیبوناچی (۵۲ هفته)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {Object.entries(fib).map(([k, v]) => {
            const val = parseFloat(v);
            const isNear = Math.abs(val - current) / current < 0.03;
            return (
              <div key={k} className={`p-3 rounded-xl ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40 border border-border/30'}`}>
                <div className="text-[10px] text-slate-400 mb-1">{k}٪</div>
                <div className={`num text-base font-bold ${isNear ? 'text-primary' : 'text-white'}`}>{fmt(val)}</div>
                {isNear && <div className="text-[9px] text-primary mt-1">نزدیک قیمت</div>}
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-500 text-center">
          بازه ۵۲ هفته: {fmt(low52)} تا {fmt(high52)}
        </div>
      </div>

      {/* Comprehensive Analysis */}
      <div className="glass-strong p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-bold text-white">تحلیل جامع شاخص کل</h3>
          </div>
          <div className="space-y-3">
            {analysis.length > 0 ? analysis.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
              </div>
            )) : <p className="text-sm text-slate-400">داده کافی برای تحلیل موجود نیست</p>}
          </div>
          <div className="mt-5 pt-5 border-t border-border/40 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">موقعیت ۵۲ هفته</div>
              <div className="num text-sm font-bold text-primary">
                {((current - low52) / (high52 - low52) * 100).toFixed(0)}٪
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">فاصله از سقف</div>
              <div className="num text-sm font-bold text-danger">
                -{((high52 - current) / high52 * 100).toFixed(1)}٪
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">فاصله از کف</div>
              <div className="num text-sm font-bold text-success">
                +{((current - low52) / low52 * 100).toFixed(1)}٪
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/8 border border-danger/25">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90">این تحلیل صرفاً آموزشی است و نه توصیه معاملاتی.</p>
      </div>
    </div>
  );
}
