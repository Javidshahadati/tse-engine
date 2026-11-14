'use client';
import Link from 'next/link';
import { Lock, X } from 'lucide-react';

export default function AuthRequiredModal({ open, onClose, feature = 'این قابلیت' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong max-w-sm w-full rounded-2xl p-6 text-center border border-primary/30 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 mx-auto mb-4 flex items-center justify-center">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">ورود لازم است</h3>
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          برای استفاده از {feature}، لطفاً وارد حساب خود شوید یا ثبت‌نام کنید.
        </p>
        <div className="space-y-2">
          <Link href="/signin" className="block w-full py-2.5 rounded-lg bg-gradient-to-l from-primary to-primary2 text-bg font-bold text-sm shadow-lg shadow-primary/30">
            ورود
          </Link>
          <Link href="/signup" className="block w-full py-2.5 rounded-lg glass text-white font-bold text-sm">
            ثبت‌نام
          </Link>
        </div>
      </div>
    </div>
  );
}
