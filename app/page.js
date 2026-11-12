'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, BarChart3, Brain, Database, Newspaper,
  TrendingUp, Shield, Zap, LineChart, Layers, Sparkles,
  AlertTriangle, CheckCircle2
} from 'lucide-react';

function useCountUp(target, duration = 2200, start = 0) {
  const [value, setValue] = useState(start);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min((t - t0) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.floor(start + (target - start) * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration, start]);

  return [value, ref];
}

function HeroChart() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Fake sparkline data
  const points = [20, 25, 22, 35, 30, 45, 42, 55, 60, 58, 70, 68, 80, 85, 92, 88, 95];
  const width = 400;
  const height = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / (max - min)) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const areaPath = path + ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      {mounted && (
        <>
          <path d={areaPath} fill="url(#chartGrad)" opacity={mounted ? 1 : 0}
                style={{ transition: 'opacity 1s ease 0.5s' }} />
          <path d={path} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="1000" strokeDashoffset={mounted ? 0 : 1000}
                style={{ transition: 'stroke-dashoffset 2s ease' }} />
        </>
      )}
    </svg>
  );
}

function DemoCard() {
  const [indexVal, indexRef] = useCountUp(2456789, 2400, 0);

  return (
    <div ref={indexRef} className="glass-strong glow-border p-6 rounded-2xl max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-slate-400 mb-1">شاخص کل بورس تهران</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-4xl md:text-5xl font-bold text-white">{indexVal.toLocaleString('fa-IR')}</span>
            <span className="text-success text-sm font-semibold flex items-center gap-1">
              <TrendingUp className="w-4 h-4" /> +۲.۳۴٪
            </span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary2/20 border border-primary/30 flex items-center justify-center">
          <LineChart className="w-6 h-6 text-primary" />
        </div>
      </div>
      <HeroChart />
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          { label: '۶۰۶', sub: 'سهم تحلیل‌شده', color: 'text-primary' },
          { label: '۹۹', sub: 'فیچر مدل', color: 'text-accent' },
          { label: '۷۷٪', sub: 'دقت Walk-Forward', color: 'text-success' },
        ].map((s, i) => (
          <div key={i} className="text-center py-3 bg-bg/40 rounded-lg border border-border/50">
            <div className={`num text-2xl font-bold ${s.color}`}>{s.label}</div>
            <div className="text-[10px] text-slate-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionObserver({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}>
      {children}
    </div>
  );
}

export default function Home() {
  const FEATURES = [
    { icon: Brain, title: 'موتور یادگیری ماشین', desc: 'ترکیب XGBoost + LightGBM با ۹۹ فیچر تکنیکال و بنیادی برای تحلیل دقیق.' },
    { icon: LineChart, title: 'چارت تعاملی همه سهم‌ها', desc: 'نمودار OHLCV حرفه‌ای برای ۶۰۶ سهم با سطوح کلیدی و فیبوناچی.' },
    { icon: Layers, title: 'تحلیل صنایع', desc: 'دسته‌بندی کامل صنایع با آمار تفکیکی و تحلیل درون‌صنعتی.' },
    { icon: Newspaper, title: 'اخبار بازار', desc: 'آخرین اخبار اقتصادی از معتبرترین منابع، به‌روزرسانی خودکار.' },
    { icon: Shield, title: 'تحلیل ریسک', desc: 'سطوح حمایت و مقاومت، ATR، نوسان و ارزیابی ریسک هر سهم.' },
    { icon: Zap, title: 'Real/Legal Flow', desc: 'حجم خرید و فروش حقیقی و حقوقی، تشخیص پول هوشمند.' },
    { icon: Database, title: 'EPS و P/E', desc: 'داده‌های بنیادی از TSETMC شامل EPS، P/E سهم و صنعت.' },
    { icon: TrendingUp, title: 'شاخص کل بازار', desc: 'تاریخچه ۲۰ ساله شاخص کل با تحلیل تکنیکال کامل.' },
  ];

  const STATS = [
    { value: 606, label: 'سهم تحلیل‌شده', suffix: '' },
    { value: 99, label: 'فیچر مدل', suffix: '' },
    { value: 4, label: 'سال تست Walk-Forward', suffix: '' },
    { value: 77, label: 'درصد دقت مدل', suffix: '٪' },
  ];

  return (
    <div className="relative">
      {/* ═══ HERO ═══ */}
      <section className="min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
        {/* Decorative orbs */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-slate-300">موتور تحلیل هوشمند نسل جدید</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight">
            <span className="gradient-text">TSE.Engine</span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-300 mb-3 font-medium">
            موتور تحلیل هوشمند بورس تهران
          </p>
          <p className="text-base md:text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            تحلیل داده‌محور بازار سرمایه ایران با موتور یادگیری ماشین —
            <span className="text-primary font-semibold"> ۶۰۶ سهم، ۹۹ فیچر تکنیکال و بنیادی، ۲۰ سال تاریخچه شاخص کل</span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <Link href="/dashboard" className="btn-primary text-base px-8 py-4">
              <BarChart3 className="w-5 h-5" />
              ورود به داشبورد
            </Link>
            <a href="#about" className="btn-secondary text-base px-8 py-4">
              درباره ما
              <ArrowLeft className="w-5 h-5" />
            </a>
          </div>

          <DemoCard />
        </div>
      </section>

      {/* ═══ ABOUT ═══ */}
      <section id="about" className="section relative">
        <div className="max-w-5xl mx-auto">
          <SectionObserver>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-primary mb-4">
                <Activity className="w-3.5 h-3.5" />
                درباره ما
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="gradient-text-2">تحلیل بورس ایران</span>
                <br />
                <span className="text-white">با دقت داده‌محور</span>
              </h2>
              <p className="text-slate-400 max-w-3xl mx-auto leading-relaxed text-lg">
                TSE.Engine یک ابزار تحلیل تکنیکال و بنیادی برای بازار سرمایه ایران است که با ترکیب الگوریتم‌های
                یادگیری ماشین، داده‌های TSETMC و اخبار اقتصادی، تحلیل جامع و شفافی از ۶۰۶ سهم ارائه می‌دهد.
                این پروژه توسط <span className="text-primary font-semibold">جاوید شهادتی</span> توسعه یافته است.
              </p>
            </div>
          </SectionObserver>

          <SectionObserver>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {STATS.map((s, i) => {
                const [v, ref] = useCountUp(s.value, 1800);
                return (
                  <div key={i} ref={ref} className="glass p-6 text-center rounded-xl hover:border-primary/30 transition-colors">
                    <div className="num text-4xl font-bold gradient-text mb-2">
                      {v.toLocaleString('fa-IR')}{s.suffix}
                    </div>
                    <div className="text-xs text-slate-400">{s.label}</div>
                  </div>
                );
              })}
            </div>
          </SectionObserver>

          <div className="mt-16 grid md:grid-cols-3 gap-4">
            {[
              { icon: Brain, title: 'موتور ML', desc: 'XGBoost + LightGBM' },
              { icon: Database, title: 'داده', desc: 'TSETMC + کدال + اخبار' },
              { icon: Shield, title: 'اعتبار', desc: 'Walk-Forward Validation' },
            ].map((x, i) => (
              <SectionObserver key={i}>
                <div className="glass p-6 rounded-xl flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <x.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-white mb-1">{x.title}</div>
                    <div className="text-sm text-slate-400">{x.desc}</div>
                  </div>
                </div>
              </SectionObserver>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="section relative">
        <div className="max-w-6xl mx-auto">
          <SectionObserver>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-accent mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                ویژگی‌ها
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                همه‌چیز برای تحلیل حرفه‌ای
              </h2>
              <p className="text-slate-400">ابزارهای کامل تحلیل تکنیکال و بنیادی در یک پلتفرم</p>
            </div>
          </SectionObserver>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <SectionObserver key={i}>
                <div className="glass p-6 rounded-xl h-full hover:border-primary/40 hover:scale-[1.02] transition-all group cursor-default">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-white mb-2 text-sm">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              </SectionObserver>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="section relative">
        <div className="max-w-5xl mx-auto">
          <SectionObserver>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">چطور کار می‌کند؟</h2>
              <p className="text-slate-400">سه مرحله ساده تا تحلیل حرفه‌ای</p>
            </div>
          </SectionObserver>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: '۱', title: 'انتخاب سهم یا صنعت', desc: 'از داشبورد کامل ۶۰۶ سهم یا لیست صنایع، سهم مورد نظر خود را انتخاب کنید.' },
              { n: '۲', title: 'مشاهده تحلیل جامع', desc: 'چارت، اندیکاتورها، سطوح کلیدی، فیبوناچی، داده‌های بنیادی و اخبار را یک‌جا ببینید.' },
              { n: '۳', title: 'تصمیم‌گیری آگاهانه', desc: 'با تکیه بر داده‌های شفاف و تحلیل شفاف، خودتان تصمیم نهایی را بگیرید.' },
            ].map((s, i) => (
              <SectionObserver key={i}>
                <div className="glass p-6 rounded-xl relative overflow-hidden">
                  <div className="num text-7xl font-black text-primary/10 absolute top-2 left-4">
                    {s.n}
                  </div>
                  <div className="relative">
                    <div className="num text-2xl font-bold gradient-text mb-3">{s.n}</div>
                    <h3 className="font-bold text-white mb-2">{s.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </SectionObserver>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="section">
        <SectionObserver>
          <div className="max-w-4xl mx-auto glass-strong glow-border p-10 md:p-16 rounded-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                آماده تحلیل هوشمند هستید؟
              </h2>
              <p className="text-slate-400 mb-8 max-w-xl mx-auto">
                همین حالا داشبورد کامل را باز کنید و تحلیل ۶۰۶ سهم بورس تهران را ببینید.
              </p>
              <Link href="/dashboard" className="btn-primary text-base px-10 py-4 inline-flex">
                <BarChart3 className="w-5 h-5" />
                شروع تحلیل
              </Link>
            </div>
          </div>
        </SectionObserver>
      </section>

      {/* ═══ DISCLAIMER ═══ */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/5 border border-danger/20">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger/90 leading-relaxed">
              <strong className="block mb-1">⚠️ هشدار مهم</strong>
              این تحلیل صرفاً آموزشی است و نه توصیه معاملاتی. TSE.Engine هیچ توصیه‌ای برای خرید یا فروش ارائه نمی‌دهد.
              مسئولیت هرگونه تصمیم‌گیری سرمایه‌گذاری کاملاً بر عهده کاربر است.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
