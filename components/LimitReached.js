'use client';
import Link from 'next/link';
import { Crown, ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LimitReached({ feature = 'این قابلیت' }) {
  const router = useRouter();
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      <style>{`
        @keyframes floatCrown {
          0%, 100% { transform: translateY(0) rotate(3deg); }
          50% { transform: translateY(-10px) rotate(-3deg); }
        }
        .animate-float-crown { animation: floatCrown 4s ease-in-out infinite; }
      `}</style>
      
      <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-yellow-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-md mx-auto">
        <div className="relative mb-6 inline-block">
          <div className="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full animate-pulse" />
          <div className="animate-float-crown relative w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center shadow-xl shadow-amber-500/30">
            <Crown className="w-12 h-12 text-[#1a1208]" strokeWidth={2.5} />
          </div>
          <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-300 animate-pulse" />
        </div>

        <h1 className="text-2xl md:text-3xl font-black mb-3">
          <span className="bg-gradient-to-l from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
            به سقف پلن رایگان رسیدید
          </span>
        </h1>
        
        <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-8">
          شما به محدودیت <strong className="text-amber-400">{feature}</strong> در پلن رایگان رسیده‌اید.
          برای دسترسی نامحدود، به پلن حرفه‌ای ارتقا دهید.
        </p>

        <div className="flex flex-col gap-3">
          <Link href={`/upgrade?feature=${encodeURIComponent(feature)}`}
            className="w-full py-3.5 rounded-xl bg-gradient-to-l from-amber-400 via-amber-500 to-yellow-500 text-[#1a1208] font-black text-sm shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
            <Crown className="w-4 h-4" /> ارتقا به حرفه‌ای
          </Link>
          <button onClick={() => router.back()} className="w-full py-3 rounded-xl glass border border-border/50 text-white font-bold text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
            <ArrowRight className="w-4 h-4" /> بازگشت
          </button>
        </div>
      </div>
    </div>
  );
}
