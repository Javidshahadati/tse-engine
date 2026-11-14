'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  Check, X, Crown, Star, ArrowLeft, Sparkles, Shield,
  BarChart3, Lock, MessageCircle, Rocket, Zap, TrendingUp
} from 'lucide-react';

const PLANS = [
  {
    id: 'free',
    name: 'رایگان',
    icon: Star,
    tagline: 'برای شروع',
    description: 'آشنایی با TSE.Engine و تحلیل پایه',
    accent: 'slate',
    gradient: 'from-slate-700/40 via-slate-800/20 to-transparent',
    iconBg: 'from-slate-600 to-slate-700',
    border: 'border-slate-600/50',
    badge: null,
    features: [
      { name: 'داشبورد کامل بازار', included: true },
      { name: 'شاخص کل و سلامت بازار', included: true },
      { name: 'صفحه سهم — ۵ سهم در روز', included: true },
      { name: 'اسکرینر — ۵ نتیجه', included: true },
      { name: 'مقایسه — ۱ در روز', included: true },
      { name: 'واچ‌لیست — ۵ سهم', included: true },
      { name: 'بک‌تست — ۳ بار در ماه', included: true },
      { name: 'دسترسی کامل ۶۰۲ سهم', included: false },
      { name: 'بک‌تست نامحدود', included: false },
      { name: 'خروجی CSV', included: false },
      { name: 'دسترسی API', included: false },
    ],
    cta: 'شروع رایگان',
    ctaLink: '/signup',
    ctaStyle: 'glass border border-slate-600/50 text-white hover:border-primary/50',
  },
  {
    id: 'pro',
    name: 'حرفه‌ای',
    icon: Crown,
    tagline: 'محبوب‌ترین',
    description: 'برای تریدرهای جدی و حرفه‌ای',
    accent: 'primary',
    gradient: 'from-primary/15 via-accent/10 to-transparent',
    iconBg: 'from-primary to-accent',
    border: 'border-primary/60',
    badge: 'پرطرفدار',
    popular: true,
    features: [
      { name: 'داشبورد کامل بازار', included: true },
      { name: 'شاخص کل و سلامت بازار', included: true },
      { name: 'تمام ۶۰۲ سهم — نامحدود', included: true },
      { name: 'اسکرینر کامل', included: true },
      { name: 'مقایسه نامحدود', included: true },
      { name: 'واچ‌لیست نامحدود', included: true },
      { name: 'بک‌تست نامحدود', included: true },
      { name: 'خروجی CSV', included: true },
      { name: 'پشتیبانی اولویت‌دار', included: true },
      { name: 'دسترسی API', included: false },
    ],
    cta: 'به‌زودی',
    ctaLink: null,
    ctaStyle: 'bg-gradient-to-l from-primary via-primary2 to-accent text-bg',
  },
  {
    id: 'enterprise',
    name: 'سازمانی',
    icon: Rocket,
    tagline: 'برای تیم‌ها',
    description: 'برای شرکت‌ها و تیم‌های سرمایه‌گذاری',
    accent: 'accent',
    gradient: 'from-accent/15 via-primary/10 to-transparent',
    iconBg: 'from-accent to-primary',
    border: 'border-accent/50',
    badge: null,
    features: [
      { name: 'همه قابلیت‌های حرفه‌ای', included: true },
      { name: 'دسترسی API کامل', included: true },
      { name: '۵ کاربر همزمان', included: true },
      { name: 'پشتیبانی اختصاصی', included: true },
      { name: 'آموزش و راه‌اندازی', included: true },
      { name: 'گزارش‌های سفارشی', included: true },
    ],
    cta: 'تماس بگیر',
    ctaLink: '/contact',
    ctaStyle: 'glass border border-accent/50 text-white hover:border-accent',
  },
];

const COMPARISON = [
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
];

function PlanCard({ plan }) {
  const Icon = plan.icon;
  const popular = plan.popular;
  return (
    <div className={`relative flex flex-col h-full rounded-2xl border-2 ${plan.border} overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
      popular ? 'shadow-2xl shadow-primary/25 md:scale-[1.02] md:z-10' : ''
    }`}>
      {/* Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${plan.gradient}`} />
      {popular && (
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
      )}

      {/* Content */}
      <div className="relative p-5 md:p-6 flex flex-col h-full">
        {/* Badge */}
        {plan.badge && (
          <div className="absolute top-4 left-4 z-10">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
              popular
                ? 'bg-gradient-to-l from-primary to-accent text-bg shadow-lg shadow-primary/40'
                : 'bg-white/10 text-white border border-white/20 backdrop-blur'
            }`}>
              {popular && <Sparkles className="w-2.5 h-2.5" />}
              {plan.badge}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mt-6 mb-5">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.iconBg} flex items-center justify-center mb-3 shadow-lg`}>
            <Icon className="w-7 h-7 text-bg" strokeWidth={2.5} />
          </div>
          <h3 className="text-xl font-black text-white mb-1">{plan.name}</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">{plan.description}</p>
        </div>

        {/* Price */}
        <div className="mb-5 pb-5 border-b border-white/10 min-h-[80px] flex flex-col justify-center">
          {plan.id === 'free' ? (
            <>
              <div className="text-3xl font-black text-white">رایگان</div>
              <div className="text-[10px] text-slate-400 mt-1">برای همیشه</div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="num text-3xl font-black text-slate-500">—</span>
                <span className="text-xs text-slate-400 font-medium">به‌زودی</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">قیمت‌گذاری در حال نهایی‌سازی</div>
            </>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-5 flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[11px]">
              {f.included ? (
                <span className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 text-success" strokeWidth={3} />
                </span>
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-700/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <X className="w-2.5 h-2.5 text-slate-500" strokeWidth={3} />
                </span>
              )}
              <span className={f.included ? 'text-slate-200 leading-snug' : 'text-slate-500 line-through leading-snug'}>
                {f.name}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        {plan.ctaLink ? (
          <Link href={plan.ctaLink}
            className={`block w-full py-3 rounded-xl font-bold text-sm text-center transition-all hover:opacity-90 ${plan.ctaStyle}`}>
            {plan.cta}
          </Link>
        ) : (
          <button disabled
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 opacity-80 cursor-not-allowed ${plan.ctaStyle}`}>
            <Lock className="w-3.5 h-3.5" />
            {plan.cta}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const [billing, setBilling] = useState('monthly');

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-12 space-y-8 md:space-y-12">

        {/* Hero */}
        <div className="text-center relative">
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl -z-10 pointer-events-none" />

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-[10px] text-primary mb-4">
            <Sparkles className="w-3 h-3" />
            پلن‌های اشتراک
          </div>

          <h1 className="text-3xl md:text-5xl font-black mb-3 leading-tight">
            <span className="gradient-text">قدرت تحلیل حرفه‌ای</span>
          </h1>
          <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed mb-6">
            پلن مناسب خود را انتخاب کنید — از کاربر رایگان تا تیم حرفه‌ای
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl glass border border-border/50">
            <button onClick={() => setBilling('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                billing === 'monthly' ? 'bg-primary text-bg shadow-lg shadow-primary/30' : 'text-slate-400 hover:text-white'
              }`}>
              ماهانه
            </button>
            <button onClick={() => setBilling('yearly')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                billing === 'yearly' ? 'bg-primary text-bg shadow-lg shadow-primary/30' : 'text-slate-400 hover:text-white'
              }`}>
              سالانه
              <span className="px-1.5 py-0.5 rounded-full bg-success/20 text-success text-[9px]">۲۰٪ تخفیف</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {PLANS.map(plan => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Comparison Table */}
        <div className="glass-strong rounded-2xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-border/40">
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              مقایسه کامل قابلیت‌ها
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-border/40 bg-white/5">
                  <th className="text-right p-3 text-[10px] text-slate-400 font-semibold">قابلیت</th>
                  <th className="text-center p-3 text-[10px] text-slate-400 font-semibold">رایگان</th>
                  <th className="text-center p-3 text-[10px] text-primary font-bold bg-primary/5">حرفه‌ای</th>
                  <th className="text-center p-3 text-[10px] text-slate-400 font-semibold">سازمانی</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-white/5 transition-colors">
                    <td className="p-3 text-xs text-slate-200">{row.name}</td>
                    {[row.free, row.pro, row.ent].map((val, j) => (
                      <td key={j} className={`p-3 text-center ${j === 1 ? 'bg-primary/5' : ''}`}>
                        {val === true ? (
                          <span className="w-5 h-5 rounded-full bg-success/20 inline-flex items-center justify-center">
                            <Check className="w-3 h-3 text-success" strokeWidth={3} />
                          </span>
                        ) : val === false ? (
                          <span className="w-5 h-5 rounded-full bg-slate-700 inline-flex items-center justify-center">
                            <X className="w-3 h-3 text-slate-500" strokeWidth={3} />
                          </span>
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
        <div className="glass-strong p-5 md:p-8 rounded-2xl">
          <h2 className="text-base md:text-lg font-bold text-white mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-accent" />
            سوالات متداول
          </h2>
          <div className="grid md:grid-cols-2 gap-3 md:gap-4">
            {[
              { q: 'چطور می‌تونم پلن رو ارتقا بدم؟', a: 'درگاه پرداخت به‌زودی فعال می‌شه. برای پیش‌ثبت‌نام با ما تماس بگیرید.' },
              { q: 'امکان لغو اشتراک وجود داره؟', a: 'بله، هر زمان می‌تونید اشتراک خود را لغو کنید.' },
              { q: 'تخفیف سالانه چقدره؟', a: 'با پرداخت سالانه، ۲ ماه رایگان دریافت می‌کنید (۲۰٪ تخفیف).' },
              { q: 'روش پرداخت چیه؟', a: 'کارت به کارت، زرین‌پال و کریپتو (به‌زودی).' },
            ].map((faq, i) => (
              <div key={i} className="p-4 rounded-xl bg-bg/40 border border-border/40 hover:border-primary/30 transition-colors">
                <h3 className="text-xs font-bold text-white mb-2">{faq.q}</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="glass-strong p-6 md:p-10 rounded-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">آماده شروع هستی؟</h2>
            <p className="text-sm text-slate-300 mb-5 max-w-xl mx-auto leading-relaxed">
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
    </div>
  );
}
