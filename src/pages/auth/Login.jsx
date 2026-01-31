import React, { useState , useEffect} from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-white">
      {/* Placeholder for Yoga Illustration */}
      <div className="mb-8 w-48 h-48 bg-blue-50 rounded-full flex items-center justify-center relative">
         <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[40px] border-b-[#002B3D]"></div>
         <div className="absolute top-10 w-8 h-8 bg-sky-500 rounded-full"></div>
      </div>

      <h1 className="text-2xl font-bold text-[#002B3D] mb-2">Keshav System</h1>
      <p className="text-gray-500 text-center text-sm mb-8">
        Streamline attendance tracking for multiple events.
      </p>

      <form onSubmit={handleLogin} className="w-full">
        <input
          type="text"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-4 mb-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#002B3D]"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-4 mb-6 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#002B3D]"
        />
        
        {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

        <button 
          disabled={loading}
          className="w-full p-4 bg-[#002B3D] text-white font-semibold rounded-lg disabled:opacity-70"
        >
          {loading ? 'Verifying...' : 'Login'}
        </button>
      </form>
    </div>
  );
}