'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, TrendingUp, TrendingDown, Activity, Gauge,
  BarChart3, Layers, ArrowUpRight, ArrowDownRight, Minus,
  Zap, Sparkles, CircleDot, Target
} from 'lucide-react';

const SECTOR_ICONS = {
  'محصولات شيميايي': '🧪', 'فلزات اساسي': '⚙️', 'مواد و محصولات دارويي': '💊',
  'قند و شكر': '🍬', 'سرمايه گذاريها': '💼', 'لاستيك و پلاستيك': '🛢️',
  'محصولات غذايي و آشاميدني به جز قند و شكر': '🍔', 'انبوه سازي، املاك و مستغلات': '🏢',
  'خودرو و ساخت قطعات': '🚗', 'بيمه وصندوق بازنشستگي به جزتامين اجتماعي': '🛡️',
  'بانكها و موسسات اعتباري': '🏦', 'استخراج كانه هاي فلزي': '⛏️',
  'فراورده هاي نفتي، كك و سوخت هسته اي': '🛢️', 'سيمان، آهك و گچ': '🏗️',
  'رايانه و فعاليت‌هاي وابسته به آن': '💻', 'مخابرات': '📡',
  'عرضه برق، گاز، بخاروآب گرم': '⚡', 'حمل ونقل، انبارداري و ارتباطات': '🚚',
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

// Animated count-up
function CountUp({ target, duration = 1500, suffix = '', decimals = 0 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min((t - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(target * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{val.toLocaleString('fa-IR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</span>;
}

// Circular Gauge
function BreadthGauge({ value }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / 2000, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(value * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  const R = 95, CX = 120, CY = 120, stroke = 18;
  const circ = 2 * Math.PI * R;
  const offset = circ - (animated / 100) * circ;

  // Zone: 0-30 danger, 30-70 neutral, 70-100 success
  const zone = value >= 70 ? 'success' : value >= 30 ? 'warning' : 'danger';
  const zoneColor = zone === 'success' ? '#10b981' : zone === 'warning' ? '#f59e0b' : '#f43f5e';
  const zoneBg = zone === 'success' ? 'from-success/15 via-success/5' : zone === 'warning' ? 'from-warning/15 via-warning/5' : 'from-danger/15 via-danger/5';
  const zoneLabel = zone === 'success' ? 'قوی' : zone === 'warning' ? 'متعادل' : 'ضعیف';

  return (
    <div className="relative w-[240px] h-[240px] flex-shrink-0">
      <svg viewBox="0 0 240 240" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" x2="1">
            <stop offset="0%" stopColor={zoneColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={zoneColor} />
          </linearGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={stroke} />
        <circle cx={CX} cy={CY} r={R} fill="none"
          stroke="url(#gaugeGrad)" strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 12px ${zoneColor}40)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] text-slate-400 mb-1">قدرت بازار</div>
        <div className={`num text-5xl font-black ${zone === 'success' ? 'text-success' : zone === 'warning' ? 'text-warning' : 'text-danger'}`}>
          <CountUp target={value} decimals={1} suffix="٪" />
        </div>
        <div className={`mt-2 text-xs font-bold px-3 py-1 rounded-full bg-${zone}-500/20 border border-${zone}-500/40 ${zone === 'success' ? 'text-success' : zone === 'warning' ? 'text-warning' : 'text-danger'}`}>
          {zoneLabel}
        </div>
      </div>
    </div>
  );
}

// Trend Chart
function TrendChart({ data }) {
  const pathRef = useRef(null);
  const areaRef = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!pathRef.current || data.length < 2) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = len;
    pathRef.current.style.strokeDashoffset = len;
    pathRef.current.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1800, fill: 'forwards', easing: 'ease-out' });
    if (areaRef.current) areaRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1800, fill: 'forwards', easing: 'ease-out' });
  }, [data]);

  const w = 800, h = 180, pad = 20;
  const vals = data.map(d => d.value);
  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (w - 2 * pad),
    y: h - pad - (d.value / 100) * (h - 2 * pad),
    value: d.value,
    date: d.date,
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = path + ` L${w-pad},${h-pad} L${pad},${h-pad} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>

        {/* Grid lines at 30, 50, 70 */}
        {[30, 50, 70].map(v => {
          const y = h - pad - (v / 100) * (h - 2 * pad);
          return (
            <g key={v}>
              <line x1={pad} y1={y} x2={w-pad} y2={y}
                stroke={v === 50 ? 'rgba(100,116,139,0.3)' : 'rgba(100,116,139,0.15)'}
                strokeDasharray={v === 50 ? '4 4' : '2 4'} />
              <text x={pad - 4} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9">{v}٪</text>
            </g>
          );
        })}

        <path ref={areaRef} d={area} fill="url(#areaGrad)" opacity="0" />
        <path ref={pathRef} d={path} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Current dot */}
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="5" fill="#06b6d4" stroke="#05070f" strokeWidth="2" />

        {/* Hover zones */}
        {pts.map((p, i) => (
          <rect key={i} x={p.x - (w / pts.length) / 2} y={0} width={w / pts.length} height={h}
            fill="transparent" onMouseEnter={() => setHover(p)} />
        ))}
      </svg>

      {hover && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 glass px-3 py-1.5 rounded-lg text-xs pointer-events-none">
          <span className="text-slate-400">{hover.date}</span>
          <span className="text-primary font-bold mr-2">{hover.value.toFixed(1)}٪</span>
        </div>
      )}
    </div>
  );
}

export default function BreadthPage() {
  const [preds, setPreds] = useState(null);
  const [charts, setCharts] = useState(null);
  const [indicators, setIndicators] = useState(null);

  useEffect(() => {
    const load = async (f) => {
      try { const r = await fetch(`/data/${f}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [p, c, i] = await Promise.all([load('predictions_today.json'), load('charts.json'), load('indicators.json')]);
      setPreds(p); setCharts(c); setIndicators(i);
    })();
  }, []);

  const computed = useMemo(() => {
    if (!preds || !charts) return null;

    const today = preds.signals.map(s => {
      const chart = charts[s.symbol];
      const ind = indicators?.[s.symbol] || {};
      if (!chart || chart.length < 50) return null;
      const sorted = [...chart].sort((a, b) => String(a.t).localeCompare(String(b.t)));
      const closes = sorted.map(r => r.c);
      const current = closes[closes.length - 1];
      const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
      return {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        close: current,
        ma20, ma50,
        aboveMA20: current > ma20,
        aboveMA50: current > ma50,
        change: s.change_pct || 0,
        rsi: ind.rsi,
      };
    }).filter(Boolean);

    const total = today.length;
    const above20 = today.filter(s => s.aboveMA20).length;
    const above50 = today.filter(s => s.aboveMA50).length;
    const advancing = today.filter(s => s.change > 0).length;
    const declining = today.filter(s => s.change < 0).length;
    const flat = total - advancing - declining;

    const breadth20 = total > 0 ? (above20 / total) * 100 : 0;
    const breadth50 = total > 0 ? (above50 / total) * 100 : 0;
    const adRatio = declining > 0 ? advancing / declining : advancing;

    // Market phase
    let phase = 'MIXED';
    if (breadth20 > 65 && adRatio > 1.5) phase = 'BULL';
    else if (breadth20 < 35 || adRatio < 0.5) phase = 'BEAR';

    // 30-day breadth history (using historical data for each stock)
    const history = [];
    const sampleCharts = today.slice(0, 50).map(t => charts[t.symbol]).filter(c => c && c.length >= 30);

    if (sampleCharts.length > 0) {
      const maxLen = Math.min(...sampleCharts.map(c => c.length));
      const daysToShow = Math.min(30, maxLen - 20);

      for (let d = daysToShow; d >= 0; d--) {
        let above = 0, cnt = 0;
        let date = null;

        sampleCharts.forEach(chart => {
          const sorted = [...chart].sort((a, b) => String(a.t).localeCompare(String(b.t)));
          const idx = sorted.length - 1 - d;
          if (idx < 20) return;
          const closes = sorted.slice(0, idx + 1).map(r => r.c);
          const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
          const price = closes[closes.length - 1];
          if (price > ma20) above++;
          cnt++;
          if (date === null) {
            const dt = String(sorted[idx].t);
            date = `${dt.slice(6,8)}/${dt.slice(4,6)}`;
          }
        });

        if (cnt > 0) {
          history.push({ date, value: (above / cnt) * 100 });
        }
      }
    }

    // Sector strength
    const sectors = {};
    today.forEach(s => {
      if (!s.sector) return;
      if (!sectors[s.sector]) sectors[s.sector] = { name: s.sector, count: 0, above: 0, advancing: 0 };
      sectors[s.sector].count++;
      if (s.aboveMA20) sectors[s.sector].above++;
      if (s.change > 0) sectors[s.sector].advancing++;
    });
    const sectorList = Object.values(sectors).map(s => ({
      ...s,
      strength: s.count > 0 ? (s.above / s.count) * 100 : 0,
    })).sort((a, b) => b.strength - a.strength);

    // Top gainers/losers
    const sortedByChange = [...today].sort((a, b) => b.change - a.change);
    const topGainers = sortedByChange.slice(0, 5);
    const topLosers = sortedByChange.slice(-5).reverse();

    return {
      total, above20, above50, advancing, declining, flat,
      breadth20, breadth50, adRatio, phase, history, sectorList,
      topGainers, topLosers,
    };
  }, [preds, charts, indicators]);

  if (!computed) {
    return <div className="max-w-7xl mx-auto px-3 md:px-6 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;
  }

  const { total, above20, above50, advancing, declining, flat, breadth20, breadth50, adRatio, phase, history, sectorList, topGainers, topLosers } = computed;

  const phaseInfo = {
    BULL: { label: 'صعودی', color: 'success', icon: TrendingUp, grad: 'from-success/20 via-success/5' },
    MIXED: { label: 'متعادل', color: 'warning', icon: Minus, grad: 'from-warning/20 via-warning/5' },
    BEAR: { label: 'نزولی', color: 'danger', icon: TrendingDown, grad: 'from-danger/20 via-danger/5' },
  }[phase];
  const PhaseIcon = phaseInfo.icon;

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
          <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
        </Link>
        <span className="text-slate-600">/</span>
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          <h1 className="text-lg md:text-xl font-black text-white">سلامت بازار</h1>
        </div>
      </div>

      {/* Hero: Gauge + Phase */}
      <div className="grid md:grid-cols-3 gap-3 md:gap-4">
        <div className="md:col-span-2 glass-strong rounded-2xl relative overflow-hidden p-4 md:p-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row items-center gap-6">
            <BreadthGauge value={breadth20} />
            <div className="flex-1 space-y-3 w-full">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
                  <span>بالای MA20</span>
                  <span className="num font-bold text-white">{fmt(above20)} / {fmt(total)}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-primary to-primary2" style={{ width: `${breadth20}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
                  <span>بالای MA50</span>
                  <span className="num font-bold text-white">{fmt(above50)} / {fmt(total)}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-accent to-warning" style={{ width: `${breadth50}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="bg-success/10 border border-success/30 rounded-lg p-2 text-center">
                  <ArrowUpRight className="w-3 h-3 text-success mx-auto mb-0.5" />
                  <div className="num text-sm font-black text-success">{fmt(advancing)}</div>
                  <div className="text-[9px] text-success/80">صعودی</div>
                </div>
                <div className="bg-slate-500/10 border border-slate-500/30 rounded-lg p-2 text-center">
                  <CircleDot className="w-3 h-3 text-slate-400 mx-auto mb-0.5" />
                  <div className="num text-sm font-black text-slate-300">{fmt(flat)}</div>
                  <div className="text-[9px] text-slate-400">ثابت</div>
                </div>
                <div className="bg-danger/10 border border-danger/30 rounded-lg p-2 text-center">
                  <ArrowDownRight className="w-3 h-3 text-danger mx-auto mb-0.5" />
                  <div className="num text-sm font-black text-danger">{fmt(declining)}</div>
                  <div className="text-[9px] text-danger/80">نزولی</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase Card */}
        <div className={`glass-strong rounded-2xl relative overflow-hidden p-4 md:p-6 bg-gradient-to-br ${phaseInfo.grad} to-transparent`}>
          <div className="absolute top-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-semibold text-slate-300 tracking-wider">فاز بازار</span>
              <div className={`w-2 h-2 rounded-full bg-${phaseInfo.color} animate-pulse`} />
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-14 h-14 rounded-2xl bg-${phaseInfo.color}/20 border border-${phaseInfo.color}/40 flex items-center justify-center`}>
                <PhaseIcon className={`w-7 h-7 text-${phaseInfo.color}`} />
              </div>
              <div>
                <div className={`text-2xl font-black text-${phaseInfo.color}`}>{phaseInfo.label}</div>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] text-slate-400">AD Ratio</span>
                <span className={`num text-base font-black ${adRatio > 1.5 ? 'text-success' : adRatio > 0.7 ? 'text-warning' : 'text-danger'}`}>
                  {adRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] text-slate-400">سهم صعودی</span>
                <span className="num text-xs font-bold text-white">
                  {((advancing / total) * 100).toFixed(1)}٪
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 30-day Trend */}
      {history.length > 1 && (
        <div className="glass-strong p-4 md:p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm md:text-base font-bold text-white">روند Breadth ۳۰ روزه</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-success" /><span className="text-slate-400">قوی (&gt;۷۰)</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-warning" /><span className="text-slate-400">متعادل</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-danger" /><span className="text-slate-400">ضعیف (&lt;۳۰)</span></div>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/40 p-2">
            <TrendChart data={history} />
          </div>
        </div>
      )}

      {/* Sector Heatmap */}
      <div className="glass-strong p-4 md:p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-sm md:text-base font-bold text-white">قدرت صنایع</h2>
          </div>
          <span className="text-[10px] text-slate-400">٪ سهم بالای MA20</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {sectorList.slice(0, 16).map(sec => {
            const icon = SECTOR_ICONS[sec.name] || '📊';
            const strength = sec.strength;
            let bg = 'bg-slate-600/40', border = 'border-slate-500/40';
            if (strength >= 70) { bg = 'bg-success/30'; border = 'border-success/60'; }
            else if (strength >= 50) { bg = 'bg-success/20'; border = 'border-success/40'; }
            else if (strength <= 30) { bg = 'bg-danger/30'; border = 'border-danger/60'; }
            else if (strength <= 50) { bg = 'bg-danger/20'; border = 'border-danger/40'; }
            return (
              <Link key={sec.name} href={`/dashboard?sector=${encodeURIComponent(sec.name)}`}
                className={`${bg} ${border} border rounded-xl p-3 hover:scale-105 transition-transform`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-lg">{icon}</span>
                  <span className="text-[10px] font-semibold text-white leading-tight line-clamp-2">{sec.name}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className={`num text-lg font-black ${strength >= 50 ? 'text-success' : 'text-danger'}`}>
                      {strength.toFixed(0)}٪
                    </div>
                    <div className="text-[8px] text-white/60">{sec.above}/{sec.count} سهم</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Top Gainers / Losers */}
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <div className="glass-strong p-4 md:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-success" />
            <h3 className="text-sm font-bold text-white">۵ صعودی برتر</h3>
          </div>
          <div className="space-y-2">
            {topGainers.map((s, i) => (
              <Link key={s.symbol} href={`/predictions/${encodeURIComponent(s.symbol)}`}
                className="flex items-center justify-between p-2.5 rounded-lg bg-success/8 border border-success/20 hover:bg-success/15 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                    <span className="num text-[10px] font-bold text-success">{i + 1}</span>
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">{s.symbol}</div>
                    <div className="text-[9px] text-slate-400 truncate">{s.name}</div>
                  </div>
                </div>
                <span className="num text-xs font-black text-success">+{s.change.toFixed(2)}٪</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-strong p-4 md:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-danger" />
            <h3 className="text-sm font-bold text-white">۵ نزولی برتر</h3>
          </div>
          <div className="space-y-2">
            {topLosers.map((s, i) => (
              <Link key={s.symbol} href={`/predictions/${encodeURIComponent(s.symbol)}`}
                className="flex items-center justify-between p-2.5 rounded-lg bg-danger/8 border border-danger/20 hover:bg-danger/15 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
                    <span className="num text-[10px] font-bold text-danger">{i + 1}</span>
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">{s.symbol}</div>
                    <div className="text-[9px] text-slate-400 truncate">{s.name}</div>
                  </div>
                </div>
                <span className="num text-xs font-black text-danger">{s.change.toFixed(2)}٪</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
