'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Trash2, Search, ArrowLeft, ArrowUpRight, TrendingUp, TrendingDown, AlertTriangle, Activity } from 'lucide-react';
import { useWatchlist } from '@/components/WatchlistContext';
import { useAuth } from '@/components/AuthContext';
import { useRouter } from 'next/navigation';

const SIGNAL = {
  BUY: { label: 'توجه بالا', icon: TrendingUp },
  HOLD: { label: 'خنثی', icon: Activity },
  SELL: { label: 'ریسک بالا', icon: TrendingDown },
};
function fmt(n, d = 0) { if (n == null) return '—'; return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d }); }

export default function WatchlistPage() {
  const { items, remove, mounted, limit } = useWatchlist();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push('/signin');
  }, [user, authLoading, router]);
  const [signals, setSignals] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/data/predictions_today.json'); if (r.ok) setSignals(await r.json()); } catch {}
    })();
  }, []);

  if (!mounted) return null;
  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Star className="w-16 h-16 text-warning/40 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">واچ‌لیست خالی است</h1>
        <p className="text-slate-300 mb-6 leading-relaxed">سهم‌های مورد علاقه‌ات رو با کلیک روی ستاره تو صفحه هر سهم اضافه کن.</p>
        <Link href="/dashboard" className="btn-primary"><ArrowLeft className="w-4 h-4" /> رفتن به داشبورد</Link>
      </div>
    );
  }
  if (!signals) return <div className="max-w-7xl mx-auto px-3 md:px-6 py-6"><div className="h-96 glass rounded-xl shimmer" /></div>;

  const watchlistSigs = items.map(sym => signals.signals.find(s => s.symbol === sym)).filter(Boolean);
  const filtered = search.trim()
    ? watchlistSigs.filter(s => s.symbol.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()))
    : watchlistSigs;

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-warning to-accent flex items-center justify-center">
            <Star className="w-5 h-5 text-bg" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">واچ‌لیست</h1>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-slate-300">{fmt(items.length)} از {fmt(limit)} سهم</p>
              {items.length >= limit && (
                <Link href="/upgrade?feature=واچ‌لیست" className="text-[10px] px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30 font-bold hover:bg-warning/30 transition-colors">
                  ارتقا
                </Link>
              )}
            </div>
          </div>
        </div>
        <Link href="/dashboard" className="btn-secondary text-xs md:text-sm">داشبورد <ArrowLeft className="w-4 h-4" /></Link>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
        <input type="text" placeholder="جستجو در واچ‌لیست..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full glass rounded-xl py-2.5 pr-10 pl-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/50 border border-border/50" />
      </div>

      {items.length >= limit && (
        <div className="glass-strong p-4 rounded-2xl border-2 border-warning/40 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/40 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white mb-0.5">به سقف پلن رایگان رسیدید</p>
            <p className="text-xs text-slate-300 mb-2">برای ذخیره نامحدود سهم‌ها، به پلن حرفه‌ای ارتقا دهید.</p>
            <Link href="/upgrade?feature=واچ‌لیست" className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-l from-primary to-accent text-bg font-bold">
              مشاهده پلن‌ها
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {filtered.map((s) => {
          const conf = SIGNAL[s.signal];
          const Icon = conf.icon;
          const cp = s.change_pct || 0;
          const up = cp >= 0;
          return (
            <div key={s.symbol} className="glass p-4 rounded-xl hover:border-primary/30 transition-all group relative">
              <button onClick={() => remove(s.symbol)}
                className="absolute top-2 left-2 p-1.5 rounded-lg text-slate-500 hover:text-danger hover:bg-danger/10 transition-colors"
                title="حذف از واچ‌لیست">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <Link href={`/predictions/${encodeURIComponent(s.symbol)}`} className="block">
                <div className="mb-2 pr-8">
                  <div className="font-black text-white text-base group-hover:text-primary transition-colors truncate">{s.symbol}</div>
                  <div className="text-[10px] text-slate-400 truncate">{s.name}</div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="num text-lg font-bold text-white">{fmt(s.close)}</div>
                  <div className={`num text-xs font-bold flex items-center gap-0.5 ${up ? 'text-success' : 'text-danger'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{cp.toFixed(2)}٪
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    s.signal === 'BUY' ? 'bg-success/15 text-success border border-success/30' :
                    s.signal === 'SELL' ? 'bg-danger/15 text-danger border border-danger/30' :
                    'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                  }`}><Icon className="w-2.5 h-2.5" /> {conf.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-500">امتیاز</span>
                    <span className="num text-xs font-bold text-white">{Math.round(s.prob * 100)}</span>
                  </div>
                </div>
                <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${s.signal === 'BUY' ? 'bg-gradient-to-l from-success to-primary' : s.signal === 'SELL' ? 'bg-danger' : 'bg-slate-500'}`}
                    style={{ width: `${s.prob * 100}%` }} />
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && search.trim() && (
        <div className="glass p-8 rounded-xl text-center">
          <AlertTriangle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">نتیجه‌ای برای «{search}» پیدا نشد</p>
        </div>
      )}
    </div>
  );
}
