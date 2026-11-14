'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Calendar, LogOut, Shield, Star, ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-3 md:px-6 py-8">
        <div className="h-96 glass rounded-xl shimmer" />
      </div>
    );
  }

  if (!user) return null;

  const email = user.email || '';
  const initial = email ? email[0].toUpperCase() : '?';
  const name = user.user_metadata?.full_name || email.split('@')[0] || 'کاربر';
  const memberSince = new Date(user.created_at).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="max-w-4xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8 space-y-4 md:space-y-6">

      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-slate-400 hover:text-primary text-xs flex items-center gap-1">
          <ArrowLeft className="w-3 h-3 rotate-180" /> داشبورد
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-white font-bold text-sm">پروفایل</span>
      </div>

      {/* Hero Card */}
      <div className="glass-strong p-6 md:p-8 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-primary via-primary2 to-accent flex items-center justify-center text-bg text-4xl md:text-5xl font-black shadow-lg shadow-primary/30 flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 text-center md:text-right">
            <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{name}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-300 justify-center md:justify-start mb-2">
              <Mail className="w-3.5 h-3.5" /> {email}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 justify-center md:justify-start">
              <Calendar className="w-3 h-3" /> عضو از {memberSince}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link href="/watchlist" className="glass p-4 rounded-xl hover:border-primary/40 transition-colors group">
          <Star className="w-5 h-5 text-warning mb-2 group-hover:scale-110 transition-transform" />
          <div className="text-xs text-slate-400 mb-0.5">واچ‌لیست</div>
          <div className="text-sm font-bold text-white">سهم‌های ذخیره‌شده</div>
        </Link>
        <Link href="/backtest" className="glass p-4 rounded-xl hover:border-primary/40 transition-colors group">
          <Shield className="w-5 h-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
          <div className="text-xs text-slate-400 mb-0.5">بک‌تست</div>
          <div className="text-sm font-bold text-white">اجرای استراتژی‌ها</div>
        </Link>
        <div className="glass p-4 rounded-xl">
          <Settings className="w-5 h-5 text-accent mb-2" />
          <div className="text-xs text-slate-400 mb-0.5">اشتراک</div>
          <div className="text-sm font-bold text-white">رایگان</div>
        </div>
      </div>

      {/* Info Card */}
      <div className="glass-strong p-5 md:p-6 rounded-2xl">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-primary" /> اطلاعات حساب
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-xs text-slate-400">ایمیل</span>
            <span className="text-sm text-white font-mono break-all">{email}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-xs text-slate-400">نام نمایشی</span>
            <span className="text-sm text-white">{name}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border/30">
            <span className="text-xs text-slate-400">تاریخ عضویت</span>
            <span className="text-sm text-white">{memberSince}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-xs text-slate-400">شناسه کاربر</span>
            <span className="text-[10px] text-white font-mono truncate max-w-[150px]" title={user.id}>
              {user.id.slice(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="glass p-4 rounded-xl">
        <button onClick={handleSignOut}
          className="w-full py-3 rounded-lg bg-danger/10 border border-danger/30 text-danger font-bold flex items-center justify-center gap-2 hover:bg-danger/20 transition-colors">
          <LogOut className="w-4 h-4" /> خروج از حساب
        </button>
      </div>

      <div className="text-center text-[10px] text-slate-500">
        اطلاعات شما به‌صورت امن در Supabase ذخیره می‌شود.
      </div>
    </div>
  );
}
