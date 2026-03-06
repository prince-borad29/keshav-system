import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 100% Native, Direct Connection
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const ghostClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// 🛡️ THE INDUSTRY-GRADE TIMEOUT
// This safely guarantees that NO network request in your app will ever hang infinitely.
export const withTimeout = async (promise, ms = 15000) => {
  return new Promise((resolve, reject) => {
    // Start the kill-switch timer
    const timer = setTimeout(() => {
      reject(new Error("Network Timeout. Please check your connection."));
    }, ms);

    // Resolve the Supabase query
    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer); // If it succeeds, cancel the kill-switch
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer); // If it fails natively, cancel the kill-switch
        reject(error);
      });
  });
};