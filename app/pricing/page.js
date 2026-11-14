'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  Check, X, Crown, Zap, Star, ArrowLeft, Sparkles,
  Shield, TrendingUp, BarChart3, Target, Filter, Gauge,
  Lock, MessageCircle, Rocket
} from 'lucide-react';

const PLANS = [
  {
    id: 'free',
    name: 'رایگان',
    icon: Star,
    price: { monthly: 0, yearly: 0 },
    color: 'from-slate-500/20 to-slate-500/5',
    iconColor: 'text-slate-300',
    borderColor: 'border-slate-500/40',
    badge: null,
    description: 'برای شروع و آشنایی با TSE.Engine',
    features: [
      { name: 'داشبورد کامل بازار', included: true },
      { name: 'شاخص کل و سلامت بازار', included: true },
      { name: 'صفحه سهم (۵ سهم در روز)', included: true },
      { name: 'اسکرینر (فقط ۵ نتیجه)', included: true },
      { name: 'مقایسه سهم (۱ در روز)', included: true },
      { name: 'واچ‌لیست (حداکثر ۵ سهم)', included: true },
      { name: 'بک‌تست (۳ بار در ماه)', included: true },
      { name: 'تمام ۶۰۲ سهم', included: false },
      { name: 'بک‌تست نامحدود', included: false },
      { name: 'خروجی CSV', included: false },
      { name: 'دسترسی API', included: false },
      { name: 'پشتیبانی اولویت‌دار', included: false },
    ],
    cta: 'همین حالا شروع کن',
    ctaLink: '/signup',
    ctaStyle: 'glass text-white',
  },
  {
    id: 'pro',
    name: 'حرفه‌ای',
    icon: Crown,
    price: { monthly: 290000, yearly: 2780000 },
    color: 'from-primary/25 to-accent/10',
    iconColor: 'text-primary',
    borderColor: 'border-primary/60',
    badge: 'پرطرفدار',
    description: 'برای تریدرهای جدی و حرفه‌ای',
    features: [
      { name: 'داشبورد کامل بازار', included: true },
      { name: 'شاخص کل و سلامت بازار', included: true },
      { name: 'تمام ۶۰۲ سهم بدون محدودیت', included: true },
      { name: 'اسکرینر کامل', included: true },
      { name: 'مقایسه نامحدود', included: true },
      { name: 'واچ‌لیست نامحدود', included: true },
      { name: 'بک‌تست نامحدود', included: true },
      { name: 'خروجی CSV', included: true },
      { name: 'دسترسی API', included: false },
      { name: 'پشتیبانی اولویت‌دار', included: true },
    ],
    cta: 'به‌زودی',
    ctaLink: null,
    ctaStyle: 'bg-gradient-to-l from-primary via-primary2 to-accent text-bg',
  },
  {
    id: 'enterprise',
    name: 'سازمانی',
    icon: Rocket,
    price: { monthly: 790000, yearly: 7580000 },
    color: 'from-accent/20 to-primary/10',
    iconColor: 'text-accent',
    borderColor: 'border-accent/40',
    badge: 'برای تیم‌ها',
    description: 'برای شرکت‌ها و تیم‌های حرفه‌ای',
    features: [
      { name: 'همه قابلیت‌های حرفه‌ای', included: true },
      { name: 'دسترسی API کامل', included: true },
      { name: 'دسترسی ۵ کاربر', included: true },
      { name: 'پشتیبانی اختصاصی', included: true },
      { name: 'آموزش و راه‌اندازی', included: true },
    ],
    cta: 'تماس بگیر',
    ctaLink: '/contact',
    ctaStyle: 'glass text-white border-accent/30',
  },
];

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function PricingPage() {
  const [billing, setBilling] = useState('monthly');

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-10 space-y-6 md:space-y-10">

      {/* Hero */}
      <div className="text-center relative">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl -z-10" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-[10px] text-primary mb-4">
          <Sparkles className="w-3 h-3" />
          پلن‌های اشتراک
        </div>

        <h1 className="text-3xl md:text-5xl font-black mb-3">
          <span className="gradient-text">قدرت تحلیل حرفه‌ای</span>
        </h1>
        <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed mb-6">
          پلن مناسب خود را انتخاب کنید — از کاربر رایگان تا تیم حرفه‌ای
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl glass border border-border/50">
          <button onClick={() => setBilling('monthly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${billing === 'monthly' ? 'bg-primary text-bg shadow-lg shadow-primary/30' : 'text-slate-400'}`}>
            ماهانه
          </button>
          <button onClick={() => setBilling('yearly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${billing === 'yearly' ? 'bg-primary text-bg shadow-lg shadow-primary/30' : 'text-slate-400'}`}>
            سالانه
            <span className="px-1.5 py-0.5 rounded-full bg-success/20 text-success text-[9px]">۲۰٪ تخفیف</span>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-3 gap-4 md:gap-5">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const price = plan.price[billing];
          const isPro = plan.id === 'pro';
          return (
            <div key={plan.id} className={`relative rounded-2xl border-2 ${plan.borderColor} bg-gradient-to-br ${plan.color} to-transparent overflow-hidden transition-all ${isPro ? 'md:scale-105 shadow-2xl shadow-primary/20' : ''}`}>
              {plan.badge && (
                <div className="absolute top-3 left-3 z-10">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    isPro ? 'bg-gradient-to-l from-primary to-accent text-bg' : 'bg-white/10 text-white border border-white/20'
                  }`}>
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="p-5 md:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-11 h-11 rounded-xl bg-white/10 border ${plan.borderColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${plan.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{plan.name}</h3>
                    <p className="text-[10px] text-slate-400">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-4">
                  {price === 0 ? (
                    <div className="text-3xl font-black text-white">رایگان</div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="num text-3xl font-black text-white">{fmt(price)}</span>
                        <span className="text-xs text-slate-400">تومان / {billing === 'monthly' ? 'ماه' : 'سال'}</span>
                      </div>
                      {billing === 'yearly' && (
                        <div className="text-[10px] text-success mt-1">
                          معادل {fmt(Math.round(price / 12))} تومان ماهانه
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <ul className="space-y-2 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      {f.included ? (
                        <div className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-2.5 h-2.5 text-success" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <X className="w-2.5 h-2.5 text-slate-500" strokeWidth={3} />
                        </div>
                      )}
                      <span className={f.included ? 'text-slate-200' : 'text-slate-500 line-through'}>{f.name}</span>
                    </li>
                  ))}
                </ul>

                {plan.ctaLink ? (
                  <Link href={plan.ctaLink}
                    className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition-all hover:-translate-y-0.5 ${plan.ctaStyle}`}>
                    {plan.cta}
                  </Link>
                ) : (
                  <button disabled
                    className={`w-full py-3 rounded-xl font-bold text-sm text-center transition-all opacity-80 cursor-not-allowed ${plan.ctaStyle}`}>
                    <Lock className="w-3.5 h-3.5 inline mr-1" />
                    {plan.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="p-4 md:p-6 border-b border-border/40">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> مقایسه کامل
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-right p-3 text-[10px] text-slate-400 font-semibold">قابلیت</th>
                <th className="text-center p-3 text-[10px] text-slate-400 font-semibold">رایگان</th>
                <th className="text-center p-3 text-[10px] text-primary font-semibold">حرفه‌ای</th>
                <th className="text-center p-3 text-[10px] text-slate-400 font-semibold">سازمانی</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'داشبورد بازار', free: true, pro: true, ent: true },
                { name: 'شاخص کل', free: true, pro: true, ent: true },
                { name: 'سلامت بازار', free: true, pro: true, ent: true },
                { name: 'صفحه سهم', free: '۵ روزانه', pro: 'نامحدود', ent: 'نامحدود' },
                { name: 'اسکرینر', free: '۵ نتیجه', pro: 'نامحدود', ent: 'نامحدود' },
                { name: 'مقایسه سهم', free: '۱ روزانه', pro: 'نامحدود', ent: 'نامحدود' },
                { name: 'واچ‌لیست', free: '۵ سهم', pro: 'نامحدود', ent: 'نامحدود' },
                { name: 'بک‌تست', free: '۳/ماه', pro: 'نامحدود', ent: 'نامحدود' },
                { name: 'خروجی CSV', free: false, pro: true, ent: true },
                { name: 'دسترسی API', free: false, pro: false, ent: true },
                { name: 'تعداد کاربر', free: '۱', pro: '۱', ent: '۵' },
                { name: 'پشتیبانی', free: 'عادی', pro: 'اولویت‌دار', ent: 'اختصاصی' },
              ].map((row, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-white/5 transition-colors">
                  <td className="p-3 text-xs text-slate-200">{row.name}</td>
                  {[row.free, row.pro, row.ent].map((val, j) => (
                    <td key={j} className="p-3 text-center">
                      {val === true ? (
                        <div className="w-5 h-5 rounded-full bg-success/20 inline-flex items-center justify-center">
                          <Check className="w-3 h-3 text-success" strokeWidth={3} />
                        </div>
                      ) : val === false ? (
                        <div className="w-5 h-5 rounded-full bg-slate-700 inline-flex items-center justify-center">
                          <X className="w-3 h-3 text-slate-500" strokeWidth={3} />
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-white">{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-accent" /> سوالات متداول
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { q: 'چطور می‌تونم پلن رو ارتقا بدم؟', a: 'درگاه پرداخت به‌زودی فعال می‌شه. فعلاً برای پیش‌ثبت‌نام با ما تماس بگیرید.' },
            { q: 'امکان لغو اشتراک وجود داره؟', a: 'بله، هر زمان می‌تونید اشتراک خود را لغو کنید.' },
            { q: 'تخفیف سالانه چقدره؟', a: 'با پرداخت سالانه، ۲ ماه رایگان دریافت می‌کنید (۲۰٪ تخفیف).' },
            { q: 'روش پرداخت چیه؟', a: 'کارت به کارت، زرین‌پال و کریپتو (به‌زودی).' },
          ].map((faq, i) => (
            <div key={i} className="p-4 rounded-xl bg-bg/40 border border-border/40">
              <h3 className="text-xs font-bold text-white mb-2">{faq.q}</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="glass-strong p-6 md:p-10 rounded-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2">آماده شروع هستی؟</h2>
          <p className="text-sm text-slate-300 mb-5 max-w-xl mx-auto">
            همین حالا حساب رایگان بساز و از تحلیل هوشمند بازار بهره‌مند شو.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary text-sm px-6 py-3">
              <Star className="w-4 h-4" /> ساخت حساب رایگان
            </Link>
            <Link href="/contact" className="btn-secondary text-sm px-6 py-3">
              <MessageCircle className="w-4 h-4" /> تماس با ما
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
