'use client';
import { Activity, TrendingUp, TrendingDown, Minus, Sparkles, Brain, BarChart3, DollarSign } from 'lucide-react';

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function ComprehensiveAnalysis({ symbol, sig, ind, fund, chart }) {
  if (!chart || chart.length < 20) {
    return (
      <div className="glass p-6 rounded-2xl">
        <p className="text-sm text-slate-400">داده کافی برای تحلیل جامع موجود نیست.</p>
      </div>
    );
  }

  const closes = chart.map(r => r.c);
  const highs = chart.map(r => r.h);
  const lows = chart.map(r => r.l);
  const current = closes[closes.length - 1];
  const high60 = Math.max(...highs);
  const low60 = Math.min(...lows);
  const pos60 = ((current - low60) / (high60 - low60)) * 100;

  // ═══ Technical Score (0-100) ═══
  let techScore = 50;
  let techSignals = [];

  // RSI
  if (ind.rsi != null) {
    if (ind.rsi > 70) { techScore -= 15; techSignals.push({ label: 'RSI', value: `اشباع خرید (${ind.rsi.toFixed(0)})`, type: 'bear' }); }
    else if (ind.rsi < 30) { techScore += 15; techSignals.push({ label: 'RSI', value: `اشباع فروش (${ind.rsi.toFixed(0)})`, type: 'bull' }); }
    else if (ind.rsi > 55) { techScore += 5; techSignals.push({ label: 'RSI', value: `صعودی (${ind.rsi.toFixed(0)})`, type: 'bull' }); }
    else if (ind.rsi < 45) { techScore -= 5; techSignals.push({ label: 'RSI', value: `نزولی (${ind.rsi.toFixed(0)})`, type: 'bear' }); }
    else { techSignals.push({ label: 'RSI', value: `خنثی (${ind.rsi.toFixed(0)})`, type: 'neutral' }); }
  }

  // MACD
  if (ind.macd_hist != null) {
    if (ind.macd_hist > 0) { techScore += 10; techSignals.push({ label: 'MACD', value: 'صعودی', type: 'bull' }); }
    else { techScore -= 10; techSignals.push({ label: 'MACD', value: 'نزولی', type: 'bear' }); }
  }

  // ADX
  if (ind.adx != null) {
    if (ind.adx > 25) { techScore += 5; techSignals.push({ label: 'ADX', value: `روند قوی (${ind.adx.toFixed(0)})`, type: 'bull' }); }
    else { techSignals.push({ label: 'ADX', value: `روند ضعیف (${ind.adx.toFixed(0)})`, type: 'neutral' }); }
  }

  // Stochastic
  if (ind.stoch_k != null) {
    if (ind.stoch_k > 80) { techScore -= 8; techSignals.push({ label: 'Stoch', value: 'اشباع خرید', type: 'bear' }); }
    else if (ind.stoch_k < 20) { techScore += 8; techSignals.push({ label: 'Stoch', value: 'اشباع فروش', type: 'bull' }); }
  }

  // Position 60d
  if (pos60 > 80) { techScore -= 5; techSignals.push({ label: 'موقعیت', value: `نزدیک سقف (${pos60.toFixed(0)}٪)`, type: 'bear' }); }
  else if (pos60 < 20) { techScore += 5; techSignals.push({ label: 'موقعیت', value: `نزدیک کف (${pos60.toFixed(0)}٪)`, type: 'bull' }); }
  else { techSignals.push({ label: 'موقعیت', value: `${pos60.toFixed(0)}٪ از رنج`, type: 'neutral' }); }

  // MA20
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (current > ma20 * 1.02) { techScore += 8; techSignals.push({ label: 'MA20', value: 'بالاتر از میانگین', type: 'bull' }); }
  else if (current < ma20 * 0.98) { techScore -= 8; techSignals.push({ label: 'MA20', value: 'پایین‌تر از میانگین', type: 'bear' }); }

  techScore = Math.max(0, Math.min(100, techScore));

  // ═══ Fundamental Score (0-100) ═══
  let fundScore = null;
  let fundSignals = [];

  if (sig?.pe != null || fund?.estimatedEPS != null) {
    fundScore = 50;

    // P/E vs sector
    if (sig?.pe != null) {
      const stockPE = fund?.estimatedEPS ? current / parseFloat(fund.estimatedEPS) : null;
      if (stockPE != null) {
        const rel = stockPE / sig.pe;
        if (rel < 0.7) { fundScore += 20; fundSignals.push({ label: 'P/E سهم', value: `کمتر از صنعت (${stockPE.toFixed(1)} vs ${sig.pe.toFixed(1)})`, type: 'bull' }); }
        else if (rel > 1.3) { fundScore -= 20; fundSignals.push({ label: 'P/E سهم', value: `بیشتر از صنعت (${stockPE.toFixed(1)} vs ${sig.pe.toFixed(1)})`, type: 'bear' }); }
        else { fundSignals.push({ label: 'P/E سهم', value: `نزدیک صنعت (${stockPE.toFixed(1)} vs ${sig.pe.toFixed(1)})`, type: 'neutral' }); }
      }
    }

    // EPS
    if (sig?.eps) {
      const eps = parseFloat(sig.eps);
      if (eps > 0) { fundScore += 10; fundSignals.push({ label: 'EPS', value: `مثبت (${fmt(eps)} ریال)`, type: 'bull' }); }
      else if (eps < 0) { fundScore -= 15; fundSignals.push({ label: 'EPS', value: `منفی (${fmt(eps)} ریال)`, type: 'bear' }); }
    } else {
      fundSignals.push({ label: 'EPS', value: 'داده موجود نیست', type: 'neutral' });
    }

    fundScore = Math.max(0, Math.min(100, fundScore));
  }

  // ═══ Final Verdict ═══
  const totalScore = fundScore != null ? (techScore * 0.6 + fundScore * 0.4) : techScore;

  const getVerdict = () => {
    if (totalScore >= 70) return { label: 'چشم‌انداز مثبت', color: 'text-success', bg: 'bg-success/10', border: 'border-success/30', icon: TrendingUp };
    if (totalScore >= 40) return { label: 'چشم‌انداز خنثی', color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: Minus };
    return { label: 'چشم‌انداز منفی', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', icon: TrendingDown };
  };

  const verdict = getVerdict();
  const VerdictIcon = verdict.icon;

  const SignalRow = ({ item }) => {
    const colors = {
      bull: 'text-success bg-success/10',
      bear: 'text-danger bg-danger/10',
      neutral: 'text-slate-400 bg-slate-500/10',
    };
    return (
      <div className={`flex items-center justify-between p-2 rounded-lg ${colors[item.type]}`}>
        <span className="text-[10px] font-medium opacity-80">{item.label}</span>
        <span className="text-[11px] font-bold">{item.value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Verdict Hero */}
      <div className={`glass-strong p-6 rounded-2xl border-2 ${verdict.border} relative overflow-hidden`}>
        <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl ${verdict.bg}`} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-xl ${verdict.bg} border ${verdict.border} flex items-center justify-center`}>
              <VerdictIcon className={`w-6 h-6 ${verdict.color}`} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-0.5">تحلیل جامع Javid LM</div>
              <div className={`text-xl font-black ${verdict.color}`}>{verdict.label}</div>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> تکنیکال
                </span>
                <span className="num text-sm font-bold text-white">{techScore.toFixed(0)} / ۱۰۰</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-l from-primary to-primary2" style={{ width: `${techScore}%` }} />
              </div>
            </div>

            {fundScore != null && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> بنیادی
                  </span>
                  <span className="num text-sm font-bold text-white">{fundScore.toFixed(0)} / ۱۰۰</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-l from-accent to-warning" style={{ width: `${fundScore}%` }} />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> امتیاز نهایی
                </span>
                <span className={`num text-sm font-bold ${verdict.color}`}>{totalScore.toFixed(0)} / ۱۰۰</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${
                  totalScore >= 70 ? 'bg-gradient-to-l from-success to-primary' :
                  totalScore >= 40 ? 'bg-slate-500' : 'bg-danger'
                }`} style={{ width: `${totalScore}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-white">سیگنال‌های تکنیکال</h3>
          </div>
          <div className="space-y-2">
            {techSignals.map((s, i) => <SignalRow key={i} item={s} />)}
          </div>
        </div>

        <div className="glass p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-bold text-white">ارزیابی بنیادی</h3>
          </div>
          {fundSignals.length > 0 ? (
            <div className="space-y-2">
              {fundSignals.map((s, i) => <SignalRow key={i} item={s} />)}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-4 text-center">داده‌های بنیادی برای این سهم در دسترس نیست</p>
          )}
        </div>
      </div>
    </div>
  );
}
