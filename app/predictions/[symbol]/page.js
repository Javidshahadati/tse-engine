'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, BarChart3,
  Target, Activity, Users, Building2, Zap, LineChart, Layers,
  DollarSign, Info, Percent, Sparkles, ArrowLeft, Shield, Network
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });
import TradeSetup from '@/components/TradeSetup';
import ComprehensiveAnalysis from '@/components/ComprehensiveAnalysis';

const SIGNAL = {
  BUY: { label: 'توجه بالا', color: 'success', bg: 'bg-success/10', border: 'border-success/30', icon: TrendingUp },
  HOLD: { label: 'خنثی', color: 'neutral', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: Activity },
  SELL: { label: 'ریسک بالا', color: 'danger', bg: 'bg-danger/10', border: 'border-danger/30', icon: TrendingDown },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function analyzeStock(chart, sig) {
  const parts = [];
  if (chart.length < 20) return parts;
  const closes = chart.map(r => r.c);
  const highs = chart.map(r => r.h);
  const lows = chart.map(r => r.l);
  const current = closes[closes.length - 1];
  const high60 = Math.max(...highs);
  const low60 = Math.min(...lows);
  const pos60 = ((current - low60) / (high60 - low60) * 100).toFixed(0);

  if (sig) {
    if (sig.prob > 0.75) parts.push(`امتیاز تحلیل مدل Javid LM برای این سهم ${(sig.prob * 100).toFixed(0)} از ۱۰۰ است که نشان‌دهنده توجه بالای مدل به این سهم می‌باشد.`);
    else if (sig.prob < 0.30) parts.push(`امتیاز تحلیل مدل Javid LM برای این سهم ${(sig.prob * 100).toFixed(0)} از ۱۰۰ است که نشان‌دهنده ریسک بالای تشخیص‌داده‌شده می‌باشد.`);
    else parts.push(`امتیاز تحلیل مدل Javid LM برای این سهم ${(sig.prob * 100).toFixed(0)} از ۱۰۰ است که در محدوده خنثی قرار دارد.`);
  }

  parts.push(`قیمت فعلی در موقعیت ${pos60}٪ از محدوده ۶۰ روز اخیر (${fmt(low60)} تا ${fmt(high60)} تومان) قرار دارد.`);

  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (current > ma20 * 1.02) parts.push(`قیمت بالاتر از میانگین متحرک ۲۰ روزه (${fmt(ma20)} تومان) است که روند کوتاه‌مدت صعودی را تأیید می‌کند.`);
  else if (current < ma20 * 0.98) parts.push(`قیمت پایین‌تر از میانگین متحرک ۲۰ روزه (${fmt(ma20)} تومان) است که فشار فروش کوتاه‌مدت را نشان می‌دهد.`);
  else parts.push(`قیمت در نزدیکی میانگین متحرک ۲۰ روزه (${fmt(ma20)} تومان) در حال تعادل است.`);

  const last5 = closes.slice(-5);
  const ret5 = ((last5[last5.length - 1] - last5[0]) / last5[0] * 100).toFixed(2);
  if (ret5 > 3) parts.push(`بازده ۵ روز اخیر ${ret5}٪ مثبت بوده و مومنتوم کوتاه‌مدت قوی است.`);
  else if (ret5 < -3) parts.push(`بازده ۵ روز اخیر ${ret5}٪ منفی بوده و فشار فروش قابل‌توجه است.`);

  if (sig?.eps && sig?.pe) {
    parts.push(`نسبت P/E سهم ${fmt(sig.pe, 1)} در مقایسه با EPS برآوردی ${fmt(sig.eps)} ریال، ارزیابی بنیادی را ممکن می‌سازد.`);
  }

  return parts;
}

export default function StockPage() {
  const params = useParams();
  const symbol = decodeURIComponent(params.symbol);

  const [charts, setCharts] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [signals, setSignals] = useState(null);
  const [realLegal, setRealLegal] = useState(null);
  const [news, setNews] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);

  useEffect(() => {
    const load = async (f) => {
      try { const r = await fetch(`/data/${f}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [ch, ind, sig, rl, nw, fd] = await Promise.all([
        load('charts.json'), load('indicators.json'), load('predictions_today.json'),
        load('real_legal.json'), load('news.json'), load('fundamentals.json'),
      ]);
      setCharts(ch); setIndicators(ind); setSignals(sig);
      setRealLegal(rl); setNews(nw); setFundamentals(fd);
    })();
  }, []);

  const chartData = charts?.[symbol] || [];
  const ind = indicators?.[symbol] || {};
  const sig = signals?.signals?.find(s => s.symbol === symbol);
  const fund = fundamentals?.[symbol] || {};
  const rl = realLegal?.[symbol] || {};

  const analysis = useMemo(() => analyzeStock(chartData, sig), [chartData, sig]);

  const stockNews = useMemo(() => {
    if (!news?.items || !sig) return [];
    const keywords = [symbol, sig.name?.split(' ')[0], sig.sector?.split(' ')[0]].filter(Boolean);
    return news.items.filter(n =>
      keywords.some(k => k && k.length > 2 && n.title.includes(k))
    ).slice(0, 5);
  }, [news, symbol, sig]);

  if (!charts || !indicators || !signals) {
    return <div className="max-w-7xl mx-auto px-4 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  if (chartData.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">سهم پیدا نشد</h1>
        <p className="text-slate-400 mb-6">نماد «{symbol}» در دیتابیس موجود نیست.</p>
        <Link href="/dashboard" className="btn-primary"><ArrowRight className="w-4 h-4" /> بازگشت</Link>
      </div>
    );
  }

  const lastBar = chartData[chartData.length - 1];
  const prevBar = chartData[chartData.length - 2];
  const change = prevBar ? ((lastBar.c - prevBar.c) / prevBar.c * 100) : 0;
  const conf = sig ? SIGNAL[sig.signal] : null;

  const buyRealPct = rl.buyRealVol && rl.sellRealVol
    ? (rl.buyRealVol / (rl.buyRealVol + rl.sellRealVol) * 100) : null;
  const smartMoney = rl.buyLegalVol != null && rl.sellLegalVol != null
    ? ((rl.buyLegalVol - rl.sellLegalVol) / (rl.buyLegalVol + rl.sellLegalVol) * 100) : null;

  // Compute RTM & PA from chart
  const closes = chartData.map(r => r.c);
  const highs = chartData.map(r => r.h);
  const lows = chartData.map(r => r.l);
  const last20High = Math.max(...highs.slice(-20));
  const last20Low = Math.min(...lows.slice(-20));
  const prev20High = highs.length > 20 ? Math.max(...highs.slice(-40, -20)) : last20High;
  const prev20Low = lows.length > 20 ? Math.min(...lows.slice(-40, -20)) : last20Low;
  const bosBull = last20High > prev20High ? 1 : 0;
  const bosBear = last20Low < prev20Low ? 1 : 0;
  const avgBody = chartData.slice(-20).reduce((a, b) => a + Math.abs(b.c - b.o), 0) / 20;
  const lastBody = Math.abs(lastBar.c - lastBar.o);
  const isHammer = lastBar.c > lastBar.o && (lastBar.o - lastBar.l) > 2 * lastBody;
  const isShootingStar = lastBar.c < lastBar.o && (lastBar.h - lastBar.o) > 2 * lastBody;
  const isDoji = lastBody < (lastBar.h - lastBar.l) * 0.1;

  // 10 indicators + RTM + PA
  const indicatorCards = [
    { key: 'rsi', label: 'RSI', value: ind.rsi, unit: '', ref: '۳۰/۷۰', href: 'rsi' },
    { key: 'macd', label: 'MACD', value: ind.macd, unit: '', ref: 'خط صفر', href: 'macd' },
    { key: 'stoch', label: 'Stochastic', value: ind.stoch_k, unit: '%', ref: '۲۰/۸۰', href: 'stochastic' },
    { key: 'adx', label: 'ADX', value: ind.adx, unit: '', ref: '>۲۵ قوی', href: 'adx' },
    { key: 'atr', label: 'ATR', value: ind.atr, unit: '', ref: `${ind.atr_pct}٪ نوسان`, href: 'atr' },
    { key: 'bb', label: 'Bollinger %B', value: ind.bb_pct, unit: '', ref: '۰-۱', href: 'bollinger' },
    { key: 'cci', label: 'CCI', value: ind.cci, unit: '', ref: '±۱۰۰', href: 'cci' },
    { key: 'mfi', label: 'MFI', value: ind.mfi, unit: '', ref: '۲۰/۸۰', href: 'mfi' },
    { key: 'willr', label: 'Williams %R', value: ind.willr, unit: '', ref: '-۲۰/-۸۰', href: 'williams' },
    { key: 'obv', label: 'OBV Slope', value: ind.obv_slope, unit: '', ref: 'روند حجم', href: 'obv' },
    { key: 'bos', label: 'BOS', value: bosBull ? 'صعودی' : bosBear ? 'نزولی' : 'خنثی', unit: '', ref: 'RTM', href: 'rtm' },
    { key: 'choch', label: 'CHoCH', value: bosBear && !bosBull ? 'تأیید' : '—', unit: '', ref: 'RTM', href: 'rtm' },
    { key: 'fvg', label: 'FVG', value: lastBar.h > prevBar?.h && lastBar.l > prevBar?.l ? 'Bull' : lastBar.h < prevBar?.h && lastBar.l < prevBar?.l ? 'Bear' : '—', unit: '', ref: 'RTM', href: 'rtm' },
    { key: 'pa1', label: 'Hammer', value: isHammer ? '✓' : '—', unit: '', ref: 'PA', href: 'price-action' },
    { key: 'pa2', label: 'Shooting Star', value: isShootingStar ? '✓' : '—', unit: '', ref: 'PA', href: 'price-action' },
    { key: 'pa3', label: 'Doji', value: isDoji ? '✓' : '—', unit: '', ref: 'PA', href: 'price-action' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{symbol}</span>
      </div>

      {/* Header */}
      <div className="glass-strong p-5 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-black text-white">{symbol}</h1>
                {conf && (
                  <span className={`text-xs px-3 py-1 rounded-full flex items-center gap-1 ${conf.bg} text-${conf.color} border ${conf.border}`}>
                    <conf.icon className="w-3 h-3" /> {conf.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 mb-1">{sig?.name || '—'}</p>
              {sig?.sector && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {sig.sector}
                </p>
              )}
            </div>
            <div className="text-left">
              <div className="num text-3xl md:text-4xl font-black text-white">
                {fmt(lastBar.c)}
                <span className="text-sm text-slate-400 mr-1 font-normal">تومان</span>
              </div>
              <div className={`num text-sm font-bold flex items-center gap-1 justify-end mt-1 ${change >= 0 ? 'text-success' : 'text-danger'}`}>
                {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {change >= 0 ? '+' : ''}{change.toFixed(2)}٪
              </div>
            </div>
          </div>

          {sig && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>امتیاز تحلیل Javid LM</span>
                <span className="num font-bold text-white">{Math.round(sig.prob * 100)} / ۱۰۰</span>
              </div>
              <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${
                  sig.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' :
                  sig.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'
                }`} style={{ width: `${sig.prob * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <TradeSetup
        symbol={symbol}
        close={lastBar.c}
        atr={ind.atr}
        atr_pct={ind.atr_pct}
        prob={sig?.prob}
      />

      {/* Chart */}
      <div className="glass-strong p-4 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <LineChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-white">نمودار قیمت</span>
        </div>
        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-2">
          <StockChart data={chartData} height={400} />
        </div>
      </div>

      {/* Indicators Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            اندیکاتورها و سیگنال‌ها
          </h2>
          <span className="text-xs text-slate-400">کلیک برای تحلیل کامل</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
          {indicatorCards.map((x) => (
            <Link key={x.key}
              href={`/predictions/${encodeURIComponent(symbol)}/indicators/${x.href}`}
              className="glass p-4 rounded-xl hover:border-primary/40 hover:scale-[1.02] transition-all group cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-400">{x.label}</span>
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary transition-colors rotate-180" />
              </div>
              <div className="num text-lg font-bold text-white">
                {x.value != null ? (typeof x.value === 'number' ? x.value.toFixed(2) : x.value) : '—'}
                <span className="text-xs text-slate-500 mr-0.5">{x.unit}</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-1">{x.ref}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Support / Resistance */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-danger" />
            <h3 className="font-bold text-white">مقاومت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {ind.resistances?.length > 0 ? ind.resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">R{i + 1}</span>
                <span className="num font-bold text-danger">{fmt(r)}</span>
                <span className="text-[10px] text-slate-500">+{((r - lastBar.c) / lastBar.c * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-500">مقاومتی نزدیک نیست</div>}
          </div>
        </div>
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-success" />
            <h3 className="font-bold text-white">حمایت‌های کلیدی</h3>
          </div>
          <div className="space-y-2">
            {ind.supports?.length > 0 ? ind.supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">S{i + 1}</span>
                <span className="num font-bold text-success">{fmt(s)}</span>
                <span className="text-[10px] text-slate-500">-{((lastBar.c - s) / lastBar.c * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-500">حمایتی نزدیک نیست</div>}
          </div>
        </div>
      </div>

      {/* Fibonacci */}
      {ind.fib && (
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-white">سطوح فیبوناچی (۵۲ هفته)</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(ind.fib).map(([k, v]) => {
              const val = parseFloat(v);
              const isNear = Math.abs(val - lastBar.c) / lastBar.c < 0.03;
              return (
                <div key={k} className={`p-2.5 rounded-lg ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40 border border-border/30'}`}>
                  <div className="text-[10px] text-slate-400">{k}٪</div>
                  <div className={`num text-sm font-bold ${isNear ? 'text-primary' : 'text-white'}`}>{fmt(val)}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-500 text-center mt-3">
            بازه: {fmt(ind.low52)} تا {fmt(ind.high52)}
          </div>
        </div>
      )}

      {/* Fundamentals */}
      <div className="glass p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-warning" />
          <h3 className="font-bold text-white">داده‌های بنیادی</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-bg/40 rounded-lg p-3">
            <div className="text-[10px] text-slate-400 mb-1">EPS برآوردی</div>
            <div className="num text-base font-bold text-white">{sig?.eps ? fmt(sig.eps) : '—'} <span className="text-xs text-slate-500">ریال</span></div>
          </div>
          <div className="bg-bg/40 rounded-lg p-3">
            <div className="text-[10px] text-slate-400 mb-1">P/E سهم</div>
            <div className="num text-base font-bold text-white">{fund?.estimatedEPS && lastBar.c ? fmt(lastBar.c / parseFloat(fund.estimatedEPS), 2) : '—'}</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-3">
            <div className="text-[10px] text-slate-400 mb-1">P/E صنعت</div>
            <div className="num text-base font-bold text-white">{sig?.pe ? fmt(sig.pe, 2) : '—'}</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-3">
            <div className="text-[10px] text-slate-400 mb-1">صنعت</div>
            <div className="text-xs font-bold text-white truncate">{sig?.sector?.slice(0, 20) || '—'}</div>
          </div>
        </div>
      </div>

      {/* Real/Legal Flow */}
      <div className="glass p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-white">جریان حقیقی و حقوقی</h3>
        </div>
        {(rl.buyRealVol != null || rl.sellRealVol != null) ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-success/10 border border-success/30 rounded-xl p-3">
                <div className="text-[10px] text-success/80 mb-1">خرید حقیقی (حجم)</div>
                <div className="num text-lg font-bold text-success">{fmt(rl.buyRealVol)}</div>
                <div className="text-[10px] text-slate-400 mt-1">{fmt(rl.buyReal)} معامله</div>
              </div>
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
                <div className="text-[10px] text-danger/80 mb-1">فروش حقیقی (حجم)</div>
                <div className="num text-lg font-bold text-danger">{fmt(rl.sellRealVol)}</div>
                <div className="text-[10px] text-slate-400 mt-1">{fmt(rl.sellReal)} معامله</div>
              </div>
            </div>

            {buyRealPct != null && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>ترکیب حقیقی</span>
                  <span className="num">{buyRealPct.toFixed(1)}٪ خرید</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden flex">
                  <div className="bg-success h-full" style={{ width: `${buyRealPct}%` }} />
                  <div className="bg-danger h-full" style={{ width: `${100 - buyRealPct}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-bg/40 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">خرید حقوقی</div>
                <div className="num text-sm font-bold text-white">{fmt(rl.buyLegalVol)}</div>
              </div>
              <div className="bg-bg/40 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">فروش حقوقی</div>
                <div className="num text-sm font-bold text-white">{fmt(rl.sellLegalVol)}</div>
              </div>
            </div>

            {smartMoney != null && (
              <div className={`flex items-center justify-between p-3 rounded-lg ${smartMoney > 0 ? 'bg-success/10 border border-success/30' : 'bg-danger/10 border border-danger/30'}`}>
                <span className="text-xs flex items-center gap-1.5 text-slate-300">
                  <Zap className={`w-3.5 h-3.5 ${smartMoney > 0 ? 'text-success' : 'text-danger'}`} /> پول هوشمند
                </span>
                <span className={`num text-base font-bold ${smartMoney > 0 ? 'text-success' : 'text-danger'}`}>
                  {smartMoney > 0 ? '+' : ''}{smartMoney.toFixed(1)}٪
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">داده حقیقی/حقوقی برای این سهم در دسترس نیست</p>
        )}
      </div>

      {/* Comprehensive Analysis */}
      <ComprehensiveAnalysis
        symbol={symbol}
        sig={sig}
        ind={ind}
        fund={fund}
        chart={chartData}
      />

      {/* Stock-specific News */}
      {stockNews.length > 0 && (
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-white">اخبار مرتبط با {symbol}</h3>
          </div>
          <div className="space-y-2">
            {stockNews.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener"
                className="block py-2 border-b border-border/30 last:border-0 hover:bg-white/5 -mx-2 px-2 rounded transition-colors">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap">{n.source}</span>
                  <span className="text-xs text-white leading-relaxed">{n.title}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Single Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/8 border border-danger/25">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90">این تحلیل صرفاً آموزشی است و نه توصیه معاملاتی.</p>
      </div>
    </div>
  );
}
