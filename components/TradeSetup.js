'use client';
import { Target, Shield, Clock, TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react';

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function TradeSetup({ symbol, close, atr, atr_pct, prob, pe }) {
  if (!close) return null;

  // ATR-based or fallback to 3%/6%
  const atrValue = atr && atr > 0 ? atr : close * 0.02;
  const stopDistance = atrValue * 1.5;
  const targetDistance = atrValue * 3;

  const stop = Math.max(0, close - stopDistance);
  const target = close + targetDistance;
  const stopPct = ((stop - close) / close * 100);
  const targetPct = ((target - close) / close * 100);
  const rr = Math.abs(targetPct / stopPct);

  // Validity: 5 trading days from today
  const today = new Date();
  const validUntil = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const persianDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(validUntil);

  // Position size (1% portfolio risk)
  const riskPct = Math.abs(stopPct);
  const positionSizePct = riskPct > 0 ? Math.min(100, (1 / riskPct) * 100) : 0;

  // Confidence based on prob
  const isStrong = prob > 0.7;
  const isNeutral = prob > 0.4 && prob <= 0.7;
  const isWeak = prob <= 0.4;

  return (
    <div className="glass-strong rounded-2xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      <div className="relative p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary2 flex items-center justify-center">
              <Target className="w-4 h-4 text-bg" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">سناریوی معاملاتی</div>
              <div className="text-[10px] text-slate-400">بر اساس تحلیل Javid LM</div>
            </div>
          </div>
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
            isStrong ? 'bg-success/15 text-success border border-success/30' :
            isWeak ? 'bg-danger/15 text-danger border border-danger/30' :
            'bg-slate-500/15 text-slate-300 border border-slate-500/30'
          }`}>
            {isStrong ? 'اعتماد بالا' : isWeak ? 'اعتماد پایین' : 'اعتماد متوسط'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Entry */}
          <div className="bg-primary/8 border border-primary/25 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold text-primary">ورود</span>
            </div>
            <div className="num text-lg font-black text-white">{fmt(close)}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">قیمت فعلی</div>
          </div>

          {/* Stop Loss */}
          <div className="bg-danger/8 border border-danger/25 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Shield className="w-3.5 h-3.5 text-danger" />
              <span className="text-[10px] font-bold text-danger">حد ضرر</span>
            </div>
            <div className="num text-lg font-black text-white">{fmt(stop)}</div>
            <div className="text-[9px] text-danger mt-0.5">{stopPct.toFixed(1)}٪</div>
          </div>

          {/* Target */}
          <div className="bg-success/8 border border-success/25 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] font-bold text-success">هدف</span>
            </div>
            <div className="num text-lg font-black text-white">{fmt(target)}</div>
            <div className="text-[9px] text-success mt-0.5">+{targetPct.toFixed(1)}٪</div>
          </div>

          {/* R:R */}
          <div className="bg-accent/8 border border-accent/25 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] font-bold text-accent">R:R</span>
            </div>
            <div className="num text-lg font-black text-white">۱:{rr.toFixed(1)}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">ریسک به بازده</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg/40 border border-border/40 rounded-xl p-3 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-warning flex-shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400">اعتبار تحلیل</div>
              <div className="num text-xs font-bold text-white">تا {persianDate}</div>
            </div>
          </div>
          <div className="bg-bg/40 border border-border/40 rounded-xl p-3 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400">حجم پیشنهادی (ریسک ۱٪)</div>
              <div className="num text-xs font-bold text-white">{positionSizePct.toFixed(0)}٪ سرمایه</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 p-2.5 rounded-lg bg-warning/8 border border-warning/20">
          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-warning/90 leading-relaxed">
            این سناریو صرفاً یک تحلیل آموزشی است. قبل از هر معامله، شرایط بازار و تحمل ریسک خود را بررسی کنید.
          </p>
        </div>
      </div>
    </div>
  );
}
