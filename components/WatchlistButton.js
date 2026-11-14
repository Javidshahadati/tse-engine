'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useWatchlist } from './WatchlistContext';
import { useAuth } from './AuthContext';
import AuthRequiredModal from './AuthRequiredModal';
import UpgradeModal from './UpgradeModal';

export default function WatchlistButton({ symbol }) {
  const { has, toggle, mounted, limit } = useWatchlist();
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  
  if (!mounted) return null;
  const active = has(symbol);
  
  const handleClick = () => {
    if (!user) { setShowAuth(true); return; }
    const res = toggle(symbol);
    if (res && !res.success && res.reason === 'LIMIT_REACHED') {
      setShowUpgrade(true);
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
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} feature="واچ‌لیست" limit={limit} />
    </>
  );
}
