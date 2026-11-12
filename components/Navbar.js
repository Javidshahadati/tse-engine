'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Activity, Menu, X, BarChart3, Info, Home } from 'lucide-react';

const NAV_LINKS = [
  { href: '/', label: 'صفحه اصلی', icon: Home },
  { href: '/dashboard', label: 'داشبورد', icon: BarChart3 },
  { href: '/#about', label: 'درباره ما', icon: Info },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 glass-strong border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary2 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Activity className="w-5 h-5 text-bg" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-white text-base">TSE.Engine</span>
            <span className="text-[10px] text-primary/80">Javid Quant</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}>
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex">
          <Link href="/dashboard" className="btn-primary text-sm py-2">
            مشاهده داشبورد
          </Link>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-white/5"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-surface/95 backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-200 hover:bg-white/5">
                <Icon className="w-4 h-4 text-primary" />
                {label}
              </Link>
            ))}
            <Link href="/dashboard" onClick={() => setOpen(false)}
              className="btn-primary w-full justify-center mt-2 text-sm">
              مشاهده داشبورد
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
