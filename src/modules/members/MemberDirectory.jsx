import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, Eye, Edit3, Trash2, Tag, MapPin, Briefcase, Loader2, ShieldAlert } from 'lucide-react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import MemberForm from './MemberForm';
import MemberProfile from './MemberProfile';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const PAGE_SIZE = 20;

export default function MemberDirectory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ref: loadMoreRef, inView } = useInView();
  
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isAuthorized = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak', 'project_admin'].includes(role);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({ kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 1. Fetch Scope Permissions
  const { data: scopeData, isLoading: scopeLoading } = useQuery({
    queryKey: ['directory-scope', profile?.id],
    queryFn: async () => {
      let allowedMandalIds = [];
      let assignedProjectIds = [];
      
      if (role === 'sanchalak') allowedMandalIds = [profile.assigned_mandal_id];
      else if (role === 'nirikshak') {
        const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id);
        allowedMandalIds = data?.map(d => d.mandal_id) || [];
        if (profile.assigned_mandal_id) allowedMandalIds.push(profile.assigned_mandal_id);
      } 
      else if (['nirdeshak', 'project_admin'].includes(role)) {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!kId && profile.assigned_mandal_id) {
           const { data } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
           if (data) kId = data.kshetra_id;
        }
        if (kId) {
            const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
            allowedMandalIds = data?.map(m => m.id) || [];
        }
        if (role === 'project_admin') {
           const { data } = await supabase.from('project_assignments').select('project_id').eq('user_id', profile.id);
           assignedProjectIds = data?.map(p => p.project_id) || [];
        }
      }
      return { allowedMandalIds, assignedProjectIds };
    },
    enabled: !!profile && isAuthorized,
  });

  // 2. Fetch Dropdown Master Data
  const { data: dropdowns } = useQuery({
    queryKey: ['directory-dropdowns', scopeData?.allowedMandalIds],
    queryFn: async () => {
      const [tRes, kRes] = await Promise.all([
        supabase.from('tags').select('id, name').contains('category', ['Member']).order('name'),
        isAdmin ? supabase.from('kshetras').select('id, name').order('name') : { data: [] }
      ]);
      
      let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');
      if (!isAdmin && scopeData?.allowedMandalIds) {
        if (scopeData.allowedMandalIds.length > 0) mQuery = mQuery.in('id', scopeData.allowedMandalIds);
        else return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: [] };
      }
      const { data: mData } = await mQuery;
      return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: mData || [] };
    },
    enabled: !!scopeData,
  });

  // 3. Infinite Query for Members
  const { 
    data: membersPages, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isMembersLoading 
  } = useInfiniteQuery({
    queryKey: ['members', scopeData, debouncedSearch, filters],
    queryFn: async ({ pageParam = 0, signal }) => {
      if (!scopeData) return { data: [], count: 0 };
      if (!isAdmin && scopeData.allowedMandalIds.length === 0) return { data: [], count: 0 };
      if (role === 'project_admin' && scopeData.assignedProjectIds.length === 0) return { data: [], count: 0 };

      let selectString = `*, mandals!inner(id, name, kshetra_id, kshetras(id, name)), ${filters.tag_id ? 'member_tags!inner' : 'member_tags'}(tag_id, tags(name, color))`;
      if (role === 'project_admin') selectString += `, project_registrations!inner(project_id)`;

      let query = supabase.from('members').select(selectString, { count: 'exact' });

      // Filters & Scope
      if (!isAdmin && profile?.gender) query = query.eq('gender', profile.gender);
      if (!isAdmin) query = query.in('mandal_id', scopeData.allowedMandalIds);
      if (role === 'project_admin') query = query.in('project_registrations.project_id', scopeData.assignedProjectIds);
      
      if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%`);
      if (isAdmin && filters.kshetra_id) query = query.eq('mandals.kshetra_id', filters.kshetra_id);
      if (filters.mandal_id) query = query.eq('mandal_id', filters.mandal_id);
      if (filters.designation) query = query.eq('designation', filters.designation);
      if (isAdmin && filters.gender) query = query.eq('gender', filters.gender);
      if (filters.tag_id) query = query.eq('member_tags.tag_id', filters.tag_id);

      const from = pageParam * PAGE_SIZE;
      const { data, count, error } = await query
        .range(from, from + PAGE_SIZE - 1)
        .order('name', { ascending: true })
        .order('surname', { ascending: true })
        .order('id', { ascending: true })
        .abortSignal(signal);

      if (error) throw error;
      return { data, count, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!scopeData,
    keepPreviousData: true,
  });

  // Handle intersection for infinite scroll
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Deletion Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['members'])
  });

  const members = useMemo(() => membersPages?.pages.flatMap(page => page.data) || [], [membersPages]);
  const totalCount = membersPages?.pages[0]?.count || 0;

  if (profile && !isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <ShieldAlert size={48} strokeWidth={1.5} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 mb-6 text-sm">You lack permissions to view the Member Directory.</p>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {role === 'project_admin' ? "Registered Database" : "Member Directory"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Total Members: <span className="font-inter font-semibold">{totalCount}</span>
          </p>
        </div>
        {['admin', 'sanchalak', 'nirikshak'].includes(role) && (
          <Button icon={Plus} onClick={() => { setSelectedMember(null); setIsFormOpen(true); }}>Add Member</Button>
        )}
      </div>

      {/* Flat Filters */}
      <div className="bg-white p-3 border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          <input className={`${inputClass} pl-9`} placeholder="Search by name, ID, mobile..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {isAdmin && (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2.5 text-gray-400" size={14} strokeWidth={1.5}/>
              <select className={`${inputClass} pl-8`} value={filters.kshetra_id} onChange={(e) => setFilters({...filters, kshetra_id: e.target.value, mandal_id: ''})}>
                <option value="">All Kshetras</option>
                {dropdowns?.kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          )}
          {['admin', 'nirdeshak', 'nirikshak', 'project_admin'].includes(role) && (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2.5 text-gray-400" size={14} strokeWidth={1.5}/>
              <select className={`${inputClass} pl-8`} value={filters.mandal_id} onChange={(e) => setFilters({...filters, mandal_id: e.target.value})}>
                <option value="">All Mandals</option>
                {dropdowns?.mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div className="relative">
            <Briefcase className="absolute left-2.5 top-2.5 text-gray-400" size={14} strokeWidth={1.5}/>
            <select className={`${inputClass} pl-8`} value={filters.designation} onChange={(e) => setFilters({...filters, designation: e.target.value})}>
              <option value="">All Roles</option>
              {['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {isAdmin && (
             <select className={inputClass} value={filters.gender} onChange={(e) => setFilters({...filters, gender: e.target.value})}>
                <option value="">All Genders</option>
                <option value="Yuvak">Yuvak</option>
                <option value="Yuvati">Yuvati</option>
             </select>
          )}
          <div className="relative">
            <Tag className="absolute left-2.5 top-2.5 text-gray-400" size={14} strokeWidth={1.5}/>
            <select className={`${inputClass} pl-8`} value={filters.tag_id} onChange={(e) => setFilters({...filters, tag_id: e.target.value})}>
              <option value="">All Tags</option>
              {dropdowns?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Dense Table */}
      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-inter text-xs text-gray-500">{m.internal_code}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{m.name} {m.surname}</div>
                  <div className="text-xs text-gray-500 font-inter mt-0.5">{m.mobile || 'No Mobile'}</div>
                  {m.member_tags?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {m.member_tags.map(mt => (
                        <span key={mt.tag_id} className="px-1.5 py-[1px] bg-gray-100 text-gray-600 text-[9px] uppercase tracking-wider rounded border border-gray-200 font-semibold">
                          {mt.tags?.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-700">{m.mandals?.name}</div>
                  {['admin', 'nirdeshak', 'project_admin'].includes(role) && (
                    <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{m.mandals?.kshetras?.name}</div>
                  )}
                </td>
                <td className="px-4 py-3"><Badge variant="default">{m.designation}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setViewMember(m)} className="p-1.5 text-gray-400 hover:text-[#5C3030] hover:bg-gray-100 rounded-md transition-colors"><Eye size={16} strokeWidth={1.5}/></button>
                    {['admin', 'sanchalak', 'nirikshak'].includes(role) && (
                      <>
                        <button onClick={() => { setSelectedMember(m); setIsFormOpen(true); }} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"><Edit3 size={16} strokeWidth={1.5}/></button>
                        {isAdmin && (
                          <button onClick={() => { if(confirm("Delete member?")) deleteMutation.mutate(m.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            {deleteMutation.isLoading && deleteMutation.variables === m.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} strokeWidth={1.5}/>}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {isMembersLoading && members.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm"><Loader2 size={16} className="animate-spin inline mr-2"/> Loading...</td></tr>
            )}
          </tbody>
        </table>
        
        {/* Infinite Scroll Trigger */}
        {members.length > 0 && (
          <div ref={loadMoreRef} className="p-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {isFetchingNextPage ? <Loader2 size={14} className="animate-spin mx-auto"/> : hasNextPage ? 'Scroll for more' : 'End of directory'}
          </div>
        )}
      </div>

      <MemberForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={() => queryClient.invalidateQueries(['members'])} initialData={selectedMember} />
      <MemberProfile isOpen={!!viewMember} member={viewMember} onClose={() => setViewMember(null)} />
    </div>
  );
}