'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, UserPlus, Sparkles, Star, Zap, TrendingUp, ArrowRight, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function GuestLimit() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1600;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(5 * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const benefits = [
    { icon: Eye, text: 'دسترسی کامل ۶۰۲ سهم', color: 'text-primary' },
    { icon: Star, text: 'واچ‌لیست شخصی', color: 'text-warning' },
    { icon: Zap, text: 'بک‌تست استراتژی‌ها', color: 'text-accent' },
    { icon: TrendingUp, text: 'تحلیل جامع هر سهم', color: 'text-success' },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 relative overflow-hidden">

      <style>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, -60px) scale(1.1); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, 40px) scale(1.15); }
        }
        @keyframes slideUp {
          from { transform: translateY(50px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-50px); opacity: 0.5; }
        }
        @keyframes lockPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shimmer2 {
          0% { background-position: -500px 0; }
          100% { background-position: 500px 0; }
        }
        .guest-card { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .lock-icon { animation: lockPulse 3s ease-in-out infinite; }
        .btn-shimmer {
          background-size: 500px 100%;
          background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shimmer2 3s infinite;
        }
      `}</style>

      {/* Animated orbs */}
      <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-primary/15 rounded-full blur-3xl" style={{ animation: 'floatOrb1 12s ease-in-out infinite' }} />
      <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-accent/15 rounded-full blur-3xl" style={{ animation: 'floatOrb2 14s ease-in-out infinite' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-warning/8 rounded-full blur-3xl" />

      {/* Floating particles */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[...Array(25)].map((_, i) => (
          <circle
            key={i}
            cx={((i * 37) % 100)}
            cy={((i * 53) % 100)}
            r={0.12 + (i % 3) * 0.1}
            fill={i % 3 === 0 ? '#06b6d4' : i % 3 === 1 ? '#8b5cf6' : '#f59e0b'}
            style={{
              animation: `particleFloat ${5 + (i % 5) * 2}s ease-in-out infinite`,
              animationDelay: `${i * 0.25}s`,
            }}
          />
        ))}
      </svg>

      {/* Card */}
      <div className="relative z-10 max-w-lg w-full guest-card">
        <div className="glass-strong rounded-3xl p-7 md:p-9 border-2 border-primary/30 relative overflow-hidden shadow-2xl shadow-primary/20">

          {/* Inner glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />

          <div className="relative text-center">

            {/* Lock icon with glow */}
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-primary/50 blur-2xl rounded-full animate-pulse" />
              <div className="lock-icon relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary via-primary2 to-accent flex items-center justify-center shadow-2xl shadow-primary/50">
                <Lock className="w-10 h-10 text-bg" strokeWidth={2.5} />
              </div>
              <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-accent animate-pulse" />
              <Sparkles className="absolute -bottom-1 -left-2 w-4 h-4 text-warning animate-pulse" style={{ animationDelay: '0.7s' }} />
            </div>

            {/* Counter */}
            <div className="mb-4">
              <div className="inline-flex items-baseline gap-2">
                <span className="num text-6xl md:text-7xl font-black gradient-text leading-none">{count}</span>
                <span className="text-3xl md:text-4xl text-slate-500 font-black">/ ۵</span>
              </div>
              <p className="text-xs md:text-sm text-slate-300 mt-2 font-medium">
                سهم رایگان امشب را دیدید
              </p>
            </div>

            <h1 className="text-xl md:text-2xl font-black text-white mb-3 leading-tight">
              برای مشاهده بیشتر، ثبت‌نام کنید
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mb-6 leading-relaxed max-w-sm mx-auto">
              با ساخت حساب رایگان، بلافاصله به همه امکانات دسترسی پیدا می‌کنید.
            </p>

            {/* Benefits */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {benefits.map((b, i) => {
                const Icon = b.icon;
                return (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-bg/60 border border-border/40 hover:border-primary/30 transition-colors">
                    <Icon className={`w-4 h-4 ${b.color} flex-shrink-0`} />
                    <span className="text-[10px] md:text-xs text-slate-200 font-semibold text-right leading-tight">{b.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Primary CTA */}
            <Link
              href="/signup"
              className="relative block w-full py-4 rounded-2xl bg-gradient-to-l from-primary via-primary2 to-accent text-bg font-black text-sm md:text-base shadow-xl shadow-primary/40 hover:shadow-primary/60 hover:-translate-y-1 transition-all mb-3 overflow-hidden group">
              <span className="relative z-10 flex items-center justify-center gap-2">
                <UserPlus className="w-5 h-5" />
                ثبت‌نام رایگان
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 btn-shimmer" />
            </Link>

            {/* Secondary CTA */}
            <div className="flex items-center gap-2">
              <Link
                href="/signin"
                className="flex-1 py-2.5 rounded-xl glass text-slate-300 font-semibold text-xs md:text-sm hover:bg-white/10 hover:text-white transition-colors text-center">
                حساب دارم
              </Link>
              <button
                onClick={() => router.back()}
                className="flex-1 py-2.5 rounded-xl glass text-slate-400 font-medium text-xs md:text-sm hover:bg-white/5 hover:text-slate-200 transition-colors">
                بازگشت
              </button>
            </div>

            {/* Footer */}
            <div className="mt-5 pt-4 border-t border-border/30">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                ثبت‌نام رایگان است و هیچ تعهدی ایجاد نمی‌کند
              </p>
            </div>
          </div>
        </div>

        {/* Bottom hint */}
        <div className="text-center mt-4">
          <p className="text-[10px] text-slate-500">
            محدودیت هر ۲۴ ساعت ریست می‌شود
          </p>
        </div>
      </div>
    </div>
  );
}
