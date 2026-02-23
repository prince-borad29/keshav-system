import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Variables');
}

// Create the Ghost Client ONCE here, not inside a component
export const ghostClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Stops the multiple client storage error
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey);