'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, BarChart3, Brain, Database, Newspaper,
  TrendingUp, Shield, Zap, LineChart, Layers, Sparkles, AlertTriangle
} from 'lucide-react';

// ═══ Live Neural Engine Visualization ═══
function LiveEngine() {
  const [tick, setTick] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setSignalCount(c => (c + 1) % 6), 1500);
    return () => clearInterval(id);
  }, []);

  // 3 layers of nodes
  const inputNodes = 8;
  const hiddenNodes = 6;
  const outputNodes = 3;
  const w = 500;
  const h = 220;

  const inputY = Array.from({ length: inputNodes }, (_, i) => 30 + i * 22);
  const hiddenY = Array.from({ length: hiddenNodes }, (_, i) => 40 + i * 28);
  const outputY = Array.from({ length: outputNodes }, (_, i) => 70 + i * 40);

  const inputX = 60, hiddenX = 250, outputX = 440;

  // Animated particles along connections
  const particles = [];
  for (let i = 0; i < inputNodes; i++) {
    for (let j = 0; j < hiddenNodes; j++) {
      if ((i + j) % 3 === 0) {
        const progress = ((tick * 2 + i * 10 + j * 7) % 100) / 100;
        particles.push({
          x1: inputX, y1: inputY[i],
          x2: hiddenX, y2: hiddenY[j],
          progress,
        });
      }
    }
  }
  for (let i = 0; i < hiddenNodes; i++) {
    for (let j = 0; j < outputNodes; j++) {
      if ((i + j) % 2 === 0) {
        const progress = ((tick * 2 + i * 12 + j * 9) % 100) / 100;
        particles.push({
          x1: hiddenX, y1: hiddenY[i],
          x2: outputX, y2: outputY[j],
          progress,
        });
      }
    }
  }

  const signalLabels = ['در حال پردازش...', 'RSI: +۲.۳', 'MACD: صعودی', 'امتیاز: ۸۹', 'سیگنال: توجه بالا', 'ذخیره...'];

  return (
    <div className="relative">
      <div className="glass-strong glow-border rounded-2xl p-4 md:p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-slate-400">Javid LM — Live</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-primary font-mono">
            <Activity className="w-3 h-3" />
            {signalLabels[signalCount]}
          </div>
        </div>

        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: '260px' }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" x2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.15" />
            </linearGradient>
            <radialGradient id="nodeGlow">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
            <filter id="glow2">
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          {/* Connections */}
          {inputY.map((y1, i) => hiddenY.map((y2, j) => (
            <line key={`ih-${i}-${j}`} x1={inputX} y1={y1} x2={hiddenX} y2={y2}
              stroke="url(#lineGrad)" strokeWidth="0.8" opacity={((i + j) % 3 === 0) ? 0.7 : 0.15} />
          )))}
          {hiddenY.map((y1, i) => outputY.map((y2, j) => (
            <line key={`ho-${i}-${j}`} x1={hiddenX} y1={y1} x2={outputX} y2={y2}
              stroke="url(#lineGrad)" strokeWidth="0.8" opacity={((i + j) % 2 === 0) ? 0.7 : 0.15} />
          )))}

          {/* Particles */}
          {particles.map((p, i) => {
            const x = p.x1 + (p.x2 - p.x1) * p.progress;
            const y = p.y1 + (p.y2 - p.y1) * p.progress;
            return (
              <circle key={i} cx={x} cy={y} r="2.2" fill="#06b6d4" opacity="0.95" filter="url(#glow2)" />
            );
          })}

          {/* Nodes */}
          {inputY.map((y, i) => (
            <g key={`in-${i}`}>
              <circle cx={inputX} cy={y} r="8" fill="#8b5cf6" opacity="0.2" filter="url(#glow2)" />
              <circle cx={inputX} cy={y} r="5" fill="#8b5cf6" stroke="#0a1428" strokeWidth="1.5" />
            </g>
          ))}
          {hiddenY.map((y, i) => {
            const pulse = Math.sin((tick + i * 5) * 0.15) * 0.3 + 0.7;
            return (
              <g key={`hd-${i}`}>
                <circle cx={hiddenX} cy={y} r="8" fill="#06b6d4" opacity={pulse * 0.3} filter="url(#glow2)" />
                <circle cx={hiddenX} cy={y} r="5" fill="#06b6d4" stroke="#0a1428" strokeWidth="1.5" opacity={pulse} />
              </g>
            );
          })}
          {outputY.map((y, i) => {
            const colors = ['#10b981', '#f59e0b', '#f43f5e'];
            return (
              <g key={`out-${i}`}>
                <circle cx={outputX} cy={y} r="9" fill={colors[i]} opacity="0.25" filter="url(#glow2)" />
                <circle cx={outputX} cy={y} r="6" fill={colors[i]} stroke="#0a1428" strokeWidth="1.5" />
              </g>
            );
          })}

          {/* Labels */}
          <text x={inputX} y={h - 8} textAnchor="middle" fill="#64748b" fontSize="9">داده خام</text>
          <text x={hiddenX} y={h - 8} textAnchor="middle" fill="#64748b" fontSize="9">پردازش</text>
          <text x={outputX} y={h - 8} textAnchor="middle" fill="#64748b" fontSize="9">تصمیم</text>
        </svg>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'در حال تحلیل', value: '۶۰۶ سهم', color: 'text-primary' },
            { label: 'میانگین زمان', value: '۰.۸ ثانیه', color: 'text-accent' },
            { label: 'دقت مدل', value: '۷۷٪', color: 'text-success' },
          ].map((s, i) => (
            <div key={i} className="text-center py-2 bg-bg/60 rounded-lg border border-border/40">
              <div className="text-[9px] text-slate-500 mb-0.5">{s.label}</div>
              <div className={`num text-sm font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    { icon: Brain, title: 'موتور Javid LM', desc: 'ensemble چندلایه از مدل‌های یادگیری ماشین با ۹۹ فیچر تکنیکال و بنیادی.' },
    { icon: LineChart, title: 'چارت تعاملی ۶۰۶ سهم', desc: 'نمودار OHLCV حرفه‌ای با سطوح کلیدی و فیبوناچی.' },
    { icon: Layers, title: 'تحلیل صنایع', desc: 'دسته‌بندی کامل صنایع با آمار تفکیکی.' },
    { icon: Newspaper, title: 'اخبار بازار', desc: 'آخرین اخبار اقتصادی از معتبرترین منابع.' },
    { icon: Shield, title: 'تحلیل ریسک', desc: 'سطوح حمایت و مقاومت، ATR، نوسان.' },
    { icon: Zap, title: 'Real/Legal Flow', desc: 'حجم خرید و فروش حقیقی و حقوقی، پول هوشمند.' },
    { icon: Database, title: 'EPS و P/E', desc: 'داده‌های بنیادی از TSETMC.' },
    { icon: TrendingUp, title: 'شاخص کل بازار', desc: 'تاریخچه ۲۰ ساله شاخص با تحلیل تکنیکال.' },
  ];

  const STATS = [
    { value: 606, label: 'سهم تحلیل‌شده', suffix: '' },
    { value: 99, label: 'فیچر مدل', suffix: '' },
    { value: 4, label: 'سال Walk-Forward', suffix: '' },
    { value: 77, label: 'درصد دقت', suffix: '٪' },
  ];

  return (
    <div className="relative">
      {/* HERO */}
      <section className="min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
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

          <p className="text-xl md:text-2xl text-slate-300 mb-3 font-medium">موتور تحلیل هوشمند بورس تهران</p>
          <p className="text-base md:text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            تحلیل داده‌محور بازار سرمایه ایران با موتور Javid LM —
            <span className="text-primary font-semibold"> ۶۰۶ سهم، ۹۹ فیچر تکنیکال و بنیادی، ۲۰ سال تاریخچه شاخص</span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <Link href="/dashboard" className="btn-primary text-base px-8 py-4">
              <BarChart3 className="w-5 h-5" /> ورود به داشبورد
            </Link>
            <a href="#features" className="btn-secondary text-base px-8 py-4">
              ویژگی‌ها <ArrowLeft className="w-5 h-5" />
            </a>
          </div>

          <LiveEngine />
        </div>
      </section>

      {/* STATS */}
      <section className="section relative">
        <div className="max-w-5xl mx-auto">
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
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="section relative">
        <div className="max-w-6xl mx-auto">
          <SectionObserver>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-accent mb-4">
                <Sparkles className="w-3.5 h-3.5" /> ویژگی‌ها
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">همه‌چیز برای تحلیل حرفه‌ای</h2>
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

      {/* CTA */}
      <section className="section">
        <SectionObserver>
          <div className="max-w-4xl mx-auto glass-strong glow-border p-10 md:p-16 rounded-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">آماده تحلیل هوشمند هستید؟</h2>
              <p className="text-slate-400 mb-8 max-w-xl mx-auto">همین حالا داشبورد کامل را باز کنید.</p>
              <Link href="/dashboard" className="btn-primary text-base px-10 py-4 inline-flex">
                <BarChart3 className="w-5 h-5" /> شروع تحلیل
              </Link>
            </div>
          </div>
        </SectionObserver>
      </section>
    </div>
  );
}
