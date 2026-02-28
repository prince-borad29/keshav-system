import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Eye, Edit3, Trash2, Tag, MapPin, Briefcase, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import MemberForm from './MemberForm';
import MemberProfile from './MemberProfile';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MemberDirectory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isNirdeshak = role === 'nirdeshak';
  const isNirikshak = role === 'nirikshak';
  const isSanchalak = role === 'sanchalak';
  const isProjectAdmin = role === 'project_admin';

  // Include project_admin in allowed roles now
  const allowedRoles = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak', 'project_admin'];
  const isAuthorized = allowedRoles.includes(role);

  // -- STATE --
  const [members, setMembers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  
  // Lazy Loading / Infinite Scroll State
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const pageSize = 20;
  const observerTarget = useRef(null);
  const isFetchingRef = useRef(false); 

  // Permissions State
  const [allowedMandalIds, setAllowedMandalIds] = useState(null); 
  const [assignedProjectIds, setAssignedProjectIds] = useState([]); // Specifically for Project Admins
  const [permsLoaded, setPermsLoaded] = useState(false);

  // Filters & Dropdowns
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({ kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' });
  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [tags, setTags] = useState([]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);

  // 1. SECURITY CHECK & PERMISSIONS
  useEffect(() => {
    if (!profile || !isAuthorized) {
      if (!isAuthorized && profile) setLoading(false);
      return;
    }

    const loadPermissions = async () => {
      let ids = [];
      try {
        if (isSanchalak) {
          if (profile.assigned_mandal_id) ids = [profile.assigned_mandal_id];
        } else if (isNirikshak) {
          const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id);
          ids = data ? data.map(d => d.mandal_id) : [];
          if (ids.length === 0 && profile.assigned_mandal_id) ids = [profile.assigned_mandal_id];
        } else if (isNirdeshak || isProjectAdmin) {
          let kId = profile.assigned_kshetra_id || profile.kshetra_id;
          if (!kId && profile.assigned_mandal_id) {
               const { data: mData } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
               if (mData) kId = mData.kshetra_id;
          }
          if (kId) {
              const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
              ids = data ? data.map(m => m.id) : [];
          }
          
          // If they are a Project Admin, fetch their assigned projects to filter the directory!
          if (isProjectAdmin) {
             const { data: pData } = await supabase.from('project_assignments').select('project_id').eq('user_id', profile.id);
             setAssignedProjectIds(pData ? pData.map(p => p.project_id) : []);
          }
        }
      } catch (err) { console.error("Permission Load Error", err); }
      
      setAllowedMandalIds(ids);
      setPermsLoaded(true);
    };
    loadPermissions();
  }, [profile, isAuthorized, isSanchalak, isNirikshak, isNirdeshak, isProjectAdmin]);

  // 2. FETCH DROPDOWNS
  useEffect(() => {
    if (permsLoaded && isAuthorized) {
      const fetchDropdowns = async () => {
        try {
          const { data: tData } = await supabase.from('tags').select('id, name').contains('category', ['Member']).order('name');
          if (tData) setTags(tData);

          if (isAdmin) {
            const { data: kData } = await supabase.from('kshetras').select('id, name').order('name');
            if (kData) setKshetras(kData);
          }

          let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');
          if (!isAdmin && allowedMandalIds !== null) {
            if (allowedMandalIds.length > 0) mQuery = mQuery.in('id', allowedMandalIds);
            else { setMandals([]); return; }
          }
          const { data: mData } = await mQuery;
          if (mData) setMandals(mData);
        } catch (e) { console.error(e); }
      };
      fetchDropdowns();
    }
  }, [permsLoaded, isAuthorized, isAdmin, allowedMandalIds]);

  // 3. SEARCH DEBOUNCE
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 4. RESET PAGE ON FILTER/SEARCH CHANGE
  useEffect(() => {
    setPage(0);
    setHasMore(true);
  }, [debouncedSearch, filters]);

  // 5. FETCH MEMBERS
  const fetchMembers = useCallback(async () => {
    if (!permsLoaded || !isAuthorized || isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    const isLoadMore = page > 0;
    
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      // Clean query string builder to dynamically include/exclude tags and registrations
      let selectString = `
        *,
        mandals!inner ( id, name, kshetra_id, kshetras ( id, name ) ),
        ${filters.tag_id ? 'member_tags!inner' : 'member_tags'} ( tag_id, tags (name, color) )
      `;

      // 💡 THE TRICK: If Project Admin, force an Inner Join on Registrations!
      if (isProjectAdmin) {
        selectString += `, project_registrations!inner ( project_id )`;
      }

      let query = supabase.from('members').select(selectString, { count: 'exact' });

      // Scope Constraints
      if (!isAdmin && profile?.gender) query = query.eq('gender', profile.gender);
      if (!isAdmin && allowedMandalIds !== null) {
         if (allowedMandalIds.length > 0) query = query.in('mandal_id', allowedMandalIds);
         else { setMembers([]); setTotalCount(0); setLoading(false); isFetchingRef.current = false; return; }
      }

      // 💡 Project Admin Constraints (Only show members registered to THEIR projects)
      if (isProjectAdmin) {
        if (assignedProjectIds.length > 0) {
           query = query.in('project_registrations.project_id', assignedProjectIds);
        } else {
           setMembers([]); setTotalCount(0); setLoading(false); isFetchingRef.current = false; return;
        }
      }

      // Form Filters
      if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%`);
      if (isAdmin && filters.kshetra_id) query = query.eq('mandals.kshetra_id', filters.kshetra_id);
      if (filters.mandal_id) {
         if (isAdmin || allowedMandalIds.includes(filters.mandal_id)) query = query.eq('mandal_id', filters.mandal_id);
      }
      if (filters.designation) query = query.eq('designation', filters.designation);
      if (isAdmin && filters.gender) query = query.eq('gender', filters.gender);
      if (filters.tag_id) query = query.eq('member_tags.tag_id', filters.tag_id);

      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data, count, error } = await query
        .range(from, to)
        .order('name', { ascending: true })
        .order('surname', { ascending: true })
        .order('id', { ascending: true }); 
        
      if (error) throw error;
      
      if (isLoadMore) {
        setMembers(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNewMembers = (data || []).filter(m => !existingIds.has(m.id));
          return [...prev, ...uniqueNewMembers];
        });
      } else {
        setMembers(data || []);
        setTotalCount(count || 0);
      }
      
      setHasMore((data || []).length === pageSize);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
      setLoadingMore(false);
      isFetchingRef.current = false; 
    }
  }, [permsLoaded, isAuthorized, page, debouncedSearch, filters, isAdmin, profile?.gender, allowedMandalIds, refreshTrigger, isProjectAdmin, assignedProjectIds]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // 6. ROBUST INFINITE SCROLL
  const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore && !loading && !loadingMore && !isFetchingRef.current) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, loading, loadingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Handlers
  const handleCreate = () => { setSelectedMember(null); setIsFormOpen(true); };
  const handleEdit = (m) => { setSelectedMember(m); setIsFormOpen(true); };
  const handleView = (m) => { setViewMember(m); };
  
  const handleSaveSuccess = () => {
    setPage(0);
    setHasMore(true);
    setRefreshTrigger(prev => prev + 1); 
  };

  const handleDelete = async (id) => { 
    if(confirm("Delete member?")) { await supabase.from('members').delete().eq('id', id); handleSaveSuccess(); } 
  };

  if (profile && !isAuthorized) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center text-center p-6">
        <div className="bg-red-50 p-6 rounded-full mb-4"><ShieldAlert size={48} className="text-red-500" /></div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-slate-500 max-w-md mb-6">You are logged in as a <strong>{role}</strong>. You do not have permission to view the Member Directory.</p>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isProjectAdmin ? "Registered Database" : "Member Directory"}
            </h1>
            <p className="text-slate-500 text-sm">
                Total Members: {totalCount} {isProjectAdmin && <span className="text-xs text-indigo-500 font-bold ml-1">(Project Scope)</span>}
                {!isAdmin && !isProjectAdmin && <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-medium capitalize">View: {role}</span>}
            </p>
        </div>
        
        {/* Project Admins cannot register/create new members from here */}
        {(isAdmin || isSanchalak || isNirikshak) && (
            <Button icon={Plus} onClick={handleCreate}>Register Member</Button>
        )}
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm transition-all focus:ring-2 focus:ring-indigo-100" placeholder="Search name, surname, ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {isAdmin && (
            <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                <select className="input-filter pl-8" value={filters.kshetra_id} onChange={(e) => setFilters({...filters, kshetra_id: e.target.value, mandal_id: ''})}>
                    <option value="">All Kshetras</option>
                    {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
            </div>
          )}
          {(isAdmin || isNirdeshak || isNirikshak || isProjectAdmin) && (
            <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                <select className="input-filter pl-8" value={filters.mandal_id} onChange={(e) => setFilters({...filters, mandal_id: e.target.value})}>
                    <option value="">{isNirikshak ? "My Mandals" : (isNirdeshak || isProjectAdmin ? "Mandals in Region" : "All Mandals")}</option>
                    {mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            </div>
          )}
          <div className="relative">
            <Briefcase className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
            <select className="input-filter pl-8" value={filters.designation} onChange={(e) => setFilters({...filters, designation: e.target.value})}>
                <option value="">All Roles</option>
                {['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {isAdmin && (
             <select className="input-filter" value={filters.gender} onChange={(e) => setFilters({...filters, gender: e.target.value})}>
                <option value="">All Genders</option>
                <option value="Yuvak">Yuvak</option>
                <option value="Yuvati">Yuvati</option>
             </select>
          )}
          <div className="relative">
            <Tag className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
            <select className="input-filter pl-8" value={filters.tag_id} onChange={(e) => setFilters({...filters, tag_id: e.target.value})}>
              <option value="">Filter by Tag</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* LIST */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 uppercase text-xs">
            <tr><th className="p-4">ID</th><th className="p-4">Name</th><th className="p-4">Location</th><th className="p-4">Role</th><th className="p-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {members.map(m => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-mono text-slate-500 text-xs">{m.internal_code}</td>
                <td className="p-4">
                    <div className="font-bold text-slate-800">{m.name} {m.surname}</div>
                    <div className="text-xs text-slate-400">{m.mobile || 'No Mobile'}</div>
                    <div className="flex gap-1 flex-wrap mt-1">{m.member_tags?.map(mt => <span key={mt.tag_id} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded-md border border-blue-100">{mt.tags?.name}</span>)}</div>
                </td>
                <td className="p-4">
                    <div className="font-medium text-slate-700">{m.mandals?.name}</div>
                    {(isAdmin || isNirdeshak || isProjectAdmin) && <div className="text-[10px] text-slate-400">{m.mandals?.kshetras?.name}</div>}
                </td>
                <td className="p-4"><Badge variant="outline">{m.designation}</Badge></td>
                <td className="p-4 text-right flex justify-end gap-2">
                    <button onClick={() => handleView(m)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg"><Eye size={16}/></button>
                    {(isAdmin || isSanchalak || isNirikshak) && (
                        <>
                            <button onClick={() => handleEdit(m)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg"><Edit3 size={16}/></button>
                            {isAdmin && <button onClick={() => handleDelete(m.id)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded-lg"><Trash2 size={16}/></button>}
                        </>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* INFINITE SCROLL LOADER / TARGET */}
        {loading && !loadingMore && <div className="p-10 text-center"><Loader2 className="animate-spin inline text-indigo-600"/> Loading directory...</div>}
        
        {members.length > 0 && (
          <div ref={observerTarget} className="p-6 text-center text-slate-400 text-xs font-medium h-16 flex items-center justify-center">
            {loadingMore ? <Loader2 className="animate-spin text-indigo-600"/> : hasMore ? 'Scroll down to load more' : 'End of directory'}
          </div>
        )}
      </div>

      <MemberForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={handleSaveSuccess} initialData={selectedMember} />
      <MemberProfile isOpen={!!viewMember} member={viewMember} onClose={() => setViewMember(null)} onEdit={handleEdit} />
      <style>{`.input-filter { @apply w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-700; }`}</style>
    </div>
  );
}