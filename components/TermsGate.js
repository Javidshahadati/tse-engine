'use client';
import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Check } from 'lucide-react';

export default function TermsGate() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem('tse_terms_accepted')) setShow(true); } catch {}
    setMounted(true);
  }, []);

  if (!mounted || !show) return null;

  const handleAccept = () => {
    if (!checked) return;
    try { localStorage.setItem('tse_terms_accepted', new Date().toISOString()); } catch {}
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-bg/95 backdrop-blur-md overflow-y-auto py-8">
      <div className="glass-strong max-w-lg w-full rounded-2xl p-6 md:p-8 relative overflow-hidden my-auto">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-5 h-5 text-bg" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">شرایط استفاده</h2>
              <p className="text-[11px] text-slate-300">قبل از ورود، لطفاً مطالعه کنید</p>
            </div>
          </div>

          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4 max-h-64 overflow-y-auto">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-danger">سلب مسئولیت مهم</p>
            </div>
            <div className="space-y-2 text-[11px] text-slate-200 leading-relaxed">
              <p>• این اپلیکیشن <strong className="text-white">صرفاً آموزشی و پژوهشی</strong> است.</p>
              <p>• هیچ‌گونه <strong className="text-white">توصیه معاملاتی، خرید یا فروش</strong> ارائه نمی‌دهد.</p>
              <p>• تمام تحلیل‌ها بر اساس الگوهای آماری گذشته است و <strong className="text-white">تضمین آینده نیست</strong>.</p>
              <p>• تصمیم‌گیری نهایی و مسئولیت کامل آن <strong className="text-white">بر عهده کاربر</strong> است.</p>
              <p>• TSE.Engine هیچ‌گونه مسئولیتی در قبال سود یا زیان ناشی از استفاده از این اطلاعات نمی‌پذیرد.</p>
              <p>• این سرویس سیگنال‌دهی یا مدیریت سرمایه نیست.</p>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-bg/40 border border-border/50 hover:border-primary/30 transition-colors mb-4">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 w-4 h-4 accent-primary cursor-pointer flex-shrink-0" />
            <span className="text-xs text-slate-200 leading-relaxed">
              <strong className="text-white">می‌پذیرم</strong> که این اپ صرفاً ابزار تحلیل آموزشی است، هیچ‌گونه توصیه معاملاتی ارائه نمی‌دهد و مسئولیت هر تصمیم سرمایه‌گذاری کاملاً بر عهده من است.
            </span>
          </label>

          <button onClick={handleAccept} disabled={!checked}
            className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              checked ? 'bg-gradient-to-l from-primary to-primary2 text-bg shadow-lg shadow-primary/30 hover:shadow-primary/50'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}>
            <Check className="w-4 h-4" />
            {checked ? 'ورود به اپلیکیشن' : 'ابتدا تیک بزنید'}
          </button>

          <p className="text-[10px] text-slate-500 text-center mt-3">با ورود، شرایط فوق را می‌پذیرید.</p>
        </div>
      </div>
    </div>
  );
}
