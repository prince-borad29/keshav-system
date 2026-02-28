import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, User, CheckCircle, Plus, MapPin, Lock, QrCode } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import QrScanner from '../attendance/QrScanner'; // Import the scanner!

export default function ProjectRoster({ project, projectRole, isAdmin }) { 
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [members, setMembers] = useState([]);
  const [togglingId, setTogglingId] = useState(null);
  
  // External QR Mapping State
  const [scanningMember, setScanningMember] = useState(null);
  
  const [userScope, setUserScope] = useState({ role: '', gender: '', mandalIds: [], kshetraId: null, isGlobal: false });
  const [scopeLoaded, setScopeLoaded] = useState(false);

  useEffect(() => {
    fetchUserScope();
  }, []);

  const fetchUserScope = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, gender, assigned_mandal_id, assigned_kshetra_id')
        .eq('id', user.id)
        .single();

      let scope = {
        role: profile.role,
        gender: profile.gender,
        mandalIds: [],
        kshetraId: profile.assigned_kshetra_id,
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

  const fetchMembers = useCallback(async () => {
    if (!scopeLoaded) return;
    setLoading(true);

    try {
      let query = supabase
        .from('members')
        .select(`
          id, name, surname, mobile, internal_code, gender,
          mandals!inner ( id, name, kshetra_id ),
          project_registrations ( project_id, external_qr ) 
        `)
        .limit(50); // Added external_qr to the query

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%`);
      }

      if (!userScope.isGlobal) query = query.eq('gender', userScope.gender);
      
      if (['sanchalak', 'nirikshak'].includes(userScope.role)) {
        if (userScope.mandalIds.length > 0) query = query.in('mandal_id', userScope.mandalIds);
        else { setMembers([]); setLoading(false); return; }
      } 
      else if (userScope.role === 'project_admin') {
        if (userScope.kshetraId) {
          query = query.eq('mandals.kshetra_id', userScope.kshetraId);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const processed = data.map(m => {
        // Find the specific registration row for THIS project
        const reg = m.project_registrations.find(r => r.project_id === project.id);
        return {
          ...m,
          is_registered: !!reg,
          external_qr: reg?.external_qr || null // Extract the QR string
        };
      });

      processed.sort((a, b) => (a.is_registered === b.is_registered) ? 0 : a.is_registered ? -1 : 1);
      setMembers(processed);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [project.id, searchTerm, scopeLoaded, userScope]);

  useEffect(() => {
    const timer = setTimeout(() => { if (scopeLoaded) fetchMembers(); }, 400);
    return () => clearTimeout(timer);
  }, [fetchMembers]);

  const isProjectAdmin = isAdmin || projectRole === 'Coordinator';
  const canEdit = isProjectAdmin || (projectRole === 'Editor' && project.registration_open);

  const handleToggle = async (member) => {
    if (!canEdit) {
      alert("Registration is closed or you do not have permission.");
      return;
    }

    setTogglingId(member.id);
    const userId = (await supabase.auth.getUser()).data.user?.id;

    try {
      if (member.is_registered) {
        await supabase.from('project_registrations').delete().match({ project_id: project.id, member_id: member.id });
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_registered: false, external_qr: null } : m));
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

  // --- NEW: HANDLE EXTERNAL QR SCANNING ---
  const handleMapExternalQr = async (scannedCode) => {
    if (!scanningMember) return { success: false, message: "No member selected" };

    const cleanCode = scannedCode.trim();

    try {
      // 1. Safety Check: Is this badge already mapped to someone else in this project?
      const { data: existing } = await supabase
        .from('project_registrations')
        .select('member_id')
        .eq('project_id', project.id)
        .eq('external_qr', cleanCode)
        .maybeSingle();

      if (existing && existing.member_id !== scanningMember.id) {
         return { success: false, type: 'error', message: "Badge is already assigned to another member!" };
      }

      // 2. Save it to the database
      const { error } = await supabase
        .from('project_registrations')
        .update({ external_qr: cleanCode })
        .match({ project_id: project.id, member_id: scanningMember.id });

      if (error) throw error;

      // 3. Update the UI locally so the icon turns green
      setMembers(prev => prev.map(m => m.id === scanningMember.id ? { ...m, external_qr: cleanCode } : m));
      
      // Auto-close scanner after success
      setTimeout(() => setScanningMember(null), 1200);
      
      return { success: true, message: `Badge linked to ${scanningMember.name}!` };
    } catch (err) {
      return { success: false, type: 'error', message: "Database Error" };
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <User size={20} className="text-indigo-600"/> 
              Project Roster
            </h3>
            {!project.registration_open && (
              <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 flex items-center gap-1">
                <Lock size={10}/> Registration Closed
              </span>
            )}
            {project.registration_open && (
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
          />
          {loading && <Loader2 className="absolute right-3 top-3 animate-spin text-slate-400" size={18} />}
        </div>
      </div>

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
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  {m.name} {m.surname}
                  {/* Badge Indicator if they have an external QR */}
                  {m.external_qr && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Badge Mapped</span>}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><MapPin size={10}/> {m.mandals?.name}</span>
                  <span className="font-mono text-slate-400">• {m.mobile}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
               {/* 1. External QR Button (Only shows if they are Registered) */}
               {m.is_registered && isAdmin && (
                 <button
                   onClick={() => setScanningMember(m)}
                   title={m.external_qr ? "Re-Map Badge" : "Map External Badge"}
                   className={`p-2 rounded-lg transition-colors border ${m.external_qr ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50'}`}
                 >
                   <QrCode size={16} />
                 </button>
               )}

               {/* 2. Register/Unregister Button */}
               {canEdit ? (
                 <button
                   onClick={() => handleToggle(m)}
                   disabled={togglingId === m.id}
                   className={`
                     px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all
                     ${m.is_registered ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}
                     disabled:opacity-50
                   `}
                 >
                   {togglingId === m.id ? <Loader2 size={14} className="animate-spin"/> : m.is_registered ? "Unregister" : <><Plus size={14}/> Register</>}
                 </button>
               ) : (
                 m.is_registered ? (
                   <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                     <CheckCircle size={12}/> Added
                   </span>
                 ) : (
                   <span className="text-xs text-slate-400 italic px-2">Not Registered</span>
                 )
               )}
            </div>
          </div>
        ))}
      </div>

      {/* RENDER THE SCANNER POPUP FOR EXTERNAL CARDS */}
      {scanningMember && (
         <QrScanner 
            isOpen={!!scanningMember} 
            onClose={() => setScanningMember(null)} 
            onScan={handleMapExternalQr} 
            eventName={`Map Badge to ${scanningMember.name}`} 
         />
      )}
    </div>
  );
}