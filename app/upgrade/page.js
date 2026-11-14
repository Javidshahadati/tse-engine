'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, ArrowRight, Check, Sparkles, Star, Zap, TrendingUp } from 'lucide-react';
import { Suspense } from 'react';

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const feature = searchParams.get('feature') || 'این قابلیت';

  const benefits = [
    { icon: Star, text: 'واچ‌لیست نامحدود' },
    { icon: Zap, text: 'بک‌تست نامحدود' },
    { icon: TrendingUp, text: 'دسترسی کامل ۶۰۲ سهم' },
  ];

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 py-12">
      {/* Custom Animation Injection */}
      <style>{`
        @keyframes dropIn {
          0% { transform: translateY(-150px) scale(0.6); opacity: 0; }
          60% { transform: translateY(15px) scale(1.05); opacity: 1; }
          80% { transform: translateY(-5px) scale(0.98); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        .animate-crown {
          animation: dropIn 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      {/* ═══ Golden Background ═══ */}
      <div className="fixed inset-0 bg-[#05070f] pointer-events-none -z-10" />
      <div className="fixed top-0 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-1/4 w-[500px] h-[500px] bg-yellow-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Back Button */}
      <button onClick={() => router.back()} 
        className="absolute top-6 right-6 md:top-10 md:right-10 flex items-center gap-2 text-sm text-amber-200/60 hover:text-amber-200 transition-colors z-20">
        <ArrowRight className="w-4 h-4" /> بازگشت
      </button>

      <div className="relative w-full max-w-2xl z-10 flex flex-col items-center text-center mt-8 md:mt-0">
        
        {/* Crown with drop animation */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-amber-500/40 blur-3xl rounded-full animate-[glowPulse_3s_ease-in-out_infinite]" />
          <div className="animate-crown relative w-28 h-28 md:w-36 md:h-36 rounded-[2rem] bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center shadow-2xl shadow-amber-500/40 rotate-3">
            <Crown className="w-14 h-14 md:w-20 md:h-20 text-[#1a1208]" strokeWidth={2.5} />
          </div>
          <Sparkles className="absolute -top-2 -right-4 w-8 h-8 text-amber-300 animate-pulse" />
          <Sparkles className="absolute -bottom-2 -left-4 w-6 h-6 text-yellow-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight">
          <span className="bg-gradient-to-l from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
            به سقف پلن رایگان رسیدید
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base md:text-lg text-amber-100/80 leading-relaxed mb-8 max-w-lg mx-auto">
          محدودیت <strong className="text-amber-300 font-bold">{feature}</strong> در پلن رایگان به پایان رسیده است.
          برای استفاده نامحدود و دسترسی به تمام امکانات، به پلن حرفه‌ای ارتقا دهید.
        </p>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-l from-transparent via-amber-500/40 to-transparent mb-8" />

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="flex flex-col items-center p-5 rounded-2xl bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 hover:bg-amber-500/15 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-amber-300" />
                </div>
                <span className="text-sm font-bold text-amber-50 mb-2">{b.text}</span>
                <Check className="w-5 h-5 text-amber-400" strokeWidth={3} />
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <Link
          href="/pricing"
          className="group relative w-full md:w-auto md:min-w-[300px] inline-flex items-center justify-center gap-2 py-4 px-8 rounded-2xl bg-gradient-to-l from-amber-400 via-amber-500 to-yellow-500 text-[#1a1208] font-black text-lg shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 hover:-translate-y-1 transition-all overflow-hidden">
          <Crown className="w-6 h-6 relative z-10" />
          <span className="relative z-10">مشاهده پلن حرفه‌ای</span>
          <div className="absolute inset-0 bg-gradient-to-l from-yellow-400 via-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        
        <p className="mt-6 text-[11px] text-amber-200/50">
          با ارتقا، از تمام قابلیت‌ها بدون محدودیت بهره‌مند شوید
        </p>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05070f] flex items-center justify-center text-amber-500">در حال بارگذاری...</div>}>
      <UpgradeContent />
    </Suspense>
  );
}
