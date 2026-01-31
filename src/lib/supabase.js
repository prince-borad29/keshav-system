import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper to create a "Ghost Client" for user creation
// This client will NOT save the session, so the Admin stays logged in.
export const createGhostClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false, // 👈 THE MAGIC TRICK
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});