'use client';
import { Sparkles, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, Lightbulb } from 'lucide-react';

function fmt(n, d = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fa-IR', { maximumFractionDigits: d });
}

export default function RiskProfile({ chart, close, sig, ind, fund }) {
  if (!chart || chart.length < 20 || !close) return null;

  const contribs = [];

  // RSI
  if (ind?.rsi != null) {
    let impact = 0, label = '', type = 'neu';
    if (ind.rsi > 70) { impact = -8; label = 'اشباع خرید'; type = 'neg'; }
    else if (ind.rsi < 30) { impact = +12; label = 'اشباع فروش'; type = 'pos'; }
    else if (ind.rsi > 55) { impact = +8; label = 'صعودی'; type = 'pos'; }
    else if (ind.rsi < 45) { impact = -5; label = 'نزولی'; type = 'neg'; }
    else { impact = 0; label = 'خنثی'; type = 'neu'; }
    contribs.push({ name: 'RSI', value: `${ind.rsi.toFixed(1)} (${label})`, impact, type });
  }

  // MACD
  if (ind?.macd_hist != null) {
    const impact = ind.macd_hist > 0 ? +10 : -10;
    contribs.push({ name: 'MACD', value: ind.macd_hist > 0 ? 'هیستوگرام مثبت' : 'هیستوگرام منفی', impact, type: impact > 0 ? 'pos' : 'neg' });
  }

  // ADX
  if (ind?.adx != null) {
    const impact = ind.adx > 25 ? +6 : -5;
    contribs.push({ name: 'ADX', value: `${ind.adx.toFixed(1)} (${ind.adx > 25 ? 'روند قوی' : 'روند ضعیف'})`, impact, type: impact > 0 ? 'pos' : 'neg' });
  }

  // Stochastic
  if (ind?.stoch_k != null) {
    let impact = 0, type = 'neu';
    if (ind.stoch_k > 80) { impact = -6; type = 'neg'; }
    else if (ind.stoch_k < 20) { impact = +6; type = 'pos'; }
    if (impact !== 0) contribs.push({ name: 'Stochastic', value: `${ind.stoch_k.toFixed(1)}٪`, impact, type });
  }

  // MA20
  const ma20 = chart.slice(-20).reduce((a, b) => a + b.c, 0) / 20;
  if (close > ma20 * 1.02) {
    contribs.push({ name: 'MA20', value: `بالاتر از ${fmt(ma20)}`, impact: +5, type: 'pos' });
  } else if (close < ma20 * 0.98) {
    contribs.push({ name: 'MA20', value: `پایین‌تر از ${fmt(ma20)}`, impact: -5, type: 'neg' });
  }

  // EPS
  if (sig?.eps) {
    const eps = parseFloat(sig.eps);
    if (eps > 0) contribs.push({ name: 'EPS', value: `مثبت (${fmt(eps)} ریال)`, impact: +3, type: 'pos' });
    else if (eps < 0) contribs.push({ name: 'EPS', value: `منفی (${fmt(eps)} ریال)`, impact: -5, type: 'neg' });
  }

  const positives = contribs.filter(c => c.impact > 0).reduce((a, b) => a + b.impact, 0);
  const negatives = contribs.filter(c => c.impact < 0).reduce((a, b) => a + b.impact, 0);
  const netScore = Math.max(0, Math.min(100, 50 + positives + negatives));

  const verdict = netScore >= 70 ? { label: 'سیگنال قوی', color: 'text-success', icon: TrendingUp } :
                  netScore >= 40 ? { label: 'سیگنال خنثی', color: 'text-slate-300', icon: Minus } :
                  { label: 'سیگنال ضعیف', color: 'text-danger', icon: TrendingDown };
  const VerdictIcon = verdict.icon;

  // "If" scenarios
  const scenarios = [];
  if (ind?.rsi != null) {
    if (ind.rsi > 55) scenarios.push({ if: 'RSI به زیر ۵۰ برگردد', then: 'قدرت سیگنال صعودی کاهش می‌یابد' });
    else if (ind.rsi < 45) scenarios.push({ if: 'RSI به بالای ۵۰ برسد', then: 'سیگنال صعودی تقویت می‌شود' });
  }
  if (ind?.macd_hist != null) {
    if (ind.macd_hist > 0) scenarios.push({ if: 'MACD هیستوگرام منفی شود', then: 'روند به خنثی/نزولی تغییر می‌کند' });
    else scenarios.push({ if: 'MACD هیستوگرام مثبت شود', then: 'سیگنال صعودی ایجاد می‌شود' });
  }
  if (ind?.supports?.[0]) {
    scenarios.push({ if: `قیمت زیر ${fmt(ind.supports[0])} برود`, then: 'سناریوی نزولی فعال می‌شود' });
  }
  if (ind?.resistances?.[0]) {
    scenarios.push({ if: `قیمت مقاومت ${fmt(ind.resistances[0])} را بشکند`, then: 'سیگنال صعودی تقویت می‌شود' });
  }

  return (
    <div className="space-y-3 md:space-y-4">

      {/* Why this score */}
      <div className="glass-strong p-4 md:p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-accent/8 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-bg" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">چرا امتیاز {Math.round(sig?.prob * 100 || netScore)}؟</div>
                <div className="text-[10px] text-slate-300">تجزیه و تحلیل عوامل مؤثر</div>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
              netScore >= 70 ? 'bg-success/15 text-success' : netScore >= 40 ? 'bg-slate-500/15 text-slate-300' : 'bg-danger/15 text-danger'
            }`}>
              <VerdictIcon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">{verdict.label}</span>
            </div>
          </div>

          {/* Contributions */}
          <div className="space-y-1.5 mb-4">
            {contribs.filter(c => c.impact !== 0).map((c, i) => (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg ${
                c.type === 'pos' ? 'bg-success/10 border border-success/20' :
                c.type === 'neg' ? 'bg-danger/10 border border-danger/20' :
                'bg-slate-500/10 border border-slate-500/20'
              }`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    c.type === 'pos' ? 'bg-success/20 text-success' :
                    c.type === 'neg' ? 'bg-danger/20 text-danger' :
                    'bg-slate-500/20 text-slate-300'
                  }`}>
                    {c.type === 'pos' ? <TrendingUp className="w-3 h-3" /> : c.type === 'neg' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-white truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-300 truncate">{c.value}</div>
                  </div>
                </div>
                <div className={`num text-xs font-black flex-shrink-0 ${
                  c.impact > 0 ? 'text-success' : 'text-danger'
                }`}>
                  {c.impact > 0 ? '+' : ''}{c.impact}
                </div>
              </div>
            ))}
            {contribs.filter(c => c.impact === 0).map((c, i) => (
              <div key={`n${i}`} className="flex items-center justify-between p-2 rounded-lg bg-slate-500/5 border border-slate-500/15">
                <div className="flex items-center gap-2">
                  <Minus className="w-3 h-3 text-slate-500" />
                  <div className="text-[10px] text-slate-300">{c.name}: {c.value}</div>
                </div>
                <span className="num text-[10px] text-slate-500">۰</span>
              </div>
            ))}
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-bg/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400 mb-0.5">پایه</div>
              <div className="num text-sm font-bold text-slate-300">۵۰</div>
            </div>
            <div className="bg-success/10 rounded-lg p-2 text-center">
              <div className="text-[9px] text-success/80 mb-0.5">تأثیر مثبت</div>
              <div className="num text-sm font-bold text-success">+{positives}</div>
            </div>
            <div className="bg-danger/10 rounded-lg p-2 text-center">
              <div className="text-[9px] text-danger/80 mb-0.5">تأثیر منفی</div>
              <div className="num text-sm font-bold text-danger">{negatives}</div>
            </div>
          </div>

          {/* Final score bar */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-300 mb-1.5">
              <span className="font-semibold">امتیاز نهایی</span>
              <span className={`num font-bold ${verdict.color}`}>{netScore.toFixed(0)} / ۱۰۰</span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full ${
                netScore >= 70 ? 'bg-gradient-to-l from-success to-primary' :
                netScore >= 40 ? 'bg-slate-500' : 'bg-danger'
              }`} style={{ width: `${netScore}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* If scenarios */}
      {scenarios.length > 0 && (
        <div className="glass p-4 md:p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-bold text-white">اگر شرایط زیر رخ دهد...</h3>
          </div>
          <div className="space-y-2">
            {scenarios.map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-bg/40 border border-border/40">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold flex-shrink-0 mt-0.5">اگر</span>
                <div className="flex-1">
                  <div className="text-xs text-white font-medium mb-0.5">{s.if}</div>
                  <div className="text-[11px] text-slate-300">← {s.then}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
