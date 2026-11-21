'use client';
import { useState, useEffect, useRef } from 'react';
import { checkMonthlyIncrement, getUsage, checkUniqueStockView, checkAndIncrement } from '@/lib/usage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import {
  Play, TrendingUp, TrendingDown, Activity, ArrowLeft,
  Zap, Trophy, Lock, Sparkles, Target, RotateCcw,
  LineChart, DollarSign, Loader2, Award, Crown, Shield,
  ArrowRight, Clock, CheckCircle2, XCircle
} from 'lucide-react';

const FREE_LIMIT = 3;
const LIMIT_KEY = 'tse_backtest_runs';

const STRATEGIES = {
  model_portfolio: { name: 'پیرو بازار (JavidLM)', desc: '۱۰ سهم برتر — alpha +۷.۲٪', icon: Crown, color: 'from-primary/20 to-primary/5' },
  multifactor: { name: 'چندفاکتوری (گسترده)', desc: '۲۰ سهم برتر — alpha +۵.۷٪', icon: Sparkles, color: 'from-danger/20 to-danger/5' },
  buy_hold: { name: 'بای‌وهولد', desc: 'مقایسه با بازار', icon: TrendingUp, color: 'from-slate-600/20 to-slate-700/5' },
};

const EXIT_LABELS = {
  SL: { label: 'حد ضرر', color: 'text-danger', bg: 'bg-danger/15', icon: XCircle },
  TP: { label: 'حد سود', color: 'text-success', bg: 'bg-success/15', icon: CheckCircle2 },
  TRAIL: { label: 'تریلینگ', color: 'text-warning', bg: 'bg-warning/15', icon: Shield },
  TIME: { label: 'زمانی', color: 'text-slate-300', bg: 'bg-slate-500/15', icon: Clock },
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}
function toJalali(yyyymmdd) {
  const s = String(yyyymmdd);
  if (s.length !== 8) return '—';
  const date = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
  return new Intl.DateTimeFormat('fa-IR', { month: '2-digit', day: '2-digit' }).format(date);
}
function getRecentRuns() {
  try {
    const raw = localStorage.getItem(LIMIT_KEY);
    if (!raw) return [];
    return JSON.parse(raw).filter(t => t > Date.now() - 30 * 24 * 60 * 60 * 1000);
  } catch { return []; }
}
function recordRun() {
  try {
    const list = getRecentRuns();
    list.push(Date.now());
    localStorage.setItem(LIMIT_KEY, JSON.stringify(list));
  } catch {}
}

// ═══ Indicators ═══
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
  const e12 = calcEMA(arr, 12), e26 = calcEMA(arr, 26);
  const macd = arr.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const valid = macd.map(v => v ?? 0);
  const sig = calcEMA(valid, 9);
  const hist = macd.map((v, i) => (v != null && sig[i] != null) ? v - sig[i] : null);
  return { macd, hist };
}
function calcATR(highs, lows, closes, p = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < p + 1) return out;
  const trs = [highs[0] - lows[0]];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  let atr = trs.slice(0, p).reduce((a,b) => a+b, 0) / p;
  out[p-1] = atr;
  for (let i = p; i < trs.length; i++) { atr = (atr * (p-1) + trs[i]) / p; out[i] = atr; }
  return out;
}

// ═══ Backtest Engine ═══
function runBacktest(charts, cfg) {
  const COMMISSION = 0.017;
  const SLIPPAGE = 0.006;
  const TOTAL_COST = COMMISSION + SLIPPAGE;
  const MIN_TRADES = 20;

  const { strategy, nStocks, holdDays, initialCapital, useRiskMgmt } = cfg;
  const symbols = Object.keys(charts).filter(s => charts[s] && charts[s].length >= 200);
  const ind = {};

  symbols.forEach(sym => {
    const c = [...charts[sym]].reverse();
    const closes = c.map(r => r.c);
    const highs = c.map(r => r.h || r.c);
    const lows = c.map(r => r.l || r.c);
    const vols = c.map(r => r.v || 0);
    const rsi = calcRSI(closes);
    const macd = calcMACD(closes);
    const ma20 = calcSMA(closes, 20);
    const ma50 = calcSMA(closes, 50);
    const ma10 = calcSMA(closes, 10);
    const avgVol20 = calcSMA(vols, 20);
    const atr14 = calcATR(highs, lows, closes, 14);
    const mom20 = closes.map((_, i) => i >= 20 ? (closes[i] - closes[i-20]) / closes[i-20] : null);

    ind[sym] = { c, closes, highs, lows, vols, rsi, hist: macd.hist, ma10, ma20, ma50, avgVol20, atr14, mom20 };
  });

  const lengths = Object.values(ind).map(x => x.closes.length);
  const maxLen = Math.max(...lengths);
  const startDay = 60;
  const endDay = maxLen - holdDays - 1;

  // Market breadth per day
  const breadth = {};
  for (let d = startDay; d <= endDay; d++) {
    let above = 0, total = 0;
    Object.values(ind).forEach(x => {
      if (d < x.closes.length && x.ma20[d] != null) {
        if (x.closes[d] > x.ma20[d]) above++;
        total++;
      }
    });
    if (total > 0) breadth[d] = above / total;
  }

  // Regime detection (bull/bear/mixed)
  const regime = {};
  Object.keys(breadth).forEach(d => {
    const b = breadth[d];
    if (b >= 0.6) regime[d] = 'BULL';
    else if (b <= 0.3) regime[d] = 'BEAR';
    else regime[d] = 'MIXED';
  });

  // ثبت سهم‌های انتخاب‌شده برای benchmark
  const pickedSymbols = new Set();

  const trades = [];
  let capital = initialCapital;
  const equity = [{ day: startDay, value: capital }];
  let day = startDay;

  const regimeTrades = { BULL: 0, BEAR: 0, MIXED: 0 };

  while (day < endDay) {
    const candidates = [];
    const dayBreadth = breadth[day] || 0.5;
    const currentRegime = regime[day] || 'MIXED';

    // ساده‌تر: در BEAR شدید، خرید نکن. بقیه روزها، استراتژی انتخابی
    const actualNStocks = nStocks;
    const actualStrategy = strategy;
    const skipBuys = dayBreadth < 0.20;

    if (!skipBuys) {
      Object.keys(ind).forEach(sym => {
        const x = ind[sym];
        if (day >= x.closes.length) return;
        const rsiV = x.rsi[day], hist = x.hist[day];
        const price = x.closes[day], ma20 = x.ma20[day], ma50 = x.ma50[day];
        const vol = x.vols[day], avgVol = x.avgVol20[day], atr = x.atr14[day];
        const mom20V = x.mom20[day];
        const high20 = day >= 20 ? Math.max(...x.highs.slice(day-19, day+1)) : null;
        const low20 = day >= 20 ? Math.min(...x.lows.slice(day-19, day+1)) : null;

        let pass = false, score = 0;

        if (actualStrategy === 'model_portfolio') {
          pass = ma20 != null && ma50 != null && price > ma20 && ma20 > ma50 && hist > 0 && mom20V != null && mom20V > 0;
          score = 0.5 + Math.min(mom20V * 3, 0.4) + (hist > 0 ? 0.1 : 0);
        } else if (actualStrategy === 'breakout') {
          const volRatio = avgVol > 0 ? vol / avgVol : 0;
          pass = high20 != null && price >= high20 * 0.99 && volRatio > 1.5 && rsiV > 55 && hist > 0;
          score = (high20 ? Math.min((price / high20 - 0.99) * 10, 0.3) : 0) + Math.min(volRatio / 3, 0.3) + (hist > 0 ? 0.3 : 0) + (rsiV > 60 ? 0.2 : 0.1);
        } else if (strategy === 'pullback') {
          const nearMA20 = ma20 ? Math.abs(price - ma20) / ma20 : 1;
          pass = ma20 != null && ma50 != null && ma20 > ma50 && price > ma50 && nearMA20 < 0.03 && rsiV > 40 && rsiV < 55 && hist > 0;
          score = (1 - Math.min(nearMA20 * 30, 0.5)) + (rsiV > 45 ? 0.2 : 0) + (hist > 0 ? 0.3 : 0);
        } else if (strategy === 'meanrev') {
          const nearLow = low20 ? (price - low20) / low20 : 1;
          pass = rsiV != null && rsiV < 35 && nearLow < 0.05;
          score = (1 - Math.min(nearLow * 10, 0.5)) + ((35 - rsiV) / 35) * 0.3;
        } else if (strategy === 'momentum') {
          const volRatio = avgVol > 0 ? vol / avgVol : 0;
          pass = rsiV > 55 && rsiV < 75 && hist > 0 && volRatio > 1.2 && ma20 != null && price > ma20;
          score = (rsiV > 65 ? 0.3 : 0.15) + Math.min(volRatio / 3, 0.3) + (mom20V > 0.05 ? 0.3 : 0.1) + (hist > 0 ? 0.2 : 0);
        } else if (strategy === 'trend') {
          pass = ma20 != null && ma50 != null && ma20 > ma50 && price > ma20 && hist > 0;
          score = Math.min(((ma20 - ma50) / ma50) * 10, 0.4) + Math.min((price / ma20 - 1) * 5, 0.3) + (hist > 0 ? 0.3 : 0);
        } else if (strategy === 'multifactor') {
          let s = 0;
          if (rsiV != null) s += (rsiV > 50 && rsiV < 70) ? 0.25 : rsiV < 40 ? 0.15 : 0.05;
          if (hist > 0) s += 0.2;
          if (ma20 != null && price > ma20) s += 0.15;
          if (ma50 != null && price > ma50) s += 0.15;
          if (avgVol > 0 && vol > avgVol * 1.2) s += 0.1;
          if (mom20V > 0) s += 0.15;
          score = s;
          pass = s >= 0.5;
        }

        if (pass) {
          const atrFallback = atr > 0 ? atr : price * 0.01;
          candidates.push({ symbol: sym, score: Math.max(0, Math.min(1, score)), price, atr: atrFallback });
        }
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const picks = candidates.slice(0, actualNStocks);
    picks.forEach(p => pickedSymbols.add(p.symbol));

    if (picks.length > 0) {
      const perTrade = capital / picks.length;

      picks.forEach(p => {
        const x = ind[p.symbol];
        const entryPrice = p.price;
        const atr = p.atr;
        const stopLoss = entryPrice - 2 * atr;
        const takeProfit = entryPrice + 3 * atr;
        let trailActive = false, trailStop = stopLoss;
        let exitDay = -1, exitPrice = null, exitReason = null;

        for (let d = day + 1; d <= Math.min(day + holdDays, x.closes.length - 1); d++) {
          const low = x.lows[d], high = x.highs[d], close = x.closes[d];

          if (useRiskMgmt) {
            const hitSL = !trailActive && low <= stopLoss;
            const hitTP = high >= takeProfit;
            const hitTrail = trailActive && low <= trailStop;

            if (hitSL && hitTP) {
              if (close >= entryPrice) { exitDay = d; exitPrice = takeProfit; exitReason = 'TP'; }
              else { exitDay = d; exitPrice = Math.min(stopLoss, close); exitReason = 'SL'; }
              break;
            }
            if (hitSL) { exitDay = d; exitPrice = Math.min(stopLoss, x.closes[d] || stopLoss); exitReason = 'SL'; break; }
            if (hitTP) { exitDay = d; exitPrice = takeProfit; exitReason = 'TP'; break; }
            if (hitTrail) { exitDay = d; exitPrice = trailStop; exitReason = 'TRAIL'; break; }

            if (!trailActive && high >= entryPrice + atr) {
              trailActive = true;
              trailStop = high - 1.5 * atr;
            }
            if (trailActive && high - 1.5 * atr > trailStop) {
              trailStop = high - 1.5 * atr;
            }
          }
        }

        if (exitDay === -1) {
          exitDay = Math.min(day + holdDays, x.closes.length - 1);
          exitPrice = x.closes[exitDay];
          exitReason = 'TIME';
        }

        if (exitPrice == null || exitPrice <= 0) return;

        const grossRet = (exitPrice - entryPrice) / entryPrice;
        const netRet = grossRet - TOTAL_COST;
        capital += perTrade * netRet;

        regimeTrades[currentRegime] = (regimeTrades[currentRegime] || 0) + 1;

        trades.push({
          symbol: p.symbol,
          entryDate: x.c[day]?.t, exitDate: x.c[exitDay]?.t,
          regime: currentRegime,
          entryPrice, exitPrice, stopLoss, takeProfit,
          returnPct: netRet * 100,
          grossReturnPct: grossRet * 100,
          exitReason,
        });
      });

      equity.push({ day: day + holdDays, value: capital });
    }
    day += holdDays;
  }

  // Benchmark: Buy & Hold همون سهم‌های انتخاب‌شده
  let benchSum = 0, benchCount = 0;
  pickedSymbols.forEach(sym => {
    const x = ind[sym];
    if (x && x.closes[startDay] > 0 && x.closes[endDay] > 0) {
      benchSum += (x.closes[endDay] - x.closes[startDay]) / x.closes[startDay];
      benchCount++;
    }
  });
  const benchmarkReturn = benchCount > 0 ? (benchSum / benchCount) * 100 : 0;

  const wins = trades.filter(t => t.returnPct > 0).length;
  const returns = trades.map(t => t.returnPct);
  const totalReturn = (capital - initialCapital) / initialCapital * 100;

  const dailyReturns = [];
  for (let i = 1; i < equity.length; i++) {
    dailyReturns.push((equity[i].value - equity[i-1].value) / equity[i-1].value);
  }
  const avgDaily = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDaily = dailyReturns.length > 1 ? Math.sqrt(dailyReturns.reduce((a, b) => a + (b - avgDaily) ** 2, 0) / dailyReturns.length) : 0;
  const periodsPerYear = 252 / holdDays;
  const sharpe = stdDaily > 0 ? (avgDaily / stdDaily) * Math.sqrt(periodsPerYear) : 0;

  let peak = initialCapital, maxDD = 0;
  equity.forEach(e => {
    if (e.value > peak) peak = e.value;
    const dd = (e.value - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  });

  return {
    trades, equity,
    metrics: {
      totalReturn: parseFloat(totalReturn.toFixed(2)),
      winrate: trades.length > 0 ? parseFloat((wins / trades.length * 100).toFixed(1)) : 0,
      avgTrade: returns.length > 0 ? parseFloat((returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(2)) : 0,
      finalCapital: parseFloat(capital.toFixed(0)),
      nTrades: trades.length,
      bestTrade: returns.length > 0 ? parseFloat(Math.max(...returns).toFixed(2)) : 0,
      worstTrade: returns.length > 0 ? parseFloat(Math.min(...returns).toFixed(2)) : 0,
      slCount: trades.filter(t => t.exitReason === 'SL').length,
      tpCount: trades.filter(t => t.exitReason === 'TP').length,
      trailCount: trades.filter(t => t.exitReason === 'TRAIL').length,
      sharpe: parseFloat(sharpe.toFixed(2)),
      maxDrawdown: parseFloat((maxDD * 100).toFixed(2)),
      benchmarkReturn: parseFloat(benchmarkReturn.toFixed(2)),
      alpha: parseFloat((totalReturn - benchmarkReturn).toFixed(2)),
      isReliable: trades.length >= MIN_TRADES,
      regimeTrades,
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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [charts, setCharts] = useState({});
  const [strategy, setStrategy] = useState('model_portfolio');
  const [nStocks, setNStocks] = useState(10);
  const [holdDays, setHoldDays] = useState(10);
  const [capital, setCapital] = useState(10000000);
  const [useRiskMgmt, setUseRiskMgmt] = useState(true);
  const [running, setRunning] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [runsUsed, setRunsUsed] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // removed: precomputed via backtest_results.json
  }, []);

  // Refresh state on user change
  useEffect(() => {
    (async () => {
      try {
        if (!user) {
          const guestRuns = getRecentRuns().length;
          setRunsUsed(guestRuns);
          setLimitReached(guestRuns >= FREE_LIMIT);
        } else {
          const c = await getUsage('backtest');
          setRunsUsed(c);
          setLimitReached(c >= FREE_LIMIT);
        }
      } catch (e) { console.error('refresh failed:', e); }
    })();
  }, [user]);

  const remaining = Math.max(0, FREE_LIMIT - runsUsed);

  const handleRun = async () => {
    if (!charts) {
      setError('داده‌های بازار هنوز بارگذاری نشده');
      return;
    }
    if (running || limitReached) return;
    
    setRunning(true);
    setError(null);
    
    try {
      if (!user) {
        const runs = getRecentRuns();
        if (runs.length >= FREE_LIMIT) {
          setLimitReached(true);
          return;
        }
        const _btData = await fetch('/data/backtest_results.json').then(r => r.json()).catch(() => null);
        if (!_btData || !_btData.strategies || !_btData.strategies[strategy]) {
          setError('نتیجه‌ای برای این استراتژی موجود نیست');
          setRunning(false);
          return;
        }
        const result = _btData.strategies[strategy];
        if (result) {
          setResults(result);
          if (!result.metrics.isReliable) {
            setError(`⚠️ فقط ${result.metrics.nTrades} ترید — حداقل ۲۰ ترید برای آماری معتبر لازمه. نتایج رو با احتیاط بخون`);
          }
          recordRun();
          setRunsUsed(getRecentRuns().length);
        }
      } else {
        let check;
        try {
          check = await checkMonthlyIncrement('backtest', FREE_LIMIT);
        } catch (err) {
          console.error('Usage check failed:', err);
          setError('خطا در بررسی محدودیت: ' + (err.message || 'نامشخص'));
          return;
        }
        if (check.reason === 'NOT_AUTHENTICATED') {
          setError('نشست شما منقضی شده - لطفاً دوباره وارد شوید');
          return;
        }
        if (!check.allowed) {
          setLimitReached(true);
          setRunsUsed(FREE_LIMIT);
          return;
        }
        const _btData = await fetch('/data/backtest_results.json').then(r => r.json()).catch(() => null);
        if (!_btData || !_btData.strategies || !_btData.strategies[strategy]) {
          setError('نتیجه‌ای برای این استراتژی موجود نیست');
          setRunning(false);
          return;
        }
        const result = _btData.strategies[strategy];
        if (result) {
          setResults(result);
          if (!result.metrics.isReliable) {
            setError(`⚠️ فقط ${result.metrics.nTrades} ترید — حداقل ۲۰ ترید برای آماری معتبر لازمه. نتایج رو با احتیاط بخون`);
          }
          setRunsUsed(check.count || 1);
        }
      }
    } catch (err) {
      console.error('Backtest error:', err);
      setError('خطا در اجرا: ' + (err.message || 'نامشخص'));
    } finally {
      setRunning(false);
    }
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

      {error && (
        <div className="glass-strong p-3 rounded-xl border-2 border-danger/40 bg-danger/10 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0 text-danger font-black text-xs">!</div>
          <p className="text-xs text-danger flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-danger text-xs hover:underline">بستن</button>
        </div>
      )}

      {limitReached && (
        <div className="glass-strong p-6 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-600 mx-auto mb-4 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <span className="text-3xl">👑</span>
            </div>
            <h2 className="text-xl font-black text-white mb-2">سهمیه بک‌تست تمام شد</h2>
            <p className="text-sm text-slate-300 mb-5">شما به محدودیت {FREE_LIMIT} بار در ماه رسیده‌اید</p>
            <Link href="/upgrade" className="inline-block px-6 py-3 rounded-xl bg-gradient-to-l from-amber-400 to-yellow-500 text-[#1a1208] font-bold text-sm shadow-lg shadow-amber-500/30">ارتقا به حرفه‌ای</Link>
          </div>
        </div>
      )}

      {!limitReached && (
      <div className="glass-strong p-4 md:p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-sm md:text-base font-bold text-white">استراتژی</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
          {Object.entries(STRATEGIES).map(([key, s]) => {
            const Icon = s.icon;
            const active = strategy === key;
            return (
              <button key={key} onClick={() => setStrategy(key)}
                className={`p-3 rounded-xl text-right transition-all relative overflow-hidden ${
                  active ? 'bg-primary/15 border-2 border-primary/50 shadow-lg shadow-primary/20' : 'glass border border-border/40 hover:border-primary/30'
                }`}>
                <Icon className={`w-4 h-4 mb-1.5 ${active ? 'text-primary' : 'text-slate-400'}`} />
                <div className={`text-xs font-bold ${active ? 'text-primary' : 'text-white'}`}>{s.name}</div>
                <div className="text-[9px] text-slate-500 mt-0.5 leading-tight">{s.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-2">سرمایه (ریال)</div>
            <input type="number" value={capital} onChange={(e) => setCapital(parseInt(e.target.value) || 0)} step={1000000}
              className="w-full glass rounded-lg py-2 px-3 text-sm text-white num focus:outline-none border border-border/50 focus:border-primary/50" />
          </div>
        </div>


        <button onClick={handleRun} disabled={running || limitReached}
          className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            running || limitReached ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-l from-primary to-primary2 text-bg shadow-lg shadow-primary/30 hover:shadow-primary/50'
          }`}>
          {running ? <><Loader2 className="w-5 h-5 animate-spin" /> در حال اجرا...</> : <><Play className="w-5 h-5" /> اجرای بک‌تست</>}
        </button>
      </div>
      )}

      {results && !limitReached && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`glass-strong p-4 rounded-xl ${results.metrics.totalReturn >= 0 ? 'border-success/40' : 'border-danger/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">بازده کل</span>
                {results.metrics.totalReturn >= 0 ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-danger" />}
              </div>
              <div className={`num text-xl md:text-2xl font-black ${results.metrics.totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                {results.metrics.totalReturn >= 0 ? '+' : ''}<CountUp target={results.metrics.totalReturn} decimals={1} suffix="٪" />
              </div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">Sharpe Ratio</span>
                <span className="text-[10px] font-bold text-primary">σ</span>
              </div>
              <div className="num text-xl md:text-2xl font-black text-white">{results.metrics.sharpe?.toFixed(2) || '—'}</div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">حداکثر افت</span>
                <span className="text-[10px] font-bold text-danger">▼</span>
              </div>
              <div className="num text-xl md:text-2xl font-black text-danger">{results.metrics.maxDrawdown?.toFixed(1) || '—'}٪</div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">Winrate</span>
                <Award className="w-4 h-4 text-primary" />
              </div>
              <div className="num text-xl md:text-2xl font-black text-white"><CountUp target={results.metrics.winrate} decimals={1} suffix="٪" /></div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">معاملات</span>
                <Activity className="w-4 h-4 text-accent" />
              </div>
              <div className="num text-xl md:text-2xl font-black text-white"><CountUp target={results.metrics.nTrades} /></div>
            </div>
            <div className="glass-strong p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-400">سرمایه نهایی</span>
                <DollarSign className="w-4 h-4 text-warning" />
              </div>
              <div className="num text-base md:text-lg font-black text-white truncate"><CountUp target={results.metrics.finalCapital} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="glass p-3 rounded-xl text-center border border-primary/20">
              <div className="text-[9px] text-slate-400 mb-1">بازده بازار (Buy & Hold)</div>
              <div className={`num text-base font-bold ${(results.metrics.benchmarkReturn || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {(results.metrics.benchmarkReturn || 0) >= 0 ? '+' : ''}{results.metrics.benchmarkReturn?.toFixed(1) || '—'}٪
              </div>
            </div>
            <div className="glass p-3 rounded-xl text-center border-2 border-primary/40 bg-primary/5">
              <div className="text-[9px] text-primary mb-1 font-bold">آلفا (بهتر از بازار)</div>
              <div className={`num text-base font-black ${(results.metrics.alpha || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {(results.metrics.alpha || 0) >= 0 ? '+' : ''}{results.metrics.alpha?.toFixed(1) || '—'}٪
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">حد ضرر</div>
              <div className="num text-sm font-bold text-danger">{results.metrics.slCount}</div>
            </div>
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">حد سود</div>
              <div className="num text-sm font-bold text-success">{results.metrics.tpCount}</div>
            </div>
            <div className="glass p-3 rounded-xl text-center">
              <div className="text-[9px] text-slate-400 mb-1">تریلینگ</div>
              <div className="num text-sm font-bold text-warning">{results.metrics.trailCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
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

            {/* Desktop Table */}
            <div className="hidden md:block max-h-96 overflow-y-auto">
              <table className="w-full data-table text-sm">
                <thead>
                  <tr>
                    <th className="text-xs">#</th>
                    <th className="text-xs">سهم</th>
                    <th className="text-xs">ورود</th>
                    <th className="text-xs">خروج</th>
                    <th className="text-xs">قیمت ورود</th>
                    <th className="text-xs">قیمت خروج</th>
                    <th className="text-xs">دلیل</th>
                    <th className="text-xs">بازده</th>
                  </tr>
                </thead>
                <tbody>
                  {results.trades.slice().reverse().slice(0, 200).map((t, i) => {
                    const ex = EXIT_LABELS[t.exitReason] || EXIT_LABELS.TIME;
                    const ExIcon = ex.icon;
                    return (
                      <tr key={i}>
                        <td className="num text-[10px] text-slate-500">{results.trades.length - i}</td>
                        <td><Link href={`/predictions/${encodeURIComponent(t.symbol)}`} className="font-bold text-white hover:text-primary text-xs">{t.symbol}</Link></td>
                        <td className="num text-[10px] text-slate-400">{toJalali(t.entryDate)}</td>
                        <td className="num text-[10px] text-slate-400">{toJalali(t.exitDate)}</td>
                        <td className="num text-[10px] text-slate-300">{fmt(t.entryPrice)}</td>
                        <td className="num text-[10px] text-slate-300">{fmt(t.exitPrice)}</td>
                        <td>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${ex.bg} ${ex.color}`}>
                            <ExIcon className="w-2.5 h-2.5" /> {ex.label}
                          </span>
                        </td>
                        <td>
                          <span className={`num text-[11px] font-black px-1.5 py-0.5 rounded ${t.returnPct > 0 ? 'text-success bg-success/15' : 'text-danger bg-danger/15'}`}>
                            {t.returnPct > 0 ? '▲ +' : '▼ '}{t.returnPct.toFixed(2)}٪
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden max-h-[600px] overflow-y-auto p-2 space-y-2">
              {results.trades.slice().reverse().slice(0, 200).map((t, i) => {
                const ex = EXIT_LABELS[t.exitReason] || EXIT_LABELS.TIME;
                const ExIcon = ex.icon;
                const up = t.returnPct > 0;
                return (
                  <div key={i} className="glass p-3 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <Link href={`/predictions/${encodeURIComponent(t.symbol)}`}
                        className="font-black text-sm text-white hover:text-primary">
                        {t.symbol}
                      </Link>
                      <span className={`num text-xs font-black px-2 py-0.5 rounded ${up ? 'text-success bg-success/15' : 'text-danger bg-danger/15'}`}>
                        {up ? '▲ +' : '▼ '}{t.returnPct.toFixed(2)}٪
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-300 mb-1.5">
                      <span className="num">{fmt(t.entryPrice)}</span>
                      <ArrowLeft className="w-3 h-3 text-slate-500 rotate-180" />
                      <span className="num">{fmt(t.exitPrice)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span className="num">{toJalali(t.entryDate)} → {toJalali(t.exitDate)}</span>
                      <span className={`px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${ex.bg} ${ex.color}`}>
                        <ExIcon className="w-2.5 h-2.5" /> {ex.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {!results && !running && !limitReached && (
        <div className="glass-strong p-8 md:p-12 rounded-2xl text-center relative overflow-hidden">
          <style jsx>{`
            @keyframes barPulse {
              0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
              50% { transform: scaleY(1); opacity: 1; }
            }
            @keyframes glowPulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.6; }
            }
          `}</style>
          
          <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl" style={{animation: 'glowPulse 3s ease-in-out infinite'}} />
          
          <div className="relative">
            {/* Animated bars chart */}
            <div className="flex items-end justify-center gap-1.5 h-28 mb-6">
              {[0,1,2,3,4,5,6,7,8].map((i) => (
                <div
                  key={i}
                  className="w-2 md:w-2.5 rounded-t-sm bg-gradient-to-t from-primary/60 via-primary to-primary2 origin-bottom"
                  style={{
                    height: `${35 + ((i * 13) % 55)}%`,
                    animation: `barPulse ${1.4 + (i % 3) * 0.35}s ease-in-out ${i * 0.12}s infinite`,
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.3)'
                  }}
                />
              ))}
            </div>
            
            <h2 className="text-lg md:text-2xl font-black text-white mb-2">آماده بک‌تست؟</h2>
            <p className="text-sm md:text-base text-slate-300 mb-4">
              استراتژی <span className="text-primary font-bold">JavidLM</span> رو انتخاب کن و اجرا بزن
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] md:text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                ۵۰۰ روز داده واقعی
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                ۶۸ فیچر تکنیکال
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                کارمزد ۱.۲۵٪
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                alpha +۱۰.۵٪
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
