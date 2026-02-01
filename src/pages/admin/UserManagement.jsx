import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, CheckCircle, RefreshCw, Trash2, Search, 
  Link as LinkIcon, X, Copy, Globe, List, Edit2, Save, Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js'; // ✅ Import for isolated auth
import { useAuth } from '../../contexts/AuthContext';

export default function UserManagement() {
  const { profile } = useAuth();
  
  // Data State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Search & Selection
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);

  // Form State
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'create' | 'edit' | 'success'
  const [createdUsersList, setCreatedUsersList] = useState([]); // Stores bulk created creds

  const [formData, setFormData] = useState({
    id: null, // For Edit Mode
    role: 'sanchalak',
    // Standard User Fields
    email: '',
    password: '',
    // Taker Fields
    takerCount: 1, 
    gender: 'Male',
    // Linked Member Fields
    member_id: null
  });

  useEffect(() => { fetchData(); }, []);

  // --- AUTO-FILL LOGIC (Linked Members) ---
  useEffect(() => {
    if (selectedMember) {
      setFormData(prev => ({
        ...prev,
        member_id: selectedMember.id,
        gender: selectedMember.gender === 'Female' ? 'Female' : 'Male'
      }));
    }
  }, [selectedMember]);

  const fetchData = async () => {
    const { data: userData } = await supabase
      .from('user_profiles')
      .select('*, members(name, surname)') 
      .order('created_at', { ascending: false });
    setUsers(userData || []);
  };

  // --- MEMBER SEARCH ---
  useEffect(() => {
    const searchMembers = async () => {
      if (memberQuery.length < 2) { setMemberResults([]); return; }
      const { data } = await supabase.from('members')
        .select('*, kshetras(name), mandals(name)')
        .or(`name.ilike.%${memberQuery}%,surname.ilike.%${memberQuery}%,id.ilike.%${memberQuery}%`)
        .limit(5);
      setMemberResults(data || []);
    };
    const timer = setTimeout(searchMembers, 400);
    return () => clearTimeout(timer);
  }, [memberQuery]);

  // --- HELPER: GENERATE RANDOM STRING ---
  const generateRandomSuffix = (length = 4) => {
    const chars = "234567891";
    let result = "";
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const generatePassword = () => `Keshav@${generateRandomSuffix(4)}`;

  // ✅ HELPER: Isolated Client to prevent Admin Logout during creation
  const getGhostClient = () => {
    return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false } // Crucial: Do not save this session
    });
  };

  // --- ACTIONS ---

  // 1. CREATE USER(S) - FIXED LOGIC
  const handleCreate = async () => {
    const isTaker = formData.role === 'taker';
    const ghost = getGhostClient(); // Use local ghost client
    const adminId = profile?.id || null;
    let newCredentials = [];

    setLoading(true);
    
    try {
      if (isTaker) {
        // --- BULK CREATE MODE ---
        const count = parseInt(formData.takerCount) || 1;
        if (count > 20) return alert("Please create max 20 takers at a time.");

        // Fetch existing count for naming
        const { count: existingCount } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true }).ilike('name', 'Keshav System Taker%');
        let startIndex = (existingCount || 0) + 1;

        for (let i = 0; i < count; i++) {
            const num = startIndex + i;
            const suffix = generateRandomSuffix(5);
            const autoEmail = `attendancetaker${suffix}@keshavsystem.com`;
            const autoPassword = generatePassword();
            const autoName = `Attendance Taker ${suffix}`;

            // A. Create Auth User (Isolated)
            const { data: authData, error: authError } = await ghost.auth.signUp({
                email: autoEmail,
                password: autoPassword,
                options: { data: { full_name: autoName } }
            });

            if (authData?.user && !authError) {
                // B. Manual Profile Insert (Bypassing Triggers)
                await supabase.from('user_profiles').insert([{
                    id: authData.user.id,
                    role: 'taker',
                    name: autoName,
                    gender: formData.gender, // 'Male' or 'Female' (Mapped to Yuvak/Yuvati in DB types if needed)
                    created_by: adminId
                }]);

                newCredentials.push({ name: autoName, email: autoEmail, password: autoPassword });
            }
        }
      } else {
        // --- STANDARD SINGLE USER MODE ---
        if (!selectedMember) return alert("Please select a member.");
        if (!formData.email || !formData.password) return alert("Email & Password required.");

        const fullName = `${selectedMember.name} ${selectedMember.surname}`;

        // A. Create Auth User
        const { data: authData, error: authError } = await ghost.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: { data: { full_name: fullName } }
        });

        if (authError) throw authError;
        
        // B. Manual Profile Insert
        if (authData?.user) {
            const { error: profileError } = await supabase.from('user_profiles').insert([{
                id: authData.user.id,
                role: formData.role,
                name: fullName,
                member_id: selectedMember.id,
                gender: selectedMember.gender === 'Female' ? 'Female' : 'Male',
                kshetra_id: formData.role === 'nirdeshak' ? selectedMember.kshetra_id : null,
                mandal_id: ['sanchalak', 'nirikshak'].includes(formData.role) ? selectedMember.mandal_id : null,
                created_by: adminId
            }]);

            if (profileError) throw profileError;

            newCredentials.push({
                name: fullName,
                email: formData.email,
                password: formData.password
            });
        }
      }

      if (newCredentials.length > 0) {
          setCreatedUsersList(newCredentials);
          setViewMode('success');
          fetchData();
      } else {
          alert("No users were created. Check database permissions.");
      }

    } catch (err) {
      alert("Error: " + (err.message || "Database error"));
    } finally {
      setLoading(false);
    }
  };

  // 2. UPDATE USER ROLE
  const handleUpdate = async () => {
    if (!formData.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: formData.role })
        .eq('id', formData.id);

      if (error) throw error;
      
      alert("Role updated successfully!");
      setViewMode('list');
      fetchData();
    } catch (err) {
      alert("Update failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. DELETE USER
  const handleDelete = async (userId) => {
    if (confirm("Revoke access for this user? This cannot be undone.")) {
      await supabase.from('user_profiles').delete().eq('id', userId);
      fetchData();
    }
  };

  // --- UI HELPERS ---
  const openEdit = (user) => {
    setFormData({
      id: user.id,
      role: user.role,
      email: 'Hidden',
      password: '',
      gender: user.gender
    });
    setViewMode('edit');
  };

  const resetForm = () => {
    setFormData({
      id: null, role: 'sanchalak', email: '', password: '', 
      takerCount: 1, gender: 'Male', member_id: null
    });
    setSelectedMember(null);
    setViewMode('create');
  };

  const copyAllCredentials = () => {
    const text = createdUsersList.map(u => 
      `Name: ${u.name}\nEmail: ${u.email}\nPassword: ${u.password}\n-------------------`
    ).join('\n');
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER */}
      <div className="flex justify-between items-center">
         <div>
            <h2 className="text-2xl font-bold text-[#002B3D]">User Management</h2>
            <p className="text-slate-500 text-sm">Create & Manage Access</p>
         </div>
         {viewMode === 'list' && (
           <button onClick={resetForm} className="bg-[#002B3D] text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-[#0b3d52]">
             <UserPlus size={18} /> New User
           </button>
         )}
      </div>

      {/* SUCCESS SCREEN */}
      {viewMode === 'success' && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl animate-in zoom-in-95">
           <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-full text-green-600"><CheckCircle size={32}/></div>
              <div className="flex-1">
                 <h3 className="text-xl font-bold text-green-800">{createdUsersList.length} User(s) Created!</h3>
                 <p className="text-green-700 text-sm mb-4">Copy these details immediately. They will not be shown again.</p>
                 
                 <div className="max-h-60 overflow-y-auto bg-white rounded-xl border border-green-200 shadow-sm mb-4">
                   <table className="w-full text-left text-sm">
                     <thead className="bg-green-50 text-green-800 font-bold border-b border-green-100">
                        <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Password</th></tr>
                     </thead>
                     <tbody className="divide-y divide-green-50">
                        {createdUsersList.map((creds, idx) => (
                          <tr key={idx}>
                             <td className="p-3 font-medium">{creds.name}</td>
                             <td className="p-3 font-mono text-xs">{creds.email}</td>
                             <td className="p-3 font-mono font-bold text-[#002B3D]">{creds.password}</td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                 </div>
                 
                 <div className="flex gap-3">
                    <button onClick={copyAllCredentials} className="flex-1 px-4 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#0b3d52] flex items-center justify-center gap-2"><Copy size={18}/> Copy All</button>
                    <button onClick={() => setViewMode('list')} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl">Done</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CREATE & EDIT FORMS */}
      {(viewMode === 'create' || viewMode === 'edit') && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-3xl mx-auto animate-in slide-in-from-top-4">
           
           <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <h3 className="text-xl font-bold text-[#002B3D]">
                {viewMode === 'edit' ? 'Update User Role' : 'Provision New Users'}
              </h3>
              <button onClick={() => setViewMode('list')} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={20}/></button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 1. ROLE SELECTION */}
              <div className="md:col-span-2">
                 <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                   {viewMode === 'edit' ? 'Update Role To:' : '1. Select Role'}
                 </label>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {['sanchalak', 'nirikshak', 'nirdeshak', 'taker', 'admin'].map(r => (
                       <button 
                         key={r}
                         onClick={() => {
                           setFormData(prev => ({ ...prev, role: r }));
                           if (r === 'taker') setSelectedMember(null); 
                         }}
                         className={`p-3 rounded-xl border text-sm font-bold capitalize transition-all ${
                           formData.role === r 
                             ? 'bg-[#002B3D] text-white border-[#002B3D]' 
                             : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                         }`}
                       >
                         {r}
                       </button>
                    ))}
                 </div>
              </div>

              {/* CREATE MODE SPECIFIC UI */}
              {viewMode === 'create' && (
                <>
                  {/* TAKER BULK OPTIONS */}
                  {formData.role === 'taker' ? (
                     <div className="md:col-span-2 bg-orange-50 p-6 rounded-xl border border-orange-100 animate-in fade-in">
                        <div className="flex gap-2 text-orange-800 font-bold items-center mb-4"><Globe size={20}/> Bulk Create Takers</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <div>
                              <label className="text-xs font-bold text-orange-700 uppercase mb-1 block">Number of Users</label>
                              <div className="flex items-center bg-white border border-orange-200 rounded-xl overflow-hidden">
                                 <input type="number" min="1" max="20" value={formData.takerCount} onChange={e => setFormData({...formData, takerCount: e.target.value})} className="w-full p-3 font-bold text-lg outline-none"/>
                                 <div className="bg-orange-100 p-3 text-orange-700 font-bold border-l border-orange-200">Users</div>
                              </div>
                           </div>
                           <div>
                              <label className="text-xs font-bold text-orange-700 uppercase mb-1 block">Gender Scope</label>
                              <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full p-4 border border-orange-200 rounded-xl bg-white font-medium outline-none">
                                 <option value="Male">Yuvak (Male)</option><option value="Female">Yuvati (Female)</option>
                              </select>
                           </div>
                        </div>
                     </div>
                  ) : (
                    // STANDARD MEMBER SELECTOR
                    <div className="md:col-span-2 space-y-4">
                       <label className="text-xs font-bold text-slate-400 uppercase block">2. Select Member</label>
                       {selectedMember ? (
                         <div className="flex justify-between items-center bg-sky-50 p-4 rounded-xl border border-sky-100 animate-in fade-in">
                            <div>
                               <div className="font-bold text-[#002B3D]">{selectedMember.name} {selectedMember.surname}</div>
                               <div className="text-xs text-slate-500 mt-1">{selectedMember.kshetras?.name} • {selectedMember.mandals?.name}</div>
                            </div>
                            <button onClick={() => setSelectedMember(null)} className="text-red-500 font-bold text-sm">Change</button>
                         </div>
                       ) : (
                         <div className="relative">
                            <input autoFocus type="text" placeholder="Search Existing Member..." value={memberQuery} onChange={e => setMemberQuery(e.target.value)} className="w-full p-3 pl-10 border rounded-xl focus:ring-2 focus:ring-sky-200 outline-none"/>
                            <Search className="absolute left-3 top-3.5 text-slate-400" size={18}/>
                            {memberResults.length > 0 && (
                               <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl mt-2 border border-slate-100 z-10 max-h-60 overflow-y-auto">
                                 {memberResults.map(m => (
                                   <div key={m.id} onClick={() => { setSelectedMember(m); setMemberQuery(''); }} className="p-3 hover:bg-sky-50 cursor-pointer border-b border-slate-50">
                                      <div className="font-bold text-slate-700">{m.name} {m.surname}</div>
                                      <div className="text-xs text-slate-400">{m.mandal} • {m.gender}</div>
                                   </div>
                                 ))}
                               </div>
                            )}
                         </div>
                       )}
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                          <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 border rounded-xl"/></div>
                          <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Password</label><div className="flex gap-2"><input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="flex-1 p-3 border rounded-xl font-mono"/><button onClick={() => setFormData({...formData, password: generatePassword()})} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200"><RefreshCw size={20}/></button></div></div>
                       </div>
                    </div>
                  )}
                </>
              )}
           </div>

           <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setViewMode('list')} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancel</button>
              <button 
                onClick={viewMode === 'edit' ? handleUpdate : handleCreate} 
                disabled={loading} 
                className="px-6 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#0b3d52] flex items-center gap-2"
              >
                 {loading ? <><Loader2 className="animate-spin" size={18}/> Processing...</> : (
                    viewMode === 'edit' ? <><Save size={18}/> Update Role</> : <><UserPlus size={18}/> {formData.role === 'taker' ? `Create ${formData.takerCount} Users` : 'Create User'}</>
                 )}
              </button>
           </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 text-slate-500 font-bold border-b">
               <tr>
                 <th className="p-4">Name</th>
                 <th className="p-4 hidden sm:table-cell">Role</th>
                 <th className="p-4 hidden sm:table-cell">Scope</th>
                 <th className="p-4 text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {users.map(user => {
                 const displayName = user.members ? `${user.members.name} ${user.members.surname}` : `${user.name}`;
                 let scope = 'Global Access';
                 if (user.role !== 'taker' && user.role !== 'admin') scope = user.gender; 

                 return (
                   <tr key={user.id} className="hover:bg-slate-50 group">
                     <td className="p-4">
                       <div className="font-bold text-slate-800">{displayName}</div>
                       <div className="text-xs text-slate-400">
                         {user.member_id ? <span className="text-sky-600 flex items-center gap-1"><LinkIcon size={10}/> Member Linked</span> : <span className="text-orange-600 flex items-center gap-1"><Globe size={10}/> External Taker</span>}
                       </div>
                     </td>
                     <td className="p-4 hidden sm:table-cell">
                       <span className={`px-2 py-1 rounded text-xs font-bold uppercase border ${user.role==='taker'?'bg-orange-50 text-orange-700 border-orange-100':'bg-sky-50 text-sky-700 border-sky-100'}`}>{user.role}</span>
                     </td>
                     <td className="p-4 hidden sm:table-cell text-slate-600">{scope}</td>
                     <td className="p-4 text-right">
                       <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {/* EDIT BUTTON */}
                          <button onClick={() => openEdit(user)} className="p-2 text-slate-400 hover:text-sky-600 bg-slate-50 hover:bg-sky-50 rounded-lg">
                             <Edit2 size={18}/>
                          </button>
                          {/* DELETE BUTTON */}
                          <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg">
                             <Trash2 size={18}/>
                          </button>
                       </div>
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
        </div>
      )}

    </div>
  );
}