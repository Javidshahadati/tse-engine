'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, Cpu, Database, Layers, Sparkles, Zap, ArrowLeft, Activity, Network, GitBranch } from 'lucide-react';

function NeuralNet() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(x => x + 1), 60);
    return () => clearInterval(id);
  }, []);

  const layers = [4, 6, 6, 3];
  const ns = 60, ls = 160, sx = 60, sy = 30;
  const nodes = [];
  layers.forEach((count, li) => {
    const lh = (count - 1) * ns;
    const oy = (240 - lh) / 2;
    for (let ni = 0; ni < count; ni++) {
      nodes.push({ id: `${li}-${ni}`, x: sx + li * ls, y: sy + oy + ni * ns, layer: li });
    }
  });

  const conns = [];
  layers.forEach((_, li) => {
    if (li >= layers.length - 1) return;
    const src = nodes.filter(n => n.layer === li);
    const dst = nodes.filter(n => n.layer === li + 1);
    src.forEach(s => dst.forEach(d => conns.push({ from: s, to: d })));
  });

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <svg viewBox="0 0 620 300" className="w-full">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="nodeGrad">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0e7490" />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {conns.map((c, i) => {
          const pr = ((t * 3 + i * 13) % 120) / 120;
          const cx = c.from.x + (c.to.x - c.from.x) * pr;
          const cy = c.from.y + (c.to.y - c.from.y) * pr;
          return (
            <g key={i}>
              <line x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} stroke="url(#lineGrad)" strokeWidth="1" />
              <circle cx={cx} cy={cy} r="2" fill="#06b6d4" opacity="0.9" filter="url(#glow)" />
            </g>
          );
        })}

        {nodes.map((n) => {
          const isIn = n.layer === 0;
          const isOut = n.layer === layers.length - 1;
          return (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r="14" fill={isOut ? '#10b981' : isIn ? '#8b5cf6' : 'url(#nodeGrad)'} opacity="0.15" filter="url(#glow)" />
              <circle cx={n.x} cy={n.y} r="9" fill={isOut ? '#10b981' : isIn ? '#8b5cf6' : 'url(#nodeGrad)'} stroke="#0f172a" strokeWidth="2" />
            </g>
          );
        })}

        <text x={sx} y={285} textAnchor="middle" fill="#64748b" fontSize="11">Input</text>
        <text x={sx + ls} y={285} textAnchor="middle" fill="#64748b" fontSize="11">Hidden</text>
        <text x={sx + 2 * ls} y={285} textAnchor="middle" fill="#64748b" fontSize="11">Hidden</text>
        <text x={sx + 3 * ls} y={285} textAnchor="middle" fill="#64748b" fontSize="11">Output</text>
      </svg>
    </div>
  );
}

export default function About() {
  return (
    <div className="relative">
      <section className="min-h-screen flex items-center justify-center px-4 py-20 relative overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-slate-300">درباره ما</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            <span className="gradient-text">Javid LM</span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-300 mb-3 font-medium">موتور یادگیری ماشین اختصاصی</p>
          <p className="text-base text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            Javid LM یک معماری چندلایه از مدل‌های یادگیری ماشین است که با ترکیب تکنیک‌های Gradient Boosting
            و تحلیل هم‌زمان ۱۰۴ فیچر تکنیکال و بنیادی، به امتیازدهی و پیش‌بینی الگوهای قیمتی در بازار سرمایه ایران می‌پردازد.
          </p>

          <div className="glass-strong glow-border p-6 md:p-10 rounded-2xl">
            <NeuralNet />
            <div className="grid grid-cols-3 gap-3 mt-8">
              {[
                { label: '۱۰۴', sub: 'فیچر ورودی', color: 'text-primary' },
                { label: '۲', sub: 'مدل پایه', color: 'text-accent' },
                { label: '۷۷٪', sub: 'دقت Walk-Forward', color: 'text-success' },
              ].map((s, i) => (
                <div key={i} className="text-center py-3 bg-bg/40 rounded-xl border border-border/50">
                  <div className={`num text-2xl font-bold ${s.color}`}>{s.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">معماری Javid LM</h2>
            <p className="text-slate-400">معماری چندلایه‌ی یادگیری ماشین</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Database, title: 'لایه داده', desc: 'استخراج و پردازش ۱۰۴ فیچر تکنیکال و بنیادی از ۶۰۲ سهم — شامل اندیکاتورهای کلاسیک، تحلیل ساختار بازار (RTM)، کنش قیمت (Price Action) و نسبت‌های بنیادی.', color: 'from-primary/20 to-primary/5', iconColor: 'text-primary' },
              { icon: Brain, title: 'موتور ترکیبی', desc: 'Javid LM یک ensemble دو لایه است: دو مدل Gradient Boosting به‌صورت موازی روی داده آموزش می‌بینند و خروجی احتمالاتی آن‌ها با روش میانگین‌گیری وزنی ترکیب می‌شود.', color: 'from-accent/20 to-accent/5', iconColor: 'text-accent' },
              { icon: Zap, title: 'لایه تصمیم', desc: 'امتیاز نهایی با اعمال فاز بازار (صعودی/مختلط/نزولی) و وزن‌دهی تطبیقی محاسبه می‌شود. این لایه تضمین می‌کند که مدل در شرایط مختلف بازار رفتار متناسبی داشته باشد.', color: 'from-success/20 to-success/5', iconColor: 'text-success' },
            ].map((x, i) => (
              <div key={i} className={`glass p-6 rounded-xl bg-gradient-to-br ${x.color}`}>
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-4">
                  <x.icon className={`w-6 h-6 ${x.iconColor}`} />
                </div>
                <h3 className="font-bold text-white mb-2">{x.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">چطور کار می‌کند؟</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { n: '۱', title: 'جمع‌آوری', desc: 'داده OHLCV از TSETMC', icon: Database },
              { n: '۲', title: 'محاسبه', desc: '۱۰۴ فیچر تکنیکال + بنیادی', icon: Cpu },
              { n: '۳', title: 'پیش‌بینی', desc: 'Javid LM ensemble', icon: Brain },
              { n: '۴', title: 'امتیازدهی', desc: 'خروجی ۰ تا ۱۰۰', icon: Activity },
            ].map((s, i) => (
              <div key={i} className="glass p-5 rounded-xl relative overflow-hidden text-center">
                <div className="num text-6xl font-black text-primary/10 absolute top-2 left-1/2 -translate-x-1/2">{s.n}</div>
                <div className="relative">
                  <s.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-bold text-white text-sm mb-1">{s.title}</h3>
                  <p className="text-[11px] text-slate-400">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="max-w-4xl mx-auto glass-strong glow-border p-10 md:p-16 rounded-3xl text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">آماده تحلیل هوشمند هستید؟</h2>
            <p className="text-slate-400 mb-8 max-w-xl mx-auto">همین حالا داشبورد کامل را باز کنید.</p>
            <Link href="/dashboard" className="btn-primary text-base px-10 py-4 inline-flex">
              <Activity className="w-5 h-5" /> شروع تحلیل
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
