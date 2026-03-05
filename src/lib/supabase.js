import { createClient } from '@supabase/supabase-js';

const isProduction = import.meta.env.PROD;

const supabaseUrl = isProduction 
  ? `${window.location.origin}/supabase-api` 
  : import.meta.env.VITE_SUPABASE_URL;

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase Environment Variables!");
}

// 1. The Main Client (For the logged-in user)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// 2. The Ghost Client (For background account creation)
// We add a custom storageKey to silence the GoTrue warning permanently!
export const ghostClient = createClient(supabaseUrl, supabaseAnonKey, { 
  auth: { 
    persistSession: false, 
    autoRefreshToken: false,
    storageKey: 'ghost-client-auth-storage' 
  }
});

// 3. --- NETWORK TIMEOUT GUARD ---
// Wraps any database call in an 8-second stopwatch. Prevents infinite hanging.
export const withTimeout = (promise, ms = 8000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Network Timeout. Please check your connection.")), ms)
    )
  ]);
};