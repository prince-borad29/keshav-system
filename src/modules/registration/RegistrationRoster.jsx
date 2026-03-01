import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, User, Plus, MapPin, Lock, ArrowLeft, Users, QrCode, Database } from 'lucide-react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase } from '../../lib/supabase';
import QrScanner from '../attendance/QrScanner';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

const PAGE_SIZE = 20;

export default function RegistrationRoster({ project, onBack, isAdmin, profile }) { 
  const queryClient = useQueryClient();
  const { ref: loadMoreRef, inView } = useInView();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scanningMember, setScanningMember] = useState(null);

  const role = (profile?.role || '').toLowerCase();
  const isGlobal = role === 'admin';

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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
        const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id);
        ids = data?.map(d => d.mandal_id) || [];
        if (profile.assigned_mandal_id) ids.push(profile.assigned_mandal_id);
        canRegister = true;
      } 
      else if (role === 'nirdeshak') {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (kId) {
          const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
          ids = data?.map(m => m.id) || [];
        }
        canRegister = true;
      } 
      else if (role === 'project_admin') {
        const { data: assignment } = await supabase.from('project_assignments').select('role').eq('project_id', project.id).eq('user_id', profile.id).maybeSingle();
        canRegister = assignment?.role === 'Coordinator';
        
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (kId) {
          const { data } = await supabase.from('mandals').select('id').eq('kshetra_id', kId);
          ids = data?.map(m => m.id) || [];
        }
      }
      return { ids, canRegister };
    },
    enabled: !!profile
  });

  const { data: registeredCount } = useQuery({
    queryKey: ['registration-count', project.id, scopeData?.ids],
    queryFn: async () => {
      let query = supabase.from('project_registrations').select('member_id, members!inner(gender, mandal_id)', { count: 'exact', head: true }).eq('project_id', project.id);
      if (!isGlobal && profile?.gender) query = query.eq('members.gender', profile.gender);
      if (!isGlobal && scopeData?.ids?.length > 0) query = query.in('members.mandal_id', scopeData.ids);
      const { count } = await query;
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
    isLoading: isMembersLoading 
  } = useInfiniteQuery({
    queryKey: ['registration-list', project.id, scopeData, debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => { // 👈 NO ABORT SIGNAL HERE
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
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1).order('name');
      if (error) throw error;

      const processed = data.map(m => {
        const reg = m.project_registrations.find(r => r.project_id === project.id);
        return { ...m, is_registered: !!reg, external_qr: reg?.external_qr || null };
      });

      return { data: processed, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!scopeData,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Safe Mutation
  const toggleRegistration = useMutation({
    mutationFn: async (member) => {
      if (member.is_registered) {
        const { error } = await supabase.from('project_registrations').delete().match({ project_id: project.id, member_id: member.id });
        if (error) throw error; 
      } else {
        const { error } = await supabase.from('project_registrations').insert({ project_id: project.id, member_id: member.id, registered_by: profile.id });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registration-count', project.id] });
    },
    onError: (err, member, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['registration-list', project.id, scopeData, debouncedSearch], context.previousData);
      }
      alert(`Action failed: ${err.message}`);
    }
  });

  const handleMapExternalQr = async (scannedCode) => {
    if (!scanningMember) return { success: false, message: "No member selected" };
    const cleanCode = scannedCode.trim();
    try {
      const { data: existing } = await supabase.from('project_registrations').select('member_id').eq('project_id', project.id).eq('external_qr', cleanCode).maybeSingle();
      if (existing && existing.member_id !== scanningMember.id) return { success: false, type: 'error', message: "Badge already assigned!" };

      const { error } = await supabase.from('project_registrations').update({ external_qr: cleanCode }).match({ project_id: project.id, member_id: scanningMember.id });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['registration-list', project.id] });
      setTimeout(() => setScanningMember(null), 1200);
      return { success: true, message: `Badge linked!` };
    } catch (err) { return { success: false, type: 'error', message: "Database Error" }; }
  };

  const members = useMemo(() => membersPages?.pages.flatMap(page => page.data) || [], [membersPages]);
  const canRegister = scopeData?.canRegister;
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] sticky top-0 z-10 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"><ArrowLeft size={18} strokeWidth={2}/></button>
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
               {canRegister ? <User size={16} strokeWidth={2} className="text-[#5C3030]"/> : <Database size={16} strokeWidth={2} className="text-gray-500"/>}
               {canRegister ? "Registration Roster" : "Registered Database"}
            </h3>
            
            {!canRegister && <Badge>View Only</Badge>}
            {canRegister && !project.registration_open && <Badge variant="danger"><Lock size={10} className="inline mr-1"/> Closed</Badge>}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
             <Users size={14} strokeWidth={1.5}/> {registeredCount || 0} Registered
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          <input 
            className={`${inputClass} pl-9`}
            placeholder={canRegister ? "Search by name or ID..." : "Search registered members..."}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        {isMembersLoading && members.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading records...</div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            {searchTerm ? "No matching records found." : canRegister ? "Search to find members to register." : "No members registered yet."}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] divide-y divide-gray-100">
            {members.map(m => {
              const isProcessing = (toggleRegistration.isPending || toggleRegistration.isLoading) && toggleRegistration.variables?.id === m.id;

              return (
                <div key={m.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center font-inter font-bold text-xs shrink-0 border ${m.is_registered ? 'bg-gray-100 text-gray-900 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                      {m.name[0]}{m.surname[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 text-sm flex items-center gap-2 truncate">
                        {m.name} {m.surname}
                        {m.external_qr && <Badge variant="success">Badge Linked</Badge>}
                      </div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5 uppercase tracking-widest font-semibold truncate">
                        <MapPin size={10} strokeWidth={2}/> {m.mandals?.name} <span className="font-inter lowercase tracking-normal mx-1">•</span> <span className="font-inter">{m.internal_code}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {m.is_registered && isAdmin && (
                      <button onClick={() => setScanningMember(m)} className={`p-1.5 rounded-md border transition-colors ${m.external_qr ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-gray-50'}`}>
                        <QrCode size={16} strokeWidth={1.5} />
                      </button>
                    )}

                    {canRegister && project.registration_open ? (
                      <Button
                        size="sm"
                        variant={m.is_registered ? "secondary" : "primary"}
                        onClick={() => toggleRegistration.mutate(m)}
                        disabled={isProcessing}
                        className="w-24 text-xs !px-0" 
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin text-gray-400"/> : m.is_registered ? "Remove" : "Add"}
                      </Button>
                    ) : (
                      m.is_registered 
                        ? <Badge variant="primary">Registered</Badge> 
                        : <span className="text-xs text-gray-400 font-medium px-2">Unregistered</span>
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

      {scanningMember && <QrScanner isOpen={!!scanningMember} onClose={() => setScanningMember(null)} onScan={handleMapExternalQr} eventName={`Map Badge: ${scanningMember.name}`} />}
    </div>
  );
}