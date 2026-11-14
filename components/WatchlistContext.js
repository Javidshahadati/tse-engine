'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext(null);
const FREE_LIMIT = 5;

export function WatchlistProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!user) {
      try {
        const r = localStorage.getItem('tse_watchlist');
        if (r) setItems(JSON.parse(r));
      } catch {}
      setMounted(true);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('watchlists')
        .select('symbol')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });
      setItems((data || []).map(d => d.symbol));
      setMounted(true);
    })();
  }, [user]);

  const saveLocal = (l) => {
    try { localStorage.setItem('tse_watchlist', JSON.stringify(l)); } catch {}
  };

  const add = async (s) => {
    if (items.includes(s)) return { success: true };
    if (items.length >= FREE_LIMIT) return { success: false, reason: 'LIMIT_REACHED' };

    if (!user) {
      const next = [...items, s];
      setItems(next);
      saveLocal(next);
      return { success: true };
    }

    const { error } = await supabase.from('watchlists').insert({ user_id: user.id, symbol: s });
    if (error) return { success: false, reason: 'DB_ERROR' };
    setItems([s, ...items]);
    return { success: true };
  };

  const remove = async (s) => {
    if (!user) {
      const next = items.filter(x => x !== s);
      setItems(next);
      saveLocal(next);
      return;
    }
    await supabase.from('watchlists').delete().eq('user_id', user.id).eq('symbol', s);
    setItems(items.filter(x => x !== s));
  };

  const toggle = async (s) => {
    if (items.includes(s)) { await remove(s); return { success: true }; }
    return await add(s);
  };

  const has = (s) => items.includes(s);

  return (
    <WatchlistContext.Provider value={{ items, add, remove, toggle, has, mounted, limit: FREE_LIMIT }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const c = useContext(WatchlistContext);
  if (!c) throw new Error('useWatchlist must be used within WatchlistProvider');
  return c;
}
