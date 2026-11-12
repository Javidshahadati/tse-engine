'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Activity, TrendingUp, TrendingDown, BarChart3, Newspaper,
  Search, Filter, ChevronDown, ArrowLeft, Layers, Building2,
  AlertTriangle, Loader2, Users, LineChart
} from 'lucide-react';

const IndexChart = dynamic(() => import('@/components/IndexChart'), { ssr: false });

const SIGNAL_LABEL = {
  BUY: { label: 'توجه بالا', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  HOLD: { label: 'خنثی', color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  SELL: { label: 'ریسک بالا', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30' },
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
  'استخراج زغال سنگ': '⛏️', 'محصولات كاغذي': '📄',
  'استخراج ساير معادن': '💎', 'هتل و رستوران': '🏨',
  'توليد محصولات كامپيوتري الكترونيكي ونوري': '🖥️', 'خدمات فني و مهندسي': '⚙️',
};

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

function Skeleton({ h = 'h-32' }) {
  return <div className={`${h} glass rounded-xl shimmer`} />;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [indexData, setIndexData] = useState(null);
  const [news, setNews] = useState(null);
  const [realLegal, setRealLegal] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = async (file) => {
      try {
        const r = await fetch(`/data/${file}`);
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };
    (async () => {
      const [pred, idx, nw, rl] = await Promise.all([
        load('predictions_today.json'),
        load('index_data.json'),
        load('news.json'),
        load('real_legal.json'),
      ]);
      if (!pred) { setError('داده‌های امروز در دسترس نیست'); return; }
      setData(pred);
      setIndexData(idx);
      setNews(nw);
      setRealLegal(rl);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} h="h-24" />)}
        </div>
        <Skeleton h="h-96" />
      </div>
    );
  }

  // ─── Stats ───
  const { summary, market, signals, top_buys, sector_buys } = data;
  const regimeFa = { BULL: 'صعودی', MIXED: 'مختلط', BEAR: 'نزولی' };
  const regimeColor = { BULL: 'text-success', MIXED: 'text-warning', BEAR: 'text-danger' };

  // Index chart (last 90 days)
  const idxRows = indexData?.rows?.slice(-90) || [];

  // Latest index value
  const latestIdx = idxRows.length > 0 ? idxRows[idxRows.length - 1] : null;
  const prevIdx = idxRows.length > 1 ? idxRows[idxRows.length - 2] : null;
  const idxChange = latestIdx && prevIdx ? ((latestIdx.c - prevIdx.c) / prevIdx.c * 100) : 0;

  // ─── Sector grouping ───
  const sectors = {};
  signals.forEach(s => {
    if (!s.sector) return;
    if (!sectors[s.sector]) {
      sectors[s.sector] = { name: s.sector, count: 0, buy: 0, hold: 0, sell: 0, avgProb: 0, sumProb: 0 };
    }
    sectors[s.sector].count++;
    if (s.signal === 'BUY') sectors[s.sector].buy++;
    else if (s.signal === 'SELL') sectors[s.sector].sell++;
    else sectors[s.sector].hold++;
    sectors[s.sector].sumProb += s.prob;
    sectors[s.sector].avgProb = sectors[s.sector].sumProb / sectors[s.sector].count;
  });
  const sectorList = Object.values(sectors).sort((a, b) => b.count - a.count);

  // ─── Filtered signals ───
  let filtered = signals;
  if (filter !== 'ALL') filtered = filtered.filter(s => s.signal === filter);
  if (sectorFilter !== 'ALL') filtered = filtered.filter(s => s.sector === sectorFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(s =>
      s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }

  const displayList = showAll ? filtered : filtered.slice(0, 40);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ═══ Market Status Bar ═══ */}
      <div className="glass-strong p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-slate-300">وضعیت بازار امروز</span>
          <span className="text-xs text-slate-500">|</span>
          <span className={`text-sm font-bold ${regimeColor[market.regime]}`}>
            {regimeFa[market.regime]}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Breadth: <strong className="text-white">{(market.breadth*100).toFixed(1)}٪</strong></span>
          <span>وزن بازار: <strong className="text-white">{market.weights.market*100}٪</strong></span>
          <span>وزن مدل: <strong className="text-white">{market.weights.model*100}٪</strong></span>
        </div>
      </div>

      {/* ═══ Index Card ═══ */}
      <div className="glass-strong p-5 md:p-6 rounded-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <LineChart className="w-4 h-4 text-primary" />
              شاخص کل بورس تهران
            </div>
            {latestIdx ? (
              <div className="flex items-baseline gap-3">
                <span className="num text-3xl md:text-5xl font-bold text-white">
                  {fmt(latestIdx.c)}
                </span>
                <span className={`num text-sm font-bold flex items-center gap-1 ${idxChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {idxChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {idxChange >= 0 ? '+' : ''}{idxChange.toFixed(2)}٪
                </span>
              </div>
            ) : <span className="text-slate-500">در حال بارگذاری...</span>}
          </div>
          <Link href="/market-index" className="btn-secondary text-xs">
            تحلیل کامل شاخص
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
        {idxRows.length > 0 && (
          <div className="rounded-xl overflow-hidden bg-bg/40 border border-border/50">
            <IndexChart data={idxRows} height={240} />
          </div>
        )}
      </div>

      {/* ═══ Stats Cards ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'توجه بالا', value: summary.buy, color: 'text-success', bg: 'from-success/20 to-success/5', icon: TrendingUp },
          { label: 'خنثی', value: summary.hold, color: 'text-slate-300', bg: 'from-slate-500/20 to-slate-500/5', icon: Activity },
          { label: 'ریسک بالا', value: summary.sell, color: 'text-danger', bg: 'from-danger/20 to-danger/5', icon: TrendingDown },
          { label: 'اطمینان بالا', value: summary.high_confidence, color: 'text-primary', bg: 'from-primary/20 to-primary/5', icon: BarChart3 },
        ].map((s, i) => (
          <div key={i} className={`glass p-4 rounded-xl bg-gradient-to-br ${s.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div className={`num text-2xl md:text-3xl font-bold ${s.color}`}>
              {fmt(s.value)}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Sectors Grid ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {sectorList.slice(0, 15).map((sec) => {
            const icon = SECTOR_ICONS[sec.name] || '📊';
            const active = sectorFilter === sec.name;
            return (
              <button
                key={sec.name}
                onClick={() => { setSectorFilter(sec.name); setShowAll(false); document.getElementById('stocks-list')?.scrollIntoView({ behavior: 'smooth' }); }}
                className={`text-right p-3 rounded-xl transition-all ${
                  active
                    ? 'bg-primary/20 border-2 border-primary/50'
                    : 'glass hover:bg-white/5 hover:border-primary/30 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-2xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white leading-tight line-clamp-2">
                      {sec.name}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">{fmt(sec.count)} سهم</span>
                  {sec.buy > 0 && (
                    <span className="text-success font-bold">{sec.buy}↑</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ News Panel ═══ */}
      {news && news.items && news.items.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
            <Newspaper className="w-5 h-5 text-accent" />
            آخرین اخبار اقتصادی
          </h2>
          <div className="glass p-4 rounded-xl space-y-2 max-h-72 overflow-y-auto">
            {news.items.slice(0, 10).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener"
                 className="block py-2 border-b border-border/30 last:border-0 hover:bg-white/5 -mx-2 px-2 rounded transition-colors">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded whitespace-nowrap mt-0.5">
                    {n.source}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-white leading-relaxed">{n.title}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Stocks List ═══ */}
      <div id="stocks-list">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            لیست سهم‌ها ({fmt(filtered.length)})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'BUY', 'HOLD', 'SELL'].map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setShowAll(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f ? 'bg-primary text-bg' : 'glass text-slate-300 hover:bg-white/10'
                }`}
              >
                {f === 'ALL' ? 'همه' : SIGNAL_LABEL[f].label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجوی نماد یا نام سهم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full glass rounded-xl py-2.5 pr-10 pl-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50 border border-border/50"
          />
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
                  const conf = SIGNAL_LABEL[s.signal];
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
                          <span className="num font-bold text-white text-xs">
                            {Math.round(s.prob * 100)}
                          </span>
                          <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className={`h-full ${s.signal === 'BUY' ? 'bg-success' : s.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'}`}
                              style={{ width: `${s.prob * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="num text-xs text-slate-300">
                          {s.pe ? fmt(s.pe, 1) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${conf.bg} ${conf.color} border ${conf.border}`}>
                          {conf.label}
                        </span>
                      </td>
                      <td>
                        <Link href={`/predictions/${encodeURIComponent(s.symbol)}`}
                              className="text-primary hover:underline text-xs">
                          جزئیات
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

      {/* ═══ Disclaimer ═══ */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/5 border border-danger/20">
        <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger/90 leading-relaxed">
          <strong>⚠️ توجه:</strong> این تحلیل صرفاً آموزشی و پژوهشی است و به‌هیچ‌وجه توصیه معاملاتی محسوب نمی‌شود.
          تمام تصمیمات سرمایه‌گذاری بر عهده کاربر است.
        </p>
      </div>

    </div>
  );
}
