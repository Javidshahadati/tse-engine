'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AuthBackground from '@/components/AuthBackground';
import TermsModal from '@/components/TermsModal';
import { Activity, Mail, Lock, Loader2, AlertTriangle, CheckCircle2, ArrowLeft, User, Check } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accepted) {
      setError('ابتدا شرایط استفاده را بپذیرید');
      return;
    }
    setError(null);
    if (password !== confirmPw) { setError('رمز عبور و تکرار آن یکسان نیست'); return; }
    if (password.length < 6) { setError('رمز عبور حداقل ۶ کاراکتر باشد'); return; }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });
      if (authError) throw authError;
      if (data.session) { router.push('/profile'); return; }
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'خطا در ثبت‌نام. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8 relative">
        <AuthBackground />
        <div className="relative glass-strong max-w-md w-full p-8 rounded-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-success/20 border border-success/40 mx-auto mb-4 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">ثبت‌نام موفق</h1>
          <p className="text-sm text-slate-300 mb-6">
            ایمیل تأیید برای <strong>{email}</strong> ارسال شد. لطفاً ایمیل خود را چک کنید.
          </p>
          <Link href="/signin" className="btn-primary inline-flex">رفتن به صفحه ورود</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-6 relative">
      <AuthBackground />
      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />

      <div className="relative w-full max-w-md my-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-primary mb-4 transition-colors">
          <ArrowLeft className="w-3 h-3 rotate-180" /> بازگشت
        </Link>

        <div className="glass-strong glow-border p-6 md:p-8 rounded-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-primary2 to-accent mx-auto mb-3 flex items-center justify-center shadow-lg shadow-primary/30">
              <Activity className="w-7 h-7 text-bg" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">ایجاد حساب</h1>
            <p className="text-sm text-slate-400">به TSE.Engine بپیوندید</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 mb-1.5 block">ایمیل</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-bg/60 rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/50 focus:border-primary/50"
                  disabled={loading} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 mb-1.5 block">رمز عبور</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                  className="w-full bg-bg/60 rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/50 focus:border-primary/50"
                  disabled={loading} minLength={6} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 mb-1.5 block">تکرار رمز عبور</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input type="password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="تکرار رمز"
                  className="w-full bg-bg/60 rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/50 focus:border-primary/50"
                  disabled={loading} minLength={6} />
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-bg/40 border border-border/40 cursor-pointer hover:border-primary/30 transition-colors">
              <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border ${accepted ? 'bg-primary border-primary' : 'border-slate-500'}`}>
                {accepted && <Check className="w-3 h-3 text-bg" strokeWidth={3} />}
              </div>
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="sr-only" />
              <span className="text-[11px] text-slate-300 leading-relaxed">
                <button type="button" onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                  className="text-primary font-bold hover:underline">
                  شرایط استفاده
                </button>
                {' '}را خوانده‌ام و می‌پذیرم که این اپ صرفاً ابزار تحلیل آموزشی است.
              </span>
            </label>

            <button type="submit" disabled={loading || !accepted}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                loading || !accepted ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-l from-primary to-primary2 text-bg shadow-lg shadow-primary/30 hover:shadow-primary/50'
              }`}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> در حال ثبت...</> : <><User className="w-4 h-4" /> ایجاد حساب</>}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-400">
              قبلاً ثبت‌نام کردی؟{' '}
              <Link href="/signin" className="text-primary font-bold hover:underline">ورود</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
