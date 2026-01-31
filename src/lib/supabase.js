import { createClient } from '@supabase/supabase-js';

// 1. Load Keys
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 2. Main Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 3. Ghost Client (This automatically sends the API Key)
export const createGhostClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
};