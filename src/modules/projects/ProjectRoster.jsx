import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, User, CheckCircle, Plus, MapPin, Lock, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Badge from '../../components/ui/Badge';

export default function ProjectRoster({ project }) { // Receive full project object
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [members, setMembers] = useState([]);
  const [togglingId, setTogglingId] = useState(null);
  
  // Scope State
  const [userScope, setUserScope] = useState({ role: '', gender: '', mandalIds: [], kshetraId: null, isGlobal: false });
  const [scopeLoaded, setScopeLoaded] = useState(false);

  // 1. Init
  useEffect(() => {
    fetchUserScope();
  }, []);

  // 2. Fetch Permissions
  const fetchUserScope = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, gender, assigned_mandal_id')
        .eq('id', user.id)
        .single();

      let scope = {
        role: profile.role,
        gender: profile.gender,
        mandalIds: [],
        kshetraId: null,
        isGlobal: profile.role === 'admin'
      };

      if (profile.role === 'sanchalak') scope.mandalIds = [profile.assigned_mandal_id];
      else if (profile.role === 'nirikshak') {
        const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', user.id);
        scope.mandalIds = data?.map(d => d.mandal_id) || [];
      }

      setUserScope(scope);
      setScopeLoaded(true);
    } catch (e) { console.error("Scope Error", e); }
  };

  // 3. Search Members
  const fetchMembers = useCallback(async () => {
    if (!scopeLoaded) return;
    setLoading(true);

    try {
      let query = supabase
        .from('members')
        .select(`
          id, name, surname, mobile, internal_code, gender,
          mandals!inner ( id, name, kshetra_id ),
          project_registrations ( project_id )
        `)
        .limit(50);

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%`);
      }

      // Permissions
      if (!userScope.isGlobal) query = query.eq('gender', userScope.gender);
      if (['sanchalak', 'nirikshak'].includes(userScope.role)) {
        if (userScope.mandalIds.length > 0) query = query.in('mandal_id', userScope.mandalIds);
        else { setMembers([]); setLoading(false); return; }
      }

      const { data, error } = await query;
      if (error) throw error;

      const processed = data.map(m => ({
        ...m,
        is_registered: m.project_registrations.some(r => r.project_id === project.id)
      }));

      processed.sort((a, b) => (a.is_registered === b.is_registered) ? 0 : a.is_registered ? -1 : 1);
      setMembers(processed);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [project.id, searchTerm, scopeLoaded, userScope]);

  useEffect(() => {
    const timer = setTimeout(() => { if (scopeLoaded) fetchMembers(); }, 400);
    return () => clearTimeout(timer);
  }, [fetchMembers]);

  // 4. Toggle Action
  const handleToggle = async (member) => {
    // SECURITY CHECK:
    if (!userScope.isGlobal && !project.registration_open) {
      alert("Registration is closed for this project.");
      return;
    }

    setTogglingId(member.id);
    const userId = (await supabase.auth.getUser()).data.user?.id;

    try {
      if (member.is_registered) {
        if(!confirm(`Remove ${member.name}?`)) { setTogglingId(null); return; }
        await supabase.from('project_registrations').delete().match({ project_id: project.id, member_id: member.id });
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_registered: false } : m));
      } else {
        const { error } = await supabase.from('project_registrations').insert({
          project_id: project.id, member_id: member.id, registered_by: userId
        });
        if (error) throw error;
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_registered: true } : m));
      }
    } catch (err) { alert("Action failed: " + err.message); } 
    finally { setTogglingId(null); }
  };

  // --- LOGIC: CAN EDIT? ---
  // Admin can always edit. Others can only edit if registration is OPEN.
  const canEdit = userScope.isGlobal || project.registration_open;

  return (
    <div className="space-y-4 animate-in fade-in">
      
      {/* HEADER */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <User size={20} className="text-indigo-600"/> 
              Project Roster
            </h3>
            {/* Status Indicator */}
            {!canEdit && (
              <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 flex items-center gap-1">
                <Lock size={10}/> Registration Closed
              </span>
            )}
            {canEdit && !userScope.isGlobal && (
              <span className="px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100 flex items-center gap-1">
                <CheckCircle size={10}/> Registration Open
              </span>
            )}
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
            placeholder="Search by name, surname, or mobile..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
          {loading && <Loader2 className="absolute right-3 top-3 animate-spin text-slate-400" size={18} />}
        </div>
      </div>

      {/* MEMBER LIST */}
      <div className="space-y-2">
        {members.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            {searchTerm ? "No members found matching your search." : "Start typing to find members..."}
          </div>
        )}

        {members.map(m => (
          <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${m.is_registered ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${m.is_registered ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {m.name[0]}{m.surname[0]}
              </div>
              <div>
                <div className="font-bold text-slate-800">
                  {m.name} {m.surname}
                  {/* ADMIN SEE: Show who registered them? (Optional future feature) */}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><MapPin size={10}/> {m.mandals?.name}</span>
                  <span className="font-mono text-slate-400">• {m.mobile}</span>
                </div>
              </div>
            </div>

            {/* ACTION BUTTON OR STATUS TAG */}
            {canEdit ? (
              <button
                onClick={() => handleToggle(m)}
                disabled={togglingId === m.id}
                className={`
                  px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all
                  ${m.is_registered 
                    ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}
                  disabled:opacity-50
                `}
              >
                {togglingId === m.id ? <Loader2 size={14} className="animate-spin"/> : m.is_registered ? "Unregister" : <><Plus size={14}/> Register</>}
              </button>
            ) : (
              // READ-ONLY VIEW
              m.is_registered ? (
                <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                  <CheckCircle size={12}/> Added
                </span>
              ) : (
                <span className="text-xs text-slate-400 italic px-2">Not Registered</span>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}