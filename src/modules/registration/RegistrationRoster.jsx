import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, User, CheckCircle, Plus, MapPin, Lock, QrCode, ArrowLeft, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import QrScanner from '../attendance/QrScanner';

export default function RegistrationRoster({ project, onBack, isAdmin, profile }) { 
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  
  // Summary & Pagination
  const [registeredCount, setRegisteredCount] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 20;
  const observerTarget = useRef(null);
  const isFetchingRef = useRef(false);

  // External QR Mapping State
  const [scanningMember, setScanningMember] = useState(null);
  
  // Instant Scope Extraction (No extra network calls!)
  const role = (profile?.role || '').toLowerCase();
  const isGlobal = role === 'admin';
  const [allowedMandalIds, setAllowedMandalIds] = useState(null);

  // 1. Establish Scope Safely
  useEffect(() => {
    const defineScope = async () => {
      let ids = [];
      if (role === 'sanchalak') ids = [profile.assigned_mandal_id];
      else if (role === 'nirikshak') {
        const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id);
        ids = data?.map(d => d.mandal_id) || [];
        if (profile.assigned_mandal_id) ids.push(profile.assigned_mandal_id);
      } else if (role === 'nirdeshak' || role === 'project_admin') {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!kId && profile.assigned_mandal_id) {
          const { data } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
          if (data) kId = data.kshetra_id;
        }
        if (kId) {
          const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
          ids = data?.map(m => m.id) || [];
        }
      }
      setAllowedMandalIds(ids);
    };
    if (!isGlobal) defineScope();
    else setAllowedMandalIds([]);
  }, [role, isGlobal, profile]);

  // 2. Fetch Summary Statistics
  useEffect(() => {
    if (!isGlobal && allowedMandalIds === null) return;
    
    const fetchSummary = async () => {
      let query = supabase.from('project_registrations')
        .select('member_id, members!inner(gender, mandal_id)', { count: 'exact', head: true })
        .eq('project_id', project.id);
        
      if (!isGlobal && profile?.gender) query = query.eq('members.gender', profile.gender);
      if (!isGlobal && allowedMandalIds.length > 0) query = query.in('members.mandal_id', allowedMandalIds);
      
      const { count } = await query;
      setRegisteredCount(count || 0);
    };
    fetchSummary();
  }, [project.id, allowedMandalIds, isGlobal, profile?.gender]);

  // 3. Search Debounce & Page Reset
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setPage(0); setHasMore(true); }, [debouncedSearch]);

  // 4. Lazy Load Members
  const fetchMembers = useCallback(async () => {
    if ((!isGlobal && allowedMandalIds === null) || isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    const isLoadMore = page > 0;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);

    try {
      let query = supabase.from('members').select(`
        id, name, surname, mobile, internal_code, gender,
        mandals!inner ( id, name, kshetra_id ),
        project_registrations ( project_id, external_qr ) 
      `);

      // Apply Scope Constraints
      if (!isGlobal && profile?.gender) query = query.eq('gender', profile.gender);
      if (!isGlobal && allowedMandalIds.length > 0) query = query.in('mandal_id', allowedMandalIds);
      else if (!isGlobal && allowedMandalIds.length === 0) { setMembers([]); return; }

      // Apply Search
      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%`);
      }

      const from = page * pageSize;
      const { data, error } = await query
        .range(from, from + pageSize - 1)
        .order('name', { ascending: true }); // Stable Alphabetical Sorting

      if (error) throw error;

      const processed = data.map(m => {
        const reg = m.project_registrations.find(r => r.project_id === project.id);
        return { ...m, is_registered: !!reg, external_qr: reg?.external_qr || null };
      });

      setMembers(prev => isLoadMore ? [...prev, ...processed] : processed);
      setHasMore(data.length === pageSize);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); setLoadingMore(false); isFetchingRef.current = false; }
  }, [project.id, page, debouncedSearch, allowedMandalIds, isGlobal, profile?.gender]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // 5. Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && !isFetchingRef.current) setPage(p => p + 1);
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  // 6. INSTANT TOGGLE HANDLER
  const handleToggle = async (member) => {
    if (!project.registration_open) return alert("Registration is closed.");
    setTogglingId(member.id);

    // BLAZING FAST: Use context profile.id directly, no network auth fetching!
    const userId = profile.id; 

    try {
      if (member.is_registered) {
        const { error } = await supabase.from('project_registrations').delete().match({ project_id: project.id, member_id: member.id });
        if (error) throw error;
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_registered: false, external_qr: null } : m));
        setRegisteredCount(prev => prev - 1);
      } else {
        const { error } = await supabase.from('project_registrations').insert({
          project_id: project.id, member_id: member.id, registered_by: userId
        });
        if (error) throw error;
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_registered: true } : m));
        setRegisteredCount(prev => prev + 1);
      }
    } catch (err) { alert("Action failed: " + err.message); } 
    finally { setTogglingId(null); }
  };

  const handleMapExternalQr = async (scannedCode) => {
    if (!scanningMember) return { success: false, message: "No member selected" };
    const cleanCode = scannedCode.trim();
    try {
      const { data: existing } = await supabase.from('project_registrations').select('member_id').eq('project_id', project.id).eq('external_qr', cleanCode).maybeSingle();
      if (existing && existing.member_id !== scanningMember.id) return { success: false, type: 'error', message: "Badge already assigned!" };

      const { error } = await supabase.from('project_registrations').update({ external_qr: cleanCode }).match({ project_id: project.id, member_id: scanningMember.id });
      if (error) throw error;

      setMembers(prev => prev.map(m => m.id === scanningMember.id ? { ...m, external_qr: cleanCode } : m));
      setTimeout(() => setScanningMember(null), 1200);
      return { success: true, message: `Badge linked!` };
    } catch (err) { return { success: false, type: 'error', message: "Database Error" }; }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in pb-20 px-4">
      {/* HEADER & SUMMARY */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100"><ArrowLeft size={20}/></button>
            <h3 className="font-bold text-slate-800 text-lg truncate">{project.name}</h3>
            {!project.registration_open && <span className="px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold rounded-lg border border-red-100 flex items-center gap-1 uppercase"><Lock size={10}/> Closed</span>}
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-100 font-bold text-sm">
             <Users size={16}/> {registeredCount} Registered
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
            placeholder="Search by name, surname, or ID to register..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* MEMBER LIST */}
      <div className="space-y-2">
        {loading && !loadingMore && <div className="py-12 text-center text-slate-400"><Loader2 className="animate-spin inline text-indigo-600"/> Loading roster...</div>}
        
        {!loading && members.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            {searchTerm ? "No members found matching your search." : "Search to find members to register."}
          </div>
        )}

        {members.map(m => (
          <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${m.is_registered ? 'bg-indigo-50/30 border-indigo-200' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${m.is_registered ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {m.name[0]}{m.surname[0]}
              </div>
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  {m.name} {m.surname}
                  {m.external_qr && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Badge</span>}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><MapPin size={10}/> {m.mandals?.name}</span>
                  <span className="font-mono text-slate-400">• {m.internal_code}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
               {m.is_registered && isAdmin && (
                 <button onClick={() => setScanningMember(m)} className={`p-2 rounded-lg transition-colors border ${m.external_qr ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                   <QrCode size={16} />
                 </button>
               )}

               {project.registration_open ? (
                 <button
                   onClick={() => handleToggle(m)}
                   disabled={togglingId === m.id}
                   className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all w-28 justify-center ${m.is_registered ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} disabled:opacity-50`}
                 >
                   {togglingId === m.id ? <Loader2 size={14} className="animate-spin"/> : m.is_registered ? "Unregister" : <><Plus size={14}/> Register</>}
                 </button>
               ) : (
                 m.is_registered ? <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1"><CheckCircle size={12}/> Added</span> : <span className="text-xs text-slate-400 italic px-2">Closed</span>
               )}
            </div>
          </div>
        ))}
        
        {members.length > 0 && (
          <div ref={observerTarget} className="py-4 text-center text-xs text-slate-400 font-medium">
             {loadingMore ? <Loader2 className="animate-spin inline text-indigo-600"/> : hasMore ? 'Scroll for more' : 'End of roster'}
          </div>
        )}
      </div>

      {scanningMember && <QrScanner isOpen={!!scanningMember} onClose={() => setScanningMember(null)} onScan={handleMapExternalQr} eventName={`Map Badge to ${scanningMember.name}`} />}
    </div>
  );
}