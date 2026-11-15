'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Activity, Menu, X, BarChart3, Info, Home, Star, Scale, Filter, Target, Gauge, Mail } from 'lucide-react';
import UserMenu from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'صفحه اصلی', icon: Home },
  { href: '/dashboard', label: 'داشبورد', icon: BarChart3 },
  { href: '/breadth', label: 'سلامت بازار', icon: Gauge },
  { href: '/screener', label: 'اسکرینر', icon: Filter },
  { href: '/compare', label: 'مقایسه', icon: Scale },
  { href: '/backtest', label: 'بک‌تست', icon: Target, Award },
  { href: '/model-performance', label: 'عملکرد مدل', icon: Award },
  { href: '/watchlist', label: 'واچ‌لیست', icon: Star },
  { href: '/about', label: 'درباره ما', icon: Info },
  { href: '/contact', label: 'تماس', icon: Mail },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-2xl bg-bg/80 border-b border-border/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary2 to-accent flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-primary/30">
            <Activity className="w-5 h-5 text-bg" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-xl bg-primary/40 blur-lg -z-10 group-hover:bg-primary/60 transition-colors" />
          </div>
          <div className="flex flex-col leading-none hidden sm:flex">
            <span className="font-black text-white text-base tracking-tight">TSE.Engine</span>
            <span className="text-[9px] text-primary/90 font-semibold tracking-[0.15em] mt-0.5">JAVID LM</span>
          </div>
        </Link>

        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active ? 'text-primary bg-primary/10' : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}>
                {active && <div className="absolute inset-0 rounded-lg border border-primary/40" />}
                <Icon className="w-4 h-4 relative" />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <UserMenu />
          <Link href="/dashboard" className="btn-primary text-sm py-2 px-5">
            داشبورد
          </Link>
        </div>

        {/* Mobile controls */}
        <div className="lg:hidden flex items-center gap-1">
          <UserMenu />
          <button onClick={() => setOpen(!open)}
            className="p-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-bg/95 backdrop-blur-xl absolute top-16 left-0 right-0 h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-4 space-y-1 pb-20">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${
                  pathname === href ? 'bg-primary/15 text-primary' : 'text-slate-200 hover:bg-white/5'
                }`}>
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
            <div className="pt-4 mt-4 border-t border-border/50">
              <Link href="/dashboard" onClick={() => setOpen(false)} className="btn-primary w-full justify-center py-3 text-sm">
                مشاهده داشبورد
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
