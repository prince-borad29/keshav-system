import { createClient } from '@supabase/supabase-js';

// 1. Check if we are in Production (Vercel) or Local Development
const isProduction = import.meta.env.PROD;

// 2. Use Vercel Proxy in Prod (bypasses ISP blocks). Use direct URL locally.
const supabaseUrl = isProduction 
  ? `${window.location.origin}/supabase-api` 
  : import.meta.env.VITE_SUPABASE_URL;

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase Environment Variables!");
}

// 3. Export a single, constant instance of the client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});