import Link from 'next/link';
import { Activity, AlertTriangle, Github, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary2 flex items-center justify-center">
                <Activity className="w-5 h-5 text-bg" />
              </div>
              <div>
                <div className="font-bold text-white">TSE.Engine</div>
                <div className="text-xs text-primary/80">Powered by Javid Quant</div>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              موتور تحلیل هوشمند بازار سرمایه ایران. تحلیل داده‌محور ۶۰۶ سهم با ۹۹ فیچر تکنیکال و بنیادی.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-3">دسترسی سریع</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="text-slate-400 hover:text-primary">صفحه اصلی</Link></li>
              <li><Link href="/dashboard" className="text-slate-400 hover:text-primary">داشبورد تحلیل</Link></li>
              <li><Link href="/#about" className="text-slate-400 hover:text-primary">درباره ما</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-3">منابع</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://github.com/Javidshahadati/tse-engine" target="_blank" rel="noopener"
                   className="text-slate-400 hover:text-primary inline-flex items-center gap-1">
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
              </li>
              <li>
                <a href="https://cdn.tsetmc.com" target="_blank" rel="noopener"
                   className="text-slate-400 hover:text-primary inline-flex items-center gap-1">
                  <ExternalLink className="w-3.5 h-3.5" /> TSETMC
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-danger/40 pt-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/30">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-danger font-bold text-sm mb-1">⚠️ سلب مسئولیت</p>
              <p className="text-danger/90 text-xs leading-relaxed">
                این تحلیل صرفاً آموزشی و پژوهشی است و به‌هیچ‌وجه توصیه معاملاتی، خرید یا فروش محسوب نمی‌شود.
                تصمیم‌گیری نهایی و مسئولیت آن کاملاً بر عهده کاربر است. هیچ تضمینی نسبت به صحت، دقت یا سودآوری وجود ندارد.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} TSE.Engine — ساخته شده توسط جاوید شهادتی
        </div>
      </div>
    </footer>
  );
}
