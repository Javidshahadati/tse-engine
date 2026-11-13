'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const WatchlistContext = createContext(null);
export function WatchlistProvider({ children }) {
  const [items, setItems] = useState([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    try { const r = localStorage.getItem('tse_watchlist'); if (r) setItems(JSON.parse(r)); } catch {}
    setMounted(true);
  }, []);
  const save = (l) => { setItems(l); try { localStorage.setItem('tse_watchlist', JSON.stringify(l)); } catch {} };
  const add = (s) => { if (!items.includes(s)) save([...items, s]); };
  const remove = (s) => save(items.filter(x => x !== s));
  const toggle = (s) => { if (items.includes(s)) remove(s); else add(s); };
  const has = (s) => items.includes(s);
  return <WatchlistContext.Provider value={{ items, add, remove, toggle, has, mounted }}>{children}</WatchlistContext.Provider>;
}
export function useWatchlist() {
  const c = useContext(WatchlistContext);
  if (!c) throw new Error('useWatchlist must be used within WatchlistProvider');
  return c;
}
