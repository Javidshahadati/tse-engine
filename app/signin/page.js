'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AuthBackground from '@/components/AuthBackground';
import { Activity, Mail, Lock, Loader2, AlertTriangle, ArrowLeft, LogIn } from 'lucide-react';

export default function SigninPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.push('/profile');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('Invalid login')) setError('ایمیل یا رمز عبور اشتباه است');
      else if (msg.includes('Email not confirmed')) setError('ابتدا ایمیل خود را تأیید کنید');
      else setError(msg || 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-6 relative">
      <AuthBackground />

      <div className="relative w-full max-w-md my-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-primary mb-4 transition-colors">
          <ArrowLeft className="w-3 h-3 rotate-180" /> بازگشت
        </Link>

        <div className="glass-strong glow-border p-6 md:p-8 rounded-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-primary2 to-accent mx-auto mb-3 flex items-center justify-center shadow-lg shadow-primary/30">
              <Activity className="w-7 h-7 text-bg" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">خوش آمدید</h1>
            <p className="text-sm text-slate-400">به حساب خود وارد شوید</p>
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
                  placeholder="رمز عبور"
                  className="w-full bg-bg/60 rounded-lg py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-border/50 focus:border-primary/50"
                  disabled={loading} />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                loading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-l from-primary to-primary2 text-bg shadow-lg shadow-primary/30 hover:shadow-primary/50'
              }`}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> در حال ورود...</> : <><LogIn className="w-4 h-4" /> ورود</>}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-400">
              حساب نداری؟{' '}
              <Link href="/signup" className="text-primary font-bold hover:underline">ثبت‌نام</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
