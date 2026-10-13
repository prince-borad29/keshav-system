import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const PROFILE_CACHE_KEY = 'keshav_profile_cache';
const PROFILE_CACHE_TTL = 1000 * 60 * 30;

const saveProfileCache = (profile) => {
  try {
    const sanitized = {
      ...profile,
      cachedAt: Date.now(),
    };
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(sanitized));
  } catch (_) {}
};

const loadProfileCache = (userId) => {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const { id, cachedAt } = cached;
    if (Date.now() - cachedAt > PROFILE_CACHE_TTL) {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    if (id !== userId) {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return cached;
  } catch (_) {
    return null;
  }
};

const clearProfileCache = () => {
  try { 
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY); // Also clear old localStorage if exists
  } catch (_) {}
};

const fetchFullProfile = async (userId) => {
  for (let i = 0; i < 3; i++) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,email,full_name,gender,role,assigned_kshetra_id,assigned_mandal_id')
      .eq('id', userId)
      .abortSignal(AbortSignal.timeout(8000))
      .maybeSingle();            // no row => data null, not an error
    if (!error) return data;
    await new Promise((r) => setTimeout(r, 400 * 2 ** i + Math.random() * 300));
  }
  return null;
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

          const cached = loadProfileCache(session.user.id);
          if (cached) {
            setProfile(cached);
            setLoading(false);

            fetchFullProfile(session.user.id).then((data) => {
              if (mounted && data) {
                saveProfileCache(data);
                setProfile(data);
              }
            });
          } else {
            const data = await fetchFullProfile(session.user.id);

            if (mounted) {
              if (data) {
                saveProfileCache(data);
                setProfile(data);
              } else {
                setProfile(null);
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
    const { data: { subscription } } =
  supabase.auth.onAuthStateChange((event, session) => {
    if (!mounted) return;

    if (event === "SIGNED_OUT" || !session?.user) {
      currentUserId = null;
      clearProfileCache();
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    if (event === "TOKEN_REFRESHED") {
      setUser(session.user);
      return;
    }

    if (
      event === "SIGNED_IN" &&
      session.user.id !== currentUserId
    ) {
      currentUserId = session.user.id;
      setUser(session.user);

      // Do not await Supabase queries inside this callback.
      setTimeout(async () => {
        if (!mounted) return;

        const cached = loadProfileCache(session.user.id);

        if (cached) {
          setProfile(cached);
          setLoading(false);
          return;
        }

        const data = await fetchFullProfile(session.user.id);

        if (!mounted || currentUserId !== session.user.id) return;

        if (data) {
          saveProfileCache(data);
          setProfile(data);
        } else {
          setProfile(null);
        }

        setLoading(false);
      }, 0);
    }
  });

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