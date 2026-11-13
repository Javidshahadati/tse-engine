'use client';
import { Star } from 'lucide-react';
import { useWatchlist } from './WatchlistContext';
export default function WatchlistButton({ symbol }) {
  const { has, toggle, mounted } = useWatchlist();
  if (!mounted) return null;
  const active = has(symbol);
  return (
    <button onClick={() => toggle(symbol)}
      title={active ? 'حذف از واچ‌لیست' : 'افزودن به واچ‌لیست'}
      className={`p-2 rounded-lg border transition-all ${
        active ? 'bg-warning/15 border-warning/40 text-warning'
               : 'glass border-border/50 text-slate-400 hover:text-warning hover:border-warning/30'
      }`}>
      <Star className="w-4 h-4" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
