import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase'; // Verify this path!

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async (userId) => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          // If error is "Row not found", we treat them as a new Viewer
          if (mounted) setProfile({ id: userId, role: 'viewer' });
        } else {
          if (mounted) setProfile(data);
        }
      } catch (err) {
        console.error("❌ Critical Error:");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Initialize Auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        if (session) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === 'admin';
  const canEdit = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'].includes(profile?.role);

  const value = useMemo(() => ({
    session,
    profile,
    loading,
    isAdmin,
    canEdit
  }), [session, profile, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}