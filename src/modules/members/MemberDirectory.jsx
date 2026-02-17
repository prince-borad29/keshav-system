import React, { useState, useEffect } from 'react';
import { Search, Plus, Eye, Edit3, Trash2, Tag, MapPin, Briefcase, Loader2, ShieldAlert, Lock } from 'lucide-react';
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
  
  // -- ROLES --
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isNirdeshak = role === 'nirdeshak';
  const isNirikshak = role === 'nirikshak';
  const isSanchalak = role === 'sanchalak';

  // 🛑 SECURITY GATE 🛑
  // Define exactly who is allowed to be here
  const allowedRoles = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'];
  const isAuthorized = allowedRoles.includes(role);

  // -- STATE --
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Permissions State
  const [allowedMandalIds, setAllowedMandalIds] = useState(null); 
  const [permsLoaded, setPermsLoaded] = useState(false);

  // Filters & Dropdowns
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' });
  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [tags, setTags] = useState([]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);

  // -- 1. SECURITY CHECK & PERMISSIONS --
  useEffect(() => {
    // If user profile isn't loaded yet, wait.
    if (!profile) return;

    // If unauthorized, stop here. The UI below handles the display.
    if (!isAuthorized) {
        setLoading(false); 
        return;
    }

    const loadPermissions = async () => {
      let ids = [];
      
      try {
        if (isSanchalak) {
          if (profile.assigned_mandal_id) ids = [profile.assigned_mandal_id];
        } 
        else if (isNirikshak) {
          const { data } = await supabase
            .from('nirikshak_assignments')
            .select('mandal_id')
            .eq('nirikshak_id', profile.id);
          
          ids = data ? data.map(d => d.mandal_id) : [];
          if (ids.length === 0 && profile.assigned_mandal_id) {
              ids = [profile.assigned_mandal_id];
          }
        }
        else if (isNirdeshak) {
          // Smart Kshetra Derivation
          let kId = profile.assigned_kshetra_id || profile.kshetra_id;
          
          if (!kId && profile.assigned_mandal_id) {
               const { data: mData } = await supabase
                 .from('mandals')
                 .select('kshetra_id')
                 .eq('id', profile.assigned_mandal_id)
                 .single();
               if (mData) kId = mData.kshetra_id;
          }

          if (kId) {
              const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
              ids = data ? data.map(m => m.id) : [];
          }
        }
      } catch (err) {
        console.error("Permission Load Error", err);
      }

      setAllowedMandalIds(ids);
      setPermsLoaded(true);
    };

    loadPermissions();
  }, [profile, isSanchalak, isNirikshak, isNirdeshak, isAuthorized]);

  // -- 2. DATA LOADING --
  useEffect(() => {
    if ((permsLoaded || isAdmin) && isAuthorized) {
      fetchDropdowns();
      fetchMembers();
    }
  }, [permsLoaded, page, filters, searchTerm, isAuthorized]);

  // -- 🛑 UNAUTHORIZED VIEW 🛑 --
  if (profile && !isAuthorized) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center text-center p-6">
        <div className="bg-red-50 p-6 rounded-full mb-4">
            <ShieldAlert size={48} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-slate-500 max-w-md mb-6">
          You are logged in as a <strong>{role}</strong>. You do not have permission to view the Member Directory.
        </p>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  // ... (Rest of fetchDropdowns, fetchMembers helpers remain exactly the same)
  const fetchDropdowns = async () => {
    try {
        const { data: tData } = await supabase.from('tags').select('id, name').eq('category', 'Member').order('name');
        if (tData) setTags(tData);

        if (isAdmin) {
            const { data: kData } = await supabase.from('kshetras').select('id, name').order('name');
            if (kData) setKshetras(kData);
        }

        let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');
        
        if (allowedMandalIds !== null) {
            if (allowedMandalIds.length > 0) {
                mQuery = mQuery.in('id', allowedMandalIds);
            } else {
                setMandals([]); return;
            }
        }
        const { data: mData } = await mQuery;
        if (mData) setMandals(mData);
    } catch (e) { console.error(e); }
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('members').select(`
          *,
          mandals!inner ( id, name, kshetra_id, kshetras ( id, name ) ),
          member_tags ( tag_id, tags (name, color) )
        `, { count: 'exact' });

      // Scope
      if (!isAdmin && profile?.gender) query = query.eq('gender', profile.gender);
      if (allowedMandalIds !== null) {
         if (allowedMandalIds.length > 0) query = query.in('mandal_id', allowedMandalIds);
         else { setMembers([]); setTotalCount(0); setLoading(false); return; }
      }

      // Filters
      if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%,internal_code.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%`);
      if (isAdmin && filters.kshetra_id) query = query.eq('mandals.kshetra_id', filters.kshetra_id);
      if (filters.mandal_id) {
         if (isAdmin || allowedMandalIds.includes(filters.mandal_id)) query = query.eq('mandal_id', filters.mandal_id);
      }
      if (filters.designation) query = query.eq('designation', filters.designation);
      if (isAdmin && filters.gender) query = query.eq('gender', filters.gender);

      // Tag Filter
      if (filters.tag_id) {
        query = supabase.from('members').select(`
          *,
          mandals!inner ( id, name, kshetra_id, kshetras ( id, name ) ),
          member_tags!inner ( tag_id, tags (name, color) ) 
        `, { count: 'exact' }).eq('member_tags.tag_id', filters.tag_id);
        
        if (!isAdmin && profile?.gender) query = query.eq('gender', profile.gender);
        if (allowedMandalIds !== null) query = query.in('mandal_id', allowedMandalIds);
        
        if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%`);
        if (filters.mandal_id) query = query.eq('mandal_id', filters.mandal_id);
        if (filters.designation) query = query.eq('designation', filters.designation);
      }

      const from = (page - 1) * pageSize;
      const { data, count, error } = await query.range(from, from + pageSize - 1).order('created_at', { ascending: false });
      
      if (error) throw error;
      setMembers(data || []);
      setTotalCount(count || 0);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleCreate = () => { setSelectedMember(null); setIsFormOpen(true); };
  const handleEdit = (m) => { setSelectedMember(m); setIsFormOpen(true); };
  const handleView = (m) => { setViewMember(m); };
  const handleDelete = async (id) => { 
    if(confirm("Delete member?")) { await supabase.from('members').delete().eq('id', id); fetchMembers(); } 
  };

  // -- RENDER LOADING OR CONTENT --
  if ((!permsLoaded && !isAdmin) || loading && !members.length) return <div className="p-10 text-center"><Loader2 className="animate-spin inline text-indigo-600"/> Loading directory...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Member Directory</h1>
            <p className="text-slate-500 text-sm">
                Total Members: {totalCount}
                {!isAdmin && <span className="ml-2 text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-medium capitalize">View: {role}</span>}
            </p>
        </div>
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
                <select className="input-filter pl-8" value={filters.kshetra_id} onChange={(e) => setFilters({...filters, kshetra_id: e.target.value, mandal_id: '', page: 1})}>
                    <option value="">All Kshetras</option>
                    {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
            </div>
          )}
          {(isAdmin || isNirdeshak || isNirikshak) && (
            <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
                <select className="input-filter pl-8" value={filters.mandal_id} onChange={(e) => setFilters({...filters, mandal_id: e.target.value, page: 1})}>
                    <option value="">{isNirikshak ? "My Mandals" : (isNirdeshak ? "Mandals in Region" : "All Mandals")}</option>
                    {mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            </div>
          )}
          <div className="relative">
            <Briefcase className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
            <select className="input-filter pl-8" value={filters.designation} onChange={(e) => setFilters({...filters, designation: e.target.value, page: 1})}>
                <option value="">All Roles</option>
                {['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {isAdmin && (
             <select className="input-filter" value={filters.gender} onChange={(e) => setFilters({...filters, gender: e.target.value, page: 1})}>
                <option value="">All Genders</option>
                <option value="Yuvak">Yuvak</option>
                <option value="Yuvati">Yuvati</option>
             </select>
          )}
          <div className="relative">
            <Tag className="absolute left-2.5 top-2.5 text-slate-400" size={14}/>
            <select className="input-filter pl-8" value={filters.tag_id} onChange={(e) => setFilters({...filters, tag_id: e.target.value, page: 1})}>
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
                    {(isAdmin || isNirdeshak) && <div className="text-[10px] text-slate-400">{m.mandals?.kshetras?.name}</div>}
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
        
        <div className="flex justify-between items-center p-4 border-t border-slate-100">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 disabled:opacity-30 hover:bg-slate-50 rounded-lg"><div className="flex items-center gap-1">« Prev</div></button>
            <span className="text-xs text-slate-500 font-medium">Page {page}</span>
            <button disabled={members.length < pageSize} onClick={() => setPage(p => p + 1)} className="p-2 disabled:opacity-30 hover:bg-slate-50 rounded-lg"><div className="flex items-center gap-1">Next »</div></button>
        </div>
      </div>

      <MemberForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={fetchMembers} initialData={selectedMember} />
      <MemberProfile isOpen={!!viewMember} member={viewMember} onClose={() => setViewMember(null)} onEdit={handleEdit} />
      <style>{`.input-filter { @apply w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-700; }`}</style>
    </div>
  );
}