'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Info,
  BookOpen, Sparkles, BarChart3, ArrowLeft, Lightbulb, Shield, Activity
} from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

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

const CONFIG = {
  rsi: {
    name: 'RSI', full: 'شاخص قدرت نسبی', category: 'مومنتوم',
    intro: 'شاخص قدرت نسبی سرعت و تغییر حرکت قیمت را اندازه‌گیری می‌کند. در بازه ۰ تا ۱۰۰ نوسان دارد.',
    how: 'بالاتر از ۷۰ = اشباع خرید، کمتر از ۳۰ = اشباع فروش. بین ۴۰ تا ۶۰ ناحیه خنثی.',
    tips: ['واگرایی RSI با قیمت = نشانه ضعف روند', 'RSI در روند قوی مدت‌ها بالای ۷۰ می‌ماند', 'ترکیب با حمایت/مقاومت = سیگنال قوی‌تر'],
    conditions: [
      { if: 'RSI بالای ۷۰', then: 'احتمال اصلاح یا توقف روند صعودی' },
      { if: 'RSI زیر ۳۰', then: 'احتمال بازگشت صعودی' },
      { if: 'واگرایی نزولی', then: 'هشدار ضعف روند صعودی' },
    ],
  },
  macd: {
    name: 'MACD', full: 'واگرایی میانگین متحرک', category: 'روند',
    intro: 'MACD از تفاضل دو میانگین متحرک نمایی (۱۲ و ۲۶) محاسبه می‌شود و قدرت روند را نشان می‌دهد.',
    how: 'MACD بالای صفر = صعودی، پایین = نزولی. کراس خط سیگنال = تغییر روند.',
    tips: ['کراس صعودی/نزولی = سیگنال اصلی', 'هیستوگرام در حال کاهش = ضعف روند', 'واگرایی MACD قوی‌ترین سیگنال است'],
    conditions: [
      { if: 'MACD بالای صفر', then: 'روند صعودی' },
      { if: 'MACD زیر صفر', then: 'روند نزولی' },
      { if: 'کراس نزولی', then: 'احتمال تغییر روند به نزولی' },
    ],
  },
  stochastic: {
    name: 'Stochastic', full: 'استوکاستیک', category: 'مومنتوم',
    intro: 'موقعیت قیمت بسته‌شدن را نسبت به بالاترین و پایین‌ترین قیمت دوره مشخص می‌کند.',
    how: 'بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش. کراس %K از %D سیگنال است.',
    tips: ['در بازار رِنج بهتر عمل می‌کند', 'کراس در ناحیه اشباع = قوی‌تر', 'با RSI ترکیب شود'],
    conditions: [
      { if: 'بالای ۸۰', then: 'احتمال اصلاح' },
      { if: 'زیر ۲۰', then: 'احتمال بازگشت صعودی' },
    ],
  },
  adx: {
    name: 'ADX', full: 'میانگین شاخص جهت‌دار', category: 'روند',
    intro: 'قدرت روند را بدون توجه به جهت اندازه‌گیری می‌کند.',
    how: 'بالاتر از ۲۵ = روند قوی، کمتر از ۲۰ = رِنج. بالاتر از ۴۰ = روند بسیار قوی.',
    tips: ['ADX بالا = از استراتژی روندی استفاده کن', 'ADX پایین = بازار رِنج', 'افت ADX = ضعف روند'],
    conditions: [
      { if: 'ADX بالای ۲۵', then: 'بازار روندی' },
      { if: 'ADX زیر ۲۰', then: 'بازار رِنج' },
    ],
  },
  atr: {
    name: 'ATR', full: 'میانگین دامنه واقعی', category: 'نوسان',
    intro: 'میانگین نوسان قیمت را در یک دوره مشخص نشان می‌دهد.',
    how: 'ATR بالا = نوسان زیاد. برای تعیین حد ضرر و اندازه پوزیشن استفاده می‌شود.',
    tips: ['حد ضرر = Entry - (1.5 × ATR)', 'ATR نسبی (ATR/Price) بهترین معیار', 'ATR بالا = ریسک بالا'],
    conditions: [
      { if: 'ATR نسبی بالای ۵٪', then: 'ریسک بالا' },
      { if: 'ATR نسبی زیر ۲٪', then: 'نوسان پایین' },
    ],
  },
  bollinger: {
    name: 'Bollinger %B', full: 'باندهای بولینگر', category: 'نوسان',
    intro: 'موقعیت قیمت را در باندهای بولینگر (میانگین ± ۲ انحراف معیار) نشان می‌دهد.',
    how: '%B = ۰ باند پایین، = ۱ باند بالا. تنگی باند = کاهش نوسان.',
    tips: ['قیمت در باند بالا + RSI بالا = اصلاح', 'Squeeze = آمادگی حرکت بزرگ', 'شکست باند = ادامه روند'],
    conditions: [
      { if: '%B > 0.95', then: 'احتمال بازگشت نزولی' },
      { if: '%B < 0.05', then: 'احتمال بازگشت صعودی' },
    ],
  },
  cci: {
    name: 'CCI', full: 'شاخص کانال کالا', category: 'مومنتوم',
    intro: 'چرخه‌های قیمتی را شناسایی می‌کند.',
    how: 'بالای +۱۰۰ = صعودی قوی، زیر -۱۰۰ = نزولی قوی. کراس صفر = تغییر روند.',
    tips: ['CCI > 200 = صعودی شدید', 'کراس صفر = سیگنال تغییر', 'در بازارهای کالایی مهم است'],
    conditions: [
      { if: 'بالای +۱۰۰', then: 'روند صعودی' },
      { if: 'زیر -۱۰۰', then: 'روند نزولی' },
    ],
  },
  mfi: {
    name: 'MFI', full: 'شاخص جریان پول', category: 'حجم',
    intro: 'ترکیب قیمت و حجم — RSI حجم‌وزنی.',
    how: 'بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش. واگرایی = ضعف روند.',
    tips: ['واگرایی MFI قوی‌ترین سیگنال', 'MFI > ۸۰ = ورود پول بیش از حد', 'MFI < ۲۰ = خروج پول'],
    conditions: [
      { if: 'بالای ۸۰', then: 'احتمال اصلاح' },
      { if: 'زیر ۲۰', then: 'احتمال بازگشت' },
    ],
  },
  willr: {
    name: 'Williams %R', full: 'درصد ویلیامز', category: 'مومنتوم',
    intro: 'برعکس استوکاستیک عمل می‌کند، بین -۲۰ تا -۸۰.',
    how: 'بالاتر از -۲۰ = اشباع خرید، کمتر از -۸۰ = اشباع فروش.',
    tips: ['مثل استوکاستیک ولی منفی', 'بهترین در رِنج', 'با RSI تایید'],
    conditions: [
      { if: 'بالاتر از -۲۰', then: 'احتمال اصلاح' },
      { if: 'زیر -۸۰', then: 'احتمال بازگشت' },
    ],
  },
  obv: {
    name: 'OBV', full: 'حجم متعادل‌شده', category: 'حجم',
    intro: 'حجم را با جهت قیمت ترکیب می‌کند.',
    how: 'OBV + قیمت هم‌جهت = تأیید روند. واگرایی = ضعف.',
    tips: ['OBV + قیمت هم‌جهت = تایید', 'واگرایی = خروج پول هوشمند', 'تشخیص accumulation'],
    conditions: [
      { if: 'OBV + قیمت صعودی', then: 'تایید روند' },
      { if: 'واگرایی نزولی', then: 'احتمال ضعف' },
    ],
  },
  rtm: {
    name: 'RTM', full: 'تحلیل ساختار بازار', category: 'ساختار',
    intro: 'تحلیل ساختار بازار به شناسایی BOS، CHoCH و FVG می‌پردازد.',
    how: 'BOS = شکست ساختار، CHoCH = تغییر شخصیت، FVG = شکاف ارزش.',
    tips: ['BOS صعودی = ادامه روند', 'CHoCH = تغییر روند', 'FVG = منطقه پر شدن'],
    conditions: [
      { if: 'BOS صعودی', then: 'ادامه روند صعودی' },
      { if: 'CHoCH نزولی', then: 'تغییر روند' },
    ],
  },
  pa: {
    name: 'Price Action', full: 'کنش قیمت', category: 'ساختار',
    intro: 'الگوهای کندلی و رفتار مستقیم قیمت.',
    how: 'Doji = تعادل، Hammer = بازگشت صعودی، Shooting Star = بازگشت نزولی.',
    tips: ['الگوها در سطوح کلیدی معتبر', 'با حجم تایید شود', 'یک الگو تنها کافی نیست'],
    conditions: [
      { if: 'Hammer در حمایت', then: 'بازگشت صعودی' },
      { if: 'Shooting Star در مقاومت', then: 'بازگشت نزولی' },
    ],
  },
};

const LEVEL = {
  overbought: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'اشباع خرید' },
  oversold: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'اشباع فروش' },
  bullish: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'صعودی' },
  bearish: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'نزولی' },
  neutral: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'خنثی' },
  info: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40', label: 'اطلاعات' },
  unknown: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'نامشخص' },
};

function analyze(name, val, ind) {
  if (val == null) return { level: 'info', text: 'داده کافی برای تحلیل موجود نیست.' };
  switch (name) {
    case 'rsi':
      if (val > 70) return { level: 'overbought', text: `RSI برابر ${val.toFixed(1)} — اشباع خرید. احتمال اصلاح.` };
      if (val < 30) return { level: 'oversold', text: `RSI برابر ${val.toFixed(1)} — اشباع فروش. احتمال بازگشت.` };
      if (val > 55) return { level: 'bullish', text: `RSI برابر ${val.toFixed(1)} — روند صعودی خفیف.` };
      if (val < 45) return { level: 'bearish', text: `RSI برابر ${val.toFixed(1)} — روند نزولی خفیف.` };
      return { level: 'neutral', text: `RSI برابر ${val.toFixed(1)} — خنثی.` };
    case 'macd':
      if (ind.macd > 0) return { level: 'bullish', text: `MACD مثبت — روند صعودی.` };
      return { level: 'bearish', text: `MACD منفی — روند نزولی.` };
    case 'stochastic':
      if (val > 80) return { level: 'overbought', text: `Stochastic ${val.toFixed(1)}٪ — اشباع خرید.` };
      if (val < 20) return { level: 'oversold', text: `Stochastic ${val.toFixed(1)}٪ — اشباع فروش.` };
      return { level: 'neutral', text: `Stochastic ${val.toFixed(1)}٪ — خنثی.` };
    case 'adx':
      if (val > 25) return { level: 'bullish', text: `ADX ${val.toFixed(1)} — روند قوی.` };
      return { level: 'neutral', text: `ADX ${val.toFixed(1)} — رِنج.` };
    case 'atr':
      if (ind.atr_pct > 3) return { level: 'overbought', text: `نوسان ${ind.atr_pct.toFixed(1)}٪ — بالا.` };
      return { level: 'neutral', text: `نوسان ${ind.atr_pct?.toFixed(1)}٪ — متوسط.` };
    case 'bollinger':
      if (val > 0.95) return { level: 'overbought', text: `%B ${val.toFixed(2)} — باند بالا.` };
      if (val < 0.05) return { level: 'oversold', text: `%B ${val.toFixed(2)} — باند پایین.` };
      return { level: 'neutral', text: `%B ${val.toFixed(2)} — میانه.` };
    case 'cci':
      if (val > 100) return { level: 'bullish', text: `CCI ${val.toFixed(1)} — روند صعودی.` };
      if (val < -100) return { level: 'bearish', text: `CCI ${val.toFixed(1)} — روند نزولی.` };
      return { level: 'neutral', text: `CCI ${val.toFixed(1)} — خنثی.` };
    case 'mfi':
      if (val > 80) return { level: 'overbought', text: `MFI ${val.toFixed(1)} — اشباع خرید.` };
      if (val < 20) return { level: 'oversold', text: `MFI ${val.toFixed(1)} — اشباع فروش.` };
      return { level: 'neutral', text: `MFI ${val.toFixed(1)} — خنثی.` };
    case 'willr':
      if (val > -20) return { level: 'overbought', text: `Williams %R ${val.toFixed(1)} — اشباع خرید.` };
      if (val < -80) return { level: 'oversold', text: `Williams %R ${val.toFixed(1)} — اشباع فروش.` };
      return { level: 'neutral', text: `Williams %R ${val.toFixed(1)} — خنثی.` };
    case 'obv':
      if (val > 0) return { level: 'bullish', text: `OBV مثبت — ورود پول.` };
      return { level: 'bearish', text: `OBV منفی — خروج پول.` };
    case 'rtm':
      if (val === 'BOS صعودی') return { level: 'bullish', text: 'ساختار شاخص کل صعودی: شاخص از سقف اخیر عبور کرده و BOS صعودی تشکیل شده.' };
      if (val === 'BOS نزولی') return { level: 'bearish', text: 'ساختار شاخص کل نزولی: شاخص زیر کف اخیر رفته و BOS نزولی تشکیل شده.' };
      if (val === 'خنثی') return { level: 'neutral', text: 'شاخص کل بین سقف و کف اخیر در حال نوسان است.' };
      return { level: 'info', text: 'داده کافی نیست' };
    case 'pa':
      if (val === 'Hammer') return { level: 'bullish', text: 'الگوی Hammer در شاخص کل: احتمال بازگشت صعودی.' };
      if (val === 'Shooting Star') return { level: 'bearish', text: 'الگوی Shooting Star در شاخص کل: احتمال بازگشت نزولی.' };
      if (val === 'Doji') return { level: 'neutral', text: 'Doji در شاخص: تعادل بین خریدار و فروشنده.' };
      if (val === 'Bullish Marubozu') return { level: 'bullish', text: 'Marubozu صعودی: قدرت خریداران در شاخص.' };
      if (val === 'Bearish Marubozu') return { level: 'bearish', text: 'Marubozu نزولی: قدرت فروشندگان در شاخص.' };
      return { level: 'info', text: 'کندل آخر الگوی خاصی نشان نمی‌دهد.' };
    default:
      return { level: 'info', text: 'برای تحلیل دقیق‌تر به چارت مراجعه کنید.' };
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

  const config = CONFIG[name];

  const computed = useMemo(() => {
    if (!idx?.rows) return null;
    const rows = idx.rows.filter(r => r.c > 0);
    if (rows.length < 30) return null;
    const closes = rows.map(r => r.c);
    const highs = rows.map(r => (r.h && r.h > 0) ? r.h : r.c);
    const lows = rows.map(r => (r.l && r.l > 0) ? r.l : r.c);
    const e12 = calcEMA(closes, 12), e26 = calcEMA(closes, 26);
    const macd = (e12 != null && e26 != null) ? e12 - e26 : null;
    const ind = {
      rsi: calcRSI(closes), macd, atr: calcATR(highs, lows, closes),
      atr_pct: calcATR(highs, lows, closes) / closes[closes.length - 1] * 100,
      stoch: calcStoch(highs, lows, closes), bbPct: calcBB(closes)?.pctB,
      cci: calcCCI(closes), willr: calcWilliamsR(highs, lows, closes),
    };
    return { rows, closes, ind };
  }, [idx]);

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">اندیکاتور پیدا نشد</h1>
        <Link href="/market-index" className="btn-primary mt-4 inline-flex"><ArrowRight className="w-4 h-4" /> بازگشت به شاخص</Link>
      </div>
    );
  }

  if (!idx || !computed) {
    return <div className="max-w-7xl mx-auto px-3 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const ind = computed.ind || computed.indicators || {};
  const valueMap = { rsi: ind.rsi, macd: ind.macd, stochastic: ind.stoch, adx: null, atr: ind.atr, bollinger: ind.bbPct, cci: ind.cci, mfi: null, willr: ind.willr, obv: null, rtm: rtmData ? (rtmData.bosBull ? 'BOS صعودی' : rtmData.bosBear ? 'BOS نزولی' : 'خنثی') : null, pa: paData ? paData.pattern : null };
  // RTM computation
  const rows = computed.rows;
  const rtmData = (() => {
    if (rows.length < 20) return null;
    const highs = rows.map(r => (r.h && r.h > 0) ? r.h : r.c);
    const lows = rows.map(r => (r.l && r.l > 0) ? r.l : r.c);
    const cur = rows[rows.length - 1];
    const recentHigh = Math.max(...highs.slice(-15, -5));
    const recentLow = Math.min(...lows.slice(-15, -5));
    return { bosBull: cur.c > recentHigh, bosBear: cur.c < recentLow, recentHigh, recentLow };
  })();
  const paData = (() => {
    if (rows.length < 3) return null;
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const o = prev.c;
    const c = last.c;
    const h = (last.h && last.h > 0) ? last.h : c;
    const l = (last.l && last.l > 0) ? last.l : c;
    const body = Math.abs(c - o);
    const range = h - l;
    if (range === 0) return { pattern: 'کندل عادی', signal: 'neutral', desc: 'کندل بدون دامنه' };
    const upper = h - Math.max(c, o);
    const lower = Math.min(c, o) - l;
    const br = body / range, ur = upper / range, lr = lower / range;
    if (br < 0.1) return { pattern: 'Doji', signal: 'neutral', desc: 'تعادل' };
    if (lr > 0.6 && ur < 0.15 && c >= o) return { pattern: 'Hammer', signal: 'bullish', desc: 'بازگشت صعودی' };
    if (ur > 0.6 && lr < 0.15 && c <= o) return { pattern: 'Shooting Star', signal: 'bearish', desc: 'بازگشت نزولی' };
    if (c > o && br > 0.85) return { pattern: 'Bullish Marubozu', signal: 'bullish', desc: 'قدرت خریداران' };
    if (c < o && br > 0.85) return { pattern: 'Bearish Marubozu', signal: 'bearish', desc: 'قدرت فروشندگان' };
    return { pattern: 'کندل عادی', signal: 'neutral', desc: 'الگوی خاص' };
  })();

  const val = valueMap[name];
  const analysis = analyze(name, val, ind);
  const style = LEVEL[analysis.level] || LEVEL.info || LEVEL.unknown || { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'نامشخص' };

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
              <div className="num text-3xl md:text-5xl font-black text-white">{val != null ? fmt(val) : '—'}</div>
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
