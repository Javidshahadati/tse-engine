'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, BarChart3,
  Target, Activity, Users, Building2, Zap, LineChart, Layers,
  DollarSign, Info, Sparkles, ArrowLeft, Shield, Gauge, Percent
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });
import RiskProfile from '@/components/RiskProfile';
import ComprehensiveAnalysis from '@/components/ComprehensiveAnalysis';

const SIGNAL = {
  BUY: { label: 'توجه بالا', bg: 'bg-success/10', border: 'border-success/30', icon: TrendingUp, text: 'text-success' },
  HOLD: { label: 'خنثی', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: Activity, text: 'text-slate-300' },
  SELL: { label: 'ریسک بالا', bg: 'bg-danger/10', border: 'border-danger/30', icon: TrendingDown, text: 'text-danger' },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
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
  const [chartH, setChartH] = useState(400);

  useEffect(() => {
    const update = () => setChartH(window.innerWidth < 640 ? 300 : 440);
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

  const stockNews = useMemo(() => {
    if (!news?.items || !sig) return [];
    const keywords = [symbol, sig.name?.split(' ')[0], sig.sector?.split(' ')[0]].filter(Boolean);
    return news.items.filter(n =>
      keywords.some(k => k && k.length > 2 && n.title.includes(k))
    ).slice(0, 5);
  }, [news, symbol, sig]);

  if (!charts || !indicators || !signals) {
    return <div className="max-w-7xl mx-auto px-3 md:px-6 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  if (chartData.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">سهم پیدا نشد</h1>
        <p className="text-slate-300 mb-6">نماد «{symbol}» در دیتابیس موجود نیست.</p>
        <Link href="/dashboard" className="btn-primary"><ArrowRight className="w-4 h-4" /> بازگشت</Link>
      </div>
    );
  }

  const lastBar = chartData[chartData.length - 1];
  const prevBar = chartData[chartData.length - 2];
  const change = prevBar ? ((lastBar.c - prevBar.c) / prevBar.c * 100) : 0;
  const conf = sig ? SIGNAL[sig.signal] : null;

  const buyRealPct = (rl.buyRealVol != null && rl.sellRealVol != null && (rl.buyRealVol + rl.sellRealVol) > 0)
    ? (rl.buyRealVol / (rl.buyRealVol + rl.sellRealVol) * 100) : null;
  const smartMoney = (rl.buyLegalVol != null && rl.sellLegalVol != null && (rl.buyLegalVol + rl.sellLegalVol) > 0)
    ? ((rl.buyLegalVol - rl.sellLegalVol) / (rl.buyLegalVol + rl.sellLegalVol) * 100) : null;

  // فقط ۱۰ اندیکاتور
  const highsAll = chartData.map(r => r.h);
  const lowsAll = chartData.map(r => r.l);
  const last20High = Math.max(...highsAll.slice(-20));
  const last20Low = Math.min(...lowsAll.slice(-20));
  const prev20High = highsAll.length > 20 ? Math.max(...highsAll.slice(-40, -20)) : last20High;
  const prev20Low = lowsAll.length > 20 ? Math.min(...lowsAll.slice(-40, -20)) : last20Low;
  const bosBull = last20High > prev20High ? 1 : 0;
  const bosBear = last20Low < prev20Low ? 1 : 0;
  const bodySize = Math.abs(lastBar.c - lastBar.o);
  const rangeSize = lastBar.h - lastBar.l;
  const upperWick = lastBar.h - Math.max(lastBar.c, lastBar.o);
  const lowerWick = Math.min(lastBar.c, lastBar.o) - lastBar.l;
  const isHammer = lastBar.c > lastBar.o && lowerWick > 2 * bodySize && upperWick < bodySize;
  const isShootingStar = lastBar.c < lastBar.o && upperWick > 2 * bodySize && lowerWick < bodySize;
  const isDoji = bodySize < rangeSize * 0.1;
  const paPattern = isHammer ? 'Hammer' : isShootingStar ? 'Shooting Star' : isDoji ? 'Doji' : '—';

  const indicatorCards = [
    { key: 'rsi', label: 'RSI', value: ind.rsi, unit: '', ref: '۳۰ / ۷۰', icon: Activity, href: 'rsi', color: (v) => v > 70 ? 'text-danger' : v < 30 ? 'text-success' : 'text-white' },
    { key: 'macd', label: 'MACD', value: ind.macd, unit: '', ref: 'خط صفر', icon: TrendingUp, href: 'macd', color: () => ind.macd_hist > 0 ? 'text-success' : 'text-danger' },
    { key: 'stoch', label: 'Stochastic', value: ind.stoch_k, unit: '%', ref: '۲۰ / ۸۰', icon: Gauge, href: 'stochastic', color: (v) => v > 80 ? 'text-danger' : v < 20 ? 'text-success' : 'text-white' },
    { key: 'adx', label: 'ADX', value: ind.adx, unit: '', ref: 'قدرت روند', icon: BarChart3, href: 'adx', color: (v) => v > 25 ? 'text-success' : 'text-slate-400' },
    { key: 'atr', label: 'ATR', value: ind.atr, unit: '', ref: `${ind.atr_pct ? ind.atr_pct.toFixed(1) + '٪ نوسان' : 'نوسان'}`, icon: Activity, href: 'atr', color: () => 'text-warning' },
    { key: 'bb', label: 'Bollinger %B', value: ind.bb_pct, unit: '', ref: '۰ — ۱', icon: Layers, href: 'bollinger', color: (v) => v > 0.9 ? 'text-danger' : v < 0.1 ? 'text-success' : 'text-white' },
    { key: 'cci', label: 'CCI', value: ind.cci, unit: '', ref: '±۱۰۰', icon: Target, href: 'cci', color: (v) => v > 100 ? 'text-danger' : v < -100 ? 'text-success' : 'text-white' },
    { key: 'mfi', label: 'MFI', value: ind.mfi, unit: '', ref: '۲۰ / ۸۰', icon: DollarSign, href: 'mfi', color: (v) => v > 80 ? 'text-danger' : v < 20 ? 'text-success' : 'text-white' },
    { key: 'willr', label: 'Williams %R', value: ind.willr, unit: '', ref: '-۲۰ / -۸۰', icon: TrendingDown, href: 'williams', color: (v) => v > -20 ? 'text-danger' : v < -80 ? 'text-success' : 'text-white' },
    { key: 'obv', label: 'OBV Slope', value: ind.obv_slope, unit: '', ref: 'روند حجم', icon: BarChart3, href: 'obv', color: (v) => v > 0 ? 'text-success' : 'text-danger' },
    { key: 'rtm', label: 'RTM', value: bosBull ? 'صعودی' : bosBear ? 'نزولی' : 'خنثی', unit: '', ref: 'ساختار بازار', icon: Layers, href: 'rtm', color: () => bosBull ? 'text-success' : bosBear ? 'text-danger' : 'text-slate-400' },
    { key: 'pa', label: 'Price Action', value: paPattern, unit: '', ref: 'الگوی کندلی', icon: Target, href: 'price-action', color: () => isHammer ? 'text-success' : isShootingStar ? 'text-danger' : 'text-white' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{symbol}</span>
      </div>

      {/* Header */}
      <div className="glass-strong p-4 md:p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl md:text-4xl font-black text-white">{symbol}</h1>
                {conf && (
                  <span className={`text-[10px] md:text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${conf.bg} ${conf.text} border ${conf.border}`}>
                    <conf.icon className="w-3 h-3" /> {conf.label}
                  </span>
                )}
              </div>
              <p className="text-sm md:text-base text-slate-300 mb-1">{sig?.name || '—'}</p>
              {sig?.sector && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {sig.sector}
                </p>
              )}
            </div>
            <div className="text-left flex-shrink-0">
              <div className="num text-2xl md:text-4xl font-black text-white">
                {fmt(lastBar.c)}
                <span className="text-xs md:text-sm text-slate-400 mr-1 font-normal">تومان</span>
              </div>
              <div className={`num text-xs md:text-sm font-bold flex items-center gap-1 justify-end mt-1 ${change >= 0 ? 'text-success' : 'text-danger'}`}>
                {change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {change >= 0 ? '+' : ''}{change.toFixed(2)}٪
              </div>
            </div>
          </div>

          {sig && (
            <div>
              <div className="flex justify-between text-[11px] md:text-xs text-slate-400 mb-1.5">
                <span>امتیاز تحلیل Javid LM</span>
                <span className="num font-bold text-white">{Math.round(sig.prob * 100)} / ۱۰۰</span>
              </div>
              <div className="w-full h-2 md:h-2.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${
                  sig.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' :
                  sig.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'
                }`} style={{ width: `${sig.prob * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trade Setup */}
      <RiskProfile chart={chartData} close={lastBar.c} sig={sig} />

      {/* Chart */}
      <div className="glass-strong p-3 md:p-4 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <LineChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-white">نمودار قیمت</span>
        </div>
        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50 p-1 md:p-2">
          <StockChart data={chartData} height={chartH} />
        </div>
      </div>

      {/* 10 Indicators */}
      <div>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 md:w-5 h-4 md:h-5 text-primary" />
            ۱۰ اندیکاتور تکنیکال
          </h2>
          <span className="text-[10px] md:text-xs text-slate-400 hidden sm:block">کلیک برای تحلیل</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
          {indicatorCards.map((x) => {
            const display = x.value != null ? (typeof x.value === 'number' ? x.value.toFixed(2) : x.value) : '—';
            const colorClass = x.color ? x.color(x.value) : 'text-white';
            const Icon = x.icon;
            return (
              <Link key={x.key}
                href={`/predictions/${encodeURIComponent(symbol)}/indicators/${x.href}`}
                className="glass p-3 md:p-4 rounded-xl hover:border-primary/40 hover:scale-[1.02] transition-all group cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] md:text-[11px] font-medium text-slate-400">{x.label}</span>
                  </div>
                  <ArrowLeft className="w-3 h-3 text-slate-600 group-hover:text-primary transition-colors rotate-180" />
                </div>
                <div className={`num text-base md:text-lg font-bold ${colorClass}`}>
                  {display}
                  <span className="text-[10px] md:text-xs text-slate-500 mr-0.5">{x.unit}</span>
                </div>
                <div className="text-[9px] md:text-[10px] text-slate-500 mt-1">{x.ref}</div>
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
            {ind.resistances?.length > 0 ? ind.resistances.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">R{i + 1}</span>
                <span className="num font-bold text-danger">{fmt(r)}</span>
                <span className="text-[10px] text-slate-400">+{((r - lastBar.c) / lastBar.c * 100).toFixed(1)}٪</span>
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
            {ind.supports?.length > 0 ? ind.supports.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-500">S{i + 1}</span>
                <span className="num font-bold text-success">{fmt(s)}</span>
                <span className="text-[10px] text-slate-400">-{((lastBar.c - s) / lastBar.c * 100).toFixed(1)}٪</span>
              </div>
            )) : <div className="text-sm text-slate-400">حمایت نزدیکی وجود ندارد</div>}
          </div>
        </div>
      </div>

      {/* Fibonacci */}
      {ind.fib && (
        <div className="glass p-4 md:p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Layers className="w-4 md:w-5 h-4 md:h-5 text-accent" />
            <h3 className="text-sm md:text-base font-bold text-white">سطوح فیبوناچی (۵۲ هفته)</h3>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
            {Object.entries(ind.fib).map(([k, v]) => {
              const val = parseFloat(v);
              const isNear = Math.abs(val - lastBar.c) / lastBar.c < 0.03;
              return (
                <div key={k} className={`p-2 md:p-2.5 rounded-lg ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40 border border-border/30'}`}>
                  <div className="text-[9px] md:text-[10px] text-slate-400">{k}٪</div>
                  <div className={`num text-xs md:text-sm font-bold ${isNear ? 'text-primary' : 'text-white'}`}>{fmt(val)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fundamentals */}
      <div className="glass p-4 md:p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <DollarSign className="w-4 md:w-5 h-4 md:h-5 text-warning" />
          <h3 className="text-sm md:text-base font-bold text-white">داده‌های بنیادی</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <div className="bg-bg/40 rounded-lg p-2.5 md:p-3">
            <div className="text-[10px] text-slate-400 mb-1">EPS برآوردی</div>
            <div className="num text-sm md:text-base font-bold text-white">{sig?.eps ? fmt(sig.eps) : '—'} <span className="text-[10px] text-slate-500">ریال</span></div>
          </div>
          <div className="bg-bg/40 rounded-lg p-2.5 md:p-3">
            <div className="text-[10px] text-slate-400 mb-1">P/E سهم</div>
            <div className="num text-sm md:text-base font-bold text-white">{fund?.estimatedEPS && lastBar.c ? fmt((lastBar.c * 10) / parseFloat(fund.estimatedEPS), 2) : '—'}</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-2.5 md:p-3">
            <div className="text-[10px] text-slate-400 mb-1">P/E صنعت</div>
            <div className="num text-sm md:text-base font-bold text-white">{sig?.pe ? fmt(sig.pe, 2) : '—'}</div>
          </div>
          <div className="bg-bg/40 rounded-lg p-2.5 md:p-3">
            <div className="text-[10px] text-slate-400 mb-1">صنعت</div>
            <div className="text-xs font-bold text-white truncate">{sig?.sector?.slice(0, 20) || '—'}</div>
          </div>
        </div>
      </div>

      {/* Real/Legal */}
      <div className="glass p-4 md:p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Users className="w-4 md:w-5 h-4 md:h-5 text-primary" />
          <h3 className="text-sm md:text-base font-bold text-white">جریان حقیقی و حقوقی</h3>
        </div>
        {(rl.buyRealVol != null || rl.sellRealVol != null) ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:gap-3 mb-3 md:mb-4">
              <div className="bg-success/10 border border-success/30 rounded-xl p-2.5 md:p-3">
                <div className="text-[10px] text-success/80 mb-1">خرید حقیقی</div>
                <div className="num text-base md:text-lg font-bold text-success">{fmt(rl.buyRealVol || 0)}</div>
                <div className="text-[9px] text-slate-400 mt-1">{fmt(rl.buyReal || 0)} معامله</div>
              </div>
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-2.5 md:p-3">
                <div className="text-[10px] text-danger/80 mb-1">فروش حقیقی</div>
                <div className="num text-base md:text-lg font-bold text-danger">{fmt(rl.sellRealVol || 0)}</div>
                <div className="text-[9px] text-slate-400 mt-1">{fmt(rl.sellReal || 0)} معامله</div>
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

            <div className="grid grid-cols-2 gap-2 md:gap-3 mb-3">
              <div className="bg-bg/40 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">خرید حقوقی</div>
                <div className="num text-xs md:text-sm font-bold text-white">{fmt(rl.buyLegalVol || 0)}</div>
              </div>
              <div className="bg-bg/40 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">فروش حقوقی</div>
                <div className="num text-xs md:text-sm font-bold text-white">{fmt(rl.sellLegalVol || 0)}</div>
              </div>
            </div>

            {smartMoney != null && (
              <div className={`flex items-center justify-between p-2.5 md:p-3 rounded-lg ${smartMoney > 0 ? 'bg-success/10 border border-success/30' : 'bg-danger/10 border border-danger/30'}`}>
                <span className="text-xs flex items-center gap-1.5 text-slate-300">
                  <Zap className={`w-3.5 h-3.5 ${smartMoney > 0 ? 'text-success' : 'text-danger'}`} /> پول هوشمند
                </span>
                <span className={`num text-sm md:text-base font-bold ${smartMoney > 0 ? 'text-success' : 'text-danger'}`}>
                  {smartMoney > 0 ? '+' : ''}{smartMoney.toFixed(1)}٪
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">داده حقیقی/حقوقی برای این سهم در دسترس نیست</p>
        )}
      </div>

      {/* Comprehensive Analysis */}
      <ComprehensiveAnalysis symbol={symbol} sig={sig} ind={ind} fund={fund} chart={chartData} />
    </div>
  );
}