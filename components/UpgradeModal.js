'use client';
import Link from 'next/link';
import { Crown, X, Check, Sparkles } from 'lucide-react';

export default function UpgradeModal({ open, onClose, feature = 'این قابلیت', limit = 5 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong max-w-md w-full rounded-2xl p-6 text-center border-2 border-primary/40 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/15 rounded-full blur-3xl" />
        
        <button onClick={onClose} className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors z-10">
          <X className="w-4 h-4" />
        </button>

        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-primary2 to-accent mx-auto mb-4 flex items-center justify-center shadow-lg shadow-primary/40">
            <Crown className="w-8 h-8 text-bg" strokeWidth={2.5} />
          </div>
          
          <h3 className="text-xl font-black text-white mb-2">به سقف پلن رایگان رسیدید</h3>
          <p className="text-sm text-slate-300 mb-5 leading-relaxed">
            شما به محدودیت <strong className="text-primary">{feature}</strong> در پلن رایگان رسیده‌اید.
            برای استفاده نامحدود، به پلن حرفه‌ای ارتقا دهید.
          </p>

          <div className="bg-bg/60 rounded-xl p-3 mb-5 space-y-1.5 text-right">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
              <span>واچ‌لیست نامحدود</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
              <span>بک‌تست نامحدود</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
              <span>دسترسی کامل ۶۰۲ سهم</span>
            </div>
          </div>

          <div className="space-y-2">
            <Link href="/pricing" className="block w-full py-3 rounded-xl bg-gradient-to-l from-primary via-primary2 to-accent text-bg font-black text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all">
              <Sparkles className="w-4 h-4 inline mr-1" />
              مشاهده پلن حرفه‌ای
            </Link>
            <button onClick={onClose} className="block w-full py-2 text-xs text-slate-400 hover:text-white transition-colors">
              شاید بعداً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
