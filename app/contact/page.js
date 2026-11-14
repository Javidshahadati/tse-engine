'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Mail, Copy, Check, ChevronDown, HelpCircle, BookOpen,
  Sparkles, Handshake, User, MessageCircle, Zap, Shield, Activity,
  TrendingUp, Gauge, BarChart3, Target, Layers, Info
} from 'lucide-react';

const FAQS = [
  {
    q: 'آیا تحلیل‌های این اپ تضمین سود دارند؟',
    a: 'خیر. تمام تحلیل‌های TSE.Engine بر اساس الگوهای آماری گذشته و مدل‌های یادگیری ماشین هستند و هیچ تضمینی برای آینده نمی‌دهند. این اپ صرفاً یک ابزار آموزشی و پژوهشی است و مسئولیت هر تصمیم سرمایه‌گذاری کاملاً بر عهده کاربر است.',
  },
  {
    q: 'تفاوت «سلامت بازار» و «نبض بازار» چیست؟',
    a: '«سلامت بازار» یک معیار تکنیکال عینی است که درصد سهم‌های بالای میانگین متحرک ۲۰ روزه (MA20) را نشان می‌دهد. اما «نبض بازار» توزیع امتیازهای مدل Javid LM است که از ۶۸ فیچر تکنیکال و بنیادی محاسبه می‌شود. بنابراین ممکن است یک سهم از نظر تکنیکال بالای MA20 باشد ولی مدل آن را با ریسک بداند.',
  },
  {
    q: 'داده‌های این اپ از کجا می‌آیند؟',
    a: 'تمام داده‌های قیمتی و حجمی از API عمومی TSETMC (سایت رسمی بورس تهران) دریافت می‌شوند. داده‌های بنیادی مثل EPS و P/E نیز از همین منبع استخراج می‌شوند. هر شب به‌روزرسانی خودکار انجام می‌شود.',
  },
  {
    q: 'امتیاز Javid LM چطور محاسبه می‌شود؟',
    a: 'Javid LM یک ensemble از دو مدل یادگیری ماشین (XGBoost و LightGBM) است که با ۶۸ فیچر تکنیکال و بنیادی آموزش دیده. خروجی، یک احتمال بین ۰ تا ۱۰۰ است که نشان می‌دهد مدل چقدر به رشد سهم در ۵ روز آینده اطمینان دارد. هرچه بالاتر، توجه مدل بیشتر.',
  },
  {
    q: 'چرا بعضی سهم‌ها داده کامل ندارند؟',
    a: 'برخی سهم‌ها کمتر از ۲۵۰ روز سابقه معاملاتی دارند (تازه IPO شده‌اند یا مدت طولانی متوقف بوده‌اند). برای محاسبه دقیق اندیکاتورها حداقل ۲۰۰ روز داده لازم است. سهم‌هایی که این شرط را ندارند از تحلیل حذف می‌شوند.',
  },
  {
    q: 'آیا این اپ سیگنال خرید و فروش می‌دهد؟',
    a: 'خیر. TSE.Engine یک ابزار تحلیل است، نه سیگنال‌دهی. ما هیچ توصیه مستقیم برای خرید یا فروش ارائه نمی‌دهیم. کاربران با مشاهده داده‌ها، اندیکاتورها و تحلیل مدل، خودشان تصمیم می‌گیرند.',
  },
  {
    q: 'چطور از اپ استفاده کنم؟',
    a: 'از داشبورد شروع کنید و وضعیت کلی بازار را ببینید. سپس از اسکرینر برای پیدا کردن سهم‌های مورد نظر، از صفحه سهم برای تحلیل عمیق، از بک‌تست برای ارزیابی استراتژی‌ها و از واچ‌لیست برای پیگیری سهم‌های منتخب استفاده کنید.',
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button onClick={handleCopy}
      className={`p-2 rounded-lg transition-all ${copied ? 'bg-success/20 text-success' : 'glass text-slate-400 hover:text-primary hover:bg-primary/10'}`}
      title={copied ? 'کپی شد' : 'کپی'}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function FAQItem({ faq, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`glass rounded-xl overflow-hidden transition-all ${open ? 'border-primary/30' : ''}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-right hover:bg-white/5 transition-colors">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
          <span className="num text-xs font-bold text-primary">{index + 1}</span>
        </div>
        <span className="flex-1 text-sm font-bold text-white">{faq.q}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pr-14">
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{faq.a}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Animated avatar
function Avatar() {
  return (
    <div className="relative w-32 h-32 md:w-40 md:h-40 flex-shrink-0">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-primary2 to-accent blur-2xl opacity-40 animate-pulse" />
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-primary2 to-accent p-1">
        <div className="w-full h-full rounded-full bg-bg flex items-center justify-center overflow-hidden">
          <span className="num text-5xl md:text-6xl font-black gradient-text">JS</span>
        </div>
      </div>
      <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-success border-4 border-bg flex items-center justify-center">
        <Check className="w-3 h-3 text-bg" strokeWidth={3} />
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-10 space-y-6 md:space-y-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/" className="hover:text-primary">صفحه اصلی</Link>
        <span className="text-slate-600">/</span>
        <span className="text-white font-bold">تماس و همکاری</span>
      </div>

      {/* Hero: سازنده */}
      <div className="glass-strong rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative p-6 md:p-10">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
            <Avatar />
            <div className="flex-1 text-center md:text-right">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-[10px] text-primary mb-3">
                <User className="w-3 h-3" />
                درباره سازنده
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
                جاوید شهادتی
              </h1>
              <p className="text-base md:text-lg text-slate-300 mb-3">
                توسعه‌دهنده هوش مصنوعی و تحلیل کمی
              </p>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xl mb-4">
                سازنده TSE.Engine و مدل Javid LM. متخصص در ساخت سیستم‌های تحلیل داده‌محور،
                مدل‌های یادگیری ماشین و ابزارهای تحلیل بازار سرمایه.
              </p>

              <a href="mailto:Javidshahadati@gmail.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-l from-primary to-primary2 text-bg font-bold text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all">
                <Mail className="w-4 h-4" />
                ارسال ایمیل
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Email Contact */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary2 flex items-center justify-center">
            <Mail className="w-5 h-5 text-bg" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-white">تماس مستقیم</h2>
            <p className="text-[11px] text-slate-400">برای سوال، پیشنهاد یا همکاری</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 rounded-xl bg-bg/60 border border-border/50 hover:border-primary/30 transition-colors group">
          <Mail className="w-4 h-4 text-primary flex-shrink-0" />
          <a href="mailto:Javidshahadati@gmail.com"
            className="flex-1 text-sm md:text-base text-white font-medium hover:text-primary transition-colors break-all">
            Javidshahadati@gmail.com
          </a>
          <CopyButton text="Javidshahadati@gmail.com" />
        </div>

        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          پاسخ معمولاً طی ۲۴ تا ۴۸ ساعت کاری انجام می‌شود.
        </p>
      </div>

      {/* Learning: چرا سلامت بازار ≠ نبض بازار */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 bg-accent/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-bg" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-white">یادگیری</h2>
              <p className="text-[11px] text-slate-400">مفاهیمی که باید بدانید</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* سلامت بازار */}
            <div className="bg-success/8 border border-success/25 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-success" />
                </div>
                <h3 className="text-sm font-bold text-white">سلامت بازار</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                معیار <strong className="text-success">تکنیکال عینی</strong> — درصد سهم‌هایی که قیمتشان
                بالای میانگین متحرک ۲۰ روزه (MA20) است.
              </p>
              <div className="text-[10px] text-slate-400 bg-bg/40 rounded-lg p-2">
                <strong className="text-success">مثال:</strong> اگه ۷۷٪ سهم‌ها بالای MA20 باشند،
                یعنی روند عمومی صعودی است.
              </div>
            </div>

            {/* نبض بازار */}
            <div className="bg-primary/8 border border-primary/25 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-white">نبض بازار</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                توزیع امتیازهای <strong className="text-primary">مدل Javid LM</strong> — پیش‌بینی
                ML از احتمال رشد هر سهم در ۵ روز آینده.
              </p>
              <div className="text-[10px] text-slate-400 bg-bg/40 rounded-lg p-2">
                <strong className="text-primary">مثال:</strong> اگه ۱۴۶ سهم توجه بالا داشته باشند،
                یعنی مدل به آن‌ها اطمینان دارد — حتی اگه بازار کلی بالای MA20 نباشد.
              </div>
            </div>
          </div>

          {/* چرا متفاوت‌اند */}
          <div className="mt-4 p-4 rounded-xl bg-warning/8 border border-warning/25">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-warning" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-warning mb-1">چرا این دو عدد با هم فرق دارند؟</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  «سلامت بازار» فقط <strong className="text-white">روند قیمت</strong> را می‌بیند،
                  اما «نبض بازار» <strong className="text-white">۶۸ فاکتور دیگر</strong> مثل حجم،
                  مومنتوم، نسبت‌های بنیادی و ساختار بازار را هم در نظر می‌گیرد.
                  ممکن است بازار از نظر تکنیکال ضعیف باشد ولی مدل چند سهم را با پتانسیل رشد ببیند.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning to-accent flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-bg" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-white">سوالات متداول</h2>
            <p className="text-[11px] text-slate-400">{FAQS.length} سوال پرتکرار</p>
          </div>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <FAQItem key={i} faq={faq} index={i} />
          ))}
        </div>
      </div>

      {/* Collaboration */}
      <div className="glass-strong p-6 md:p-10 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-[10px] text-accent mb-3">
            <Handshake className="w-3 h-3" />
            همکاری
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">
            پیشنهاد همکاری داری؟
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl mx-auto mb-6 leading-relaxed">
            اگه ایده‌ای برای بهبود TSE.Engine داری، می‌خوای با ما همکاری کنی،
            یا پیشنهاد تجاری/سرمایه‌گذاری داری — خوشحال می‌شیم بشنویم.
          </p>
          <a href="mailto:Javidshahadati@gmail.com?subject=پیشنهاد همکاری - TSE.Engine"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-primary via-primary2 to-accent text-bg font-bold text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all">
            <MessageCircle className="w-4 h-4" />
            ارسال پیشنهاد
          </a>
        </div>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { href: '/dashboard', icon: BarChart3, label: 'داشبورد' },
          { href: '/breadth', icon: Gauge, label: 'سلامت بازار' },
          { href: '/screener', icon: Layers, label: 'اسکرینر' },
          { href: '/about', icon: Info, label: 'درباره Javid LM' },
        ].map((x, i) => (
          <Link key={i} href={x.href}
            className="glass p-4 rounded-xl hover:border-primary/40 hover:scale-105 transition-all text-center group">
            <x.icon className="w-5 h-5 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">{x.label}</div>
          </Link>
        ))}
      </div>

    </div>
  );
}
