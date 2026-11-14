'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, LogOut, ChevronDown, Star } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (loading) {
    return <div className="w-9 h-9 glass rounded-full shimmer" />;
  }

  if (!user) {
    return (
      <Link href="/signin" className="btn-secondary text-[11px] md:text-xs py-1.5 px-3 md:px-4">
        ورود / ثبت‌نام
      </Link>
    );
  }

  const email = user.email || '';
  const initial = email ? email[0].toUpperCase() : '?';
  const name = user.user_metadata?.full_name || email.split('@')[0] || 'کاربر';

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 p-1 pr-2 rounded-full glass hover:border-primary/30 transition-colors">
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-bg text-[11px] md:text-xs font-black shadow-sm">
          {initial}
        </div>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-[100] glass-strong rounded-xl min-w-[220px] max-w-[calc(100vw-2rem)] border border-primary/30 shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-border/40 bg-white/5">
            <div className="text-[10px] text-slate-400 mb-0.5">حساب کاربری</div>
            <div className="text-sm font-bold text-white truncate">{name}</div>
            <div className="text-[10px] text-slate-500 truncate" dir="ltr">{email}</div>
          </div>
          <div className="p-1.5">
            <Link href="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm text-white">
              <User className="w-4 h-4 text-primary" /> پروفایل من
            </Link>
            <Link href="/watchlist" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm text-white">
              <Star className="w-4 h-4 text-warning" /> واچ‌لیست
            </Link>
            <div className="h-px bg-border/40 my-1 mx-2" />
            <button onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-danger/10 transition-colors text-sm text-danger font-medium">
              <LogOut className="w-4 h-4" /> خروج از حساب
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
