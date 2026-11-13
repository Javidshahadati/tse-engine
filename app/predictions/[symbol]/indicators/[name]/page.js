'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Info,
  BookOpen, Target, Activity, Sparkles, BarChart3, Gauge,
  Calculator, Lightbulb, ArrowLeft, Shield
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

function fmt(n, d = 2) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

const INDICATORS = {
  rsi: {
    name: 'RSI', full: 'شاخص قدرت نسبی',
    category: 'مومنتوم',
    intro: 'شاخص قدرت نسبی (Relative Strength Index) توسط جی. ولز وایلدر در ۱۹۷۸ معرفی شد و سرعت و تغییر حرکت قیمت را اندازه‌گیری می‌کند. در بازه ۰ تا ۱۰۰ نوسان دارد.',
    how: 'RSI از میانگین سودها و زیان‌های دوره‌ای محاسبه می‌شود. بالاتر از ۷۰ = اشباع خرید و احتمال اصلاح. کمتر از ۳۰ = اشباع فروش و احتمال بازگشت صعودی. بین ۴۰ تا ۶۰ ناحیه خنثی.',
    formula: 'RSI = 100 - (100 / (1 + (میانگین سود / میانگین زیان)))',
    tips: ['واگرایی RSI با قیمت = نشانه ضعف روند', 'RSI در روند قوی می‌تواند مدت‌ها بالای ۷۰ بماند', 'ترکیب با حمایت/مقاومت = نشانه قوی‌تر'],
    use: 'برای تشخیص نقاط احتمالی بازگشت و تأیید روند استفاده می‌شود.',
  },
  macd: {
    name: 'MACD', full: 'واگرایی میانگین متحرک',
    category: 'روند',
    intro: 'MACD (Moving Average Convergence Divergence) توسط جرالد آپل توسعه یافت و از تفاضل دو میانگین متحرک نمایی (۱۲ و ۲۶) محاسبه می‌شود.',
    how: 'وقتی MACD از سیگنال بالاتر = صعودی. پایین‌تر = نزولی. هیستوگرام فاصله دو خط را نشان می‌دهد و تغییر علامت آن نشانه تغییر روند است.',
    formula: 'MACD = EMA(12) - EMA(26)\nSignal = EMA(9) از MACD\nHistogram = MACD - Signal',
    tips: ['کراس صعودی/نزولی = نشانه اصلی', 'هیستوگرام در حال کاهش = ضعف روند', 'واگرایی MACD قوی‌ترین نشانه است'],
    use: 'برای تشخیص تغییر روند و قدرت آن در میان‌مدت استفاده می‌شود.',
  },
  stochastic: {
    name: 'Stochastic', full: 'استوکاستیک',
    category: 'مومنتوم',
    intro: 'استوکاستیک توسط جورج لین در دهه ۱۹۵۰ طراحی شد و موقعیت قیمت بسته‌شدن را نسبت به بالاترین و پایین‌ترین قیمت دوره مشخص می‌کند.',
    how: 'خط %K سریع و %D میانگین آن است. کراس %K از %D به بالا = صعودی. بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش.',
    formula: '%K = 100 × (Close - Low) / (High - Low)\n%D = MA(3) از %K',
    tips: ['در بازار رِنج بهتر از روندی عمل می‌کند', 'کراس در ناحیه اشباع = نشانه قوی‌تر', 'با RSI ترکیب شود برای دقت بیشتر'],
    use: 'برای شناسایی نقاط ورود/خروج کوتاه‌مدت در بازار رِنج.',
  },
  adx: {
    name: 'ADX', full: 'میانگین شاخص جهت‌دار',
    category: 'روند',
    intro: 'ADX (Average Directional Index) قدرت روند را بدون توجه به جهت اندازه‌گیری می‌کند. این اندیکاتور خود جهت را نشان نمی‌دهد، فقط قدرت را.',
    how: 'بالاتر از ۲۵ = روند قوی. کمتر از ۲۰ = روند ضعیف یا رِنج. بالاتر از ۴۰ = روند بسیار قوی. برای جهت از +DI و -DI استفاده می‌شود.',
    formula: 'ADX = میانگین ۱۴ دوره‌ای DX\nDX = 100 × |(+DI) - (-DI)| / ((+DI) + (-DI))',
    tips: ['ADX بالا + +DI بالاتر = روند صعودی قوی', 'ADX پایین = رِنج (از استراتژی‌های رِنج استفاده کن)', 'افت ADX = ضعف روند در حال شکل‌گیری'],
    use: 'برای تشخیص بازار روندی از رِنج و انتخاب استراتژی مناسب.',
  },
  atr: {
    name: 'ATR', full: 'میانگین دامنه واقعی',
    category: 'نوسان',
    intro: 'ATR (Average True Range) توسط ولز وایلدر معرفی شد و میانگین نوسان قیمت را در یک دوره مشخص نشان می‌دهد.',
    how: 'ATR بالا = نوسان زیاد و ریسک بالا. برای تعیین حد ضرر (Entry ± 1.5×ATR) و اندازه پوزیشن استفاده می‌شود.',
    formula: 'TR = max(High-Low, |High-PrevClose|, |Low-PrevClose|)\nATR = میانگین ۱۴ دوره‌ای TR',
    tips: ['حد ضرر = Entry - (1.5 × ATR)', 'حجم پوزیشن = ریسک ۱٪ / (1.5 × ATR)', 'ATR نسبی (ATR/Price) بهترین معیار مقایسه‌ای است'],
    use: 'برای تعیین حد ضرر، هدف و اندازه پوزیشن بر اساس نوسان واقعی سهم.',
  },
  bollinger: {
    name: 'Bollinger Bands', full: 'باندهای بولینگر',
    category: 'نوسان',
    intro: 'باندهای بولینگر توسط جان بولینگر معرفی شد. از یک میانگین متحرک ۲۰ دوره‌ای و دو باند انحراف معیار (±۲) تشکیل شده.',
    how: '%B موقعیت قیمت را نشان می‌دهد: ۰ = باند پایین، ۱ = باند بالا. تنگی باندها = کاهش نوسان و احتمال انفجار قیمت.',
    formula: 'Middle = SMA(20)\nUpper = Middle + 2×SD\nLower = Middle - 2×SD\n%B = (Price - Lower) / (Upper - Lower)',
    tips: ['قیمت در باند بالا + RSI بالا = احتمال اصلاح', 'Squeeze = کاهش نوسان قبل از حرکت بزرگ', 'شکست باند = ادامه روند، نه بازگشت'],
    use: 'برای تشخیص نوسان، اشباع و آمادگی برای حرکت انفجاری.',
  },
  cci: {
    name: 'CCI', full: 'شاخص کانال کالا',
    category: 'مومنتوم',
    intro: 'شاخص کانال کالا (Commodity Channel Index) توسط دونالد لمبرت برای شناسایی چرخه‌های قیمتی طراحی شد.',
    how: 'بالاتر از +۱۰۰ = قدرت روند صعودی. کمتر از -۱۰۰ = قدرت روند نزولی. عبور از صفر = تغییر خط پایه.',
    formula: 'TP = (H + L + C) / 3\nCCI = (TP - MA(TP)) / (0.015 × MD)',
    tips: ['CCI > 200 = صعودی شدید ولی احتمال اصلاح', 'کراس صفر = نشانه تغییر روند', 'در بازارهای کالایی اصلی‌ترین ابزار است'],
    use: 'برای تشخیص چرخه‌های قیمتی و نقاط بازگشت قوی.',
  },
  mfi: {
    name: 'MFI', full: 'شاخص جریان پول',
    category: 'حجم',
    intro: 'شاخص جریان پول (Money Flow Index) ترکیبی از قیمت و حجم است و به آن «RSI حجم‌وزنی» می‌گویند.',
    how: 'از قیمت معمولی و حجم محاسبه می‌شود. بالای ۸۰ = اشباع خرید، زیر ۲۰ = اشباع فروش. واگرایی با قیمت = ضعف روند.',
    formula: 'TP = (H+L+C)/3\nMF = TP × Volume\nMFI = 100 - (100 / (1 + (Positive MF / Negative MF)))',
    tips: ['واگرایی MFI قوی‌ترین نشانه است', 'MFI > ۸۰ = ورود پول بیش از حد', 'MFI < ۲۰ = خروج پول و احتمال بازگشت'],
    use: 'برای تشخیص ورود/خروج پول هوشمند با در نظر گرفتن حجم.',
  },
  williams: {
    name: 'Williams %R', full: 'درصد ویلیامز',
    category: 'مومنتوم',
    intro: 'Williams %R توسط لری ویلیامز توسعه یافت و برعکس استوکاستیک عمل می‌کند.',
    how: 'مقادیر منفی بین -۲۰ تا -۸۰. بالاتر از -۲۰ = اشباع خرید. کمتر از -۸۰ = اشباع فروش. شکست -۵۰ = تغییر روند.',
    formula: '%R = -100 × (High - Close) / (High - Low)',
    tips: ['مثل استوکاستیک ولی مقیاس منفی', 'بهترین عملکرد در بازارهای رِنج', 'با RSI تأیید نشانه'],
    use: 'برای شناسایی سریع اشباع خرید/فروش در کوتاه‌مدت.',
  },
  rtm: {
    name: 'RTM', full: 'تحلیل ساختار بازار',
    category: 'ساختار',
    intro: 'تحلیل ساختار بازار (Real-Time Market structure) به شناسایی نقاط تغییر ساختار (BOS)، تغییر شخصیت (CHoCH) و شکاف‌های ارزش منصفانه (FVG) می‌پردازد.',
    how: 'BOS (Break of Structure) شکست ساختار قبلی را نشان می‌دهد. CHoCH (Change of Character) تغییر روند. FVG (Fair Value Gap) شکاف بین کندل‌ها که ممکن است پر شود.',
    formula: 'BOS صعودی: High جدید > High قبلی\nBOS نزولی: Low جدید < Low قبلی',
    tips: ['BOS صعودی = ادامه روند صعودی', 'CHoCH = تغییر روند احتمالی', 'FVG = منطقه پر شدن قیمت'],
    use: 'برای تشخیص ساختار قیمت و نقاط تغییر روند.',
    conditions: [
      { if: 'BOS صعودی تایید شود', then: 'احتمال ادامه روند صعودی' },
      { if: 'CHoCH نزولی رخ دهد', then: 'احتمال تغییر روند از صعودی به نزولی' },
      { if: 'FVG پر شود', then: 'احتمال ادامه حرکت در جهت اصلی' },
    ],
  },
  'price-action': {
    name: 'Price Action', full: 'کنش قیمت',
    category: 'ساختار',
    intro: 'تحلیل کنش قیمت بر اساس الگوهای کندلی و رفتار مستقیم قیمت بدون استفاده از اندیکاتورهای پیچیده انجام می‌شود.',
    how: 'الگوهای مهم شامل Doji (تعادل)، Hammer (بازگشت صعودی)، Shooting Star (بازگشت نزولی)، Engulfing (تسلط یکی از طرفین) است. الگوهای کندلی در سطوح کلیدی معتبرترند.',
    formula: 'Doji: |Close - Open| < 10٪ دامنه\nHammer: سایه پایین > ۲ برابر بدنه',
    tips: ['الگوها در سطوح کلیدی معتبرترند', 'ترکیب با حجم = تایید بیشتر', 'یک الگوی تنها کافی نیست'],
    use: 'برای تشخیص نقاط بازگشت یا ادامه روند بر اساس رفتار قیمت.',
    conditions: [
      { if: 'Hammer در سطح حمایت', then: 'احتمال بازگشت صعودی' },
      { if: 'Shooting Star در مقاومت', then: 'احتمال بازگشت نزولی' },
      { if: 'Doji در روند قوی', then: 'احتمال توقف یا تغییر روند' },
    ],
  },
  obv: {
    name: 'OBV', full: 'حجم متعادل‌شده',
    category: 'حجم',
    intro: 'OBV (On-Balance Volume) توسط جو گرانویل معرفی شد. حجم را با جهت قیمت ترکیب می‌کند.',
    how: 'حجم روزهای صعودی جمع، روزهای نزولی کم می‌شود. افزایش OBV با افزایش قیمت = تأیید روند. واگرایی = ضعف روند.',
    formula: 'اگر Close > Close دیروز: OBV += Volume\nاگر Close < Close دیروز: OBV -= Volume',
    tips: ['OBV + قیمت هم‌جهت = تأیید روند', 'واگرایی OBV = خروج پول هوشمند', 'بهترین ابزار برای تشخیص accumulation/distribution'],
    use: 'برای تأیید روند قیمت با تحلیل جریان حجم.',
  },
};

const LEVEL_STYLE = {
  overbought: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'اشباع خرید', icon: TrendingDown },
  oversold: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'اشباع فروش', icon: TrendingUp },
  bullish: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'صعودی', icon: TrendingUp },
  bearish: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/40', label: 'نزولی', icon: TrendingDown },
  strong: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/40', label: 'روند قوی', icon: TrendingUp },
  weak: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/40', label: 'روند ضعیف', icon: Activity },
  range: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'رِنج', icon: Activity },
  neutral: { text: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'خنثی', icon: Activity },
  info: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40', label: 'اطلاعات', icon: Info },
  unknown: { text: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/40', label: 'نامشخص', icon: Info },
};

function analyze(name, val, ind) {
  if (val == null) return { level: 'unknown', text: 'داده کافی برای محاسبه موجود نیست.' };
  
  switch (name) {
    case 'rsi':
      if (val > 70) return { level: 'overbought', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه اشباع خرید قرار دارد. احتمال اصلاح کوتاه‌مدت یا توقف روند صعودی وجود دارد.` };
      if (val < 30) return { level: 'oversold', text: `مقدار RSI برابر ${val.toFixed(1)} است که در ناحیه اشباع فروش قرار دارد. پتانسیل بازگشت صعودی دیده می‌شود.` };
      if (val > 55) return { level: 'bullish', text: `مقدار RSI برابر ${val.toFixed(1)} است که نشان‌دهنده فشار خریداران و روند صعودی خفیف است.` };
      if (val < 45) return { level: 'bearish', text: `مقدار RSI برابر ${val.toFixed(1)} است که نشان‌دهنده فشار فروشندگان و روند نزولی خفیف است.` };
      return { level: 'neutral', text: `مقدار RSI برابر ${val.toFixed(1)} است و در ناحیه خنثی قرار دارد.` };

    case 'macd':
      if (ind.macd_hist > 0) return { level: 'bullish', text: `MACD برابر ${val.toFixed(2)} و هیستوگرام مثبت است. مومنتوم صعودی تأیید می‌شود.` };
      return { level: 'bearish', text: `MACD برابر ${val.toFixed(2)} و هیستوگرام منفی است. فشار نزولی غالب است.` };

    case 'stochastic':
      if (val > 80) return { level: 'overbought', text: `استوکاستیک برابر ${val.toFixed(1)}٪ است — در ناحیه اشباع خرید.` };
      if (val < 20) return { level: 'oversold', text: `استوکاستیک برابر ${val.toFixed(1)}٪ است — در ناحیه اشباع فروش.` };
      return { level: 'neutral', text: `استوکاستیک برابر ${val.toFixed(1)}٪ است — در ناحیه خنثی.` };

    case 'adx':
      if (val > 40) return { level: 'strong', text: `ADX برابر ${val.toFixed(1)} است — روند بسیار قوی در بازار حاکم است.` };
      if (val > 25) return { level: 'strong', text: `ADX برابر ${val.toFixed(1)} است — روند قوی در بازار وجود دارد.` };
      if (val > 20) return { level: 'weak', text: `ADX برابر ${val.toFixed(1)} است — روند ضعیف در حال شکل‌گیری است.` };
      return { level: 'range', text: `ADX برابر ${val.toFixed(1)} است — بازار در حالت رِنج قرار دارد.` };

    case 'atr':
      const pct = ind.atr_pct;
      if (pct > 5) return { level: 'overbought', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — ریسک بالا. حجم پوزیشن را کاهش دهید.` };
      if (pct > 2) return { level: 'neutral', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — نوسان متوسط و طبیعی.` };
      return { level: 'oversold', text: `نوسان روزانه ${pct.toFixed(1)}٪ است — نوسان پایین و ثبات بیشتر.` };

    case 'bollinger':
      if (val > 0.95) return { level: 'overbought', text: `قیمت به باند بالایی رسیده (%B = ${val.toFixed(2)}). احتمال بازگشت نزولی.` };
      if (val < 0.05) return { level: 'oversold', text: `قیمت به باند پایینی رسیده (%B = ${val.toFixed(2)}). احتمال بازگشت صعودی.` };
      if (val > 0.5) return { level: 'bullish', text: `قیمت در نیمه بالایی باند قرار دارد (%B = ${val.toFixed(2)}).` };
      return { level: 'bearish', text: `قیمت در نیمه پایینی باند قرار دارد (%B = ${val.toFixed(2)}).` };

    case 'cci':
      if (val > 200) return { level: 'overbought', text: `CCI برابر ${val.toFixed(1)} — روند صعودی بسیار قوی ولی احتمال اصلاح.` };
      if (val > 100) return { level: 'bullish', text: `CCI برابر ${val.toFixed(1)} — روند صعودی قوی آغاز شده است.` };
      if (val < -200) return { level: 'oversold', text: `CCI برابر ${val.toFixed(1)} — روند نزولی بسیار قوی.` };
      if (val < -100) return { level: 'bearish', text: `CCI برابر ${val.toFixed(1)} — روند نزولی قوی.` };
      return { level: 'neutral', text: `CCI برابر ${val.toFixed(1)} در ناحیه خنثی قرار دارد.` };

    case 'mfi':
      if (val > 80) return { level: 'overbought', text: `MFI برابر ${val.toFixed(1)} — جریان پول ورودی زیاد ولی احتمال اشباع.` };
      if (val < 20) return { level: 'oversold', text: `MFI برابر ${val.toFixed(1)} — جریان پول خروجی زیاد و احتمال بازگشت.` };
      return { level: 'neutral', text: `MFI برابر ${val.toFixed(1)} — جریان پول متعادل است.` };

    case 'williams':
      if (val > -20) return { level: 'overbought', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه اشباع خرید.` };
      if (val < -80) return { level: 'oversold', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه اشباع فروش.` };
      return { level: 'neutral', text: `Williams %R برابر ${val.toFixed(1)} — در ناحیه خنثی.` };

    case 'rtm':
      if (val === 'BOS صعودی') return { level: 'bullish', text: 'ساختار بازار صعودی است: قیمت از سقف اخیر عبور کرده و BOS صعودی تشکیل شده. ادامه روند صعودی محتمل است.' };
      if (val === 'BOS نزولی') return { level: 'bearish', text: 'ساختار بازار نزولی است: قیمت زیر کف اخیر رفته و BOS نزولی تشکیل شده.' };
      if (val === 'خنثی') return { level: 'neutral', text: 'قیمت هنوز ساختار مشخصی را نشکسته و بین سقف و کف اخیر نوسان می‌کند.' };
      return { level: 'info', text: 'داده کافی نیست' };
    case 'price-action':
      if (val === 'Hammer') return { level: 'bullish', text: 'الگوی Hammer: سایه پایین بلند نشان‌دهنده فشار خرید قوی در انتهای نزول است.' };
      if (val === 'Shooting Star') return { level: 'bearish', text: 'الگوی Shooting Star: سایه بالای بلند نشان‌دهنده فشار فروش در انتهای صعود است.' };
      if (val === 'Doji') return { level: 'neutral', text: 'الگوی Doji: تعادل بین خریدار و فروشنده. احتمال توقف یا تغییر روند.' };
      if (val === 'Bullish Engulfing') return { level: 'bullish', text: 'الگوی Bullish Engulfing: کندل صعودی، کندل نزولی قبل را کاملاً پوشانده. تسلط خریداران.' };
      if (val === 'Bearish Engulfing') return { level: 'bearish', text: 'الگوی Bearish Engulfing: کندل نزولی، کندل صعودی قبل را کاملاً پوشانده. تسلط فروشندگان.' };
      if (val === 'Bullish Marubozu') return { level: 'bullish', text: 'Marubozu صعودی: بدنه کامل صعودی بدون سایه. قدرت خریداران.' };
      if (val === 'Bearish Marubozu') return { level: 'bearish', text: 'Marubozu نزولی: بدنه کامل نزولی بدون سایه. قدرت فروشندگان.' };
      return { level: 'info', text: 'کندل آخر الگوی خاصی نشان نمی‌دهد.' };
    case 'obv':
      if (val > 0) return { level: 'bullish', text: `شیب OBV مثبت است — ورود پول هوشمند قابل تشخیص است.` };
      return { level: 'bearish', text: `شیب OBV منفی است — خروج پول در حال وقوع است.` };

    default:
      return { level: 'info', text: 'اطلاعات کافی برای تحلیل موجود است.' };
  }
}

export default function IndicatorPage() {
  const params = useParams();
  const symbol = decodeURIComponent(params.symbol);
  const name = params.name;
  const [charts, setCharts] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [signals, setSignals] = useState(null);
  const [chartH, setChartH] = useState(380);

  useEffect(() => {
    const update = () => setChartH(window.innerWidth < 640 ? 280 : 400);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
          <ArrowRight className="w-4 h-4" /> بازگشت
        </Link>
      </div>
    );
  }

  if (!charts || !indicators || !signals) {
    return <div className="max-w-7xl mx-auto px-3 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const chartData = charts[symbol] || [];
  const ind = indicators[symbol] || {};
  const sig = signals.signals?.find(s => s.symbol === symbol);

  if (chartData.length === 0) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">داده‌ای برای این سهم موجود نیست.</div>;
  }

  // RTM computation
  const rtmData = (() => {
    if (chartData.length < 20) return null;
    const highs = chartData.map(r => r.h);
    const lows = chartData.map(r => r.l);
    const cur = chartData[chartData.length - 1];
    const recentHigh = Math.max(...highs.slice(-15, -5));
    const recentLow = Math.min(...lows.slice(-15, -5));
    const bosBull = cur.c > recentHigh;
    const bosBear = cur.c < recentLow;
    return { bosBull, bosBear, recentHigh, recentLow };
  })();
  // PA computation
  const paData = (() => {
    if (chartData.length < 3) return null;
    const last = chartData[chartData.length - 1];
    const prev = chartData[chartData.length - 2];
    const body = Math.abs(last.c - last.o);
    const range = last.h - last.l;
    if (range === 0) return { pattern: 'کندل عادی', signal: 'neutral', desc: 'کندل بدون دامنه' };
    const upper = last.h - Math.max(last.c, last.o);
    const lower = Math.min(last.c, last.o) - last.l;
    const br = body / range, ur = upper / range, lr = lower / range;
    if (br < 0.1) return { pattern: 'Doji', signal: 'neutral', desc: 'تعادل بین خریدار و فروشنده' };
    if (lr > 0.6 && ur < 0.15 && last.c >= last.o) return { pattern: 'Hammer', signal: 'bullish', desc: 'احتمال بازگشت صعودی' };
    if (ur > 0.6 && lr < 0.15 && last.c <= last.o) return { pattern: 'Shooting Star', signal: 'bearish', desc: 'احتمال بازگشت نزولی' };
    if (last.c > last.o && prev.c < prev.o && last.c > prev.o && last.o < prev.c) return { pattern: 'Bullish Engulfing', signal: 'bullish', desc: 'تسلط خریداران' };
    if (last.c < last.o && prev.c > prev.o && last.c < prev.o && last.o > prev.c) return { pattern: 'Bearish Engulfing', signal: 'bearish', desc: 'تسلط فروشندگان' };
    if (br > 0.85 && last.c > last.o) return { pattern: 'Bullish Marubozu', signal: 'bullish', desc: 'قدرت خریداران' };
    if (br > 0.85 && last.c < last.o) return { pattern: 'Bearish Marubozu', signal: 'bearish', desc: 'قدرت فروشندگان' };
    return { pattern: 'کندل عادی', signal: 'neutral', desc: 'الگوی خاصی تشخیص داده نشد' };
  })();

  const valueMap = {
    rsi: ind.rsi, macd: ind.macd, stochastic: ind.stoch_k, adx: ind.adx,
    atr: ind.atr, bollinger: ind.bb_pct, cci: ind.cci, mfi: ind.mfi,
    williams: ind.willr, obv: ind.obv_slope,
  };
  const currentValue = valueMap[name];
  const analysis = analyze(name, currentValue, ind);
  const style = LEVEL_STYLE[analysis.level] || LEVEL_STYLE.info;
  const StyleIcon = style.icon;

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <Link href={`/predictions/${encodeURIComponent(symbol)}`} className="hover:text-primary">{symbol}</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{config.name}</span>
      </div>

      {/* Hero */}
      <div className="glass-strong rounded-2xl relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl ${style.bg}`} />
        <div className="relative p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold">
                  {config.category}
                </span>
                <span className="text-[10px] text-slate-500">|</span>
                <span className="text-[11px] text-slate-400">{symbol}</span>
              </div>
              <h1 className="text-2xl md:text-4xl font-black text-white mb-1">
                {config.name}
              </h1>
              <p className="text-sm text-slate-300">{config.full}</p>
            </div>
            <div className="text-left flex-shrink-0">
              <div className="text-[10px] text-slate-400 mb-1">مقدار فعلی</div>
              <div className="num text-3xl md:text-5xl font-black text-white">
                {currentValue != null ? fmt(currentValue) : '—'}
              </div>
              <div className={`mt-2 inline-flex items-center gap-1.5 text-[11px] md:text-xs px-2.5 py-1 rounded-lg ${style.bg} ${style.text} border ${style.border}`}>
                <StyleIcon className="w-3.5 h-3.5" /> {style.label}
              </div>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-1 md:p-2">
            <StockChart data={chartData} height={chartH} />
          </div>
        </div>
      </div>

      {/* Analysis Card */}
      <div className={`glass-strong p-4 md:p-6 rounded-2xl border-2 ${style.border} relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Sparkles className={`w-5 h-5 ${style.text}`} />
            <h2 className="text-base md:text-lg font-bold text-white">تحلیل {config.name} برای {symbol}</h2>
          </div>
          <p className="text-sm md:text-base text-slate-200 leading-relaxed mb-4">{analysis.text}</p>

          {sig && (
            <div className="pt-4 border-t border-border/40 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">امتیاز کلی Javid LM</div>
                  <div className="num text-base md:text-lg font-bold text-white">{Math.round(sig.prob * 100)} / ۱۰۰</div>
                </div>
              </div>
              <Link href={`/predictions/${encodeURIComponent(symbol)}`} className="btn-secondary text-xs md:text-sm">
                تحلیل کامل سهم <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Conditions */}
      {config.conditions && config.conditions.length > 0 && (
        <div className="glass p-4 md:p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Lightbulb className="w-5 h-5 text-warning" />
            <h3 className="text-sm md:text-base font-bold text-white">اگر شرایط زیر رخ دهد...</h3>
          </div>
          <div className="space-y-2">
            {config.conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-bg/40 border border-border/40">
                <div className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold flex-shrink-0 mt-0.5">
                  اگر
                </div>
                <div className="flex-1">
                  <div className="text-xs md:text-sm text-white font-medium mb-0.5">{c.if}</div>
                  <div className="text-[11px] md:text-xs text-slate-400">← {c.then}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* About / How */}
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
            <Lightbulb className="w-5 h-5 text-warning" />
            <h3 className="text-sm md:text-base font-bold text-white">چطور تفسیر می‌شود؟</h3>
          </div>
          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{config.how}</p>
        </div>
      </div>
      {/* Tips */}
      <div className="glass p-4 md:p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Shield className="w-5 h-5 text-success" />
          <h3 className="text-sm md:text-base font-bold text-white">نکات کلیدی استفاده</h3>
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
        <div className="mt-4 p-3 rounded-lg bg-primary/8 border border-primary/20">
          <div className="text-[10px] text-primary mb-1">کاربرد اصلی</div>
          <p className="text-xs md:text-sm text-slate-200">{config.use}</p>
        </div>
      </div>
      </div>
  );
}
