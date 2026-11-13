'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight, TrendingUp, TrendingDown, LineChart, AlertTriangle,
  Activity, Target, Layers, BarChart3, Gauge, Sparkles, Minus,
  ArrowLeft, Zap
} from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// ─── Animated count-up ───
function useCountUp(target, duration = 2000) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min((t - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.floor(target * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);

  return [value, ref];
}

// ─── Indicators ───
function calcRSI(c, p = 14) {
  if (c.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function calcEMA(c, p) {
  if (c.length < p) return null;
  const k = 2 / (p + 1);
  let e = c.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < c.length; i++) e = c[i] * k + e * (1 - k);
  return e;
}
function calcATR(h, l, c, p = 14) {
  if (c.length < p + 1) return null;
  const trs = [];
  for (let i = 1; i < c.length; i++) trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  return trs.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function calcStoch(h, l, c, p = 14) {
  if (c.length < p) return null;
  const hi = Math.max(...h.slice(-p)), lo = Math.min(...l.slice(-p));
  if (hi === lo) return 50;
  return ((c[c.length - 1] - lo) / (hi - lo)) * 100;
}
function calcBB(c, p = 20) {
  if (c.length < p) return null;
  const s = c.slice(-p);
  const m = s.reduce((a, b) => a + b, 0) / p;
  const v = s.reduce((a, b) => a + Math.pow(b - m, 2), 0) / p;
  const sd = Math.sqrt(v);
  return { pctB: (c[c.length - 1] - (m - 2 * sd)) / (4 * sd) };
}
function calcCCI(c, p = 20) {
  if (c.length < p) return null;
  const s = c.slice(-p);
  const m = s.reduce((a, b) => a + b, 0) / p;
  const md = s.reduce((a, b) => a + Math.abs(b - m), 0) / p;
  if (md === 0) return 0;
  return (c[c.length - 1] - m) / (0.015 * md);
}
function calcWilliamsR(h, l, c, p = 14) {
  if (c.length < p) return null;
  const hi = Math.max(...h.slice(-p)), lo = Math.min(...l.slice(-p));
  if (hi === lo) return -50;
  return ((hi - c[c.length - 1]) / (hi - lo)) * -100;
}
function calcADX(h, l, c, p = 14) {
  if (c.length < p * 2) return null;
  const up = [], dn = [];
  for (let i = 1; i < c.length; i++) {
    up.push(Math.max(h[i] - h[i-1], 0));
    dn.push(Math.max(l[i-1] - l[i], 0));
  }
  const trs = [];
  for (let i = 1; i < c.length; i++) trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i-1]), Math.abs(l[i] - c[i-1])));
  const pdi = [], ndi = [];
  let atr = trs.slice(0, p).reduce((a,b) => a+b, 0) / p;
  let pdm = up.slice(0, p).reduce((a,b) => a+b, 0) / p;
  let ndm = dn.slice(0, p).reduce((a,b) => a+b, 0) / p;
  for (let i = p; i < trs.length; i++) {
    atr = (atr * (p-1) + trs[i]) / p;
    pdm = (pdm * (p-1) + up[i-1]) / p;
    ndm = (ndm * (p-1) + dn[i-1]) / p;
    pdi.push(100 * pdm / (atr || 1));
    ndi.push(100 * ndm / (atr || 1));
  }
  const dx = pdi.map((v, i) => 100 * Math.abs(v - ndi[i]) / ((v + ndi[i]) || 1));
  if (dx.length < p) return null;
  return dx.slice(-p).reduce((a,b) => a+b, 0) / p;
}
function calcMFI(h, l, c, v, p = 14) {
  if (c.length < p + 1) return null;
  let pos = 0, neg = 0;
  for (let i = c.length - p; i < c.length; i++) {
    const tp = (h[i] + l[i] + c[i]) / 3;
    const tpPrev = (h[i-1] + l[i-1] + c[i-1]) / 3;
    const mf = tp * (v?.[i] || 1);
    if (tp > tpPrev) pos += mf;
    else if (tp < tpPrev) neg += mf;
  }
  if (neg === 0) return 100;
  return 100 - 100 / (1 + pos / neg);
}
function calcOBVSlope(h, l, c, v, p = 5) {
  if (c.length < p + 2) return null;
  let obv = 0;
  const vals = [];
  for (let i = 1; i < c.length; i++) {
    if (c[i] > c[i-1]) obv += v?.[i] || 0;
    else if (c[i] < c[i-1]) obv -= v?.[i] || 0;
    vals.push(obv);
  }
  return vals[vals.length - 1] - vals[vals.length - p];
}
function fibonacci(high, low) {
  const d = high - low;
  return { '0.0': low, '23.6': low + 0.236 * d, '38.2': low + 0.382 * d, '50.0': low + 0.5 * d, '61.8': low + 0.618 * d, '78.6': low + 0.786 * d, '100.0': high };
}
function getSR(c, h, l, cur) {
  const rs = [], ss = [];
  [20, 50, 100, 250].forEach(p => {
    if (h.length >= p) {
      const hi = Math.max(...h.slice(-p)), lo = Math.min(...l.slice(-p));
      if (hi > cur) rs.push({ level: hi, period: p });
      if (lo < cur) ss.push({ level: lo, period: p });
    }
  });
  const uR = [], uS = [];
  rs.sort((a, b) => a.level - b.level).forEach(x => { if (!uR.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uR.push(x); });
  ss.sort((a, b) => b.level - a.level).forEach(x => { if (!uS.some(y => Math.abs(y.level - x.level) / x.level < 0.02)) uS.push(x); });
  return { resistances: uR.slice(0, 3), supports: uS.slice(0, 3) };
}
function generateAnalysis(c, ind, fib, sr) {
  const parts = [];
  if (ind.rsi != null) {
    if (ind.rsi > 70) parts.push(`RSI در ناحیه اشباع خرید (${ind.rsi.toFixed(1)}) است و احتمال اصلاح کوتاه‌مدت وجود دارد.`);
    else if (ind.rsi < 30) parts.push(`RSI در ناحیه اشباع فروش (${ind.rsi.toFixed(1)}) است و پتانسیل بازگشت صعودی دیده می‌شود.`);
    else parts.push(`RSI در محدوده خنثی (${ind.rsi.toFixed(1)}) قرار دارد.`);
  }
  if (ind.macd != null) parts.push(ind.macd > 0 ? 'MACD نشانه صعودی دارد.' : 'MACD نشانه نزولی دارد.');
  if (sr.resistances.length > 0) parts.push(`نزدیک‌ترین مقاومت: ${fmt(sr.resistances[0].level)} (${((sr.resistances[0].level - c) / c * 100).toFixed(1)}٪ بالاتر).`);
  if (sr.supports.length > 0) parts.push(`نزدیک‌ترین حمایت: ${fmt(sr.supports[0].level)} (${((c - sr.supports[0].level) / c * 100).toFixed(1)}٪ پایین‌تر).`);
  return parts;
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
    const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
    const macd = (e12 != null && e26 != null) ? e12 - e26 : null;
    const vols = rows.map(r => r.v || 0);
    const indicators = {
      rsi: calcRSI(closes), macd, atr: calcATR(highs, lows, closes),
      stoch: calcStoch(highs, lows, closes), bbPct: calcBB(closes)?.pctB,
      cci: calcCCI(closes), willr: calcWilliamsR(highs, lows, closes),
      adx: calcADX(highs, lows, closes),
      mfi: calcMFI(highs, lows, closes, vols),
      obvSlope: calcOBVSlope(highs, lows, closes, vols),
    };
    const fib = fibonacci(high52, low52);
    const sr = getSR(current, highs, lows, current);
    const analysis = generateAnalysis(current, indicators, fib, sr);
    return { rows, closes, current, high52, low52, indicators, fib, sr, analysis };
  }, [idx]);

  const [animatedPrice, priceRef] = useCountUp(computed?.current || 0, 2000);

  if (!idx) return <div className="max-w-7xl mx-auto px-3 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  if (!computed) return <div className="max-w-7xl mx-auto px-4 py-8 text-center text-slate-400">داده کافی موجود نیست</div>;

  const latest = computed.rows[computed.rows.length - 1];
  const prev = computed.rows[computed.rows.length - 2];
  const change = prev ? ((latest.c - prev.c) / prev.c * 100) : 0;
  const { indicators, fib, sr, analysis, high52, low52, current } = computed;
  const isUp = change >= 0;

  const indicatorCards = [
    { key: 'rsi', label: 'RSI', value: indicators.rsi, ref: '۳۰ / ۷۰', color: (v) => v > 70 ? 'text-danger' : v < 30 ? 'text-success' : 'text-white' },
    { key: 'macd', label: 'MACD', value: indicators.macd, ref: 'خط صفر', color: (v) => v > 0 ? 'text-success' : 'text-danger' },
    { key: 'stoch', label: 'Stochastic', value: indicators.stoch, ref: '۲۰ / ۸۰', color: (v) => v > 80 ? 'text-danger' : v < 20 ? 'text-success' : 'text-white' },
    { key: 'adx', label: 'ADX', value: indicators.adx, ref: 'قدرت روند', color: (v) => v > 25 ? 'text-success' : 'text-slate-400' },
    { key: 'atr', label: 'ATR', value: indicators.atr, ref: 'نوسان', color: () => 'text-warning' },
    { key: 'bb', label: 'Bollinger %B', value: indicators.bbPct, ref: '۰ — ۱', color: (v) => v > 0.9 ? 'text-danger' : v < 0.1 ? 'text-success' : 'text-white' },
    { key: 'cci', label: 'CCI', value: indicators.cci, ref: '±۱۰۰', color: (v) => v > 100 ? 'text-danger' : v < -100 ? 'text-success' : 'text-white' },
    { key: 'mfi', label: 'MFI', value: indicators.mfi, ref: '۲۰ / ۸۰', color: (v) => v > 80 ? 'text-danger' : v < 20 ? 'text-success' : 'text-white' },
    { key: 'willr', label: 'Williams %R', value: indicators.willr, ref: '-۲۰ / -۸۰', color: (v) => v > -20 ? 'text-danger' : v < -80 ? 'text-success' : 'text-white' },
    { key: 'obv', label: 'OBV Slope', value: indicators.obvSlope, ref: 'روند حجم', color: (v) => v > 0 ? 'text-success' : 'text-danger' },
    { key: 'rtm', label: 'RTM', value: null, ref: 'ساختار', color: () => 'text-slate-400' },
    { key: 'pa', label: 'Price Action', value: null, ref: 'الگو', color: () => 'text-slate-400' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">شاخص کل</span>
      </div>

      {/* Hero Price Card (بدون چارت) */}
      <div className="glass-strong rounded-2xl relative overflow-hidden" ref={priceRef}>
        <div className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl ${isUp ? 'bg-success/10' : 'bg-danger/10'}`} />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

        <div className="relative p-5 md:p-8">
          <div className="flex items-center gap-2 mb-6 text-[11px] text-slate-300">
            <LineChart className="w-4 h-4 text-primary" />
            شاخص کل بورس تهران
          </div>

          <div className="flex flex-wrap items-end gap-6 mb-6">
            <div>
              <div className="text-[10px] text-slate-500 mb-2">آخرین مقدار شاخص</div>
              <div className="num text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tight">
                {fmt(animatedPrice)}
              </div>
            </div>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${isUp ? 'bg-success/15 border border-success/30' : 'bg-danger/15 border border-danger/30'}`}>
              {isUp ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-danger" />}
              <span className={`num text-lg font-black ${isUp ? 'text-success' : 'text-danger'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)}٪
              </span>
              <span className={`text-[10px] ${isUp ? 'text-success/70' : 'text-danger/70'}`}>از روز قبل</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
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
              <div className="num text-sm font-bold text-primary">{fmt(computed.rows.length)} روز</div>
            </div>
            <div className="bg-bg/60 rounded-xl p-3 border border-border/40">
              <div className="text-[9px] text-slate-500 mb-1">تغییر</div>
              <div className={`num text-sm font-bold ${isUp ? 'text-success' : 'text-danger'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)}٪
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Card (جدا) */}
      <div className="glass-strong p-3 md:p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-white">نمودار شاخص کل</span>
          </div>
          <div className="flex gap-1.5">
            {[30, 90, 250, 1000].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  range === d ? 'bg-primary text-bg' : 'glass text-slate-300'
                }`}>
                {d === 30 ? '۱م' : d === 90 ? '۳م' : d === 250 ? '۱س' : '۴س'}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-1">
          <IndexChart data={computed.rows.slice(-range)} height={340} />
        </div>
      </div>

      {/* 12 Indicators (clickable) */}
      <div>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 md:w-5 h-4 md:h-5 text-primary" />
            ۱۲ اندیکاتور
          </h2>
          <span className="text-[10px] md:text-xs text-slate-400 hidden sm:block">کلیک برای تحلیل</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
          {indicatorCards.map((x) => {
            const display = x.value != null ? (typeof x.value === 'number' ? x.value.toFixed(2) : x.value) : '—';
            const colorClass = typeof x.value === 'number' ? x.color(x.value) : 'text-slate-400';
            return (
              <Link key={x.key}
                href={`/market-index/indicators/${x.key}`}
                className="glass p-3 rounded-xl hover:border-primary/40 hover:scale-[1.02] transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] md:text-[11px] font-medium text-slate-400">{x.label}</span>
                  <ArrowLeft className="w-3 h-3 text-slate-600 group-hover:text-primary transition-colors rotate-180" />
                </div>
                <div className={`num text-sm md:text-base font-bold ${colorClass}`}>{display}</div>
                <div className="text-[9px] text-slate-500 mt-1">{x.ref}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* S/R */}
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <div className="glass p-4 md:p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <TrendingUp className="w-4 md:w-5 h-4 md:h-5 text-danger" />
            <h3 className="text-sm md:text-base font-bold text-white">مقاومت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {sr.resistances.length > 0 ? sr.resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">R{i + 1}</span>
                <span className="num font-bold text-danger">{fmt(r.level)}</span>
                <span className="text-[10px] text-danger">+{((r.level - current) / current * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-400">مقاومت نزدیکی وجود ندارد</div>}
          </div>
        </div>
        <div className="glass p-4 md:p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <TrendingDown className="w-4 md:w-5 h-4 md:h-5 text-success" />
            <h3 className="text-sm md:text-base font-bold text-white">حمایت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {sr.supports.length > 0 ? sr.supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">S{i + 1}</span>
                <span className="num font-bold text-success">{fmt(s.level)}</span>
                <span className="text-[10px] text-success">-{((current - s.level) / current * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-400">حمایت نزدیکی وجود ندارد</div>}
          </div>
        </div>
      </div>

      {/* Fibonacci */}
      <div className="glass p-4 md:p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Layers className="w-4 md:w-5 h-4 md:h-5 text-accent" />
          <h3 className="text-sm md:text-base font-bold text-white">سطوح فیبوناچی</h3>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
          {Object.entries(fib).map(([k, v]) => {
            const val = parseFloat(v);
            const isNear = Math.abs(val - current) / current < 0.03;
            return (
              <div key={k} className={`p-2 md:p-2.5 rounded-lg ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40 border border-border/30'}`}>
                <div className="text-[9px] md:text-[10px] text-slate-400">{k}٪</div>
                <div className={`num text-xs md:text-sm font-bold ${isNear ? 'text-primary' : 'text-white'}`}>{fmt(val)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis */}
      <div className="glass-strong p-4 md:p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Sparkles className="w-4 md:w-5 h-4 md:h-5 text-accent" />
            <h3 className="text-base md:text-lg font-bold text-white">تحلیل جامع شاخص کل</h3>
          </div>
          <div className="space-y-3">
            {analysis.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <p className="text-sm text-slate-300 leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
