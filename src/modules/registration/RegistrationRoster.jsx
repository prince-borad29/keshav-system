import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, User, Plus, MapPin, Lock, ArrowLeft, Users, QrCode, Database, Check, Download, Layers, X, FileText, FileSpreadsheet, Filter, Settings, Trash2, SortAsc, ChevronDown } from 'lucide-react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase, withTimeout } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver'; 
import QrScanner from '../attendance/QrScanner';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/Modal';

const PAGE_SIZE = 20;

export default function RegistrationRoster({ project, onBack, isAdmin, profile }) { 
  const queryClient = useQueryClient();
  const { ref: loadMoreRef, inView } = useInView();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scanningMember, setScanningMember] = useState(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isMandalExportOpen, setIsMandalExportOpen] = useState(false);
  
  const defaultFilters = { kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' };
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  
  const defaultSortConfig = [{ column: 'name', ascending: true }];
  const [sortConfig, setSortConfig] = useState(defaultSortConfig);
  const [draftSortConfig, setDraftSortConfig] = useState(defaultSortConfig);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('filter');

  // 🛡️ Updated export state to support multiple mandals
  const [exportFilters, setExportFilters] = useState({ kshetra_id: '', mandal_ids: [], gender: '', designation: '', tag_id: '' });
  const [bulkConfig, setBulkConfig] = useState({ type: 'designation', value: '' });

  const role = (profile?.role || '').toLowerCase();
  const isGlobal = role === 'admin';

  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(() => {
      if (isActive) setDebouncedSearch(searchTerm);
    }, 500);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (isFilterOpen) {
      setDraftFilters({ ...filters });
      setDraftSortConfig([...sortConfig]); 
      setDrawerTab('filter'); 
    }
  }, [isFilterOpen, filters, sortConfig]);

  const { data: scopeData } = useQuery({
    queryKey: ['registration-scope', project.id, profile?.id],
    queryFn: async () => {
      let ids = [];
      let canRegister = false;

      if (isGlobal) return { ids: [], canRegister: true };

      if (role === 'sanchalak') {
        ids = [profile.assigned_mandal_id];
        canRegister = true;
      } 
      else if (role === 'nirikshak') {
        const { data } = await withTimeout(supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id));
        ids = data?.map(d => d.mandal_id) || [];
        if (profile.assigned_mandal_id) ids.push(profile.assigned_mandal_id);
        canRegister = true;
      } 
      else if (role === 'nirdeshak' || role === 'project_admin') {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!kId && profile.assigned_mandal_id) {
          const { data } = await withTimeout(supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single());
          if (data) kId = data.kshetra_id;
        }
        if (kId) {
          const { data } = await withTimeout(supabase.from('mandals').select('id').eq('kshetra_id', kId));
          ids = data?.map(m => m.id) || [];
        }

        if (role === 'project_admin') {
          const { data: assignment } = await withTimeout(supabase.from('project_assignments').select('role').eq('project_id', project.id).eq('user_id', profile.id).maybeSingle());
          canRegister = assignment?.role === 'Coordinator';
        } else {
          canRegister = true; 
        }
      }
      return { ids, canRegister };
    },
    enabled: !!profile,
    staleTime: 1000 * 60 * 30
  });

  const { data: registeredCount } = useQuery({
    queryKey: ['registration-count', project.id, scopeData?.ids],
    queryFn: async () => {
      let query = supabase.from('project_registrations').select('member_id, members!inner(gender, mandal_id)', { count: 'exact', head: true }).eq('project_id', project.id);
      if (!isGlobal && profile?.gender) query = query.eq('members.gender', profile.gender);
      if (!isGlobal && scopeData?.ids?.length > 0) query = query.in('members.mandal_id', scopeData.ids);
      const { count } = await withTimeout(query);
      return count || 0;
    },
    enabled: !!scopeData,
    refetchInterval: 5000 
  });

  const { 
    data: membersPages, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isMembersLoading,
    isFetching,
    isError
  } = useInfiniteQuery({
    queryKey: ['registration-list', project.id, scopeData, debouncedSearch, filters, sortConfig],
    queryFn: async ({ pageParam = 0, signal }) => {
      if (!scopeData) return { data: [] };
      if (!isGlobal && scopeData.ids.length === 0) return { data: [] };

      let selectString = `
        id, name, surname, internal_code, gender, designation, mobile,
        mandals!inner ( id, name, kshetra_id ),
        ${filters.tag_id ? 'member_tags!inner(tag_id),' : ''}
        ${scopeData.canRegister ? `project_registrations ( project_id, external_qr )` : `project_registrations!inner ( project_id, external_qr )`}
      `;

      let query = supabase.from('members').select(selectString);

      if (!scopeData.canRegister) query = query.eq('project_registrations.project_id', project.id);
      if (!isGlobal && profile?.gender) query = query.eq('gender', profile.gender);
      
      if (!isGlobal) {
        if (scopeData.ids && scopeData.ids.length > 0) query = query.in('mandal_id', scopeData.ids);
        else query = query.eq('mandal_id', '00000000-0000-0000-0000-000000000000');
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%`);
      }
      
      if (isAdmin && filters.kshetra_id) query = query.eq('mandals.kshetra_id', filters.kshetra_id);
      if (filters.mandal_id) query = query.eq('mandal_id', filters.mandal_id);
      if (filters.designation) query = query.eq('designation', filters.designation);
      if (isAdmin && filters.gender) query = query.eq('gender', filters.gender);
      if (filters.tag_id) query = query.eq('member_tags.tag_id', filters.tag_id);

      sortConfig.forEach(sort => {
        query = query.order(sort.column, { ascending: sort.ascending });
      });

      const from = pageParam * PAGE_SIZE;
      const { data, error } = await withTimeout(
        query.range(from, from + PAGE_SIZE - 1).order('id', { ascending: true }).abortSignal(signal),
        8000
      );

      if (error) throw error;

      const processed = data.map(m => {
        const reg = m.project_registrations.find(r => r.project_id === project.id);
        return { ...m, is_registered: !!reg, external_qr: reg?.external_qr || null };
      });

      return { data: processed, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!scopeData,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetching && !isError) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage]);

  const { data: dropdowns } = useQuery({
    queryKey: ['admin-dropdowns'],
    queryFn: async () => {
      const [tRes, kRes, mRes] = await Promise.all([
        withTimeout(supabase.from('tags').select('id, name').order('name')),
        withTimeout(supabase.from('kshetras').select('id, name').order('name')),
        withTimeout(supabase.from('mandals').select('id, name, kshetra_id').order('name'))
      ]);
      return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: mRes.data || [] };
    },
    enabled: isAdmin && (isExportModalOpen || isBulkModalOpen || isFilterOpen),
    staleTime: 1000 * 60 * 30
  });

  const sortableColumns = [
    { value: 'name', label: 'First Name' },
    { value: 'surname', label: 'Last Name' },
    { value: 'internal_code', label: 'Internal ID' },
    { value: 'designation', label: 'Designation' },
    { value: 'gender', label: 'Gender' }
  ];

  const toggleRegistration = useMutation({
    mutationFn: async (member) => {
      if (member.is_registered) {
        const { error } = await withTimeout(supabase.from('project_registrations').delete().match({ project_id: project.id, member_id: member.id }));
        if (error) throw error;
      } else {
        const { error } = await withTimeout(supabase.from('project_registrations').insert({ project_id: project.id, member_id: member.id, registered_by: profile.id }));
        if (error) throw error;
      }
    },
    onMutate: async (member) => {
      await queryClient.cancelQueries({ queryKey: ['registration-list', project.id] });
      const previousData = queryClient.getQueryData(['registration-list', project.id, scopeData, debouncedSearch, filters, sortConfig]);
      
      queryClient.setQueryData(['registration-list', project.id, scopeData, debouncedSearch, filters, sortConfig], old => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            data: page.data.map(m => m.id === member.id ? { ...m, is_registered: !m.is_registered, external_qr: !m.is_registered ? m.external_qr : null } : m)
          }))
        };
      });
      return { previousData };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registration-count', project.id] }),
    onError: (err, member, context) => {
      if (context?.previousData) queryClient.setQueryData(['registration-list', project.id, scopeData, debouncedSearch, filters, sortConfig], context.previousData);
      toast.error(`Action failed: ${err.message}`);
    }
  });

  const handleMapExternalQr = async (scannedCode) => {
    if (!scanningMember) return { success: false, message: "No member selected" };
    const cleanCode = scannedCode.trim();
    try {
      const { data: existing } = await withTimeout(supabase.from('project_registrations').select('member_id').eq('project_id', project.id).eq('external_qr', cleanCode).maybeSingle());
      if (existing && existing.member_id !== scanningMember.id) return { success: false, type: 'error', message: "Badge already assigned!" };

      const { error } = await withTimeout(supabase.from('project_registrations').update({ external_qr: cleanCode }).match({ project_id: project.id, member_id: scanningMember.id }));
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['registration-list', project.id] });
      setTimeout(() => setScanningMember(null), 1200);
      return { success: true, message: `Badge linked!` };
    } catch (err) { return { success: false, type: 'error', message: "Database Error" }; }
  };

  // --- 🚀 BULLETPROOF EXPORT ENGINE ---
  const handleExport = async (format) => {
    const loadingToast = toast.loading("Generating report...");
    try {
      let query = supabase.from('project_registrations')
        .select(`member_id, members!inner(name, surname, mobile, designation, mandal_id, mandals(id, name, kshetra_id, kshetras(name)), member_tags(tag_id))`)
        .eq('project_id', project.id)
        .order('members(name)', { ascending: true });

      // Apply Base Scope
      if (!isGlobal && profile?.gender) query = query.eq('members.gender', profile.gender);
      if (!isGlobal && scopeData?.ids?.length > 0) query = query.in('members.mandal_id', scopeData.ids);

      // 🛡️ Apply Admin Filters (Natively on Mandal ID instead of relying on joins)
      if (isAdmin) {
        if (exportFilters.mandal_ids.length > 0) {
          query = query.in('members.mandal_id', exportFilters.mandal_ids);
        } else if (exportFilters.kshetra_id) {
          const mIds = dropdowns?.mandals.filter(m => m.kshetra_id === exportFilters.kshetra_id).map(m => m.id) || [];
          if (mIds.length > 0) {
            query = query.in('members.mandal_id', mIds);
          } else {
            query = query.eq('members.mandal_id', '00000000-0000-0000-0000-000000000000'); 
          }
        }
        
        if (exportFilters.gender) query = query.eq('members.gender', exportFilters.gender);
        if (exportFilters.designation) query = query.eq('members.designation', exportFilters.designation);
        if (exportFilters.tag_id) query = query.eq('members.member_tags.tag_id', exportFilters.tag_id);
      }

      const { data, error } = await withTimeout(query, 15000);
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("No data found for this export.", { id: loadingToast });
        return;
      }

      // 🛡️ DYNAMIC HEADERS & COLUMNS
      const kshetraName = exportFilters.kshetra_id ? dropdowns?.kshetras.find(k => k.id === exportFilters.kshetra_id)?.name : null;
      const showKshetraCol = !exportFilters.kshetra_id && exportFilters.mandal_ids.length === 0;
      const showMandalCol = exportFilters.mandal_ids.length !== 1;

      let subtitle = "All Kshetras & Mandals";
      if (exportFilters.mandal_ids.length === 1) {
        const mName = dropdowns?.mandals.find(m => m.id === exportFilters.mandal_ids[0])?.name;
        subtitle = `Mandal: ${mName}`;
      } else if (exportFilters.mandal_ids.length > 1) {
        subtitle = kshetraName ? `Kshetra: ${kshetraName} (Filtered Mandals)` : `Multiple Mandals Selected`;
      } else if (kshetraName) {
        subtitle = `Kshetra: ${kshetraName} (All Mandals)`;
      }

      const cleanData = data.map(row => {
        const m = row.members;
        const obj = {
          Name: `${m.name} ${m.surname}`,
          Mobile: m.mobile || '-'
        };
        if (showMandalCol) obj.Mandal = m.mandals?.name || '-';
        if (showKshetraCol) obj.Kshetra = m.mandals?.kshetras?.name || '-';
        return obj;
      });

      if (format === 'csv') {
        const headers = Object.keys(cleanData[0]);
        const csvRows = cleanData.map(row => headers.map(h => `"${row[h]}"`).join(','));
        const csvContent = "\uFEFF" + [headers.join(','), ...csvRows].join('\n'); 
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `Registrations_${project.name.replace(/\s+/g, '_')}.csv`);
        toast.success("Excel/CSV downloaded!", { id: loadingToast });
      } 
      else if (format === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.write('<html><head><title>Registration Report</title>');
        doc.write('<style>body{font-family:sans-serif; padding:20px; color:#111827;} table{border-collapse:collapse; width:100%; font-size:12px; margin-top:20px;} th,td{border:1px solid #e5e7eb; padding:10px; text-align:left;} th{background-color:#f9fafb; color:#374151;}</style>');
        doc.write('</head><body>');
        doc.write(`<h2 style="color:#5C3030; margin-bottom:5px;">${project.name}</h2>`);
        doc.write(`<p style="color:#6b7280; font-size:14px; margin-top:0;">${subtitle} &bull; Total: ${cleanData.length}</p>`);
        
        doc.write('<table><thead><tr>');
        Object.keys(cleanData[0]).forEach(h => doc.write(`<th>${h}</th>`));
        doc.write('</tr></thead><tbody>');
        
        cleanData.forEach(row => {
          doc.write('<tr>');
          Object.values(row).forEach(val => doc.write(`<td>${val}</td>`));
          doc.write('</tr>');
        });
        
        doc.write('</tbody></table></body></html>');
        doc.close();
        
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          toast.success("PDF generated!", { id: loadingToast });
          setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 500);
      }

      setIsExportModalOpen(false);
    } catch (err) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const bulkRegisterMutation = useMutation({
    mutationFn: async () => {
      if (!bulkConfig.value) throw new Error("Please select a criteria value");

      let query = supabase.from('members').select('id');
      if (bulkConfig.type === 'designation') query = query.eq('designation', bulkConfig.value);
      if (bulkConfig.type === 'tag') query = query.eq('member_tags.tag_id', bulkConfig.value).select('id, member_tags!inner(tag_id)');

      const { data: membersToAdd, error: memError } = await withTimeout(query, 15000);
      if (memError) throw memError;
      if (!membersToAdd?.length) throw new Error("No members match this criteria.");

      const { data: existingRegs } = await withTimeout(supabase.from('project_registrations').select('member_id').eq('project_id', project.id));
      const existingSet = new Set(existingRegs.map(e => e.member_id));

      const payload = membersToAdd
        .filter(m => !existingSet.has(m.id))
        .map(m => ({ project_id: project.id, member_id: m.id, registered_by: profile.id }));

      if (payload.length === 0) throw new Error("All matching members are already registered.");

      const { error: insertError } = await withTimeout(supabase.from('project_registrations').insert(payload));
      if (insertError) throw insertError;
      return payload.length;
    },
    onSuccess: (count) => {
      toast.success(`Successfully registered ${count} members!`);
      queryClient.invalidateQueries(['registration-list']);
      queryClient.invalidateQueries(['registration-count']);
      setIsBulkModalOpen(false);
    },
    onError: (err) => toast.error(err.message)
  });

  const members = useMemo(() => membersPages?.pages.flatMap(page => page.data) || [], [membersPages]);
  const canRegister = scopeData?.canRegister;
  
  // Calculate Export Modal cascade options
  const exportAvailableMandals = dropdowns?.mandals.filter(m => !exportFilters.kshetra_id || m.kshetra_id === exportFilters.kshetra_id) || [];
  
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";

  const FilterRow = ({ label, value, options, fieldKey }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 min-w-[120px] border border-gray-200 rounded-md p-2 bg-white text-sm font-medium flex justify-between items-center text-gray-700">
        {label} <Settings size={14} className="text-gray-400"/>
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
      <button 
        onClick={() => setDraftFilters(prev => ({...prev, [fieldKey]: ''}))} 
        className="p-2 bg-gray-50 border border-gray-200 rounded-md text-gray-500 hover:text-red-600 transition-colors"
      >
        <Trash2 size={16} strokeWidth={1.5}/>
      </button>
    </div>
  );

  return (
    <div className="space-y-4 pb-10">
      
      {/* Sticky Header */}
      <div className="bg-white p-3 sm:p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] sticky top-0 z-10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
              <ArrowLeft size={18} strokeWidth={2}/>
            </button>
            <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-1.5 truncate">
               {canRegister ? <User size={16} strokeWidth={2} className="text-[#5C3030] hidden sm:block"/> : <Database size={16} strokeWidth={2} className="text-gray-500 hidden sm:block"/>}
               <span className="truncate">{canRegister ? "Registration Roster" : "Database View"}</span>
            </h3>
            {!canRegister && <Badge className="shrink-0 hidden sm:inline-flex">View Only</Badge>}
            {canRegister && !project.registration_open && <Badge variant="danger" className="shrink-0 hidden sm:inline-flex"><Lock size={10} className="inline mr-1"/> Closed</Badge>}
          </div>
          
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            {isAdmin && <Button variant="secondary" size="sm" onClick={() => setIsBulkModalOpen(true)} className="!px-2 sm:!px-3 hidden sm:flex"><Layers size={14} className="mr-1.5"/> Bulk Add</Button>}
            <Button variant="secondary" size="sm" onClick={() => setIsExportModalOpen(true)} className="!px-2 sm:!px-3"><Download size={14} className="sm:mr-1.5"/> <span className="hidden sm:inline">Export</span></Button>

            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-gray-600 bg-gray-50 px-2 sm:px-2.5 py-1.5 sm:py-1.5 rounded-md border border-gray-200 ml-1">
               <Users size={14} strokeWidth={1.5}/> <span className="font-inter">{registeredCount || 0}</span> <span className="hidden lg:inline">Registered</span>
            </div>
          </div>
        </div>
        
        {/* Search & Filter Toolbar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
            <input 
              className={`${inputClass} pl-9 pr-9`}
              placeholder={canRegister ? "Search name or ID..." : "Search registered..."}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <Button variant="secondary" icon={Filter} onClick={() => setIsFilterOpen(true)} className="relative !bg-white shrink-0">
            View
            {Object.values(filters).filter(v => v !== '').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#5C3030] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm border border-white">
                {Object.values(filters).filter(v => v !== '').length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Member List */}
      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] divide-y divide-gray-100 relative min-h-[300px]">
        {(isFetching && !isFetchingNextPage) && (
         <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center pointer-events-none backdrop-blur-[1px]">
           <Loader2 className="animate-spin text-[#5C3030]" size={24}/>
         </div>
        )}

        {isMembersLoading && members.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading records...</div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            {searchTerm ? "No matching records found." : canRegister ? "Search to find members to register." : "No members registered yet."}
          </div>
        ) : (
          members.map(m => {
            const isProcessing = (toggleRegistration.isPending || toggleRegistration.isLoading) && toggleRegistration.variables?.id === m.id;

            return (
              <div key={m.id} className="flex items-center justify-between p-3 sm:p-4 gap-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center font-inter font-bold text-[10px] sm:text-xs shrink-0 border ${m.is_registered ? 'bg-gray-100 text-gray-900 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                    {m.name[0]}{m.surname[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 truncate">
                      <span className="truncate">{m.name} {m.surname}</span>
                      {m.external_qr && <Badge variant="success" className="shrink-0 hidden sm:inline-flex">Linked</Badge>}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1 sm:gap-1.5 mt-0.5 truncate">
                      <MapPin size={10} strokeWidth={2} className="shrink-0 hidden sm:block"/> 
                      <span className="truncate">{m.mandals?.name}</span> 
                      <span className="font-inter lowercase tracking-normal mx-0.5 sm:mx-1 text-gray-300 shrink-0">•</span> 
                      <span className="font-inter shrink-0">{m.internal_code}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {m.is_registered && isAdmin && (
                    <button onClick={() => setScanningMember(m)} className={`p-1.5 sm:p-2 rounded-md border transition-colors ${m.external_qr ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-gray-50'}`}>
                      <QrCode size={14} className="sm:w-4 sm:h-4" strokeWidth={1.5} />
                    </button>
                  )}

                  {canRegister && project.registration_open ? (
                    <Button size="sm" variant={m.is_registered ? "secondary" : "primary"} onClick={() => toggleRegistration.mutate(m)} disabled={isProcessing} className="w-16 sm:w-24 text-[10px] sm:text-xs !px-0 h-7 sm:h-8">
                      {isProcessing ? <Loader2 size={12} className="animate-spin text-gray-400"/> : m.is_registered ? "Remove" : <span className="flex items-center gap-1"><Plus size={12} className="hidden sm:block"/> Add</span>}
                    </Button>
                  ) : (
                    m.is_registered 
                      ? <Badge variant="primary" className="flex items-center gap-1"><Check size={10} className="hidden sm:block"/> Added</Badge> 
                      : <span className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2">Unregistered</span>
                  )}
                </div>
              </div>
            )
          })
        )}
        
        {members.length > 0 && (
          <div ref={loadMoreRef} className="py-4 text-center text-[10px] uppercase font-semibold tracking-widest text-gray-400">
             {isFetchingNextPage ? <Loader2 className="animate-spin inline" size={14}/> : hasNextPage ? 'Scroll for more' : 'End of records'}
          </div>
        )}
      </div>

      {/* --- SLIDE OUT FILTER & SORT DRAWER --- */}
      {isFilterOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-gray-900">Configure View</h2>
              <button onClick={() => setIsFilterOpen(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 p-1.5 rounded-md transition-colors"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
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
                  {isAdmin && <FilterRow label="Kshetra" fieldKey="kshetra_id" value={draftFilters.kshetra_id} options={dropdowns?.kshetras.map(k => ({value: k.id, label: k.name})) || []} />}
                  {['admin', 'nirdeshak', 'nirikshak', 'project_admin'].includes(role) && <FilterRow label="Mandal" fieldKey="mandal_id" value={draftFilters.mandal_id} options={dropdowns?.mandals.filter(m => !draftFilters.kshetra_id || m.kshetra_id === draftFilters.kshetra_id).map(m => ({value: m.id, label: m.name})) || []} />}
                  <FilterRow label="Designation" fieldKey="designation" value={draftFilters.designation} options={['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => ({value: d, label: d}))} />
                  {isAdmin && <FilterRow label="Gender" fieldKey="gender" value={draftFilters.gender} options={[{value: 'Yuvak', label: 'Yuvak'}, {value: 'Yuvati', label: 'Yuvati'}]} />}
                  <FilterRow label="Tags" fieldKey="tag_id" value={draftFilters.tag_id} options={dropdowns?.tags.map(t => ({value: t.id, label: t.name})) || []} />
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Multi-Level Sorting</p>
                  
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

      {/* --- EXPORT MODAL --- */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Export Report">
        <div className="space-y-5">
          <p className="text-sm text-gray-600">Export a complete list of members currently registered for this project.</p>
          
          {isAdmin && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 space-y-3">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">Optional Filters</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Kshetra</label>
                  <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-xs text-gray-900 focus:border-[#5C3030]" value={exportFilters.kshetra_id} onChange={e => setExportFilters({...exportFilters, kshetra_id: e.target.value, mandal_ids: []})}>
                    <option value="">All Kshetras</option>
                    {dropdowns?.kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </div>
                
                {/* 🛡️ Multi-Mandal Selection Accordion */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Mandals</label>
                  <div className="border border-gray-200 rounded-md bg-white overflow-hidden transition-all">
                    <button 
                      type="button"
                      onClick={() => setIsMandalExportOpen(!isMandalExportOpen)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-gray-700 text-xs">
                        {exportFilters.mandal_ids.length === 0 ? "All Mandals" : <span className="font-semibold text-[#5C3030]">{exportFilters.mandal_ids.length} Selected</span>}
                      </div>
                      <ChevronDown className={`text-gray-400 transition-transform ${isMandalExportOpen ? 'rotate-180' : ''}`} size={14} strokeWidth={1.5}/>
                    </button>

                    {isMandalExportOpen && (
                      <div className="p-2 bg-gray-50 border-t border-gray-200 space-y-1 max-h-40 overflow-y-auto">
                        {exportAvailableMandals.length === 0 ? (
                          <div className="text-xs text-gray-400 p-2 text-center">No mandals available.</div>
                        ) : (
                          exportAvailableMandals.map(m => {
                            const isSelected = exportFilters.mandal_ids.includes(m.id);
                            return (
                              <div 
                                key={m.id} 
                                onClick={() => {
                                  setExportFilters(prev => ({
                                    ...prev,
                                    mandal_ids: isSelected ? prev.mandal_ids.filter(id => id !== m.id) : [...prev.mandal_ids, m.id]
                                  }))
                                }}
                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-[#5C3030]/10 text-[#5C3030]' : 'text-gray-600 hover:bg-gray-100'}`}
                              >
                                <span className="text-xs font-semibold">{m.name}</span>
                                {isSelected && <Check size={14} className="text-[#5C3030]" strokeWidth={2}/>}
                              </div>
                            )
                          })
                        )}
                        {exportFilters.mandal_ids.length > 0 && (
                          <button onClick={() => { setExportFilters(p => ({...p, mandal_ids: []})); setIsMandalExportOpen(false); }} className="w-full pt-2 pb-1 text-xs text-red-600 font-semibold hover:underline">
                            Clear Selection
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Gender</label>
                  <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-xs text-gray-900 focus:border-[#5C3030]" value={exportFilters.gender} onChange={e => setExportFilters({...exportFilters, gender: e.target.value})}>
                    <option value="">All Genders</option>
                    <option value="Yuvak">Yuvak</option>
                    <option value="Yuvati">Yuvati</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Designation</label>
                  <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-xs text-gray-900 focus:border-[#5C3030]" value={exportFilters.designation} onChange={e => setExportFilters({...exportFilters, designation: e.target.value})}>
                    <option value="">All Roles</option>
                    {['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Tag</label>
                  <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-xs text-gray-900 focus:border-[#5C3030]" value={exportFilters.tag_id} onChange={e => setExportFilters({...exportFilters, tag_id: e.target.value})}>
                    <option value="">All Tags</option>
                    {dropdowns?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" className="w-full h-14" onClick={() => handleExport('csv')}>
              <FileSpreadsheet size={18} className="mr-2 text-emerald-600"/> Excel (.csv)
            </Button>
            <Button variant="secondary" className="w-full h-14" onClick={() => handleExport('pdf')}>
              <FileText size={18} className="mr-2 text-red-500"/> PDF (Print)
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- BULK ADD MODAL (Admin Only) --- */}
      {isAdmin && (
        <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title="Bulk Register">
          <form onSubmit={(e) => { e.preventDefault(); bulkRegisterMutation.mutate(); }} className="space-y-4">
            <div className="bg-[#5C3030]/5 text-[#5C3030] p-4 rounded-md border border-[#5C3030]/20 flex gap-3">
              <Layers className="shrink-0 mt-0.5" size={18} />
              <p className="text-sm font-medium">Instantly register all active members matching a specific criteria. Duplicates will be safely ignored.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Criteria Type</label>
                <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030]" value={bulkConfig.type} onChange={e => setBulkConfig({ type: e.target.value, value: '' })}>
                  <option value="designation">By Designation</option>
                  <option value="tag">By Tag</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Select Value</label>
                <select required className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030]" value={bulkConfig.value} onChange={e => setBulkConfig({...bulkConfig, value: e.target.value})}>
                  <option value="">Select...</option>
                  {bulkConfig.type === 'designation' 
                    ? ['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)
                    : dropdowns?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                  }
                </select>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setIsBulkModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={bulkRegisterMutation.isPending || !bulkConfig.value}>
                {bulkRegisterMutation.isPending ? <Loader2 className="animate-spin" size={16}/> : 'Run Bulk Add'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {scanningMember && <QrScanner isOpen={!!scanningMember} onClose={() => setScanningMember(null)} onScan={handleMapExternalQr} eventName={`Map Badge: ${scanningMember.name}`} />}
    </div>
  );
}