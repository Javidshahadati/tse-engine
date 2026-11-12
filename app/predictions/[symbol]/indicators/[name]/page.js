'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Info,
  BookOpen, Target, Activity, Sparkles, LineChart, BarChart3
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// ═══ Indicator Configs ═══
const INDICATORS = {
  rsi: {
    name: 'RSI — شاخص قدرت نسبی',
    short: 'RSI',
    category: 'مومنتوم',
    intro: 'شاخص قدرت نسبی (Relative Strength Index) توسط جی. ولز وایلدر در سال ۱۹۷۸ معرفی شد. این اندیکاتور سرعت و تغییر حرکت قیمت را اندازه‌گیری می‌کند و در بازه ۰ تا ۱۰۰ نوسان دارد.',
    how: 'RSI از میانگین سودها و زیان‌های دوره‌ای محاسبه می‌شود. مقدار بالاتر از ۷۰ نشان‌دهنده اشباع خرید و احتمال اصلاح است. مقدار کمتر از ۳۰ نشانه اشباع فروش و احتمال بازگشت صعودی است. RSI بین ۴۰ تا ۶۰ ناحیه خنثی محسوب می‌شود.',
    formula: 'RSI = 100 - (100 / (1 + (میانگین سود / میانگین زیان)))',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 70) return { level: 'overbought', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه اشباع خرید قرار دارد. احتمال اصلاح کوتاه‌مدت وجود دارد.` };
      if (val < 30) return { level: 'oversold', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه اشباع فروش قرار دارد. پتانسیل بازگشت صعودی دیده می‌شود.` };
      if (val > 50) return { level: 'bullish', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه صعودی خنثی قرار دارد. فشار خریداران غالب است.` };
      return { level: 'bearish', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه نزولی خنثی قرار دارد. فشار فروشندگان غالب است.` };
    },
  },
  macd: {
    name: 'MACD — واگرایی میانگین متحرک',
    short: 'MACD',
    category: 'روند',
    intro: 'MACD (Moving Average Convergence Divergence) توسط جرالد آپل توسعه یافت و از تفاضل دو میانگین متحرک نمایی (۱۲ و ۲۶ دوره) محاسبه می‌شود.',
    how: 'وقتی خط MACD از خط سیگنال (میانگین ۹ دوره MACD) به بالا عبور کند، سیگنال صعودی است. عبور نزولی، سیگنال فروش است. هیستوگرام MACD فاصله دو خط را نشان می‌دهد و تغییر علامت آن نشانه تغییر روند است.',
    formula: 'MACD = EMA(12) - EMA(26)\nSignal = EMA(9) از MACD\nHistogram = MACD - Signal',
    signal: (val, ind) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      const hist = ind.macd_hist;
      if (hist != null && hist > 0) return { level: 'bullish', text: `MACD برابر ${val.toFixed(2)} و هیستوگرام مثبت است. روند صعودی تأیید می‌شود.` };
      return { level: 'bearish', text: `MACD برابر ${val.toFixed(2)} و هیستوگرام منفی است. فشار نزولی غالب است.` };
    },
  },
  stochastic: {
    name: 'Stochastic — استوکاستیک',
    short: 'Stoch',
    category: 'مومنتوم',
    intro: 'استوکاستیک توسط جورج لین در دهه ۱۹۵۰ طراحی شد و موقعیت قیمت بسته‌شدن را نسبت به بالاترین و پایین‌ترین قیمت دوره مشخص می‌کند.',
    how: 'خط %K سریع و خط %D میانگین %K است. وقتی %K از %D به بالا عبور کند سیگنال صعودی، و عبور نزولی سیگنال فروش است. مقادیر بالای ۸۰ اشباع خرید و کمتر از ۲۰ اشباع فروش.',
    formula: '%K = 100 × (Close - Low(n)) / (High(n) - Low(n))\n%D = MA(3) از %K',
    signal: (val, ind) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 80) return { level: 'overbought', text: `استوکاستیک برابر ${val.toFixed(1)}٪ است که در ناحیه اشباع خرید قرار دارد.` };
      if (val < 20) return { level: 'oversold', text: `استوکاستیک برابر ${val.toFixed(1)}٪ است که در ناحیه اشباع فروش قرار دارد.` };
      return { level: 'neutral', text: `استوکاستیک برابر ${val.toFixed(1)}٪ در ناحیه خنثی قرار دارد.` };
    },
  },
  adx: {
    name: 'ADX — میانگین شاخص جهت‌دار',
    short: 'ADX',
    category: 'روند',
    intro: 'ADX (Average Directional Index) قدرت روند را بدون توجه به جهت آن اندازه‌گیری می‌کند. این اندیکاتور جزء خانواده Directional Movement است.',
    how: 'ADX بالاتر از ۲۵ نشان‌دهنده روند قوی است. کمتر از ۲۰ نشانه روند ضعیف یا بازار رِنج. ADX خود جهت را نشان نمی‌دهد؛ برای جهت از +DI و -DI استفاده می‌شود.',
    formula: 'ADX = میانگین ۱۴ دوره‌ای DX\nDX = 100 × |(+DI) - (-DI)| / ((+DI) + (-DI))',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 40) return { level: 'strong', text: `ADX برابر ${val.toFixed(1)} است — روند بسیار قوی در بازار حاکم است.` };
      if (val > 25) return { level: 'trending', text: `ADX برابر ${val.toFixed(1)} است — روند قوی در بازار وجود دارد.` };
      if (val > 20) return { level: 'weak', text: `ADX برابر ${val.toFixed(1)} است — روند ضعیف در حال شکل‌گیری است.` };
      return { level: 'range', text: `ADX برابر ${val.toFixed(1)} است — بازار در حالت رِنج (بدون روند) قرار دارد.` };
    },
  },
  atr: {
    name: 'ATR — میانگین دامنه واقعی',
    short: 'ATR',
    category: 'نوسان',
    intro: 'ATR (Average True Range) توسط ولز وایلدر معرفی شد و میانگین نوسان قیمت را در یک دوره مشخص نشان می‌دهد.',
    how: 'ATR میانگین سه مقدار را محاسبه می‌کند: (High - Low)، |High - Close دیروز|، |Low - Close دیروز|. ATR بالا یعنی نوسان زیاد و ریسک بالا. برای تعیین حد ضرر و اندازه پوزیشن کاربرد دارد.',
    formula: 'TR = max(High-Low, |High-PrevClose|, |Low-PrevClose|)\nATR = میانگین ۱۴ دوره‌ای TR',
    signal: (val, ind) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      const pct = ind.atr_pct;
      if (pct == null) return { level: 'info', text: `ATR برابر ${val.toFixed(2)} است.` };
      if (pct > 5) return { level: 'high-vol', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — ریسک بالا. حجم پوزیشن را کاهش دهید.` };
      if (pct > 2) return { level: 'medium-vol', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — نوسان متوسط.` };
      return { level: 'low-vol', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — نوسان پایین و ثبات بیشتر.` };
    },
  },
  bollinger: {
    name: 'Bollinger Bands — باندهای بولینگر',
    short: 'BB',
    category: 'نوسان',
    intro: 'باندهای بولینگر توسط جان بولینگر معرفی شد و از یک میانگین متحرک (۲۰ دوره) به همراه دو باند انحراف معیار تشکیل شده است.',
    how: 'باند میانی = میانگین متحرک ۲۰ دوره. باند بالا و پایین = میانی ± ۲ انحراف معیار. %B موقعیت قیمت را نشان می‌دهد: ۰ = باند پایین، ۱ = باند بالا. تنگی باندها نشانه کاهش نوسان و احتمال انفجار قیمت است.',
    formula: 'Middle = SMA(20)\nUpper = Middle + 2×SD\nLower = Middle - 2×SD\n%B = (Price - Lower) / (Upper - Lower)',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 0.95) return { level: 'overbought', text: `قیمت به باند بالایی بولینگر رسیده (%B = ${val.toFixed(2)}). احتمال بازگشت نزولی.` };
      if (val < 0.05) return { level: 'oversold', text: `قیمت به باند پایینی بولینگر رسیده (%B = ${val.toFixed(2)}). احتمال بازگشت صعودی.` };
      if (val > 0.5) return { level: 'upper', text: `قیمت در نیمه بالایی باند بولینگر قرار دارد (%B = ${val.toFixed(2)}).` };
      return { level: 'lower', text: `قیمت در نیمه پایینی باند بولینگر قرار دارد (%B = ${val.toFixed(2)}).` };
    },
  },
  cci: {
    name: 'CCI — شاخص کانال کالا',
    short: 'CCI',
    category: 'مومنتوم',
    intro: 'شاخص کانال کالا (Commodity Channel Index) توسط دونالد لمبرت برای شناسایی چرخه‌های قیمتی طراحی شد.',
    how: 'CCI قیمت معمولی را با میانگین متحرک مقایسه می‌کند. بالاتر از +۱۰۰ نشانه قدرت روند صعودی است. کمتر از -۱۰۰ نشانه قدرت روند نزولی. عبور از صفر خط پایه را نشان می‌دهد.',
    formula: 'TP = (High + Low + Close) / 3\nCCI = (TP - MA(TP)) / (0.015 × MD)',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 200) return { level: 'extreme-bull', text: `CCI برابر ${val.toFixed(1)} — روند صعودی بسیار قوی ولی احتمال اصلاح.` };
      if (val > 100) return { level: 'bull', text: `CCI برابر ${val.toFixed(1)} — روند صعودی قوی آغاز شده است.` };
      if (val < -200) return { level: 'extreme-bear', text: `CCI برابر ${val.toFixed(1)} — روند نزولی بسیار قوی.` };
      if (val < -100) return { level: 'bear', text: `CCI برابر ${val.toFixed(1)} — روند نزولی قوی.` };
      return { level: 'neutral', text: `CCI برابر ${val.toFixed(1)} در ناحیه خنثی قرار دارد.` };
    },
  },
  mfi: {
    name: 'MFI — شاخص جریان پول',
    short: 'MFI',
    category: 'حجم',
    intro: 'شاخص جریان پول (Money Flow Index) ترکیبی از قیمت و حجم است و به آن «RSI حجم‌وزنی» هم می‌گویند.',
    how: 'MFI از قیمت معمولی و حجم محاسبه می‌شود. بالاتر از ۸۰ اشباع خرید و کمتر از ۲۰ اشباع فروش. واگرایی MFI با قیمت نشانه ضعف روند است.',
    formula: 'TP = (H+L+C)/3\nMF = TP × Volume\nMFI = 100 - (100 / (1 + (Positive MF / Negative MF)))',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 80) return { level: 'overbought', text: `MFI برابر ${val.toFixed(1)} — جریان پول ورودی زیاد ولی احتمال اشباع.` };
      if (val < 20) return { level: 'oversold', text: `MFI برابر ${val.toFixed(1)} — جریان پول خروجی زیاد، احتمال بازگشت.` };
      return { level: 'neutral', text: `MFI برابر ${val.toFixed(1)} — جریان پول متعادل است.` };
    },
  },
  williams: {
    name: 'Williams %R',
    short: 'W%R',
    category: 'مومنتوم',
    intro: 'Williams %R توسط لری ویلیامز توسعه یافت و برعکس استوکاستیک عمل می‌کند.',
    how: 'مقادیر منفی بین -۲۰ تا -۸۰. بالاتر از -۲۰ نشانه اشباع خرید، کمتر از -۸۰ نشانه اشباع فروش. شکست سطح -۵۰ تغییر روند را نشان می‌دهد.',
    formula: '%R = -100 × (High - Close) / (High - Low)',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > -20) return { level: 'overbought', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه اشباع خرید.` };
      if (val < -80) return { level: 'oversold', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه اشباع فروش.` };
      return { level: 'neutral', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه خنثی.` };
    },
  },
  obv: {
    name: 'OBV — حجم متعادل‌شده',
    short: 'OBV',
    category: 'حجم',
    intro: 'OBV (On-Balance Volume) توسط جو گرانویل معرفی شد و حجم را با جهت قیمت ترکیب می‌کند.',
    how: 'OBV حجم روزهای صعودی را جمع و حجم روزهای نزولی را کم می‌کند. افزایش OBV همراه با افزایش قیمت تأیید روند است. واگرایی OBV با قیمت نشانه ضعف روند است.',
    formula: 'اگر Close > Close دیروز: OBV = OBV + Volume\nاگر Close < Close دیروز: OBV = OBV - Volume',
    signal: (val) => {
      if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
      if (val > 0) return { level: 'bullish', text: `شیب OBV در ۵ روز اخیر مثبت است — ورود پول هوشمند قابل تشخیص است.` };
      return { level: 'bearish', text: `شیب OBV در ۵ روز اخیر منفی است — خروج پول در حال وقوع است.` };
    },
  },
  rtm: {
    name: 'RTM — تحلیل ساختار بازار',
    short: 'RTM',
    category: 'ساختار',
    intro: 'تحلیل ساختار بازار (Real-Time Market structure) به شناسایی نقاط تغییر ساختار (BOS) و تغییر شخصیت (CHoCH) و شکاف‌های ارزش منصفانه (FVG) می‌پردازد.',
    how: 'BOS (Break of Structure) شکست ساختار قبلی را نشان می‌دهد. CHoCH (Change of Character) تغییر روند را. FVG (Fair Value Gap) شکاف بین کندل‌ها که ممکن است پر شود.',
    formula: 'BOS صعودی: High جدید > High قبلی\nBOS نزولی: Low جدید < Low قبلی\nFVG: فاصله بین کندل‌های غیرپیوسته',
    signal: (val) => {
      return { level: 'info', text: 'برای تحلیل کامل RTM به چارت و ساختار قیمت مراجعه کنید. BOS صعودی نشانه ادامه روند صعودی، CHoCH نشانه تغییر روند است.' };
    },
  },
  'price-action': {
    name: 'Price Action — کنش قیمت',
    short: 'PA',
    category: 'ساختار',
    intro: 'تحلیل کنش قیمت (Price Action) بر اساس الگوهای کندلی و رفتار مستقیم قیمت بدون استفاده از اندیکاتورهای پیچیده انجام می‌شود.',
    how: 'الگوهای مهم شامل Doji (تعادل)، Hammer (بازگشت صعودی)، Shooting Star (بازگشت نزولی)، Engulfing (تسلط یکی از طرفین) است. الگوهای کندلی در سطوح کلیدی معتبرترند.',
    formula: 'Doji: |Close - Open| < 10٪ دامنه\nHammer: سایه پایین > ۲ برابر بدنه\nShooting Star: سایه بالا > ۲ برابر بدنه',
    signal: (val) => {
      return { level: 'info', text: 'الگوهای کندلی باید در کنار ساختار و سطوح کلیدی تفسیر شوند. یک الگوی تنها سیگنال معتبر نیست.' };
    },
  },
};

const LEVEL_COLOR = {
  overbought: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: 'اشباع خرید' },
  oversold: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'اشباع فروش' },
  bullish: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'صعودی' },
  bearish: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: 'نزولی' },
  bull: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'صعودی قوی' },
  bear: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: 'نزولی قوی' },
  'extreme-bull': { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: 'صعودی شدید' },
  'extreme-bear': { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'نزولی شدید' },
  strong: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'روند قوی' },
  trending: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'روند دار' },
  weak: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: 'روند ضعیف' },
  range: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'رِنج' },
  neutral: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'خنثی' },
  'high-vol': { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', label: 'نوسان بالا' },
  'medium-vol': { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: 'نوسان متوسط' },
  'low-vol': { text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: 'نوسان پایین' },
  upper: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'نیمه بالا' },
  lower: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'نیمه پایین' },
  info: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30', label: 'اطلاعات' },
  unknown: { text: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'نامشخص' },
};

export default function IndicatorPage() {
  const params = useParams();
  const symbol = decodeURIComponent(params.symbol);
  const name = params.name;

  const [charts, setCharts] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [signals, setSignals] = useState(null);

  useEffect(() => {
    const load = async (f) => {
      try { const r = await fetch(`/data/${f}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [ch, ind, sig] = await Promise.all([
        load('charts.json'), load('indicators.json'), load('predictions_today.json'),
      ]);
      setCharts(ch); setIndicators(ind); setSignals(sig);
    })();
  }, []);

  const config = INDICATORS[name];

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">اندیکاتور پیدا نشد</h1>
        <p className="text-slate-400 mb-6">اندیکاتور «{name}» موجود نیست.</p>
        <Link href={`/predictions/${encodeURIComponent(symbol)}`} className="btn-primary">
          <ArrowRight className="w-4 h-4" /> بازگشت به سهم
        </Link>
      </div>
    );
  }

  if (!charts || !indicators || !signals) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const chartData = charts[symbol] || [];
  const ind = indicators[symbol] || {};
  const sig = signals.signals?.find(s => s.symbol === symbol);

  if (chartData.length === 0) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">داده‌ای برای این سهم موجود نیست.</div>;
  }

  // Get current value
  const valueMap = {
    rsi: ind.rsi, macd: ind.macd, stochastic: ind.stoch_k, adx: ind.adx,
    atr: ind.atr, bollinger: ind.bb_pct, cci: ind.cci, mfi: ind.mfi,
    williams: ind.willr, obv: ind.obv_slope, rtm: null, 'price-action': null,
  };
  const currentValue = valueMap[name];

  // Analyze
  const analysis = config.signal(currentValue, ind);
  const levelStyle = LEVEL_COLOR[analysis.level] || LEVEL_COLOR.info;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <Link href={`/predictions/${encodeURIComponent(symbol)}`} className="hover:text-primary">{symbol}</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{config.short}</span>
      </div>

      {/* Hero */}
      <div className="glass-strong p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {config.category}
                </span>
                <span className="text-xs text-slate-500">|</span>
                <span className="text-xs text-slate-400">{symbol}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-1">{config.name}</h1>
              <p className="text-sm text-slate-400">{sig?.name}</p>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-slate-400 mb-1">مقدار فعلی</div>
              <div className="num text-4xl font-black text-white">
                {currentValue != null ? fmt(currentValue) : '—'}
              </div>
              <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${levelStyle.bg} ${levelStyle.text} border ${levelStyle.border}`}>
                <Activity className="w-3 h-3" /> {levelStyle.label}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-2">
            <StockChart data={chartData} height={380} />
          </div>
        </div>
      </div>

      {/* Analysis Card */}
      <div className={`glass-strong p-6 rounded-2xl border-2 ${levelStyle.border} relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className={`w-5 h-5 ${levelStyle.text}`} />
            <h3 className="text-lg font-bold text-white">تحلیل {config.short} برای {symbol}</h3>
          </div>
          <p className="text-base text-slate-200 leading-relaxed mb-4">{analysis.text}</p>

          {sig && (
            <div className="pt-4 border-t border-border/40 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">امتیاز کلی Javid LM</div>
                  <div className="num text-lg font-bold text-white">{Math.round(sig.prob * 100)} / ۱۰۰</div>
                </div>
              </div>
              <Link href={`/predictions/${encodeURIComponent(symbol)}`}
                className="btn-secondary text-sm">
                تحلیل کامل سهم <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* About the indicator */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-white">این اندیکاتور چیست؟</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{config.intro}</p>
        </div>

        <div className="glass p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-white">چطور تفسیر می‌شود؟</h3>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{config.how}</p>
        </div>
      </div>

      {/* Formula */}
      <div className="glass-strong p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-white">فرمول محاسبه</h3>
        </div>
        <div className="bg-bg/60 rounded-xl p-4 border border-border/40">
          <pre className="text-sm text-primary font-mono leading-relaxed whitespace-pre-wrap" dir="ltr">
            {config.formula}
          </pre>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass p-4 rounded-xl">
          <div className="text-[10px] text-slate-400 mb-1">قیمت فعلی</div>
          <div className="num text-lg font-bold text-white">{fmt(chartData[chartData.length - 1].c, 0)}</div>
        </div>
        <div className="glass p-4 rounded-xl">
          <div className="text-[10px] text-slate-400 mb-1">مقدار {config.short}</div>
          <div className="num text-lg font-bold text-primary">{currentValue != null ? fmt(currentValue) : '—'}</div>
        </div>
        <div className="glass p-4 rounded-xl">
          <div className="text-[10px] text-slate-400 mb-1">دوره داده</div>
          <div className="num text-lg font-bold text-white">{fmt(chartData.length)} روز</div>
        </div>
        <div className="glass p-4 rounded-xl">
          <div className="text-[10px] text-slate-400 mb-1">وضعیت</div>
          <div className={`text-sm font-bold ${levelStyle.text}`}>{levelStyle.label}</div>
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
