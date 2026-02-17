import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Ref helps avoid stale closure issues in event listeners
  const isMounted = useRef(true);

  // --- Helper: Fetch Profile ---
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error("Profile Fetch Error:", error.message);
        
        // CRITICAL: If RLS recursion happens, stop trying.
        if (error.code === '42501' || error.message.includes('recursion')) {
            console.warn("Security Policy Error. Falling back to safe mode.");
            // Optional: Set a temporary "Guest" profile to prevent white screen
            if (isMounted.current) setProfile({ role: 'guest', id: userId }); 
        }
      } else {
        if (isMounted.current) setProfile(data);
      }
    } catch (err) {
      console.error("Unexpected Auth Error:", err);
    }
  };

  useEffect(() => {
    isMounted.current = true;

    // --- 1. Initial Boot ---
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          if (isMounted.current) setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (error) {
        console.error("Session Init Error:", error);
      } finally {
        // Stop loading only after initial check is done
        if (isMounted.current) setLoading(false);
      }
    };

    initAuth();

    // --- 2. Event Listener ---
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        // Only trigger loading if we are essentially "Logged Out" locally
        setUser(prev => {
          if (!prev) {
            // Fresh login
            fetchProfile(session.user.id);
            return session.user;
          }
          return prev; // Already logged in (Tab focus), do nothing
        });
      } 
      else if (event === 'SIGNED_OUT') {
        if (isMounted.current) {
          setUser(null);
          setProfile(null);
          // Do not set loading true here, just clear data
        }
      } 
      else if (event === 'TOKEN_REFRESHED') {
        if (isMounted.current) setUser(session?.user);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === 'admin';
  const isSanchalak = profile?.role === 'sanchalak';
  const isNirdeshak = profile?.role === 'nirdeshak';
  const isNirikshak = profile?.role === 'nirikshak';

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, isSanchalak, isNirdeshak, isNirikshak, loading }}>
      {children}
    </AuthContext.Provider>
  );
}