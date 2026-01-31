import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Shield, CheckCircle, Copy, RefreshCw, Smartphone 
} from 'lucide-react';
import { supabase, createGhostClient } from '../../lib/supabase';

export default function UserManagement() {
  const [activeUsers, setActiveUsers] = useState([]);
  const [hierarchy, setHierarchy] = useState({ kshetras: [], mandals: [] });
  const [loading, setLoading] = useState(false);
  
  // Success State (To show the credentials card)
  const [createdUser, setCreatedUser] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'sanchalak', // Default
    gender: 'Male',
    kshetra_id: '',
    mandal_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. Fetch Active Profiles
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    setActiveUsers(profiles || []);

    // 2. Fetch Hierarchy
    const { data: kData } = await supabase.from('kshetras').select('*');
    const { data: mData } = await supabase.from('mandals').select('*');
    setHierarchy({ kshetras: kData || [], mandals: mData || [] });
  };

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // No ambiguous chars like i,l,1,o,0
    let pass = "Keshav@";
    for (let i = 0; i < 4; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pass }));
  };

  const handleCreateUser = async () => {
    if (!formData.email || !formData.password) return alert("Email and Password required");
    
    setLoading(true);
    setCreatedUser(null);

    try {
      // 1. Prepare the Invite Data (This tells the DB what role to give)
      const inviteData = {
        email: formData.email.toLowerCase(),
        role: formData.role,
        gender: formData.gender,
        kshetra_id: formData.role === 'nirdeshak' ? formData.kshetra_id : null,
        mandal_id: ['nirikshak', 'sanchalak'].includes(formData.role) ? formData.mandal_id : null
      };

      // 2. Insert into 'app_invitations' FIRST
      // The database trigger we wrote earlier will watch for the new user and apply these details.
      const { error: inviteError } = await supabase.from('app_invitations').insert([inviteData]);
      if (inviteError) throw inviteError;

      // 3. Create the Auth User using "Ghost Client"
      const ghost = createGhostClient();
      const { data: authData, error: authError } = await ghost.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;

      // 4. Success! Show the "Share Credentials" card
      setCreatedUser({
        email: formData.email,
        password: formData.password,
        role: formData.role
      });
      
      // Reset Form
      setFormData({ ...formData, email: '', password: '' });
      fetchData(); // Refresh list

    } catch (err) {
      alert("Error creating user: " + err.message);
      // Clean up invite if auth failed (optional but good practice)
      await supabase.from('app_invitations').delete().eq('email', formData.email);
    } finally {
      setLoading(false);
    }
  };

  const getWhatsAppLink = () => {
    if (!createdUser) return '';
    const text = `*Welcome to Keshav App!*%0A%0AHere are your login details:%0A👤 *Email:* ${createdUser.email}%0A🔑 *Password:* ${createdUser.password}%0A%0APlease login here:%0Ahttps://your-app-url.com`;
    return `https://wa.me/?text=${text}`;
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* 1. SUCCESS CARD (Shown after creation) */}
      {createdUser && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-full text-green-600"><CheckCircle size={32} /></div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-green-800">User Created Successfully!</h3>
              <p className="text-green-700 text-sm mb-4">Share these credentials with the {createdUser.role} immediately.</p>
              
              <div className="bg-white p-4 rounded-xl border border-green-200 font-mono text-sm space-y-2 select-all">
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-bold text-slate-800">{createdUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Password:</span>
                  <span className="font-bold text-[#002B3D]">{createdUser.password}</span>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                 <a 
                   href={getWhatsAppLink()} 
                   target="_blank" 
                   rel="noreferrer"
                   className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-lg font-bold hover:shadow-lg transition-all"
                 >
                   <Smartphone size={18} /> Share via WhatsApp
                 </a>
                 <button onClick={() => navigator.clipboard.writeText(`Email: ${createdUser.email}\nPassword: ${createdUser.password}`)} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-50">
                   <Copy size={18} /> Copy
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. CREATION FORM */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-[#002B3D] mb-4 flex items-center gap-2">
          <UserPlus size={20} className="text-sky-500"/> Provision New User
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Role Selection */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Role</label>
            <select 
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value})}
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500 font-medium"
            >
              <option value="sanchalak">Sanchalak (Mandal Leader)</option>
              <option value="nirikshak">Nirikshak (Mandal Supervisor)</option>
              <option value="nirdeshak">Nirdeshak (Kshetra Leader)</option>
              <option value="taker">Attendance Taker</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Gender Scope */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Gender Scope</label>
            <select 
              value={formData.gender}
              onChange={e => setFormData({...formData, gender: e.target.value})}
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500 font-medium"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* Conditional: Kshetra */}
          {formData.role === 'nirdeshak' && (
            <div className="space-y-1 animate-in fade-in">
              <label className="text-xs font-bold text-slate-400 uppercase">Assign Region</label>
              <select 
                value={formData.kshetra_id}
                onChange={e => setFormData({...formData, kshetra_id: e.target.value})}
                className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500"
              >
                <option value="">Select Kshetra...</option>
                {hierarchy.kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          )}

          {/* Conditional: Mandal */}
          {['nirikshak', 'sanchalak'].includes(formData.role) && (
            <div className="space-y-1 animate-in fade-in">
              <label className="text-xs font-bold text-slate-400 uppercase">Assign Mandal</label>
              <select 
                value={formData.mandal_id}
                onChange={e => setFormData({...formData, mandal_id: e.target.value})}
                className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500"
              >
                <option value="">Select Mandal...</option>
                {hierarchy.mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1 lg:col-start-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Email Address</label>
            <input 
              type="email" 
              placeholder="e.g. rajkot.west@keshav.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500"
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Password</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Secure Password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="flex-1 p-3 bg-slate-50 border rounded-xl outline-none focus:border-sky-500 font-mono"
              />
              <button 
                onClick={generatePassword}
                title="Generate Random Password"
                className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-end">
            <button 
              onClick={handleCreateUser}
              disabled={loading}
              className={`w-full p-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#0b3d52] transition-colors flex justify-center items-center gap-2 ${loading ? 'opacity-70 cursor-wait' : ''}`}
            >
              {loading ? 'Creating...' : <><Shield size={18} /> Create & Generate Keys</>}
            </button>
          </div>
        </div>
      </div>

      {/* 3. EXISTING USERS TABLE */}
      <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase mb-3 px-2">Active Team Members ({activeUsers.length})</h3>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b">
              <tr>
                <th className="p-4">Role</th>
                <th className="p-4">Assigned To</th>
                <th className="p-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeUsers.map(user => {
                 // Resolve Mandal/Kshetra Name (Optional: Needs lookup, or just show ID for now)
                 // For now, let's show simpler logic
                 let scope = 'Global Access';
                 if (user.mandal_id) scope = 'Mandal Specific';
                 else if (user.kshetra_id) scope = 'Kshetra Specific';
                 else if (user.role === 'taker') scope = 'Task Specific';

                 return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-md font-bold text-xs uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-600'}`}>
                        {user.role}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">{user.id.slice(0,8)}...</div>
                    </td>
                    <td className="p-4 text-slate-600 font-medium">
                      {scope}
                      <div className="text-xs text-slate-400">{user.gender}</div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="inline-flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full">
                        <CheckCircle size={12}/> Active
                      </div>
                    </td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}