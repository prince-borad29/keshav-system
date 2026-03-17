import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const PROFILE_CACHE_KEY = 'keshav_profile_cache';
const PROFILE_CACHE_TTL = 1000 * 60 * 30;

const saveProfileCache = (profile) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      profile,
      cachedAt: Date.now(),
    }));
  } catch (_) {}
};

const loadProfileCache = (userId) => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const { profile, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > PROFILE_CACHE_TTL) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    if (profile?.id !== userId) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return profile;
  } catch (_) {
    return null;
  }
};

const clearProfileCache = () => {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) {}
};

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let currentUserId = null;

    const initialize = async () => {
      try {
        // getSession() reads localStorage — zero network, instant
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          currentUserId = session.user.id;

          // Load cached profile instantly — unblocks UI with no network call
          const cached = loadProfileCache(session.user.id);
          if (cached) {
            setProfile(cached);
            setLoading(false); // ← UI unblocks here instantly

            // Revalidate in background — don't await, don't block
            supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
              .then(({ data }) => {
                if (mounted && data) {
                  saveProfileCache(data);
                  setProfile(data);
                }
              });
          } else {
            // No cache — must fetch, but with a hard timeout
            const { data } = await Promise.race([
              supabase.from('user_profiles').select('*').eq('id', session.user.id).single(),
              new Promise((resolve) =>
                setTimeout(() => resolve({ data: null }), 8000)
              ),
            ]);

            if (mounted) {
              if (data) {
                saveProfileCache(data);
                setProfile(data);
              }
              setLoading(false);
            }
          }
        } else {
          // No session — not logged in
          setLoading(false);
        }
      } catch (err) {
        console.error('[AUTH] init error:', err.message);
        if (mounted) setLoading(false);
      }
    };

    initialize();

    // Listener handles changes AFTER init — login, logout, token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT' || !session?.user) {
          currentUserId = null;
          clearProfileCache();
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_IN' && session.user.id !== currentUserId) {
          currentUserId = session.user.id;
          setUser(session.user);

          const cached = loadProfileCache(session.user.id);
          if (cached) {
            setProfile(cached);
            // Background revalidate
            supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
              .then(({ data }) => {
                if (mounted && data) {
                  saveProfileCache(data);
                  setProfile(data);
                }
              });
          } else {
            const { data } = await Promise.race([
              supabase.from('user_profiles').select('*').eq('id', session.user.id).single(),
              new Promise((resolve) =>
                setTimeout(() => resolve({ data: null }), 8000)
              ),
            ]);
            if (mounted) {
              if (data) {
                saveProfileCache(data);
                setProfile(data);
              }
              setLoading(false);
            }
          }
        }

        // TOKEN_REFRESHED — silently update user, don't re-fetch profile
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Tab visibility — revalidate session silently
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          clearProfileCache();
          setUser(null);
          setProfile(null);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 z-[9999]">
        <Loader2 className="animate-spin text-[#5C3030] mb-3" size={32} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAdmin: profile?.role === 'admin',
      isProjectAdmin: profile?.role === 'project_admin',
      isSanchalak: profile?.role === 'sanchalak',
    }}>
      {children}
    </AuthContext.Provider>
  );
}