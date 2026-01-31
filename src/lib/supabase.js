import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jicmhqadrvjspffktbzq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_avze5uv3ENzTRD-gRkbTjg_2WfXrXAq';

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