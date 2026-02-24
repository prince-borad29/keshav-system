import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Use a ref to track if we've completed the initial load
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
          isInitialized.current = true; // Mark as successfully loaded
        }
      }
    };

    // 1. Run the initial check once
    if (!isInitialized.current) {
       initializeAuth();
    }

    // 2. Listen for actual login/logout events (IGNORE background refreshes)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      // If the app hasn't finished its first load, let initializeAuth handle it
      if (!isInitialized.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      } 
      else if (event === 'SIGNED_IN') {
        // Only run the DB fetch if it's a completely new login event
        if (session?.user) {
           setUser(session.user);
           const { data } = await supabase
             .from('user_profiles')
             .select('*')
             .eq('id', session.user.id)
             .single();
             
           if (mounted && data) setProfile(data);
        }
      }
      // Notice what is missing: We completely ignore TOKEN_REFRESHED and USER_UPDATED.
      // Supabase handles the token in local storage automatically. 
      // We don't need to poke React and cause the ProtectedRoute to redirect you!
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 z-[9999]">
         <Loader2 className="animate-spin text-indigo-600 mb-4" size={42} />
         <p className="text-slate-500 font-bold text-sm tracking-widest uppercase animate-pulse">
           Verifying Secure Session...
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