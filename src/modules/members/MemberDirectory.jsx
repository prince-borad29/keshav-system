import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Eye, Edit3, Trash2, MapPin, Loader2, ShieldAlert, X, AlertTriangle, Filter, Settings, RefreshCw, SortAsc } from 'lucide-react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase, withTimeout } from '../../lib/supabase';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/Modal';
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

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Filter & Multi-Sort States
  const defaultFilters = { kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' };
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  
  // 🛡️ NEW: Multi-Level Sort Array
  const defaultSortConfig = [{ column: 'name', ascending: true }];
  const [sortConfig, setSortConfig] = useState(defaultSortConfig);
  const [draftSortConfig, setDraftSortConfig] = useState(defaultSortConfig);

  // Drawer States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('filter'); // 'filter' or 'sort'

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);

  // Debounce search
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(() => {
      if (isActive) setDebouncedSearch(searchTerm);
    }, 400);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // Sync draft states when drawer opens
  useEffect(() => {
    if (isFilterOpen) {
      setDraftFilters({ ...filters });
      setDraftSortConfig([...sortConfig]); // Deep copy sort array
      setDrawerTab('filter'); 
    }
  }, [isFilterOpen, filters, sortConfig]);

  // 1. Fetch Scope Permissions
  const { data: scopeData } = useQuery({
    queryKey: ['directory-scope', profile?.id],
    queryFn: async () => {
      let allowedMandalIds = [];
      let assignedProjectIds = [];
      
      if (role === 'sanchalak') allowedMandalIds = [profile.assigned_mandal_id];
      else if (role === 'nirikshak') {
        const { data } = await withTimeout(supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id));
        allowedMandalIds = data?.map(d => d.mandal_id) || [];
        if (profile.assigned_mandal_id) allowedMandalIds.push(profile.assigned_mandal_id);
      } 
      else if (['nirdeshak', 'project_admin'].includes(role)) {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!kId && profile.assigned_mandal_id) {
           const { data } = await withTimeout(supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single());
           if (data) kId = data.kshetra_id;
        }
        if (kId) {
            const { data } = await withTimeout(supabase.from('mandals').select('id').eq('kshetra_id', kId));
            allowedMandalIds = data?.map(m => m.id) || [];
        }
        if (role === 'project_admin') {
           const { data } = await withTimeout(supabase.from('project_assignments').select('project_id').eq('user_id', profile.id));
           assignedProjectIds = data?.map(p => p.project_id) || [];
        }
      }
      return { allowedMandalIds, assignedProjectIds };
    },
    enabled: !!profile && isAuthorized,
    staleTime: 1000 * 60 * 30, 
  });

  // 2. Fetch Dropdown Master Data
  const { data: dropdowns } = useQuery({
    queryKey: ['directory-dropdowns', scopeData?.allowedMandalIds],
    queryFn: async () => {
      const [tRes, kRes] = await Promise.all([
        withTimeout(supabase.from('tags').select('id, name').contains('category', ['Member']).order('name')),
        isAdmin ? withTimeout(supabase.from('kshetras').select('id, name').order('name')) : Promise.resolve({ data: [] })
      ]);
      
      if (!isAdmin && (!scopeData?.allowedMandalIds || scopeData.allowedMandalIds.length === 0)) {
        return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: [] };
      }

      let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');
      if (!isAdmin) mQuery = mQuery.in('id', scopeData.allowedMandalIds);
      
      const { data: mData } = await withTimeout(mQuery);
      return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: mData || [] };
    },
    enabled: !!scopeData,
    staleTime: 1000 * 60 * 30,
  });

  // 3. Infinite Query for Members
  const { 
    data: membersPages, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isMembersLoading,
    isFetching,
    isError,
    refetch
  } = useInfiniteQuery({
    queryKey: ['members', scopeData, debouncedSearch, filters, sortConfig], // 🛡️ Re-fetches when Multi-Sort changes
    queryFn: async ({ pageParam = 0, signal }) => {
      if (!scopeData) return { data: [], count: 0 };
      if (!isAdmin && scopeData.allowedMandalIds.length === 0) return { data: [], count: 0 };
      if (role === 'project_admin' && scopeData.assignedProjectIds.length === 0) return { data: [], count: 0 };

      let selectString = `*, mandals!inner(id, name, kshetra_id, kshetras(id, name)), ${filters.tag_id ? 'member_tags!inner' : 'member_tags'}(tag_id, tags(name, color))`;
      if (role === 'project_admin') selectString += `, project_registrations!inner(project_id)`;

      let query = supabase.from('members').select(selectString, { count: 'exact' });

      // Apply Filters
      if (!isAdmin && profile?.gender) query = query.eq('gender', profile.gender);
      if (!isAdmin) {
        if (scopeData.allowedMandalIds && scopeData.allowedMandalIds.length > 0) {
          query = query.in('mandal_id', scopeData.allowedMandalIds);
        } else {
          query = query.eq('mandal_id', '00000000-0000-0000-0000-000000000000'); 
        }
      }
      if (role === 'project_admin') {
        if (scopeData.assignedProjectIds && scopeData.assignedProjectIds.length > 0) {
           query = query.in('project_registrations.project_id', scopeData.assignedProjectIds);
        } else {
           query = query.eq('project_registrations.project_id', '00000000-0000-0000-0000-000000000000');
        }
      }
      
      if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%`);
      if (isAdmin && filters.kshetra_id) query = query.eq('mandals.kshetra_id', filters.kshetra_id);
      if (filters.mandal_id) query = query.eq('mandal_id', filters.mandal_id);
      if (filters.designation) query = query.eq('designation', filters.designation);
      if (isAdmin && filters.gender) query = query.eq('gender', filters.gender);
      if (filters.tag_id) query = query.eq('member_tags.tag_id', filters.tag_id);

      // 🛡️ APPLY MULTI-LEVEL SORTING
      sortConfig.forEach(sort => {
        query = query.order(sort.column, { ascending: sort.ascending });
      });

      const from = pageParam * PAGE_SIZE;
      
      const { data, count, error } = await withTimeout(
        query.range(from, from + PAGE_SIZE - 1)
             .order('id', { ascending: true }) // Final tie-breaker for stable pagination
             .abortSignal(signal),
        10000
      );

      if (error) throw error;
      return { data, count, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!scopeData,
    staleTime: 1000 * 60 * 5, 
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetching && !isError) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage]);

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await withTimeout(supabase.from('members').delete().eq('id', id));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['members']);
      toast.success("Member deleted successfully");
      setMemberToDelete(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setMemberToDelete(null);
    }
  });

  const members = useMemo(() => membersPages?.pages.flatMap(page => page.data) || [], [membersPages]);
  const totalCount = membersPages?.pages[0]?.count || 0;
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // Options for Sort Builder
  const sortableColumns = [
    { value: 'name', label: 'First Name' },
    { value: 'surname', label: 'Last Name' },
    { value: 'internal_code', label: 'Internal ID' },
    { value: 'designation', label: 'Designation' },
    { value: 'gender', label: 'Gender' }
  ];

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

  const FilterRow = ({ label, value, options, fieldKey }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 min-w-[120px] border border-gray-200 rounded-md p-2 bg-white text-sm font-medium flex justify-between items-center text-gray-700">
        {label} 
        {/* <Settings size={14} className="text-gray-400"/> */}
      </div>
      <div className="flex-[1.5] relative">
        <select 
          className="w-full border border-gray-200 rounded-md p-2 bg-white text-sm outline-none appearance-none cursor-pointer focus:border-[#5C3030]" 
          value={value} 
          onChange={(e) => setDraftFilters(prev => ({...prev, [fieldKey]: e.target.value}))}
        >
          <option value="">Select Criteria...</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {/* <button 
        onClick={() => setDraftFilters(prev => ({...prev, [fieldKey]: ''}))} 
        className="p-2 bg-gray-50 border border-gray-200 rounded-md text-gray-500 hover:text-red-600 transition-colors"
      >
        <Trash2 size={16} strokeWidth={1.5}/>
      </button> */}
    </div>
  );

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

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          <input className={`${inputClass} pl-9 pr-9`} placeholder="Search by name, ID, mobile..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 transition-colors">
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <Button variant="secondary" icon={Filter} onClick={() => setIsFilterOpen(true)} className="relative !bg-white">
          View & Sort
          {activeFilterCount > 0 && (
             <span className="absolute -top-1.5 -right-1.5 bg-[#5C3030] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm border border-white">
               {activeFilterCount}
             </span>
          )}
        </Button>
      </div>

      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-x-auto relative min-h-[300px]">
        {(isFetching && !isFetchingNextPage && !isError) && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
            <Loader2 className="animate-spin text-[#5C3030]" size={24} />
          </div>
        )}
        
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
            {isError && (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} strokeWidth={1.5}/>
                  <h3 className="text-gray-900 font-bold mb-1">Failed to load records</h3>
                  <p className="text-gray-500 text-sm mb-4">Please check your internet connection.</p>
                  <Button variant="secondary" size="sm" onClick={() => refetch()}><RefreshCw size={14} className="mr-2"/> Try Again</Button>
                </td>
              </tr>
            )}

            {!isError && members.length === 0 && !isFetching && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400 text-sm">
                   No members found matching your search and filters.
                </td>
              </tr>
            )}

            {!isError && members.map(m => (
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
                          <button onClick={() => setMemberToDelete(m)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            <Trash2 size={16} strokeWidth={1.5}/>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {!isError && members.length > 0 && (
          <div ref={loadMoreRef} className="p-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {isFetchingNextPage ? <Loader2 size={14} className="animate-spin mx-auto text-[#5C3030]"/> : hasNextPage ? 'Scroll for more' : 'End of directory'}
          </div>
        )}
      </div>

      {isFilterOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-gray-900">Configure View</h2>
              <button onClick={() => setIsFilterOpen(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 p-1.5 rounded-md transition-colors"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              
              {/* Dynamic Filter/Sort Tabs */}
              <div className="flex p-1 bg-gray-100 rounded-lg mb-6 border border-gray-200">
                <button 
                  onClick={() => setDrawerTab('filter')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all ${drawerTab === 'filter' ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Filter
                </button>
                <button 
                  onClick={() => setDrawerTab('sort')}
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${drawerTab === 'sort' ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <SortAsc size={14} /> Sort
                </button>
              </div>

              {drawerTab === 'filter' ? (
                <div className="space-y-1 animate-in fade-in duration-200">
                  {isAdmin && (
                    <FilterRow label="Kshetra" fieldKey="kshetra_id" value={draftFilters.kshetra_id} options={dropdowns?.kshetras.map(k => ({value: k.id, label: k.name})) || []} />
                  )}
                  {['admin', 'nirdeshak', 'nirikshak', 'project_admin'].includes(role) && (
                    <FilterRow label="Mandal" fieldKey="mandal_id" value={draftFilters.mandal_id} options={dropdowns?.mandals.map(m => ({value: m.id, label: m.name})) || []} />
                  )}
                  <FilterRow label="Designation" fieldKey="designation" value={draftFilters.designation} options={['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => ({value: d, label: d}))} />
                  {isAdmin && (
                    <FilterRow label="Gender" fieldKey="gender" value={draftFilters.gender} options={[{value: 'Yuvak', label: 'Yuvak'}, {value: 'Yuvati', label: 'Yuvati'}]} />
                  )}
                  <FilterRow label="Tags" fieldKey="tag_id" value={draftFilters.tag_id} options={dropdowns?.tags.map(t => ({value: t.id, label: t.name})) || []} />
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Multi-Level Sorting</p>
                  
                  {/* 🛡️ DYNAMIC SORT BUILDER */}
                  {draftSortConfig.map((sort, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-md border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                      <div className="w-6 h-6 bg-white border border-gray-200 rounded flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                        {index + 1}
                      </div>
                      <select 
                        className="flex-1 border border-gray-200 rounded-md p-1.5 bg-white text-sm outline-none cursor-pointer focus:border-[#5C3030]"
                        value={sort.column}
                        onChange={e => {
                          const newSort = [...draftSortConfig];
                          newSort[index].column = e.target.value;
                          setDraftSortConfig(newSort);
                        }}
                      >
                        {sortableColumns.map(col => <option key={col.value} value={col.value}>{col.label}</option>)}
                      </select>
                      <select 
                        className="w-24 border border-gray-200 rounded-md p-1.5 bg-white text-sm outline-none cursor-pointer focus:border-[#5C3030]"
                        value={sort.ascending.toString()}
                        onChange={e => {
                          const newSort = [...draftSortConfig];
                          newSort[index].ascending = e.target.value === 'true';
                          setDraftSortConfig(newSort);
                        }}
                      >
                        <option value="true">A-Z / Asc</option>
                        <option value="false">Z-A / Desc</option>
                      </select>
                      {draftSortConfig.length > 1 && (
                        <button 
                          onClick={() => {
                            const newSort = [...draftSortConfig];
                            newSort.splice(index, 1);
                            setDraftSortConfig(newSort);
                          }} 
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors bg-white rounded border border-gray-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {draftSortConfig.length < 3 && (
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="w-full border-dashed border-gray-300 text-gray-500 bg-transparent hover:bg-gray-50 mt-2"
                      onClick={() => setDraftSortConfig([...draftSortConfig, { column: 'designation', ascending: true }])}
                    >
                      <Plus size={14} className="mr-1.5" /> Add Sort Level
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-3 bg-white">
              <Button 
                variant="secondary" 
                className="flex-1 bg-gray-50 !border-gray-200 !text-gray-700 hover:!bg-gray-100" 
                onClick={() => {
                  setDraftFilters(defaultFilters);
                  setFilters(defaultFilters);
                  setDraftSortConfig(defaultSortConfig);
                  setSortConfig(defaultSortConfig);
                  setIsFilterOpen(false);
                }}
              >
                Reset All
              </Button>
              <Button 
                className="flex-1 !bg-[#1E4B59] !border-[#1E4B59] hover:!bg-[#153641]" 
                onClick={() => { 
                  setFilters(draftFilters); 
                  setSortConfig(draftSortConfig); 
                  setIsFilterOpen(false); 
                }}
              >
                Apply View
              </Button>
            </div>
          </div>
        </>
      )}

      <MemberForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={() => {
        queryClient.invalidateQueries(['members']);
        toast.success(selectedMember ? "Profile Updated!" : "Member Registered!");
      }} initialData={selectedMember} />
      <MemberProfile isOpen={!!viewMember} member={viewMember} onClose={() => setViewMember(null)} />

      <Modal isOpen={!!memberToDelete} onClose={() => setMemberToDelete(null)} title="Confirm Deletion">
        <div className="space-y-4">
          <div className="bg-red-50 text-red-800 p-4 rounded-md border border-red-100 flex gap-3">
            <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
            <p className="text-sm">Are you sure you want to permanently delete <span className="font-bold">{memberToDelete?.name} {memberToDelete?.surname}</span>? This action cannot be undone.</p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMemberToDelete(null)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button className="!bg-red-600 !border-red-600 hover:!bg-red-700" onClick={() => deleteMutation.mutate(memberToDelete.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : "Yes, Delete Member"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}