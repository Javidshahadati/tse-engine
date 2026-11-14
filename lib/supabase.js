import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kmyosedodlcdnckfaods.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtteW9zZWRvZGxjZG5ja2Zhb2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDg4ODQsImV4cCI6MjExMDIyNDg4NH0.eQNsaDD-VcvF4i8hMNruACEcE7APbL0SyAbQpRE_Igc';

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
