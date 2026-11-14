import { supabase } from './supabase';

export async function checkAndIncrement(feature, limit) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'NOT_AUTHENTICATED' };

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('usage_limits')
    .select('id, use_count')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .eq('used_date', today)
    .maybeSingle();

  if (error) return { allowed: false, reason: 'DB_ERROR' };

  if (!data) {
    const { error: insErr } = await supabase
      .from('usage_limits')
      .insert({ user_id: user.id, feature, used_date: today, use_count: 1 });
    if (insErr) return { allowed: false, reason: 'DB_ERROR' };
    return { allowed: true, count: 1, limit };
  }

  if (data.use_count >= limit) return { allowed: false, reason: 'LIMIT_REACHED', count: data.use_count, limit };

  const { error: updErr } = await supabase
    .from('usage_limits')
    .update({ use_count: data.use_count + 1 })
    .eq('id', data.id);
  if (updErr) return { allowed: false, reason: 'DB_ERROR' };

  return { allowed: true, count: data.use_count + 1, limit };
}

export async function checkUniqueStockView(symbol, limit) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'NOT_AUTHENTICATED' };

  const today = new Date().toISOString().split('T')[0];

  // آیا این سهم قبلاً امروز دیده شده؟
  const { data: existing } = await supabase
    .from('stock_views')
    .select('id')
    .eq('user_id', user.id)
    .eq('symbol', symbol)
    .eq('view_date', today)
    .maybeSingle();

  if (existing) {
    return { allowed: true, alreadyViewed: true };
  }

  // چند سهم یکتا دیده شده امروز؟
  const { data: views, error } = await supabase
    .from('stock_views')
    .select('symbol')
    .eq('user_id', user.id)
    .eq('view_date', today);

  if (error) return { allowed: false, reason: 'DB_ERROR' };

  const count = views?.length || 0;
  if (count >= limit) {
    return { allowed: false, reason: 'LIMIT_REACHED', count, limit };
  }

  // ثبت سهم جدید
  const { error: insErr } = await supabase
    .from('stock_views')
    .insert({ user_id: user.id, symbol, view_date: today });

  if (insErr) return { allowed: false, reason: 'DB_ERROR' };

  return { allowed: true, count: count + 1, limit };
}

export async function getUsage(feature) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('usage_limits')
    .select('use_count')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .eq('used_date', today)
    .maybeSingle();
  return data?.use_count || 0;
}

export async function checkMonthlyIncrement(feature, limit) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'NOT_AUTHENTICATED' };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('usage_limits')
    .select('id, use_count')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .eq('used_date', monthStart)
    .maybeSingle();

  if (error) return { allowed: false, reason: 'DB_ERROR' };

  if (!data) {
    const { error: insErr } = await supabase
      .from('usage_limits')
      .insert({ user_id: user.id, feature, used_date: monthStart, use_count: 1 });
    if (insErr) return { allowed: false, reason: 'DB_ERROR' };
    return { allowed: true, count: 1, limit };
  }

  if (data.use_count >= limit) return { allowed: false, reason: 'LIMIT_REACHED', count: data.use_count, limit };

  const { error: updErr } = await supabase
    .from('usage_limits')
    .update({ use_count: data.use_count + 1 })
    .eq('id', data.id);
  if (updErr) return { allowed: false, reason: 'DB_ERROR' };

  return { allowed: true, count: data.use_count + 1, limit };
}
