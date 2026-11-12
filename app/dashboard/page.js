'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, TrendingUp, TrendingDown, BarChart3, Search, ChevronDown,
  ArrowLeft, Layers, AlertTriangle, Minus, Sparkles, ArrowUpRight,
  ArrowDownRight, CircleDot, Zap, Users, Gauge, Target
} from 'lucide-react';

const SIGNAL = {
  BUY: { label: 'توجه بالا', color: 'success' },
  HOLD: { label: 'خنثی', color: 'neutral' },
  SELL: { label: 'ریسک بالا', color: 'danger' },
};

const SECTOR_ICONS = {
  'محصولات شيميايي': '🧪', 'فلزات اساسي': '⚙️', 'مواد و محصولات دارويي': '💊',
  'قند و شكر': '🍬', 'سرمايه گذاريها': '💼', 'لاستيك و پلاستيك': '🛢️',
  'محصولات غذايي و آشاميدني به جز قند و شكر': '🍔', 'انبوه سازي، املاك و مستغلات': '🏢',
  'خودرو و ساخت قطعات': '🚗', 'بيمه وصندوق بازنشستگي به جزتامين اجتماعي': '🛡️',
  'بانكها و موسسات اعتباري': '🏦', 'استخراج كانه هاي فلزي': '⛏️',
  'فراورده هاي نفتي، كك و سوخت هسته اي': '🛢️', 'سيمان، آهك و گچ': '🏗️',
  'رايانه و فعاليت‌هاي وابسته به آن': '💻', 'مخابرات': '📡',
  'عرضه برق، گاز، بخاروآب گرم': '⚡', 'حمل ونقل، انبارداري و ارتباطات': '🚚',
  'كاشي و سراميك': '🔲', 'ساير محصولات كاني غيرفلزي': '🪨',
  'ماشين آلات و تجهيزات': '🔧', 'ساخت محصولات فلزي': '🔩',
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function Skeleton({ h = 'h-32' }) {
  return <div className={`${h} glass rounded-xl shimmer`} />;
}

// ═══ Professional Market Pulse ═══
function MarketPulse({ buy, hold, sell, total }) {
  const [animated, setAnimated] = useState({ buy: 0, hold: 0, sell: 0 });
  useEffect(() => {
    const duration = 1800;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated({
        buy: Math.floor(buy * eased),
        hold: Math.floor(hold * eased),
        sell: Math.floor(sell * eased),
      });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [buy, hold, sell]);

  const pct = (v) => total > 0 ? (v / total * 100) : 0;
  const buyPct = pct(buy);
  const holdPct = pct(hold);
  const sellPct = pct(sell);

  // Arc parameters
  const R = 90;
  const CX = 120;
  const CY = 120;
  const stroke = 22;
  const circ = 2 * Math.PI * R;

  return (
    <div className="glass-strong rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 bg-success/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-danger/5 rounded-full blur-3xl" />

      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Gauge className="w-5 h-5 text-bg" />
              <div className="absolute inset-0 rounded-xl bg-primary/30 blur-lg animate-pulse" />
            </div>
            <div>
              <div className="text-base font-bold text-white">نبض بازار</div>
              <div className="text-[11px] text-slate-400">توزیع سیگنال‌های تحلیل</div>
            </div>
          </div>
          <div className="text-left">
            <div className="text-[9px] text-slate-500">کل</div>
            <div className="num text-xl font-black text-white">{fmt(total)}</div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Arc gauge */}
          <div className="relative w-[240px] h-[240px] flex-shrink-0">
            <svg viewBox="0 0 240 240" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="buyGrad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="sellGrad" x1="0" x2="1">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#be123c" />
                </linearGradient>
              </defs>

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={stroke} />

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="url(#buyGrad)" strokeWidth={stroke}
                strokeDasharray={`${(buyPct / 100) * circ} ${circ}`}
                strokeDashoffset="0"
                strokeLinecap="butt"
                opacity={animated.buy > 0 ? 1 : 0}
                style={{ transition: 'opacity 0.3s' }} />

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="#64748b" strokeWidth={stroke}
                strokeDasharray={`${(holdPct / 100) * circ} ${circ}`}
                strokeDashoffset={`-${(buyPct / 100) * circ}`}
                strokeLinecap="butt"
                opacity={animated.hold > 0 ? 1 : 0}
                style={{ transition: 'opacity 0.3s' }} />

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="url(#sellGrad)" strokeWidth={stroke}
                strokeDasharray={`${(sellPct / 100) * circ} ${circ}`}
                strokeDashoffset={`-${((buyPct + holdPct) / 100) * circ}`}
                strokeLinecap="butt"
                opacity={animated.sell > 0 ? 1 : 0}
                style={{ transition: 'opacity 0.3s' }} />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[9px] text-slate-500 mb-1">سیگنال مثبت</div>
              <div className="num text-4xl font-black text-success">{buyPct.toFixed(0)}٪</div>
              <div className="text-[9px] text-slate-400 mt-1">{fmt(animated.buy)} سهم</div>
            </div>
          </div>

          {/* Right side breakdown */}
          <div className="flex-1 w-full space-y-3">
            {[
              { label: 'توجه بالا', value: animated.buy, real: buy, pct: buyPct, color: 'success', icon: ArrowUpRight, bg: 'from-success/15 to-success/5', border: 'border-success/30' },
              { label: 'خنثی', value: animated.hold, real: hold, pct: holdPct, color: 'neutral', icon: CircleDot, bg: 'from-slate-500/15 to-slate-500/5', border: 'border-slate-500/30' },
              { label: 'ریسک بالا', value: animated.sell, real: sell, pct: sellPct, color: 'danger', icon: ArrowDownRight, bg: 'from-danger/15 to-danger/5', border: 'border-danger/30' },
            ].map((s) => (
              <div key={s.label} className={`bg-gradient-to-l ${s.bg} border ${s.border} rounded-xl p-3.5`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <s.icon className={`w-4 h-4 text-${s.color}`} />
                    <span className="text-xs font-bold text-white">{s.label}</span>
                  </div>
                  <span className={`num text-xs font-bold text-${s.color}`}>{s.pct.toFixed(1)}٪</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-bg/50 rounded-full overflow-hidden">
                    <div className={`h-full bg-${s.color}`} style={{ width: `${s.pct}%`, transition: 'width 0.1s' }} />
                  </div>
                  <span className="num text-sm font-black text-white">{fmt(s.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ Professional Market Status ═══
function MarketStatus({ market }) {
  const regimeFa = { BULL: 'صعودی', MIXED: 'مختلط', BEAR: 'نزولی' };
  const regimeConf = {
    BULL: { icon: TrendingUp, color: 'success', grad: 'from-success/25 via-success/10 to-transparent' },
    MIXED: { icon: Minus, color: 'warning', grad: 'from-warning/25 via-warning/10 to-transparent' },
    BEAR: { icon: TrendingDown, color: 'danger', grad: 'from-danger/25 via-danger/10 to-transparent' },
  };
  const conf = regimeConf[market.regime];
  const RegimeIcon = conf.icon;
  const breadthPct = market.breadth * 100;

  return (
    <div className="glass-strong rounded-2xl relative overflow-hidden h-full">
      <div className={`absolute inset-0 bg-gradient-to-bl ${conf.grad}`} />

      <div className="relative p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider">وضعیت بازار</span>
          <div className={`w-2 h-2 rounded-full bg-${conf.color} animate-pulse`} />
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className={`w-14 h-14 rounded-2xl bg-${conf.color}/20 border border-${conf.color}/40 flex items-center justify-center`}>
            <RegimeIcon className={`w-7 h-7 text-${conf.color}`} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">رژیم فعلی</div>
            <div className={`text-2xl font-black text-${conf.color}`}>{regimeFa[market.regime]}</div>
          </div>
        </div>

        <div className="space-y-3 mt-auto">
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
              <span>Breadth بازار</span>
              <span className="num font-bold text-white">{breadthPct.toFixed(1)}٪</span>
            </div>
            <div className="h-1.5 bg-bg/60 rounded-full overflow-hidden">
              <div className={`h-full bg-gradient-to-l from-${conf.color} to-primary`} style={{ width: `${breadthPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
              <span>وزن مدل</span>
              <span className="num font-bold text-white">{(market.weights.model * 100).toFixed(0)}٪</span>
            </div>
            <div className="h-1.5 bg-bg/60 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-l from-accent to-primary2" style={{ width: `${market.weights.model * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [indexData, setIndexData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = async (file) => {
      try { const r = await fetch(`/data/${file}`); return r.ok ? await r.json() : null; }
      catch { return null; }
    };
    (async () => {
      const [pred, idx] = await Promise.all([load('predictions_today.json'), load('index_data.json')]);
      if (!pred) { setError('داده‌های امروز در دسترس نیست'); return; }
      setData(pred);
      setIndexData(idx);
    })();
  }, []);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass p-8 rounded-xl text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">خطا در بارگذاری</h2>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton h="h-48" />
          <div className="md:col-span-2"><Skeleton h="h-48" /></div>
        </div>
        <Skeleton h="h-64" />
        <Skeleton h="h-96" />
      </div>
    );
  }

  const { summary, market, signals } = data;

  // Index
  const idxRows = indexData?.rows?.filter(r => r.c > 0) || [];
  const latestIdx = idxRows.length > 0 ? idxRows[idxRows.length - 1] : null;
  const prevIdx = idxRows.length > 1 ? idxRows[idxRows.length - 2] : null;
  const idxChange = latestIdx && prevIdx ? ((latestIdx.c - prevIdx.c) / prevIdx.c * 100) : 0;

  // Sectors
  const sectors = {};
  signals.forEach(s => {
    if (!s.sector) return;
    if (!sectors[s.sector]) sectors[s.sector] = { name: s.sector, count: 0, buy: 0, hold: 0, sell: 0, sumProb: 0 };
    sectors[s.sector].count++;
    if (s.signal === 'BUY') sectors[s.sector].buy++;
    else if (s.signal === 'SELL') sectors[s.sector].sell++;
    else sectors[s.sector].hold++;
    sectors[s.sector].sumProb += s.prob;
  });
  const sectorList = Object.values(sectors).sort((a, b) => b.count - a.count);

  let filtered = signals;
  if (filter !== 'ALL') filtered = filtered.filter(s => s.signal === filter);
  if (sectorFilter !== 'ALL') filtered = filtered.filter(s => s.sector === sectorFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }
  const displayList = showAll ? filtered : filtered.slice(0, 40);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ═══ Market Status + Index Card ═══ */}
      <div className="grid md:grid-cols-3 gap-4">
        <MarketStatus market={market} />

        <Link href="/market-index"
          className="md:col-span-2 glass-strong rounded-2xl relative overflow-hidden hover:border-primary/40 transition-all group p-6">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
          <div className="relative h-full flex flex-col justify-between">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-2">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  شاخص کل بورس تهران
                </div>
                {latestIdx ? (
                  <>
                    <div className="num text-4xl md:text-5xl font-black text-white mb-2">
                      {fmt(latestIdx.c)}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg ${
                      idxChange >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                    }`}>
                      {idxChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="num text-sm font-bold">
                        {idxChange >= 0 ? '+' : ''}{idxChange.toFixed(2)}٪
                      </span>
                      <span className="text-[10px] opacity-70">امروز</span>
                    </div>
                  </>
                ) : <span className="text-slate-500">—</span>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ArrowLeft className="w-5 h-5 text-primary rotate-180" />
                </div>
                <span className="text-[10px] text-primary font-semibold">تحلیل کامل</span>
              </div>
            </div>

            {idxRows.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: 'بالاترین ۱ سال', value: fmt(Math.max(...idxRows.slice(-250).map(r => r.c))) },
                  { label: 'پایین‌ترین ۱ سال', value: fmt(Math.min(...idxRows.slice(-250).map(r => r.c))) },
                  { label: 'تاریخچه', value: `${fmt(idxRows.length)} روز` },
                ].map((s, i) => (
                  <div key={i} className="bg-bg/40 rounded-lg p-2 border border-border/30">
                    <div className="text-[9px] text-slate-500 mb-0.5">{s.label}</div>
                    <div className="num text-xs font-bold text-white">{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* ═══ Market Pulse ═══ */}
      <MarketPulse buy={summary.buy} hold={summary.hold} sell={summary.sell} total={summary.total} />

      {/* ═══ Sectors ═══ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            صنایع فعال ({fmt(sectorList.length)})
          </h2>
          {sectorFilter !== 'ALL' && (
            <button onClick={() => setSectorFilter('ALL')} className="text-xs text-primary hover:underline">
              حذف فیلتر
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {sectorList.slice(0, 15).map((sec) => {
            const icon = SECTOR_ICONS[sec.name] || '📊';
            const active = sectorFilter === sec.name;
            const buyRatio = sec.count > 0 ? (sec.buy / sec.count * 100) : 0;
            return (
              <button key={sec.name}
                onClick={() => { setSectorFilter(sec.name); setShowAll(false); document.getElementById('stocks-list')?.scrollIntoView({ behavior: 'smooth' }); }}
                className={`text-right p-3 rounded-xl transition-all group ${
                  active ? 'bg-primary/20 border-2 border-primary/60 scale-[0.98]' : 'glass hover:bg-white/5 hover:border-primary/30 border border-transparent'
                }`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white leading-tight line-clamp-2">{sec.name}</div>
                  </div>
                </div>
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mb-1.5">
                  <div className="bg-gradient-to-l from-success to-primary h-full" style={{ width: `${buyRatio}%`, transition: 'width 0.5s' }} />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">{fmt(sec.count)} سهم</span>
                  {sec.buy > 0 && <span className="text-success font-bold flex items-center gap-0.5">
                    <ArrowUpRight className="w-3 h-3" />{sec.buy}
                  </span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Stocks List ═══ */}
      <div id="stocks-list">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            لیست سهم‌ها ({fmt(filtered.length)})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'BUY', 'HOLD', 'SELL'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setShowAll(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f ? 'bg-primary text-bg shadow-lg shadow-primary/20' : 'glass text-slate-300 hover:bg-white/10'
                }`}>
                {f === 'ALL' ? 'همه' : SIGNAL[f].label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="جستجوی نماد یا نام سهم..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full glass rounded-xl py-2.5 pr-10 pl-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50 border border-border/50" />
        </div>

        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full data-table text-sm">
              <thead>
                <tr>
                  <th>نماد</th>
                  <th className="hidden sm:table-cell">نام</th>
                  <th className="hidden md:table-cell">صنعت</th>
                  <th>امتیاز</th>
                  <th className="hidden sm:table-cell">P/E</th>
                  <th>وضعیت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((s, i) => {
                  const confColors = {
                    BUY: 'bg-success/10 text-success border-success/30',
                    HOLD: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
                    SELL: 'bg-danger/10 text-danger border-danger/30',
                  };
                  return (
                    <tr key={`${s.symbol}-${i}`}>
                      <td>
                        <Link href={`/predictions/${encodeURIComponent(s.symbol)}`} className="font-bold text-white hover:text-primary transition-colors">
                          {s.symbol}
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell text-slate-400 text-xs">{s.name}</td>
                      <td className="hidden md:table-cell">
                        <span className="text-[10px] text-slate-400">
                          {SECTOR_ICONS[s.sector] || '📊'} {s.sector?.slice(0, 20)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="num font-bold text-white text-xs">{Math.round(s.prob * 100)}</span>
                          <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div className={`h-full ${
                              s.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' :
                              s.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'
                            }`} style={{ width: `${s.prob * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="num text-xs text-slate-300">{s.pe ? fmt(s.pe, 1) : '—'}</span>
                      </td>
                      <td>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confColors[s.signal]}`}>
                          {SIGNAL[s.signal].label}
                        </span>
                      </td>
                      <td>
                        <Link href={`/predictions/${encodeURIComponent(s.symbol)}`} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                          جزئیات <ArrowLeft className="w-3 h-3 rotate-180" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 40 && !showAll && (
            <div className="p-4 text-center border-t border-border/50">
              <button onClick={() => setShowAll(true)} className="btn-secondary text-sm">
                نمایش همه ({fmt(filtered.length)}) <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
