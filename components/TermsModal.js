'use client';
import { X, Shield, AlertTriangle } from 'lucide-react';

export default function TermsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-strong max-w-lg w-full rounded-2xl max-h-[85vh] flex flex-col border border-primary/30" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-white">شرایط استفاده</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 text-xs text-slate-200 leading-relaxed">
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-warning font-bold text-[11px]">سلب مسئولیت</p>
          </div>
          <p><strong className="text-white">۱.</strong> این اپلیکیشن صرفاً آموزشی و پژوهشی است و به هیچ وجه توصیه معاملاتی، خرید یا فروش ارائه نمی‌دهد.</p>
          <p><strong className="text-white">۲.</strong> تمام تحلیل‌ها بر اساس الگوهای آماری گذشته است و تضمین آینده نیست.</p>
          <p><strong className="text-white">۳.</strong> تصمیم‌گیری نهایی و مسئولیت کامل آن بر عهده کاربر است.</p>
          <p><strong className="text-white">۴.</strong> TSE.Engine هیچ‌گونه مسئولیتی در قبال سود یا زیان ناشی از استفاده از این اطلاعات نمی‌پذیرد.</p>
          <p><strong className="text-white">۵.</strong> این سرویس سیگنال‌دهی یا مدیریت سرمایه نیست.</p>
          <p><strong className="text-white">۶.</strong> اطلاعات حساب شما (ایمیل، رمز عبور) به صورت امن در Supabase ذخیره می‌شود و با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود.</p>
        </div>
        <div className="p-4 border-t border-border/40">
          <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-primary text-bg font-bold text-sm hover:opacity-90 transition-opacity">
            متوجه شدم
          </button>
        </div>
      </div>
    </div>
  );
}
