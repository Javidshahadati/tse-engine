'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, TrendingUp, TrendingDown, BarChart3, Search, ChevronDown,
  ArrowLeft, Layers, Building2, AlertTriangle, Minus, Sparkles,
  ArrowUpRight, ArrowDownRight, CircleDot, Zap, Users
} from 'lucide-react';

const SIGNAL = {
  BUY: { label: 'توجه بالا', color: 'success', icon: TrendingUp },
  HOLD: { label: 'خنثی', color: 'neutral', icon: Minus },
  SELL: { label: 'ریسک بالا', color: 'danger', icon: TrendingDown },
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
  'شركتهاي چند رشته اي صنعتي': '🏭', 'منسوجات': '🧵',
  'ماشين آلات و دستگاه‌هاي برقي': '🔌', 'زراعت و خدمات وابسته': '🌾',
  'ساير واسطه گريهاي مالي': '💳', 'فعاليتهاي كمكي به نهادهاي مالي واسط': '📊',
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function Skeleton({ h = 'h-32' }) {
  return <div className={`${h} glass rounded-xl shimmer`} />;
}

// ═══ Animated Market Pulse ═══
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

  return (
    <div className="glass-strong p-6 md:p-8 rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary2 flex items-center justify-center">
            <Activity className="w-5 h-5 text-bg" />
            <span className="absolute inset-0 rounded-xl bg-primary/40 blur-xl animate-pulse" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">نبض بازار</div>
            <div className="text-xs text-slate-400">توزیع سهم‌ها در سه دسته</div>
          </div>
        </div>

        {/* Pulse Ring */}
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="relative w-48 h-48 flex-shrink-0">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(30,42,68,0.5)" strokeWidth="16" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#10b981" strokeWidth="16"
                strokeDasharray={`${pct(animated.buy) * 5.03} 1000`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.1s' }} />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#64748b" strokeWidth="16"
                strokeDasharray={`${pct(animated.hold) * 5.03} 1000`}
                strokeDashoffset={`-${pct(buy) * 5.03}`}
                strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.1s' }} />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f43f5e" strokeWidth="16"
                strokeDasharray={`${pct(animated.sell) * 5.03} 1000`}
                strokeDashoffset={`-${(pct(buy) + pct(hold)) * 5.03}`}
                strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.1s' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="num text-3xl font-black gradient-text">{fmt(total)}</div>
              <div className="text-[10px] text-slate-400 mt-1">کل سهم‌ها</div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-3 w-full">
            {[
              { key: 'buy', label: 'توجه بالا', value: animated.buy, real: buy, color: 'success', icon: ArrowUpRight },
              { key: 'hold', label: 'خنثی', value: animated.hold, real: hold, color: 'neutral', icon: CircleDot },
              { key: 'sell', label: 'ریسک بالا', value: animated.sell, real: sell, color: 'danger', icon: ArrowDownRight },
            ].map((s) => {
              const colorMap = {
                success: 'border-success/40 bg-success/10 text-success',
                neutral: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
                danger: 'border-danger/40 bg-danger/10 text-danger',
              };
              return (
                <div key={s.key} className={`p-3 rounded-xl border ${colorMap[s.color]} relative overflow-hidden group`}>
                  <div className="flex items-center justify-between mb-1">
                    <s.icon className="w-4 h-4" />
                    <span className="text-[9px] font-bold opacity-60">{pct(s.real).toFixed(0)}٪</span>
                  </div>
                  <div className="num text-2xl font-black">{fmt(s.value)}</div>
                  <div className="text-[10px] mt-1 opacity-80">{s.label}</div>
                </div>
              );
            })}
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
        <Skeleton h="h-48" />
        <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i => <Skeleton key={i} h="h-32" />)}</div>
        <Skeleton h="h-96" />
      </div>
    );
  }

  const { summary, market, signals } = data;
  const regimeFa = { BULL: 'صعودی', MIXED: 'مختلط', BEAR: 'نزولی' };
  const regimeColor = { BULL: 'text-success', MIXED: 'text-warning', BEAR: 'text-danger' };
  const regimeBg = { BULL: 'from-success/20 to-success/5', MIXED: 'from-warning/20 to-warning/5', BEAR: 'from-danger/20 to-danger/5' };

  // Index
  const idxRows = indexData?.rows?.slice(-250) || [];
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
        {/* Market Regime */}
        <div className={`glass-strong p-5 rounded-2xl bg-gradient-to-br ${regimeBg[market.regime]} relative overflow-hidden`}>
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <Sparkles className="w-4 h-4" />
              وضعیت بازار
            </div>
            <div className={`text-3xl font-black ${regimeColor[market.regime]} mb-3`}>
              {regimeFa[market.regime]}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div>
                <div className="text-slate-400">Breadth</div>
                <div className="num font-bold text-white">{(market.breadth * 100).toFixed(1)}٪</div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div>
                <div className="text-slate-400">وزن مدل</div>
                <div className="num font-bold text-white">{(market.weights.model * 100).toFixed(0)}٪</div>
              </div>
            </div>
          </div>
        </div>

        {/* Index Card - Click to go */}
        <Link href="/market-index"
          className="md:col-span-2 glass-strong p-5 rounded-2xl hover:border-primary/40 transition-all group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                شاخص کل بورس تهران
              </div>
              {latestIdx ? (
                <>
                  <div className="num text-3xl md:text-4xl font-black text-white mb-1">
                    {fmt(latestIdx.c)}
                  </div>
                  <div className={`num text-sm font-bold flex items-center gap-1 ${idxChange >= 0 ? 'text-success' : 'text-danger'}`}>
                    {idxChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {idxChange >= 0 ? '+' : ''}{idxChange.toFixed(2)}٪
                    <span className="text-[10px] text-slate-500 font-normal mr-1">امروز</span>
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
        </Link>
      </div>

      {/* ═══ Market Pulse ═══ */}
      <MarketPulse
        buy={summary.buy}
        hold={summary.hold}
        sell={summary.sell}
        total={summary.total}
      />

      {/* ═══ Sectors ═══ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            صنایع فعال ({fmt(sectorList.length)})
          </h2>
          {sectorFilter !== 'ALL' && (
            <button onClick={() => setSectorFilter('ALL')}
              className="text-xs text-primary hover:underline">
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
              <button
                key={sec.name}
                onClick={() => { setSectorFilter(sec.name); setShowAll(false); document.getElementById('stocks-list')?.scrollIntoView({ behavior: 'smooth' }); }}
                className={`text-right p-3 rounded-xl transition-all group ${
                  active ? 'bg-primary/20 border-2 border-primary/60 scale-[0.98]' : 'glass hover:bg-white/5 hover:border-primary/30 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white leading-tight line-clamp-2">{sec.name}</div>
                  </div>
                </div>
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mb-1.5">
                  <div className="bg-gradient-to-l from-success to-primary h-full"
                    style={{ width: `${buyRatio}%`, transition: 'width 0.5s' }} />
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
              <button key={f}
                onClick={() => { setFilter(f); setShowAll(false); }}
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
                  const conf = SIGNAL[s.signal];
                  const confColors = {
                    BUY: 'bg-success/10 text-success border-success/30',
                    HOLD: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
                    SELL: 'bg-danger/10 text-danger border-danger/30',
                  };
                  return (
                    <tr key={`${s.symbol}-${i}`}>
                      <td>
                        <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                          className="font-bold text-white hover:text-primary transition-colors">
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
                          {conf.label}
                        </span>
                      </td>
                      <td>
                        <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                          className="text-primary hover:underline text-xs inline-flex items-center gap-1">
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
                نمایش همه ({fmt(filtered.length)})
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
