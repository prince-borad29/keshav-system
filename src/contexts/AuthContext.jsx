import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Ref tracking to prevent React 18 strict mode double-fetches
  const isInitialized = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          if (mounted) setUser(session.user);
          
          const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
            
          if (mounted && data) setProfile(data);
        }
      } catch (error) {
        console.error("Auth initialization failed:", error);
      } finally {
        if (mounted) {
          setLoading(false);
          isInitialized.current = true;
        }
      }
    };

    if (!isInitialized.current) {
       initializeAuth();
    }

    // Supabase Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted || !isInitialized.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      } 
      else if (event === 'SIGNED_IN' && session?.user) {
         setUser(session.user);
         const { data } = await supabase
           .from('user_profiles')
           .select('*')
           .eq('id', session.user.id)
           .single();
           
         if (mounted && data) setProfile(data);
      }
      // Note: We safely ignore 'TOKEN_REFRESHED' to prevent UI thrashing
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-50 z-[9999] font-sora">
         <Loader2 className="animate-spin text-[#5C3030] mb-3" size={32} strokeWidth={1.5} />
         <p className="text-gray-500 font-semibold text-[10px] tracking-widest uppercase animate-pulse">
           Verifying Security...
         </p>
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
      isSanchalak: profile?.role === 'sanchalak'
    }}>
      {children}
    </AuthContext.Provider>
  );
}