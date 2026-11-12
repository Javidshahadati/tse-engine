import Link from 'next/link';
import { Activity, AlertTriangle, Sparkles } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border/60 bg-gradient-to-b from-surface/30 to-bg mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-3 gap-8 mb-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-primary via-primary2 to-accent flex items-center justify-center shadow-lg shadow-primary/30">
                <Activity className="w-5 h-5 text-bg" strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-black text-white text-lg tracking-tight">TSE.Engine</div>
                <div className="text-[10px] text-primary/90 font-semibold tracking-[0.15em]">POWERED BY JAVID LM</div>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              موتور تحلیل هوشمند بازار سرمایه ایران. تحلیل داده‌محور ۶۰۲ سهم با ۱۰۴ فیچر تکنیکال و بنیادی و شاخص کل ۲۰ ساله.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" /> دسترسی سریع
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/" className="text-slate-400 hover:text-primary transition-colors">صفحه اصلی</Link></li>
              <li><Link href="/dashboard" className="text-slate-400 hover:text-primary transition-colors">داشبورد تحلیل</Link></li>
              <li><Link href="/market-index" className="text-slate-400 hover:text-primary transition-colors">شاخص کل</Link></li>
              <li><Link href="/about" className="text-slate-400 hover:text-primary transition-colors">درباره ما</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-danger/30 pt-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/8 border border-danger/25">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-danger font-bold text-sm mb-1">سلب مسئولیت</p>
              <p className="text-danger/80 text-xs leading-relaxed">
                این تحلیل صرفاً آموزشی و پژوهشی است و به‌هیچ‌وجه توصیه معاملاتی، خرید یا فروش محسوب نمی‌شود.
                تصمیم‌گیری نهایی و مسئولیت آن کاملاً برعهده کاربر است.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 flex justify-center">
          <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-l from-primary/10 via-accent/10 to-primary2/10 border border-primary/25">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
              Crafted by Javid Shahadati
            </span>
            <Sparkles className="w-3.5 h-3.5 text-accent" />
          </div>
        </div>
        <div className="mt-4 text-center text-[10px] text-slate-600 num">
          © {new Date().getFullYear()} — All Rights Reserved
        </div>
      </div>
    </footer>
  );
}
