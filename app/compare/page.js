'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import LimitReached from '@/components/LimitReached';
import { checkAndIncrement } from '@/lib/usage';
import {
  ArrowLeft, Search, TrendingUp, TrendingDown, Activity, Trophy,
  ChevronDown, X, BarChart3, AlertTriangle
} from 'lucide-react';

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

const SIGNAL = {
  BUY: { label: 'توجه بالا', color: 'text-success', bg: 'bg-success/15', border: 'border-success/30' },
  HOLD: { label: 'خنثی', color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
  SELL: { label: 'ریسک بالا', color: 'text-danger', bg: 'bg-danger/15', border: 'border-danger/30' },
};

function Selector({ value, onChange, options, placeholder, side }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = q.trim()
    ? options.filter(o => o.symbol.toLowerCase().includes(q.toLowerCase()) || o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30)
    : options.slice(0, 30);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`w-full glass rounded-xl p-3 text-right hover:border-primary/40 transition-colors ${open ? 'border-primary/50' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {value ? (
              <>
                <div className="font-black text-white text-base">{value.symbol}</div>
                <div className="text-[10px] text-slate-400 truncate">{value.name}</div>
              </>
            ) : (
              <div className="text-slate-400 text-sm">{placeholder}</div>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute top-full mt-2 inset-x-0 z-50 glass-strong rounded-xl overflow-hidden border border-primary/30 shadow-2xl">
          <div className="relative p-2 border-b border-border/40">
            <Search className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2" />
            <input autoFocus type="text" placeholder="جستجو..." value={q} onChange={(e) => setQ(e.target.value)}
              className="w-full bg-bg/60 rounded-lg py-2 pr-9 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/30" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(s => (
              <button key={s.symbol}
                onClick={() => { onChange(s); setOpen(false); setQ(''); }}
                className={`w-full text-right p-2.5 hover:bg-primary/10 transition-colors border-b border-border/20 last:border-0 ${
                  value?.symbol === s.symbol ? 'bg-primary/10' : ''
                }`}>
                <div className="font-bold text-white text-sm">{s.symbol}</div>
                <div className="text-[10px] text-slate-400 truncate">{s.name}</div>
              </button>
            )) : (
              <div className="p-4 text-center text-sm text-slate-500">نتیجه‌ای یافت نشد</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, v1, v2, winner = null, format = (v) => v, color = null }) {
  const f1 = format(v1);
  const f2 = format(v2);
  return (
    <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-border/30 last:border-0 items-center">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`num text-sm font-bold text-left ${winner === 1 ? 'text-success' : winner === 2 ? 'text-slate-400' : 'text-white'} ${color === 1 ? 'text-success' : color === 2 ? 'text-danger' : ''}`}>
        {f1}
      </div>
      <div className={`num text-sm font-bold text-left ${winner === 2 ? 'text-success' : winner === 1 ? 'text-slate-400' : 'text-white'} ${color === 2 ? 'text-success' : color === 1 ? 'text-danger' : ''}`}>
        {f2}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [limitReached, setLimitReached] = useState(false);
  const [hasCompared, setHasCompared] = useState(false);

  const [checking, setChecking] = useState(false);
  const handleCompare = async () => {
    setChecking(true);
    const res = await checkAndIncrement('compare', 1);
    setChecking(false);
    if (!res.allowed) {
      setLimitReached(true);
      return;
    }
    setHasCompared(true);
  };
  const [signals, setSignals] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [charts, setCharts] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [realLegal, setRealLegal] = useState(null);
  const [sym1, setSym1] = useState(null);
  const [sym2, setSym2] = useState(null);

  useEffect(() => {
    setHasCompared(false);
  }, [sym1, sym2]);

  useEffect(() => {
    const load = async (f) => {
      try { const r = await fetch(`/data/${f}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [sig, ind, ch, fund, rl] = await Promise.all([
        load('predictions_today.json'),
        load('indicators.json'),
        load('charts.json'),
        load('fundamentals.json'),
        load('real_legal.json'),
      ]);
      setSignals(sig);
      setIndicators(ind);
      setCharts(ch);
      setFundamentals(fund);
      setRealLegal(rl);
    })();
  }, []);

  const allStocks = useMemo(() => {
    if (!signals) return [];
    return signals.signals.map(s => ({ symbol: s.symbol, name: s.name }));
  }, [signals]);

  if (limitReached) return <LimitReached feature="مقایسه سهم" />;

  if (!signals || !indicators) {
    return <div className="max-w-7xl mx-auto px-3 md:px-6 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const sig1 = sym1 ? signals.signals.find(s => s.symbol === sym1.symbol) : null;
  const sig2 = sym2 ? signals.signals.find(s => s.symbol === sym2.symbol) : null;
  const ind1 = sym1 ? indicators[sym1.symbol] : null;
  const ind2 = sym2 ? indicators[sym2.symbol] : null;
  const chart1 = sym1 ? charts?.[sym1.symbol] : null;
  const chart2 = sym2 ? charts?.[sym2.symbol] : null;

  const bothSelected = sig1 && sig2;

  // Winner calculation (score based)
  let winner = null;
  if (bothSelected) {
    const score1 = sig1.prob * 100;
    const score2 = sig2.prob * 100;
    if (Math.abs(score1 - score2) > 5) winner = score1 > score2 ? 1 : 2;
  }

  // Better/worse helpers
  const better = (v1, v2, higherIsBetter = true) => {
    if (v1 == null || v2 == null) return null;
    if (Math.abs(v1 - v2) / Math.max(Math.abs(v1), Math.abs(v2), 1) < 0.02) return null;
    if (higherIsBetter) return v1 > v2 ? 1 : 2;
    return v1 < v2 ? 1 : 2;
  };

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
          <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
        </Link>
        <span className="text-slate-600">/</span>
        <h1 className="text-lg md:text-xl font-black text-white">مقایسه دو سهم</h1>
      </div>

      {/* Selectors */}
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <Selector
          value={sym1}
          onChange={setSym1}
          options={allStocks.filter(s => s.symbol !== sym2?.symbol)}
          placeholder="سهم اول را انتخاب کنید"
          side="1"
        />
        <Selector
          value={sym2}
          onChange={setSym2}
          options={allStocks.filter(s => s.symbol !== sym1?.symbol)}
          placeholder="سهم دوم را انتخاب کنید"
          side="2"
        />
      </div>

      {!bothSelected && (
        <div className="glass-strong p-12 rounded-2xl text-center">
          <BarChart3 className="w-16 h-16 text-primary/30 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">
            {!sym1 && !sym2 ? 'دو سهم برای مقایسه انتخاب کنید' : 'یک سهم دیگر انتخاب کنید'}
          </h2>
          <p className="text-sm text-slate-400">اندیکاتورها، بنیادی، و چارت هر دو سهم را کنار هم ببینید</p>
        </div>
      )}

            {bothSelected && !hasCompared && (
        <div className="glass-strong p-6 rounded-2xl text-center">
          <p className="text-sm text-slate-300 mb-4">
            آماده مقایسه <strong className="text-primary">{sym1.symbol}</strong> و <strong className="text-primary">{sym2.symbol}</strong>؟
          </p>
          <button onClick={handleCompare} disabled={checking}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-l from-primary to-primary2 text-bg font-bold text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all">
            <BarChart3 className="w-4 h-4" /> شروع مقایسه
          </button>
          <p className="text-[10px] text-slate-500 mt-3">هر مقایسه یک بار از سهمیه روزانه مصرف می‌کند</p>
        </div>
      )}

      {bothSelected && hasCompared && (

        <>
          {/* Winner banner */}
          {winner && (
            <div className={`glass-strong p-4 rounded-2xl border-2 ${winner === 1 ? 'border-success/50' : 'border-primary/50'} relative overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl ${winner === 1 ? 'bg-success/10' : 'bg-primary/10'}`} />
              <div className="relative flex items-center gap-3">
                <Trophy className={`w-8 h-8 ${winner === 1 ? 'text-success' : 'text-primary'}`} />
                <div>
                  <div className="text-[10px] text-slate-400">برنده بر اساس امتیاز تحلیل Javid LM</div>
                  <div className="text-xl font-black text-white">
                    {winner === 1 ? sym1.symbol : sym2.symbol}
                    <span className="text-sm text-slate-400 font-normal mr-2">
                      ({winner === 1 ? Math.round(sig1.prob * 100) : Math.round(sig2.prob * 100)} امتیاز)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Header Cards */}
          <div className="grid grid-cols-2 gap-3">
            {[{sig: sig1, side: 1}, {sig: sig2, side: 2}].map(({sig, side}) => {
              const conf = SIGNAL[sig.signal];
              const up = (sig.change_pct || 0) >= 0;
              return (
                <div key={side} className={`glass-strong p-3 md:p-4 rounded-xl relative overflow-hidden ${
                  winner === side ? 'border-2 border-success/40' : ''
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/predictions/${encodeURIComponent(sig.symbol)}`}
                        className="font-black text-white text-base md:text-lg hover:text-primary transition-colors truncate block">
                        {sig.symbol}
                      </Link>
                      <div className="text-[10px] text-slate-400 truncate">{sig.name}</div>
                    </div>
                    {winner === side && <Trophy className="w-4 h-4 text-success flex-shrink-0" />}
                  </div>
                  <div className="num text-xl md:text-2xl font-black text-white mb-1">{fmt(sig.close)}</div>
                  <div className={`num text-xs font-bold flex items-center gap-1 ${up ? 'text-success' : 'text-danger'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{(sig.change_pct || 0).toFixed(2)}٪
                  </div>
                  <div className="mt-2">
                    <div className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${conf.bg} ${conf.color} ${conf.border}`}>
                      {conf.label}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${sig.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' : sig.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'}`}
                      style={{ width: `${sig.prob * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison Table */}
          <div className="glass-strong p-4 md:p-6 rounded-2xl">
            <div className="grid grid-cols-3 gap-2 pb-2 mb-2 border-b border-border/40">
              <div className="text-[10px] text-slate-500">شاخص</div>
              <div className="text-[10px] text-slate-500 text-left">{sym1.symbol}</div>
              <div className="text-[10px] text-slate-500 text-left">{sym2.symbol}</div>
            </div>

            <Row label="امتیاز تحلیل" v1={Math.round(sig1.prob * 100)} v2={Math.round(sig2.prob * 100)}
              winner={better(sig1.prob, sig2.prob)} />
            <Row label="قیمت (تومان)" v1={sig1.close} v2={sig2.close} format={(v) => fmt(v)} />
            <Row label="تغییر روزانه" v1={sig1.change_pct} v2={sig2.change_pct}
              format={(v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}٪` : '—'}
              winner={better(sig1.change_pct, sig2.change_pct)} />
            <Row label="P/E" v1={sig1.pe} v2={sig2.pe} format={(v) => v != null ? v.toFixed(2) : '—'}
              winner={better(sig1.pe, sig2.pe, false)} />
            <Row label="EPS (ریال)" v1={sig1.eps} v2={sig2.eps}
              format={(v) => v ? fmt(parseFloat(v)) : '—'}
              winner={better(parseFloat(sig1.eps) || 0, parseFloat(sig2.eps) || 0)} />
          </div>

          {/* Indicators */}
          <div className="glass-strong p-4 md:p-6 rounded-2xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> اندیکاتورهای تکنیکال
            </h3>

            <Row label="RSI" v1={ind1?.rsi} v2={ind2?.rsi} format={(v) => v != null ? v.toFixed(1) : '—'} />
            <Row label="MACD Histogram" v1={ind1?.macd_hist} v2={ind2?.macd_hist}
              format={(v) => v != null ? (v > 0 ? 'صعودی' : 'نزولی') : '—'}
              color={ind1?.macd_hist > 0 ? 2 : ind1?.macd_hist < 0 ? 1 : null} />
            <Row label="ADX" v1={ind1?.adx} v2={ind2?.adx} format={(v) => v != null ? v.toFixed(1) : '—'}
              winner={better(ind1?.adx, ind2?.adx)} />
            <Row label="Stochastic" v1={ind1?.stoch_k} v2={ind2?.stoch_k} format={(v) => v != null ? v.toFixed(1) + '٪' : '—'} />
            <Row label="Bollinger %B" v1={ind1?.bb_pct} v2={ind2?.bb_pct} format={(v) => v != null ? v.toFixed(2) : '—'} />
            <Row label="ATR %" v1={ind1?.atr_pct} v2={ind2?.atr_pct}
              format={(v) => v != null ? v.toFixed(2) + '٪' : '—'}
              winner={better(ind1?.atr_pct, ind2?.atr_pct, false)} />
          </div>

          {/* Charts side by side */}
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { sym: sym1.symbol, chart: chart1, side: 1 },
              { sym: sym2.symbol, chart: chart2, side: 2 },
            ].map(({ sym, chart, side }) => (
              <div key={side} className={`glass-strong p-3 rounded-xl ${winner === side ? 'border-2 border-success/30' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <Link href={`/predictions/${encodeURIComponent(sym)}`} className="text-sm font-bold text-white hover:text-primary">
                    {sym}
                  </Link>
                </div>
                {chart && chart.length > 0 ? (
                  <StockChart data={chart.slice(0, 90)} height={260} />
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-slate-500">دیتا موجود نیست</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
