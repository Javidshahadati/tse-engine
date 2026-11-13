'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Info, BookOpen, Sparkles, BarChart3, ArrowLeft, Lightbulb, Shield, Activity } from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 2) {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// --- توابع محاسباتی ---
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
  let atr = trs.slice(0, p).reduce((a,b) => a+b, 0) / p;
  let pdm = up.slice(0, p).reduce((a,b) => a+b, 0) / p;
  let ndm = dn.slice(0, p).reduce((a,b) => a+b, 0) / p;
  const pdi = [], ndi = [];
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

const CONFIG = {
  rsi: { name: 'RSI', full: 'شاخص قدرت نسبی', category: 'مومنتوم', intro: 'سرعت و تغییر حرکت قیمت را اندازه‌گیری می‌کند.', how: 'بالاتر از ۷۰ = اشباع خرید، کمتر از ۳۰ = اشباع فروش.', tips: ['واگرایی RSI نشانه ضعف روند است.'], conditions: [{ if: 'بالای ۷۰', then: 'احتمال اصلاح' }, { if: 'زیر ۳۰', then: 'احتمال بازگشت' }] },
  macd: { name: 'MACD', full: 'واگرایی میانگین متحرک', category: 'روند', intro: 'تفاضل دو میانگین متحرک نمایی (۱۲ و ۲۶) است.', how: 'بالای صفر = صعودی، پایین = نزولی.', tips: ['کراس خط سیگنال یعنی تغییر روند.'], conditions: [{ if: 'کراس صعودی', then: 'شروع روند صعودی' }] },
  stochastic: { name: 'Stochastic', full: 'استوکاستیک', category: 'مومنتوم', intro: 'موقعیت قیمت نسبت به بالاترین/پایین‌ترین قیمت دوره است.', how: 'بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش.', tips: ['در بازار رِنج بهتر عمل می‌کند.'], conditions: [{ if: 'کراس در اشباع', then: 'سیگنال قوی' }] },
  adx: { name: 'ADX', full: 'شاخص جهت‌دار', category: 'روند', intro: 'قدرت روند را بدون توجه به جهت اندازه‌گیری می‌کند.', how: 'بالاتر از ۲۵ = روند قوی، کمتر از ۲۰ = رِنج.', tips: ['ADX بالا = از استراتژی روندی استفاده کن.'], conditions: [{ if: 'بالای ۲۵', then: 'بازار روندی' }] },
  atr: { name: 'ATR', full: 'میانگین دامنه واقعی', category: 'نوسان', intro: 'میانگین نوسان قیمت در یک دوره است.', how: 'ATR بالا = نوسان زیاد.', tips: ['برای تعیین حد ضرر استفاده می‌شود.'], conditions: [{ if: 'ATR بالا', then: 'ریسک بالا' }] },
  bollinger: { name: 'Bollinger', full: 'باندهای بولینگر', category: 'نوسان', intro: 'موقعیت قیمت در باندهای انحراف معیار است.', how: '%B = ۰ باند پایین، = ۱ باند بالا.', tips: ['Squeeze یعنی آمادگی حرکت بزرگ.'], conditions: [{ if: '%B > 0.95', then: 'احتمال بازگشت نزولی' }] },
  cci: { name: 'CCI', full: 'شاخص کانال کالا', category: 'مومنتوم', intro: 'چرخه‌های قیمتی را شناسایی می‌کند.', how: 'بالای +۱۰۰ = صعودی قوی، زیر -۱۰۰ = نزولی قوی.', tips: ['کراس صفر یعنی تغییر روند.'], conditions: [{ if: 'بالای +۱۰۰', then: 'روند صعودی' }] },
  mfi: { name: 'MFI', full: 'شاخص جریان پول', category: 'حجم', intro: 'ترکیب قیمت و حجم (RSI حجم‌وزنی) است.', how: 'بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش.', tips: ['واگرایی MFI قوی‌ترین سیگنال است.'], conditions: [{ if: 'بالای ۸۰', then: 'احتمال اصلاح' }] },
  willr: { name: 'Williams %R', full: 'درصد ویلیامز', category: 'مومنتوم', intro: 'برعکس استوکاستیک عمل می‌کند.', how: 'بالاتر از -۲۰ = اشباع خرید، کمتر از -۸۰ = اشباع فروش.', tips: ['بهترین عملکرد در بازار رِنج.'], conditions: [{ if: 'بالاتر از -۲۰', then: 'احتمال اصلاح' }] },
  obv: { name: 'OBV', full: 'حجم متعادل‌شده', category: 'حجم', intro: 'حجم را با جهت قیمت ترکیب می‌کند.', how: 'OBV + قیمت هم‌جهت = تأیید روند.', tips: ['واگرایی یعنی خروج پول هوشمند.'], conditions: [{ if: 'واگرایی نزولی', then: 'احتمال ضعف' }] },
  rtm: { name: 'RTM', full: 'ساختار بازار', category: 'ساختار', intro: 'شناسایی BOS، CHoCH و FVG.', how: 'BOS = شکست ساختار، CHoCH = تغییر شخصیت.', tips: ['CHoCH یعنی تغییر روند.'], conditions: [{ if: 'BOS صعودی', then: 'ادامه روند' }] },
  pa: { name: 'Price Action', full: 'کنش قیمت', category: 'ساختار', intro: 'الگوهای کندلی و رفتار مستقیم قیمت.', how: 'Doji = تعادل، Hammer = بازگشت.', tips: ['در سطوح کلیدی معتبرند.'], conditions: [{ if: 'Hammer در حمایت', then: 'بازگشت صعودی' }] },
};

const LEVEL = {
  overbought: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'اشباع خرید' },
  oversold: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'اشباع فروش' },
  bullish: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'صعودی' },
  bearish: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'نزولی' },
  neutral: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'خنثی' },
  info: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40', label: 'اطلاعات' },
  unknown: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'نامشخص' },
  'extreme-bull': { text: 'text-success', bg: 'bg-success/20', border: 'border-success/50', label: 'صعودی شدید' },
  'extreme-bear': { text: 'text-danger', bg: 'bg-danger/20', border: 'border-danger/50', label: 'نزولی شدید' },
};

function analyze(name, val, ind) {
  if (val == null) return { level: 'unknown', text: 'داده کافی نیست.' };
  switch (name) {
    case 'rsi': if (val > 70) return { level: 'overbought', text: 'اشباع خرید.' }; if (val < 30) return { level: 'oversold', text: 'اشباع فروش.' }; return { level: 'neutral', text: 'خنثی.' };
    case 'macd': return ind.macd > 0 ? { level: 'bullish', text: 'روند صعودی.' } : { level: 'bearish', text: 'روند نزولی.' };
    case 'stochastic': if (val > 80) return { level: 'overbought', text: 'اشباع خرید.' }; if (val < 20) return { level: 'oversold', text: 'اشباع فروش.' }; return { level: 'neutral', text: 'خنثی.' };
    case 'adx': return val > 25 ? { level: 'bullish', text: 'روند قوی.' } : { level: 'neutral', text: 'رِنج.' };
    case 'atr': return ind.atr_pct > 3 ? { level: 'overbought', text: 'نوسان بالا.' } : { level: 'neutral', text: 'نوسان متوسط.' };
    case 'bollinger': if (val > 0.95) return { level: 'overbought', text: 'باند بالا.' }; if (val < 0.05) return { level: 'oversold', text: 'باند پایین.' }; return { level: 'neutral', text: 'میانه.' };
    case 'cci': if (val > 100) return { level: 'bullish', text: 'روند صعودی.' }; if (val < -100) return { level: 'bearish', text: 'روند نزولی.' }; return { level: 'neutral', text: 'خنثی.' };
    case 'mfi': if (val > 80) return { level: 'overbought', text: 'اشباع خرید.' }; if (val < 20) return { level: 'oversold', text: 'اشباع فروش.' }; return { level: 'neutral', text: 'خنثی.' };
    case 'willr': if (val > -20) return { level: 'overbought', text: 'اشباع خرید.' }; if (val < -80) return { level: 'oversold', text: 'اشباع فروش.' }; return { level: 'neutral', text: 'خنثی.' };
    case 'obv': return val > 0 ? { level: 'bullish', text: 'ورود پول.' } : { level: 'bearish', text: 'خروج پول.' };
    default: return { level: 'info', text: 'به چارت مراجعه کنید.' };
  }
}

export default function MarketIndicatorPage() {
  const params = useParams();
  const name = params.name;
  const [idx, setIdx] = useState(null);
  const [chartH, setChartH] = useState(340);

  useEffect(() => {
    const update = () => setChartH(window.innerWidth < 640 ? 260 : 340);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
    const vols = rows.map(r => r.v || 0);
    const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
    
    const indicators = {
      rsi: calcRSI(closes), macd: (e12 && e26) ? e12 - e26 : null, atr: calcATR(highs, lows, closes),
      atr_pct: calcATR(highs, lows, closes) / closes[closes.length - 1] * 100,
      stoch: calcStoch(highs, lows, closes), bbPct: calcBB(closes)?.pctB,
      cci: calcCCI(closes), willr: calcWilliamsR(highs, lows, closes),
      adx: calcADX(highs, lows, closes), mfi: calcMFI(highs, lows, closes, vols),
      obvSlope: calcOBVSlope(highs, lows, closes, vols),
    };
    return { rows, closes, indicators };
  }, [idx]);

  if (!idx || !computed) {
    return <div className="max-w-7xl mx-auto px-3 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const config = CONFIG[name];
  if (!config) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">اندیکاتور پیدا نشد</h1>
        <Link href="/market-index" className="btn-primary mt-4 inline-flex"><ArrowRight className="w-4 h-4" /> بازگشت</Link>
      </div>
    );
  }

  const ind = computed.indicators || {};
  const rows = computed.rows;
  
  const rtmData = (() => {
    if (rows.length < 20) return null;
    const highs = rows.map(r => (r.h && r.h > 0) ? r.h : r.c);
    const lows = rows.map(r => (r.l && r.l > 0) ? r.l : r.c);
    const cur = rows[rows.length - 1];
    const recentHigh = Math.max(...highs.slice(-15, -5));
    const recentLow = Math.min(...lows.slice(-15, -5));
    return { bosBull: cur.c > recentHigh, bosBear: cur.c < recentLow };
  })();

  const paData = (() => {
    if (rows.length < 3) return null;
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const o = prev.c; const c = last.c;
    const h = (last.h && last.h > 0) ? last.h : c;
    const l = (last.l && last.l > 0) ? last.l : c;
    const body = Math.abs(c - o); const range = h - l;
    if (range === 0) return 'کندل عادی';
    const ur = (h - Math.max(c, o)) / range; const lr = (Math.min(c, o) - l) / range;
    if (body / range < 0.1) return 'Doji';
    if (lr > 0.6 && ur < 0.15 && c >= o) return 'Hammer';
    if (ur > 0.6 && lr < 0.15 && c <= o) return 'Shooting Star';
    if (body / range > 0.85 && c > o) return 'Bullish Marubozu';
    if (body / range > 0.85 && c < o) return 'Bearish Marubozu';
    return 'کندل عادی';
  })();

  const valueMap = {
    rsi: ind.rsi, macd: ind.macd, stochastic: ind.stoch, adx: ind.adx, atr: ind.atr,
    bollinger: ind.bbPct, cci: ind.cci, mfi: ind.mfi, willr: ind.willr, obv: ind.obvSlope,
    rtm: rtmData ? (rtmData.bosBull ? 'BOS صعودی' : rtmData.bosBear ? 'BOS نزولی' : 'خنثی') : null,
    pa: paData
  };

  const val = valueMap[name];
  const analysis = analyze(name, val, ind);
  const safeLevel = analysis && analysis.level ? analysis.level : 'unknown';
  const style = LEVEL[safeLevel] || LEVEL.unknown;

  const displayVal = val != null ? (typeof val === 'string' ? val : fmt(val)) : '—';
  const chartData = computed.rows.slice(-250).map(r => ({ d: r.d, c: r.c, h: r.h, l: r.l }));

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        <Link href="/market-index" className="hover:text-primary">شاخص کل</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{config.name}</span>
      </div>

      <div className="glass-strong rounded-2xl relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl ${style.bg}`} />
        <div className="relative p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold">{config.category}</span>
              <h1 className="text-2xl md:text-4xl font-black text-white mt-2 mb-1">{config.name}</h1>
              <p className="text-sm text-slate-300">{config.full}</p>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-slate-400 mb-1">مقدار فعلی</div>
              <div className="num text-3xl md:text-5xl font-black text-white">{displayVal}</div>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg ${style.bg} ${style.text} border ${style.border}`}>
                <Activity className="w-3.5 h-3.5" /> {style.label}
              </div>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-1 md:p-2">
            <IndexChart data={chartData} height={chartH} />
          </div>
        </div>
      </div>

      <div className={`glass-strong p-4 md:p-6 rounded-2xl border-2 ${style.border}`}>
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Sparkles className={`w-5 h-5 ${style.text}`} />
          <h3 className="text-base md:text-lg font-bold text-white">تحلیل {config.name}</h3>
        </div>
        <p className="text-sm md:text-base text-slate-200 leading-relaxed">{analysis.text}</p>
      </div>

      {config.conditions && (
        <div className="glass p-4 md:p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Lightbulb className="w-5 h-5 text-warning" />
            <h3 className="text-sm md:text-base font-bold text-white">اگر شرایط زیر رخ دهد...</h3>
          </div>
          <div className="space-y-2">
            {config.conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-bg/40 border border-border/40">
                <div className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold flex-shrink-0 mt-0.5">اگر</div>
                <div className="flex-1">
                  <div className="text-xs md:text-sm text-white font-medium mb-0.5">{c.if}</div>
                  <div className="text-[11px] md:text-xs text-slate-400">← {c.then}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <div className="glass p-4 md:p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            <h3 className="text-sm md:text-base font-bold text-white">این اندیکاتور چیست؟</h3>
          </div>
          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{config.intro}</p>
        </div>
        <div className="glass p-4 md:p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Info className="w-5 h-5 text-accent" />
            <h3 className="text-sm md:text-base font-bold text-white">چطور تفسیر می‌شود؟</h3>
          </div>
          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{config.how}</p>
        </div>
      </div>

      <div className="glass p-4 md:p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Shield className="w-5 h-5 text-success" />
          <h3 className="text-sm md:text-base font-bold text-white">نکات کلیدی</h3>
        </div>
        <div className="space-y-2">
          {config.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-bg/30">
              <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="num text-[10px] font-bold text-success">{i + 1}</span>
              </div>
              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      <Link href="/market-index" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
        <ArrowLeft className="w-4 h-4" /> بازگشت به شاخص کل
      </Link>
    </div>
  );
}
