'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Play, TrendingUp, TrendingDown, Activity, ArrowLeft,
  Zap, Trophy, Lock, Sparkles, Target, RotateCcw,
  LineChart, DollarSign, Loader2, Award, Crown
} from 'lucide-react';

const FREE_LIMIT = 3;
const LIMIT_KEY = 'tse_backtest_runs';

const STRATEGIES = {
  top_score: { name: 'بهترین امتیاز', desc: 'N سهم با بالاترین امتیاز', icon: Trophy },
  momentum: { name: 'مومنتوم', desc: 'RSI ۵۰-۷۰ + MACD صعودی', icon: Zap },
  oversold: { name: 'بازگشت از اشباع فروش', desc: 'RSI کمتر از ۳۰', icon: TrendingDown },
  trend: { name: 'روند صعودی', desc: 'قیمت بالای MA20 و MA50', icon: TrendingUp },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function toJalali(yyyymmdd) {
  const s = String(yyyymmdd);
  if (s.length !== 8) return '—';
  const date = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
  return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getRecentRuns() {
  try {
    const raw = localStorage.getItem(LIMIT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return list.filter(t => t > cutoff);
  } catch { return []; }
}
function recordRun() {
  try {
    const list = getRecentRuns();
    list.push(Date.now());
    localStorage.setItem(LIMIT_KEY, JSON.stringify(list));
  } catch {}
}

function calcSMA(arr, p) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < p) return out;
  let sum = 0;
  for (let i = 0; i < p; i++) sum += arr[i];
  out[p-1] = sum / p;
  for (let i = p; i < arr.length; i++) { sum += arr[i] - arr[i-p]; out[i] = sum / p; }
  return out;
}
function calcEMA(arr, p) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < p) return out;
  const k = 2 / (p + 1);
  let ema = arr.slice(0, p).reduce((a,b) => a+b, 0) / p;
  out[p-1] = ema;
  for (let i = p; i < arr.length; i++) { ema = arr[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}
function calcRSI(arr, p = 14) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < p + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = arr[i] - arr[i-1]; if (d > 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  out[p] = al === 0 ? 100 : 100 - 100/(1 + ag/al);
  for (let i = p + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i-1];
    ag = (ag * (p-1) + Math.max(d, 0)) / p;
    al = (al * (p-1) + Math.max(-d, 0)) / p;
    out[i] = al === 0 ? 100 : 100 - 100/(1 + ag/al);
  }
  return out;
}
function calcMACD(arr) {
  const ema12 = calcEMA(arr, 12), ema26 = calcEMA(arr, 26);
  const macd = arr.map((_, i) => (ema12[i] != null && ema26[i] != null) ? ema12[i] - ema26[i] : null);
  const valid = macd.map(v => v ?? 0);
  const signal = calcEMA(valid, 9);
  const hist = macd.map((v, i) => (v != null && signal[i] != null) ? v - signal[i] : null);
  return { macd, hist };
}

function runBacktest(charts, cfg) {
  const { strategy, nStocks, holdDays, initialCapital } = cfg;
  const symbols = Object.keys(charts).filter(s => charts[s] && charts[s].length >= 100);
  const ind = {};
  symbols.forEach(sym => {
    const c = [...charts[sym]].reverse();
    const closes = c.map(r => r.c);
    ind[sym] = {
      c, closes,
      rsi: calcRSI(closes),
      macd: calcMACD(closes),
      ma20: calcSMA(closes, 20),
      ma50: calcSMA(closes, 50),
    };
  });
  
  const minLen = Math.min(...Object.values(ind).map(x => x.closes.length));
  const startDay = 60;
  const endDay = minLen - holdDays - 1;
  
  const trades = [];
  let capital = initialCapital;
  const equity = [{ day: startDay, value: capital }];
  
  for (let day = startDay; day <= endDay; day += holdDays) {
    const candidates = [];
    Object.keys(ind).forEach(sym => {
      const x = ind[sym];
      if (day >= x.closes.length) return;
      const rsi = x.rsi[day], hist = x.macd.hist[day];
      const price = x.closes[day], ma20 = x.ma20[day], ma50 = x.ma50[day];
      let score = 0.5;
      if (rsi != null) {
        if (rsi < 30) score += 0.25; else if (rsi < 45) score += 0.1;
        else if (rsi > 70) score -= 0.2; else if (rsi > 55) score += 0.1;
      }
      if (hist != null) score += hist > 0 ? 0.15 : -0.15;
      if (ma20 != null && price > ma20) score += 0.1;
      if (ma50 != null && price > ma50) score += 0.1;
      score = Math.max(0, Math.min(1, score));
      
      let pass = false;
      if (strategy === 'top_score') pass = score >= 0.4;
      else if (strategy === 'momentum') pass = rsi != null && rsi > 50 && rsi < 70 && hist != null && hist > 0;
      else if (strategy === 'oversold') pass = rsi != null && rsi < 30;
      else if (strategy === 'trend') pass = ma20 != null && ma50 != null && price > ma20 && ma20 > ma50;
      if (pass) candidates.push({ symbol: sym, score, price });
    });
    
    candidates.sort((a, b) => b.score - a.score);
    const picks = candidates.slice(0, nStocks);
    if (picks.length === 0) continue;
    const per = capital / picks.length;
    
    picks.forEach(p => {
      const x = ind[p.symbol];
      const exit = x.closes[day + holdDays];
      if (!exit || exit <= 0) return;
      const ret = (exit - p.price) / p.price;
      capital += per * ret;
      trades.push({
        symbol: p.symbol, entryDate: x.c[day]?.t, exitDate: x.c[day + holdDays]?.t,
        entryPrice: p.price, exitPrice: exit, returnPct: ret * 100,
      });
    });
    equity.push({ day: day + holdDays, value: capital });
  }
  
  const wins = trades.filter(t => t.returnPct > 0).length;
  return {
    trades, equity,
    metrics: {
      totalReturn: (capital - initialCapital) / initialCapital * 100,
      winrate: trades.length > 0 ? (wins / trades.length * 100) : 0,
      avgTrade: trades.length > 0 ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : 0,
      finalCapital: capital,
      nTrades: trades.length,
      bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.returnPct)) : 0,
      worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.returnPct)) : 0,
    }
  };
}

function CountUp({ target, duration = 1200, suffix = '', decimals = 0 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <>{val.toLocaleString('fa-IR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</>;
}

function EquityCurve({ data }) {
  const pathRef = useRef(null);
  const areaRef = useRef(null);
  useEffect(() => {
    if (!pathRef.current || !data || data.length < 2) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = len;
    pathRef.current.style.strokeDashoffset = len;
    pathRef.current.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1800, fill: 'forwards', easing: 'ease-out' });
    if (areaRef.current) areaRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1800, fill: 'forwards', easing: 'ease-out' });
  }, [data]);
  
  if (!data || data.length < 2) return null;
  const w = 700, h = 220, pad = 10;
  const vals = data.map(d => d.value);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (w - 2 * pad),
    y: h - pad - ((d.value - mn) / rng) * (h - 2 * pad),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = path + ` L${w-pad},${h-pad} L${pad},${h-pad} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <defs>
        <linearGradient id="eqU" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#10b981"/></linearGradient>
        <linearGradient id="eqD" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f43f5e"/><stop offset="100%" stopColor="#be123c"/></linearGradient>
        <linearGradient id="eqAU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.35"/><stop offset="100%" stopColor="#10b981" stopOpacity="0"/></linearGradient>
        <linearGradient id="eqAD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35"/><stop offset="100%" stopColor="#f43f5e" stopOpacity="0"/></linearGradient>
      </defs>
      <path ref={areaRef} d={area} fill={up ? 'url(#eqAU)' : 'url(#eqAD)'} opacity="0" />
      <path ref={pathRef} d={path} fill="none" stroke={up ? 'url(#eqU)' : 'url(#eqD)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BacktestPage() {
  const [charts, setCharts] = useState(null);
  const [strategy, setStrategy] = useState('top_score');
  const [nStocks, setNStocks] = useState(5);
  const [holdDays, setHoldDays] = useState(5);
  const [capital, setCapital] = useState(10000000);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [runsUsed, setRunsUsed] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRunsUsed(getRecentRuns().length);
    setMounted(true);
    (async () => {
      try {
        const r = await fetch('/data/charts.json');
        if (r.ok) setCharts(await r.json());
      } catch {}
    })();
  }, []);

  const remaining = Math.max(0, FREE_LIMIT - runsUsed);
  const limitReached = remaining === 0;

  const handleRun = async () => {
    if (!charts || limitReached) return;
    setRunning(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 100));
    try {
      const result = runBacktest(charts, { strategy, nStocks, holdDays, initialCapital: capital });
      setResults(result);
      recordRun();
      setRunsUsed(getRecentRuns().length);
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  };

  if (!mounted || !charts) return <div className="max-w-7xl mx-auto px-3 md:px-6 py-8"><div className="h-96 glass rounded-xl shimmer" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
            <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h1 className="text-lg md:text-xl font-black text-white">بک‌تست استراتژی</h1>
          </div>
        </div>
        <div className={`glass px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${limitReached ? 'border-danger/40' : ''}`}>
          {limitReached ? <Lock className="w-3 h-3 text-danger" /> : <Zap className="w-3 h-3 text-primary" />}
          <span className="text-slate-400">رایگان:</span>
          <span className={`num font-bold ${limitReached ? 'text-danger' : 'text-primary'}`}>{remaining}</span>
          <span className="text-slate-500">از {FREE_LIMIT} در ماه</span>
        </div>
      </div>

      {limitReached && (
        <div className="glass-strong p-5 rounded-2xl border-2 border-danger/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-danger/10 rounded-full blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-danger/15 border border-danger/40 flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-danger" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white mb-1">سهمیه ماهانه تمام شد</h3>
              <p className="text-sm text-slate-300 mb-3">برای بک‌تست نامحدود + استراتژی‌های پیشرفته، به پلن حرفه‌ای ارتقا دهید.</p>
              <button disabled className="btn-primary text-sm opacity-60 cursor-not-allowed">
                <Crown className="w-4 h-4" /> ارتقا به حرفه‌ای (به‌زودی)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-strong p-4 md:p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-sm md:text-base font-bold text-white">تنظیمات بک‌تست</h2>
        </div>

        <div className="mb-5">
          <div className="text-[11px] font-semibold text-slate-400 mb-2">استراتژی</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(STRATEGIES).map(([key, s]) => {
              const Icon = s.icon;
              const active = strategy === key;
              return (
                <button key={key} onClick={() => setStrategy(key)}
                  className={`p-3 rounded-xl text-right transition-all ${
                    active ? 'bg-primary/15 border-2 border-primary/50 shadow-lg shadow-primary/20' : 'glass border border-border/40 hover:border-primary/30'
                  }`}>
                  <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-primary' : 'text-slate-400'}`} />
                  <div className={`text-xs font-bold ${active ? 'text-primary' : 'text-white'}`}>{s.name}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5 leading-tight">{s.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-2">تعداد سهم</div>
            <div className="grid grid-cols-4 gap-1">
              {[3, 5, 10, 15].map(n => (
                <button key={n} onClick={() => setNStocks(n)}
                  className={`py-2 rounded-lg text-xs font-bold ${nStocks === n ? 'bg-primary text-bg' : 'glass text-slate-300'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-2">مدت نگه‌داری</div>
            <div className="grid grid-cols-4 gap-1">
              {[5, 10, 20, 30].map(d => (
                <button key={d} onClick={() => setHoldDays(d)}
                  className={`py-2 rounded-lg text-xs font-bold ${holdDays === d ? 'bg-primary text-bg' : 'glass text-slate-300'}`}>{d}ر</button>
              ))}
            </div>
          </div>
          <div className="col-span-2 md:col-span-1">
            <div className="text-[11px] font-semibold text-slate-400 mb-2">سرمایه (تومان)</div>
            <input type="number" value={capital} onChange={(e) => setCapital(parseInt(e.target.value) || 0)} step={1000000}
              className="w-full glass rounded-lg py-2 px-3 text-sm text-white num focus:outline-none border border-border/50 focus:border-primary/50" />
          </div>
        </div>

        <button onClick={handleRun} disabled={running || limitReached}
          className={`mt-5 w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            running || limitReached ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-l from-primary to-primary2 text-bg shadow-lg shadow-primary/30 hover:shadow-primary/50'
          }`}>
          {running ? <><Loader2 className="w-5 h-5 animate-spin" /> در حال اجرا...</> : <><Play className="w-5 h-5" /> اجرای بک‌تست</>}
        </button>
      </div>

      {results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`glass-strong p-4 rounded-xl ${results.metrics.totalReturn >= 0 ? 'border-success/40' : 'border-danger/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">بازده کل</span>
                {results.metrics.totalReturn >= 0 ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-danger" />}
              </div>
              <div className={`num text-2xl font-black ${results.metrics.totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                {results.metrics.totalReturn >= 0 ? '+' : ''}<CountUp target={results.metrics.totalReturn} decimals={1} suffix="٪" />
              </div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">Winrate</span>
                <Award className="w-4 h-4 text-primary" />
              </div>
              <div className="num text-2xl font-black text-white"><CountUp target={results.metrics.winrate} decimals={1} suffix="٪" /></div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">معاملات</span>
                <Activity className="w-4 h-4 text-accent" />
              </div>
              <div className="num text-2xl font-black text-white"><CountUp target={results.metrics.nTrades} /></div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">سرمایه نهایی</span>
                <DollarSign className="w-4 h-4 text-warning" />
              </div>
              <div className="num text-lg font-black text-white truncate"><CountUp target={results.metrics.finalCapital} /></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">میانگین</div>
              <div className={`num text-base font-bold ${results.metrics.avgTrade >= 0 ? 'text-success' : 'text-danger'}`}>
                {results.metrics.avgTrade >= 0 ? '+' : ''}{results.metrics.avgTrade.toFixed(2)}٪
              </div>
            </div>
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">بهترین</div>
              <div className="num text-base font-bold text-success">+{results.metrics.bestTrade.toFixed(2)}٪</div>
            </div>
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">بدترین</div>
              <div className="num text-base font-bold text-danger">{results.metrics.worstTrade.toFixed(2)}٪</div>
            </div>
          </div>

          <div className="glass-strong p-4 md:p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <LineChart className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-white">نمودار رشد سرمایه</h3>
            </div>
            <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/40 p-2">
              <EquityCurve data={results.equity} />
            </div>
          </div>

          <div className="glass-strong rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">لیست معاملات</h3>
              <span className="text-[10px] text-slate-400">{fmt(results.metrics.nTrades)} معامله</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full data-table text-sm">
                <thead>
                  <tr>
                    <th className="text-xs">#</th>
                    <th className="text-xs">سهم</th>
                    <th className="text-xs">ورود</th>
                    <th className="text-xs">خروج</th>
                    <th className="text-xs">قیمت ورود</th>
                    <th className="text-xs">بازده</th>
                  </tr>
                </thead>
                <tbody>
                  {results.trades.slice().reverse().slice(0, 100).map((t, i) => (
                    <tr key={i}>
                      <td className="num text-[10px] text-slate-500">{results.trades.length - i}</td>
                      <td><Link href={`/predictions/${encodeURIComponent(t.symbol)}`} className="font-bold text-white hover:text-primary text-xs">{t.symbol}</Link></td>
                      <td className="num text-[10px] text-slate-400">{toJalali(t.entryDate)}</td>
                      <td className="num text-[10px] text-slate-400">{toJalali(t.exitDate)}</td>
                      <td className="num text-[10px] text-slate-300">{fmt(t.entryPrice)}</td>
                      <td>
                        <span className={`num text-[11px] font-black px-1.5 py-0.5 rounded ${t.returnPct > 0 ? 'text-success bg-success/15' : 'text-danger bg-danger/15'}`}>
                          {t.returnPct > 0 ? '▲ +' : '▼ '}{t.returnPct.toFixed(2)}٪
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!results && !running && (
        <div className="glass-strong p-12 rounded-2xl text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Target className="w-10 h-10 text-primary/60" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">آماده بک‌تست؟</h2>
          <p className="text-sm text-slate-400 mb-4">استراتژی، تعداد سهم، و مدت نگه‌داری را انتخاب کنید و دکمه اجرا را بزنید</p>
          <p className="text-[10px] text-slate-500">بک‌تست روی ۲۵۰ روز اخیر اجرا می‌شود</p>
        </div>
      )}
    </div>
  );
}
