import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';

export default function Login() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({ email: '', password: '' });

  // 🛑 SAFETY REDIRECT: Push to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user && profile) {
      navigate('/');
    }
  }, [user, profile, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;
      // Do not navigate here; AuthContext's onAuthStateChange handles it safely
    } catch (err) {
      console.error(err);
      setError(err.message === "Invalid login credentials" 
        ? "Incorrect email or password." 
        : "Login failed. Please try again.");
      setLoading(false);
    } 
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-md font-medium text-gray-900 focus:outline-none focus:border-[#5C3030] transition-colors placeholder:text-gray-400 text-sm";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sora selection:bg-[#5C3030]/20">
      <div className="bg-white w-full max-w-sm rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-200 overflow-hidden">
        
        {/* Brand Header */}
        <div className="bg-[#5C3030] p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Keshav Portal</h1>
          <p className="text-[#5C3030] text-xs text-white/80 font-semibold tracking-wide uppercase">Yuvak Mandal Systems</p>
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-5 text-center">Welcome Back</h2>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-md text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={16} strokeWidth={1.5} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} strokeWidth={1.5} />
                </div>
                <input
                  type="email"
                  required
                  className={inputClass}
                  placeholder="admin@keshav.app"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} strokeWidth={1.5} />
                </div>
                <input
                  type="password"
                  required
                  className={inputClass}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full mt-2 py-2.5" 
              disabled={loading || authLoading}
            >
              {(loading || authLoading) ? <><Loader2 size={16} className="animate-spin mr-2" /> Verifying...</> : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center border-t border-gray-100 pt-4">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
              Authorized Personnel Only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}