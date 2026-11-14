'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Crown, X, Check, Sparkles, Star, Zap, TrendingUp } from 'lucide-react';

export default function UpgradeModal({ open, onClose, feature = 'این قابلیت', limit = 5 }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const benefits = [
    { icon: Star, text: 'واچ‌لیست نامحدود' },
    { icon: Zap, text: 'بک‌تست نامحدود' },
    { icon: TrendingUp, text: 'دسترسی کامل ۶۰۲ سهم' },
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 overflow-y-auto"
      onClick={onClose}>
      <div
        className="flex min-h-full items-center justify-center p-4 py-8"
        onClick={(e) => e.stopPropagation()}>
        <div className="relative w-full max-w-md my-auto rounded-3xl overflow-hidden border-2 border-amber-500/40 shadow-2xl shadow-amber-500/20">

          {/* ═══ Golden gradient background ═══ */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1208] via-[#0f0a05] to-[#05070f]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-yellow-600/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl" />

          {/* ═══ Content ═══ */}
          <div className="relative p-6 md:p-8">

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-black/40 border border-amber-500/30 flex items-center justify-center text-amber-200/70 hover:text-amber-200 hover:bg-black/60 transition-all">
              <X className="w-4 h-4" />
            </button>

            {/* Crown icon */}
            <div className="flex justify-center mb-5 mt-2">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/50 blur-2xl rounded-full animate-pulse" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center shadow-xl shadow-amber-500/40 rotate-3 hover:rotate-0 transition-transform">
                  <Crown className="w-10 h-10 text-[#1a1208]" strokeWidth={2.5} />
                </div>
                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-300 animate-pulse" />
                <Sparkles className="absolute -bottom-1 -left-2 w-4 h-4 text-yellow-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-center text-2xl md:text-3xl font-black mb-2 leading-tight">
              <span className="bg-gradient-to-l from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                به سقف پلن رایگان رسیدید
              </span>
            </h2>

            {/* Subtitle */}
            <p className="text-center text-sm text-amber-100/80 leading-relaxed mb-6 px-2">
              محدودیت <strong className="text-amber-300 font-bold">{feature}</strong> در پلن رایگان به پایان رسیده.
              برای استفاده نامحدود، به پلن حرفه‌ای ارتقا دهید.
            </p>

            {/* Divider */}
            <div className="h-px bg-gradient-to-l from-transparent via-amber-500/40 to-transparent mb-5" />

            {/* Benefits */}
            <div className="space-y-2.5 mb-6">
              {benefits.map((b, i) => {
                const Icon = b.icon;
                return (
                  <div key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-l from-amber-500/10 to-transparent border border-amber-500/20">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400/30 to-yellow-600/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-amber-300" />
                    </div>
                    <div className="flex-1 text-right">
                      <span className="text-sm font-bold text-amber-50">{b.text}</span>
                    </div>
                    <Check className="w-4 h-4 text-amber-400 flex-shrink-0" strokeWidth={3} />
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            <Link
              href="/pricing"
              onClick={onClose}
              className="relative block w-full py-4 rounded-xl bg-gradient-to-l from-amber-400 via-amber-500 to-yellow-500 text-[#1a1208] font-black text-base text-center shadow-xl shadow-amber-500/40 hover:shadow-amber-500/60 hover:-translate-y-0.5 transition-all overflow-hidden group">
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Crown className="w-5 h-5" />
                مشاهده پلن حرفه‌ای
              </span>
              <div className="absolute inset-0 bg-gradient-to-l from-yellow-400 via-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>

            {/* Later */}
            <button
              onClick={onClose}
              className="block w-full mt-3 py-2 text-xs text-amber-200/60 hover:text-amber-200 transition-colors">
              شاید بعداً
            </button>

            {/* Footer note */}
            <div className="mt-5 pt-4 border-t border-amber-500/20 text-center">
              <p className="text-[10px] text-amber-200/50 leading-relaxed">
                با ارتقا به پلن حرفه‌ای، از تمام قابلیت‌ها بدون محدودیت بهره‌مند شوید
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
