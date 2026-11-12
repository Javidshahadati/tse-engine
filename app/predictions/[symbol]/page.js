'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Target, Activity, Users, Building2, Zap,
  LineChart, Layers, DollarSign, Info, Percent
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

const SIGNAL_LABEL = {
  BUY: { label: 'توجه بالا', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  HOLD: { label: 'خنثی', color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  SELL: { label: 'ریسک بالا', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30' },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function Card({ title, icon: Icon, children, color = 'text-primary' }) {
  return (
    <div className="glass p-4 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="py-2">
      <div className="text-[10px] text-slate-400 mb-1">{label}</div>
      <div className={`num text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
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

  const loading = !charts || !indicators || !signals;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <div className="h-12 glass rounded-xl shimmer" />
        <div className="h-96 glass rounded-xl shimmer" />
      </div>
    );
  }

  const chartData = charts[symbol] || [];
  const ind = indicators[symbol] || {};
  const sig = signals.signals?.find(s => s.symbol === symbol);
  const fund = fundamentals?.[symbol] || {};
  const rl = realLegal?.[symbol] || {};

  if (chartData.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">سهم پیدا نشد</h1>
        <p className="text-slate-400 mb-6">نماد «{symbol}» در دیتابیس موجود نیست.</p>
        <Link href="/dashboard" className="btn-primary">
          <ArrowRight className="w-4 h-4" /> بازگشت به داشبورد
        </Link>
      </div>
    );
  }

  const lastBar = chartData[chartData.length - 1];
  const prevBar = chartData[chartData.length - 2];
  const change = prevBar ? ((lastBar.c - prevBar.c) / prevBar.c * 100) : 0;

  const conf = sig ? SIGNAL_LABEL[sig.signal] : null;

  // حقیقی/حقوقی
  const buyRealPct = rl.buyRealVol && rl.sellRealVol
    ? (rl.buyRealVol / (rl.buyRealVol + rl.sellRealVol) * 100) : null;
  const smartMoney = rl.buyLegalVol && rl.sellLegalVol
    ? ((rl.buyLegalVol - rl.sellLegalVol) / (rl.buyLegalVol + rl.sellLegalVol) * 100) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-primary">داشبورد</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-white font-bold">{symbol}</span>
      </div>

      {/* Header */}
      <div className="glass-strong p-5 rounded-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold text-white">{symbol}</h1>
              {conf && (
                <span className={`text-xs px-3 py-1 rounded-full ${conf.bg} ${conf.color} border ${conf.border}`}>
                  {conf.label}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{sig?.name || '—'}</p>
            {sig?.sector && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {sig.sector}
              </p>
            )}
          </div>
          <div className="text-left">
            <div className="num text-3xl md:text-4xl font-bold text-white">
              {fmt(lastBar.c)}
              <span className="text-sm text-slate-400 mr-1">تومان</span>
            </div>
            <div className={`num text-sm font-bold flex items-center gap-1 ${change >= 0 ? 'text-success' : 'text-danger'}`}>
              {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {change >= 0 ? '+' : ''}{change.toFixed(2)}٪
            </div>
          </div>
        </div>

        {/* Score bar */}
        {sig && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>امتیاز تحلیل مدل</span>
              <span className="num font-bold text-white">{Math.round(sig.prob * 100)} / ۱۰۰</span>
            </div>
            <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${sig.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' : sig.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'}`}
                style={{ width: `${sig.prob * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="glass-strong p-4 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <LineChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-white">نمودار قیمت (۶۰ روز اخیر)</span>
        </div>
        <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50">
          <StockChart data={chartData} height={360} />
        </div>
      </div>

      {/* 10 Indicators Grid */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          ۱۰ اندیکاتور تکنیکال
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'RSI', value: ind.rsi, unit: '', ref: '۳۰/۷۰', color: ind.rsi > 70 ? 'text-danger' : ind.rsi < 30 ? 'text-success' : 'text-white' },
            { label: 'MACD', value: ind.macd, unit: '', ref: ind.macd_hist > 0 ? 'صعودی' : 'نزولی', color: ind.macd_hist > 0 ? 'text-success' : 'text-danger' },
            { label: 'Stochastic', value: ind.stoch_k, unit: '%', ref: '۲۰/۸۰', color: 'text-white' },
            { label: 'ADX', value: ind.adx, unit: '', ref: '>۲۵ قوی', color: ind.adx > 25 ? 'text-success' : 'text-slate-400' },
            { label: 'ATR', value: ind.atr, unit: '', ref: `${ind.atr_pct}٪ نوسان`, color: 'text-warning' },
            { label: 'Bollinger %B', value: ind.bb_pct, unit: '', ref: '۰-۱', color: 'text-white' },
            { label: 'CCI', value: ind.cci, unit: '', ref: '±۱۰۰', color: ind.cci > 100 ? 'text-danger' : ind.cci < -100 ? 'text-success' : 'text-white' },
            { label: 'MFI', value: ind.mfi, unit: '', ref: '۲۰/۸۰', color: 'text-white' },
            { label: 'Williams %R', value: ind.willr, unit: '', ref: '-۲۰/-۸۰', color: 'text-white' },
            { label: 'OBV Slope', value: ind.obv_slope ? fmt(ind.obv_slope) : '—', unit: '', ref: 'روند حجم', color: 'text-primary' },
          ].map((x, i) => (
            <div key={i} className="glass p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 mb-1">{x.label}</div>
              <div className={`num text-base font-bold ${x.color}`}>
                {x.value != null ? (typeof x.value === 'number' ? x.value.toFixed(2) : x.value) : '—'}
                <span className="text-xs text-slate-500 mr-0.5">{x.unit}</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">{x.ref}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Support / Resistance */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="مقاومت‌های کلیدی" icon={TrendingUp} color="text-danger">
          <div className="space-y-2">
            {ind.resistances?.length > 0 ? ind.resistances.map((r, i) => (
              <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-400">R{i + 1}</span>
                <span className="num font-bold text-danger">{fmt(r)}</span>
                <span className="text-[10px] text-slate-500">
                  {((r - lastBar.c) / lastBar.c * 100).toFixed(1)}٪ بالاتر
                </span>
              </div>
            )) : <div className="text-slate-500 text-sm">مقاومت نزدیکی وجود ندارد</div>}
          </div>
        </Card>

        <Card title="حمایت‌های کلیدی" icon={TrendingDown} color="text-success">
          <div className="space-y-2">
            {ind.supports?.length > 0 ? ind.supports.map((s, i) => (
              <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                <span className="text-xs text-slate-400">S{i + 1}</span>
                <span className="num font-bold text-success">{fmt(s)}</span>
                <span className="text-[10px] text-slate-500">
                  {((lastBar.c - s) / lastBar.c * 100).toFixed(1)}٪ پایین‌تر
                </span>
              </div>
            )) : <div className="text-slate-500 text-sm">حمایت نزدیکی وجود ندارد</div>}
          </div>
        </Card>
      </div>

      {/* Fibonacci */}
      {ind.fib && (
        <Card title="سطوح فیبوناچی (۵۲ هفته)" icon={Layers} color="text-accent">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(ind.fib).map(([key, val]) => {
              const isNear = Math.abs(val - lastBar.c) / lastBar.c < 0.03;
              return (
                <div key={key} className={`p-2 rounded-lg ${isNear ? 'bg-primary/20 border border-primary/50' : 'bg-bg/40'}`}>
                  <div className="text-[10px] text-slate-400">{key}٪</div>
                  <div className={`num text-sm font-bold ${isNear ? 'text-primary' : 'text-white'}`}>
                    {fmt(val)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-slate-500">
            ۵۲ هفته: {fmt(ind.low52)} — {fmt(ind.high52)}
          </div>
        </Card>
      )}

      {/* Fundamentals */}
      <Card title="داده‌های بنیادی" icon={DollarSign} color="text-warning">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="EPS برآوردی" value={sig?.eps ? fmt(sig.eps) : '—'} sub="ریال" />
          <Metric label="P/E صنعت" value={sig?.pe ? fmt(sig.pe, 2) : '—'} />
          <Metric label="P/E سهم" value={fund?.estimatedEPS && lastBar.c ? fmt(lastBar.c / parseFloat(fund.estimatedEPS), 2) : '—'} />
          <Metric label="تعداد سهام" value={fund?.totalShares ? fmt(fund.totalShares) : '—'} />
        </div>
      </Card>

      {/* Real/Legal Flow */}
      <Card title="حجم حقیقی و حقوقی" icon={Users} color="text-primary">
        {rl.buyRealVol ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-[10px] text-slate-400 mb-1">خرید حقیقی</div>
                <div className="num text-sm font-bold text-success">{fmt(rl.buyRealVol)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 mb-1">فروش حقیقی</div>
                <div className="num text-sm font-bold text-danger">{fmt(rl.sellRealVol)}</div>
              </div>
            </div>
            {buyRealPct != null && (
              <div>
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
            {smartMoney != null && (
              <div className="mt-3 p-2 rounded-lg bg-bg/40 flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-warning" /> پول هوشمند
                </span>
                <span className={`num text-sm font-bold ${smartMoney > 0 ? 'text-success' : 'text-danger'}`}>
                  {smartMoney > 0 ? '+' : ''}{smartMoney.toFixed(1)}٪
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">داده حقیقی/حقوقی برای این سهم در دسترس نیست</p>
        )}
      </Card>

      {/* News */}
      {news?.items && (
        <Card title="اخبار بازار (مرتبط به تحلیل)" icon={Info} color="text-accent">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {news.items.slice(0, 8).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener"
                 className="block py-2 border-b border-border/30 last:border-0 hover:bg-white/5 -mx-2 px-2 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {n.source}
                  </span>
                  <span className="text-xs text-white leading-relaxed">{n.title}</span>
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/5 border border-danger/20">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90 leading-relaxed">
          <strong>⚠️ توجه:</strong> این تحلیل صرفاً آموزشی و پژوهشی است و نه توصیه معاملاتی. مسئولیت هرگونه تصمیم‌گیری سرمایه‌گذاری کاملاً بر عهده کاربر است.
        </p>
      </div>
    </div>
  );
}
