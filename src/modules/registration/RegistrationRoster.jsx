import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, User, Plus, MapPin, Lock, ArrowLeft, Users, QrCode, Database, Check, Download, Layers, X, FileText, FileSpreadsheet } from 'lucide-react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase, withTimeout } from '../../lib/supabase'; // 🛡️ Imported withTimeout
import toast from 'react-hot-toast'; // 🛡️ Imported toast
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

  // Advanced Feature States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({ kshetra_id: '', mandal_id: '', gender: '', designation: '', tag_id: '' });
  const [bulkConfig, setBulkConfig] = useState({ type: 'designation', value: '' });

  const role = (profile?.role || '').toLowerCase();
  const isGlobal = role === 'admin';

  // 🛡️ Bulletproof Debounce search
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(() => {
      if (isActive) setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // 1. Fetch Scope (Protected with Timeout)
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

  // 2. Fetch Summary Count
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

  // 3. Infinite Query for Roster List
  const { 
    data: membersPages, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isMembersLoading,
    isFetching,
    isError
  } = useInfiniteQuery({
    queryKey: ['registration-list', project.id, scopeData, debouncedSearch],
    queryFn: async ({ pageParam = 0, signal }) => {
      if (!scopeData) return { data: [] };
      if (!isGlobal && scopeData.ids.length === 0) return { data: [] };

      const regJoin = scopeData.canRegister 
         ? `project_registrations ( project_id, external_qr )`
         : `project_registrations!inner ( project_id, external_qr )`;

      let query = supabase.from('members').select(`
        id, name, surname, internal_code, gender,
        mandals!inner ( id, name, kshetra_id ),
        ${regJoin} 
      `);

      if (!scopeData.canRegister) query = query.eq('project_registrations.project_id', project.id);
      if (!isGlobal && profile?.gender) query = query.eq('gender', profile.gender);
      if (!isGlobal) query = query.in('mandal_id', scopeData.ids);

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%`);
      }

      const from = pageParam * PAGE_SIZE;
      const { data, error } = await withTimeout(query.range(from, from + PAGE_SIZE - 1).order('name').abortSignal(signal));
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

  // 🛡️ Strict Intersection Observer
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetching && !isError) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage]);

  // Dropdowns for Advanced Admin Export/Bulk
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
    enabled: isAdmin && (isExportModalOpen || isBulkModalOpen),
    staleTime: 1000 * 60 * 30
  });

  // 4. Individual Registration Mutation
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
      const previousData = queryClient.getQueryData(['registration-list', project.id, scopeData, debouncedSearch]);
      
      queryClient.setQueryData(['registration-list', project.id, scopeData, debouncedSearch], old => {
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
      if (context?.previousData) queryClient.setQueryData(['registration-list', project.id, scopeData, debouncedSearch], context.previousData);
      toast.error(`Action failed: ${err.message}`); // 🛡️ Replaced alert()
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

  // --- NEW: ADVANCED EXPORT ENGINE ---
  const handleExport = async (format) => {
    const loadingToast = toast.loading("Generating report...");
    try {
      let query = supabase.from('project_registrations')
        .select(`member_id, members!inner(id, name, surname, internal_code, gender, mobile, designation, mandal_id, mandals(id, name, kshetra_id, kshetras(name)), member_tags(tag_id))`)
        .eq('project_id', project.id);

      // Apply Base Scope
      if (!isGlobal && profile?.gender) query = query.eq('members.gender', profile.gender);
      if (!isGlobal && scopeData?.ids?.length > 0) query = query.in('members.mandal_id', scopeData.ids);

      // Apply Admin Explicit Filters
      if (isAdmin && exportFilters.kshetra_id) query = query.eq('members.mandals.kshetra_id', exportFilters.kshetra_id);
      if (isAdmin && exportFilters.mandal_id) query = query.eq('members.mandal_id', exportFilters.mandal_id);
      if (isAdmin && exportFilters.gender) query = query.eq('members.gender', exportFilters.gender);
      if (isAdmin && exportFilters.designation) query = query.eq('members.designation', exportFilters.designation);
      if (isAdmin && exportFilters.tag_id) query = query.eq('members.member_tags.tag_id', exportFilters.tag_id);

      const { data, error } = await withTimeout(query);
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("No data found for this export.", { id: loadingToast });
        return;
      }

      // Map Clean Data
      const cleanData = data.map(row => ({
        ID: row.members.internal_code,
        Name: `${row.members.name} ${row.members.surname}`,
        Gender: row.members.gender,
        Mobile: row.members.mobile || '-',
        Mandal: row.members.mandals?.name || '-',
        Kshetra: row.members.mandals?.kshetras?.name || '-',
        Designation: row.members.designation || '-'
      }));

      if (format === 'csv') {
        const headers = Object.keys(cleanData[0]);
        const csvRows = cleanData.map(row => headers.map(h => `"${row[h]}"`).join(','));
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Registrations_${project.name}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Excel/CSV downloaded!", { id: loadingToast });
      } 
      else if (format === 'pdf') {
        // Native Print-to-PDF approach
        const printWindow = window.open('', '', 'height=800,width=1000');
        printWindow.document.write('<html><head><title>Registration Report</title>');
        printWindow.document.write('<style>body{font-family:sans-serif; padding:20px} table{border-collapse:collapse; width:100%; font-size:12px} th,td{border:1px solid #eee; padding:8px; text-align:left} th{background-color:#f9fafb; color:#374151}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(`<h2>${project.name} - Registration Report</h2>`);
        printWindow.document.write(`<p style="color:#6b7280; font-size:12px; margin-top:-10px; margin-bottom:20px">Total Registered: ${cleanData.length}</p>`);
        
        printWindow.document.write('<table><thead><tr>');
        Object.keys(cleanData[0]).forEach(h => printWindow.document.write(`<th>${h}</th>`));
        printWindow.document.write('</tr></thead><tbody>');
        
        cleanData.forEach(row => {
          printWindow.document.write('<tr>');
          Object.values(row).forEach(val => printWindow.document.write(`<td>${val}</td>`));
          printWindow.document.write('</tr>');
        });
        
        printWindow.document.write('</tbody></table></body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
        toast.success("PDF generated!", { id: loadingToast });
      }

      setIsExportModalOpen(false);
    } catch (err) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  // --- NEW: BULK REGISTRATION ENGINE (Admin Only) ---
  const bulkRegisterMutation = useMutation({
    mutationFn: async () => {
      if (!bulkConfig.value) throw new Error("Please select a criteria value");

      let query = supabase.from('members').select('id');
      if (bulkConfig.type === 'designation') query = query.eq('designation', bulkConfig.value);
      if (bulkConfig.type === 'tag') query = query.eq('member_tags.tag_id', bulkConfig.value).select('id, member_tags!inner(tag_id)');

      const { data: membersToAdd, error: memError } = await withTimeout(query);
      if (memError) throw memError;
      if (!membersToAdd?.length) throw new Error("No members match this criteria.");

      // Fetch existing to prevent duplicates
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
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

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
            {/* 🛡️ Advanced Actions */}
            {isAdmin && <Button variant="secondary" size="sm" onClick={() => setIsBulkModalOpen(true)} className="!px-2 sm:!px-3 hidden sm:flex"><Layers size={14} className="mr-1.5"/> Bulk Add</Button>}
            <Button variant="secondary" size="sm" onClick={() => setIsExportModalOpen(true)} className="!px-2 sm:!px-3"><Download size={14} className="sm:mr-1.5"/> <span className="hidden sm:inline">Export</span></Button>

            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-gray-600 bg-gray-50 px-2 sm:px-2.5 py-1.5 sm:py-1.5 rounded-md border border-gray-200 ml-1">
               <Users size={14} strokeWidth={1.5}/> <span className="font-inter">{registeredCount || 0}</span> <span className="hidden lg:inline">Registered</span>
            </div>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          {/* 🛡️ X Clear Button Added Here */}
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
      </div>

      {/* Member List */}
      <div className="space-y-2">
        {isMembersLoading && members.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading records...</div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            {searchTerm ? "No matching records found." : canRegister ? "Search to find members to register." : "No members registered yet."}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] divide-y divide-gray-100 relative">
             {/* Subtle loading overlay */}
             {(isFetching && !isFetchingNextPage) && (
              <div className="absolute inset-0 bg-white/40 z-10 flex items-center justify-center pointer-events-none"></div>
             )}

            {members.map(m => {
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
            })}
          </div>
        )}
        
        {members.length > 0 && (
          <div ref={loadMoreRef} className="py-4 text-center text-[10px] uppercase font-semibold tracking-widest text-gray-400">
             {isFetchingNextPage ? <Loader2 className="animate-spin inline" size={14}/> : hasNextPage ? 'Scroll for more' : 'End of records'}
          </div>
        )}
      </div>

      {/* --- EXPORT MODAL --- */}
      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Export Report">
        <div className="space-y-5">
          <p className="text-sm text-gray-600">Export a complete list of members currently registered for this project.</p>
          
          {isAdmin && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 space-y-3">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">Optional Filters</h4>
              <div className="grid grid-cols-2 gap-3">
                <select className={`${inputClass} text-xs`} value={exportFilters.kshetra_id} onChange={e => setExportFilters({...exportFilters, kshetra_id: e.target.value})}>
                  <option value="">All Kshetras</option>
                  {dropdowns?.kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <select className={`${inputClass} text-xs`} value={exportFilters.mandal_id} onChange={e => setExportFilters({...exportFilters, mandal_id: e.target.value})}>
                  <option value="">All Mandals</option>
                  {dropdowns?.mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select className={`${inputClass} text-xs`} value={exportFilters.gender} onChange={e => setExportFilters({...exportFilters, gender: e.target.value})}>
                  <option value="">All Genders</option>
                  <option value="Yuvak">Yuvak</option>
                  <option value="Yuvati">Yuvati</option>
                </select>
                <select className={`${inputClass} text-xs`} value={exportFilters.designation} onChange={e => setExportFilters({...exportFilters, designation: e.target.value})}>
                  <option value="">All Roles</option>
                  {['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Member', 'Sah Sanchalak', 'Sampark Karyakar'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="col-span-2">
                  <select className={`${inputClass} text-xs`} value={exportFilters.tag_id} onChange={e => setExportFilters({...exportFilters, tag_id: e.target.value})}>
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
                <select className={inputClass} value={bulkConfig.type} onChange={e => setBulkConfig({ type: e.target.value, value: '' })}>
                  <option value="designation">By Designation</option>
                  <option value="tag">By Tag</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Select Value</label>
                <select required className={inputClass} value={bulkConfig.value} onChange={e => setBulkConfig({...bulkConfig, value: e.target.value})}>
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