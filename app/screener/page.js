'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Search, Filter, X, TrendingUp, TrendingDown, Activity, ArrowLeft,
  ChevronDown, RotateCcw, BarChart3, Sparkles
} from 'lucide-react';

const SIGNAL = {
  BUY: { label: 'توجه بالا', color: 'text-success', bg: 'bg-success/15', border: 'border-success/30', icon: TrendingUp },
  HOLD: { label: 'خنثی', color: 'text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30', icon: Activity },
  SELL: { label: 'ریسک بالا', color: 'text-danger', bg: 'bg-danger/15', border: 'border-danger/30', icon: TrendingDown },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function SectorSelector({ value, onChange, sectors }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = q.trim()
    ? sectors.filter(s => s.includes(q))
    : sectors;

  const select = (s) => {
    onChange(s);
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} type="button"
        className={`w-full glass rounded-lg py-2.5 px-3 text-sm text-right flex items-center justify-between transition-colors border ${
          value !== 'ALL' ? 'border-primary/50 text-primary' : 'text-white border-border/50'
        }`}>
        <span className="truncate">{value === 'ALL' ? 'همه صنایع' : value}</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="glass-strong w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-primary/30"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-white text-sm">انتخاب صنعت</h3>
              </div>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-border/40">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input ref={inputRef} type="text" placeholder="جستجوی صنعت..." value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full bg-bg/60 rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/50 focus:border-primary/50" />
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              <button onClick={() => select('ALL')}
                className={`w-full text-right px-4 py-3 hover:bg-primary/10 transition-colors border-b border-border/20 flex items-center justify-between ${
                  value === 'ALL' ? 'bg-primary/15' : ''
                }`}>
                <span className={`text-sm ${value === 'ALL' ? 'text-primary font-bold' : 'text-white'}`}>همه صنایع</span>
                {value === 'ALL' && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
              {filtered.length > 0 ? filtered.map(s => (
                <button key={s} onClick={() => select(s)}
                  className={`w-full text-right px-4 py-3 hover:bg-primary/10 transition-colors border-b border-border/20 last:border-0 flex items-center justify-between ${
                    value === s ? 'bg-primary/15' : ''
                  }`}>
                  <span className={`text-sm ${value === s ? 'text-primary font-bold' : 'text-white'}`}>{s}</span>
                  {value === s && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              )) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  نتیجه‌ای برای «{q}» یافت نشد
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RangeSlider({ label, value, onChange, min, max, step = 1, unit = '', defaultValue }) {
  const [v, setV] = useState(value);
  const isActive = v !== defaultValue;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold ${isActive ? 'text-primary' : 'text-slate-400'}`}>{label}</span>
        <span className={`num text-xs font-bold ${isActive ? 'text-primary' : 'text-slate-300'}`}>
          {v.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => { const n = parseFloat(e.target.value); setV(n); onChange(n); }}
        className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${
          isActive ? 'bg-primary/30' : 'bg-slate-700'
        }`}
        style={{
          background: isActive
            ? `linear-gradient(to left, #06b6d4 0%, #06b6d4 ${((v - min) / (max - min)) * 100}%, #334155 ${((v - min) / (max - min)) * 100}%, #334155 100%)`
            : undefined
        }}
      />
    </div>
  );
}

export default function ScreenerPage() {
  const [signals, setSignals] = useState(null);
  const [indicators, setIndicators] = useState(null);

  // Filters
  const [minScore, setMinScore] = useState(0);
  const [minRSI, setMinRSI] = useState(0);
  const [maxRSI, setMaxRSI] = useState(100);
  const [maxPE, setMaxPE] = useState(100);
  const [minChange, setMinChange] = useState(-20);
  const [maxChange, setMaxChange] = useState(20);
  const [signalFilter, setSignalFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = async (f) => {
      try { const r = await fetch(`/data/${f}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [sig, ind] = await Promise.all([load('predictions_today.json'), load('indicators.json')]);
      setSignals(sig);
      setIndicators(ind);
    })();
  }, []);

  const sectors = useMemo(() => {
    if (!signals) return [];
    const set = new Set();
    signals.signals.forEach(s => { if (s.sector) set.add(s.sector); });
    return Array.from(set).sort();
  }, [signals]);

  const results = useMemo(() => {
    if (!signals || !indicators) return [];
    return signals.signals.filter(s => {
      const ind = indicators[s.symbol] || {};
      const score = Math.round(s.prob * 100);
      const cp = s.change_pct || 0;

      if (score < minScore) return false;
      if (ind.rsi != null && (ind.rsi < minRSI || ind.rsi > maxRSI)) return false;
      if (s.pe != null && s.pe > maxPE) return false;
      if (s.pe == null && maxPE < 100) return false;
      if (cp < minChange || cp > maxChange) return false;
      if (signalFilter !== 'ALL' && s.signal !== signalFilter) return false;
      if (sectorFilter !== 'ALL' && s.sector !== sectorFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.symbol.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.prob - a.prob);
  }, [signals, indicators, minScore, minRSI, maxRSI, maxPE, minChange, maxChange, signalFilter, sectorFilter, search]);

  const reset = () => {
    setMinScore(0);
    setMinRSI(0);
    setMaxRSI(100);
    setMaxPE(100);
    setMinChange(-20);
    setMaxChange(20);
    setSignalFilter('ALL');
    setSectorFilter('ALL');
    setSearch('');
  };

  const activeFilters = [
    minScore > 0,
    minRSI > 0, maxRSI < 100,
    maxPE < 100,
    minChange > -20, maxChange < 20,
    signalFilter !== 'ALL',
    sectorFilter !== 'ALL',
  ].filter(Boolean).length;

  if (!signals || !indicators) {
    return <div className="max-w-7xl mx-auto px-3 md:px-6 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const displayList = showAll ? results : results.slice(0, 50);

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
            <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h1 className="text-lg md:text-xl font-black text-white">اسکرینر سهم‌ها</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass px-3 py-1.5 rounded-lg text-xs">
            <span className="text-slate-400">نتیجه: </span>
            <span className="num font-bold text-primary">{fmt(results.length)}</span>
            <span className="text-slate-400"> از </span>
            <span className="num text-slate-300">{fmt(signals.signals.length)}</span>
          </div>
          {activeFilters > 0 && (
            <button onClick={reset}
              className="glass px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 text-warning hover:bg-warning/10 transition-colors">
              <RotateCcw className="w-3 h-3" />
              پاک کردن ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      <div className="glass-strong p-4 md:p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-white">فیلترها</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          {/* Column 1 */}
          <div className="space-y-4">
            <RangeSlider label="حداقل امتیاز مدل" value={minScore} onChange={setMinScore}
              min={0} max={100} step={5} unit="" defaultValue={0} />
            
            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">محدوده RSI</div>
              <div className="grid grid-cols-2 gap-2">
                <RangeSlider label="حداقل" value={minRSI} onChange={setMinRSI}
                  min={0} max={100} step={5} unit="" defaultValue={0} />
                <RangeSlider label="حداکثر" value={maxRSI} onChange={setMaxRSI}
                  min={0} max={100} step={5} unit="" defaultValue={100} />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">تغییر روزانه</div>
              <div className="grid grid-cols-2 gap-2">
                <RangeSlider label="حداقل" value={minChange} onChange={setMinChange}
                  min={-20} max={20} step={0.5} unit="٪" defaultValue={-20} />
                <RangeSlider label="حداکثر" value={maxChange} onChange={setMaxChange}
                  min={-20} max={20} step={0.5} unit="٪" defaultValue={20} />
              </div>
            </div>

            <RangeSlider label="حداکثر P/E" value={maxPE} onChange={setMaxPE}
              min={0} max={100} step={1} unit="" defaultValue={100} />
          </div>

          {/* Column 2 */}
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">وضعیت</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: 'ALL', label: 'همه' },
                  { key: 'BUY', label: 'توجه بالا' },
                  { key: 'HOLD', label: 'خنثی' },
                  { key: 'SELL', label: 'ریسک' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setSignalFilter(opt.key)}
                    className={`py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${
                      signalFilter === opt.key ? 'bg-primary text-bg shadow-lg shadow-primary/20' : 'glass text-slate-300 hover:bg-white/10'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">صنعت</div>
              <SectorSelector value={sectorFilter} onChange={setSectorFilter} sectors={sectors} />
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-400 mb-2">جستجو</div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="نماد یا نام..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full glass rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50 border border-border/50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="glass p-12 rounded-2xl text-center">
          <Filter className="w-16 h-16 text-slate-500/40 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">هیچ سهمی با این فیلترها پیدا نشد</h2>
          <p className="text-sm text-slate-400 mb-4">فیلترها را کمی شل‌تر کنید</p>
          <button onClick={reset} className="btn-primary text-sm">
            <RotateCcw className="w-4 h-4" /> پاک کردن همه فیلترها
          </button>
        </div>
      ) : (
<div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full data-table text-sm">
                <thead>
                  <tr>
                    <th className="w-8 text-center">#</th>
                    <th>نماد</th>
                    <th className="hidden sm:table-cell">نام</th>
                    <th className="hidden md:table-cell">صنعت</th>
                    <th>قیمت</th>
                    <th>امتیاز</th>
                    <th className="hidden lg:table-cell">RSI</th>
                    <th>تغییر</th>
                    <th className="hidden sm:table-cell">وضعیت</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.map((s, i) => {
                    const ind = indicators[s.symbol] || {};
                    const conf = SIGNAL[s.signal];
                    const ConfIcon = conf.icon;
                    const cp = s.change_pct || 0;
                    const up = cp > 0;
                    const down = cp < 0;
                    const nameColor = up ? 'text-success' : down ? 'text-danger' : 'text-slate-300';
                    return (
                      <tr key={s.symbol}>
                        <td className="num text-[10px] text-slate-500 text-center">{fmt(i + 1)}</td>
                        <td>
                          <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                            className={`font-black text-sm hover:underline transition-colors ${nameColor}`}>
                            {s.symbol}
                          </Link>
                        </td>
                        <td className="hidden sm:table-cell text-slate-400 text-xs">{s.name}</td>
                        <td className="hidden md:table-cell">
                          <span className="text-[10px] text-slate-400">{s.sector?.slice(0, 20)}</span>
                        </td>
                        <td>
                          <span className={`num text-xs font-bold ${nameColor}`}>{fmt(s.close)}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span className="num font-bold text-white text-xs">{Math.round(s.prob * 100)}</span>
                            <div className="w-10 h-1 bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                              <div className={`h-full ${
                                s.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' :
                                s.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'
                              }`} style={{ width: `${s.prob * 100}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="hidden lg:table-cell">
                          <span className={`num text-xs ${
                            ind.rsi > 70 ? 'text-danger' : ind.rsi < 30 ? 'text-success' : 'text-slate-300'
                          }`}>
                            {ind.rsi != null ? ind.rsi.toFixed(1) : '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`num text-[11px] font-black px-1.5 py-0.5 rounded ${
                            up ? 'text-success bg-success/15' : down ? 'text-danger bg-danger/15' : 'text-slate-400 bg-slate-500/15'
                          }`}>
                            {up ? '▲ +' : down ? '▼ ' : ''}{cp.toFixed(2)}٪
                          </span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${conf.bg} ${conf.color} border ${conf.border}`}>
                            <ConfIcon className="w-2.5 h-2.5" /> {conf.label}
                          </span>
                        </td>
                        <td>
                          <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                            className="text-primary hover:underline text-[11px]">
                            جزئیات
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length > 50 && !showAll && (
              <div className="p-4 text-center border-t border-border/50">
                <button onClick={() => setShowAll(true)} className="btn-secondary text-sm">
                  نمایش همه ({fmt(results.length)})
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
