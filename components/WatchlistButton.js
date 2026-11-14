'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { useWatchlist } from './WatchlistContext';
import { useAuth } from './AuthContext';
import AuthRequiredModal from './AuthRequiredModal';

export default function WatchlistButton({ symbol }) {
  const { has, toggle, mounted, limit } = useWatchlist();
  const { user } = useAuth();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  
  if (!mounted) return null;
  const active = has(symbol);
  
  const handleClick = () => {
    if (!user) { setShowAuth(true); return; }
    const res = toggle(symbol);
    if (res && !res.success && res.reason === 'LIMIT_REACHED') {
      router.push('/upgrade?feature=واچ‌لیست');
    }
  };
  
  return (
    <>
      <button onClick={handleClick}
        title={active ? 'حذف از واچ‌لیست' : 'افزودن به واچ‌لیست'}
        className={`p-2 rounded-lg border transition-all ${
          active ? 'bg-warning/15 border-warning/40 text-warning'
                 : 'glass border-border/50 text-slate-400 hover:text-warning hover:border-warning/30'
        }`}>
        <Star className="w-4 h-4" fill={active ? 'currentColor' : 'none'} />
      </button>
      <AuthRequiredModal open={showAuth} onClose={() => setShowAuth(false)} feature="واچ‌لیست" />
    </>
  );
}
