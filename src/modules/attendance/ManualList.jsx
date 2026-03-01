import React, { useState } from 'react';
import { Search, Check, Loader2, MapPin, X, Briefcase, Tag } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import Badge from '../../components/ui/Badge';

export default function ManualList({ event, project, onBack, mandalFilterId = null, mandalFilterName = null }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); 
  const [desigFilter, setDesigFilter] = useState('');

  const designations = ['Member', 'Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Utsahi Yuvak'];

  // 1. Fetch Roster & Attendance
  const { data: attendees, isLoading } = useQuery({
    queryKey: ['manual-attendance', event.id, project.id],
    queryFn: async () => {
      const { data: regData, error } = await supabase
        .from('project_registrations')
        .select(`member_id, seat_number, members ( id, name, surname, internal_code, designation, mandals (id, name) )`)
        .eq('project_id', project.id);

      if (error) throw error;

      const { data: attData } = await supabase.from('attendance').select('member_id').eq('event_id', event.id);
      const attMap = new Set(attData?.map(a => a.member_id));

      const processed = regData.map(reg => ({
        ...reg.members,
        seat_number: reg.seat_number,
        is_present: attMap.has(reg.member_id),
      })).sort((a, b) => a.name.localeCompare(b.name));

      return processed;
    }
  });

  // 2. Optimistic Mutation
  const toggleAttendance = useMutation({
    mutationFn: async (member) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (member.is_present) {
        await supabase.from('attendance').delete().match({ event_id: event.id, member_id: member.id });
      } else {
        await supabase.from('attendance').insert({ event_id: event.id, member_id: member.id, marked_by: user.id });
      }
    },
    onMutate: async (member) => {
      await queryClient.cancelQueries({ queryKey: ['manual-attendance', event.id, project.id] });
      const previousData = queryClient.getQueryData(['manual-attendance', event.id, project.id]);

      queryClient.setQueryData(['manual-attendance', event.id, project.id], old => {
        if (!old) return old;
        return old.map(m => m.id === member.id ? { ...m, is_present: !m.is_present } : m);
      });
      return { previousData };
    },
    onError: (err, member, context) => {
      queryClient.setQueryData(['manual-attendance', event.id, project.id], context.previousData);
      alert("Network sync failed.");
    }
  });

  // 3. Filtering
  const filteredList = attendees?.filter(m => {
    const matchesSearch = `${m.name} ${m.surname} ${m.seat_number || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'present' ? m.is_present : !m.is_present;
    const matchesMandal = mandalFilterId ? m.mandals?.id === mandalFilterId : true;
    const matchesDesig = desigFilter ? m.designation === desigFilter : true;
    return matchesSearch && matchesStatus && matchesMandal && matchesDesig;
  }) || [];

  const inputClass = "px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <div className="flex flex-col bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-gray-200 overflow-hidden animate-in fade-in duration-200">
      
      {/* Header Controls */}
      <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
            <input 
              className={`w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-md text-sm focus:border-[#5C3030] outline-none shadow-sm`}
              placeholder="Search list..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          {mandalFilterName && (
            <div className="hidden sm:flex items-center gap-1.5 bg-[#5C3030]/10 text-[#5C3030] px-3 py-2 rounded-md text-xs font-semibold border border-[#5C3030]/20">
              <MapPin size={12}/> {mandalFilterName}
              <button onClick={onBack} className="ml-1 hover:bg-[#5C3030]/20 rounded-md p-0.5"><X size={12}/></button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex bg-gray-200/50 p-1 rounded-md border border-gray-200">
            {['all', 'present', 'pending'].map(f => (
              <button
                key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${statusFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <select className={`${inputClass} pl-8 py-1.5 text-xs appearance-none`} value={desigFilter} onChange={e => setDesigFilter(e.target.value)}>
              <option value="">All Roles</option>
              {designations.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <Briefcase size={12} className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none"/>
          </div>
          {desigFilter && (
            <button onClick={() => setDesigFilter('')} className="text-xs text-red-500 hover:underline px-1 font-semibold">Reset</button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No members match your filters.</div>
        ) : (
          filteredList.map(m => {
            const isProcessing = (toggleAttendance.isPending || toggleAttendance.isLoading) && toggleAttendance.variables?.id === m.id;

            return (
              <div key={m.id} className={`p-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${m.is_present ? 'bg-emerald-50/20' : ''}`}>
                <div className="flex items-center gap-3 overflow-hidden min-w-0 pr-2">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold font-inter shrink-0 border ${m.is_present ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {m.is_present ? <Check size={16} strokeWidth={2.5}/> : m.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm truncate ${m.is_present ? 'text-emerald-900' : 'text-gray-900'}`}>
                      {m.name} {m.surname}
                    </div>
                    <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest flex items-center gap-1.5 truncate mt-0.5">
                      <span>{m.designation}</span> <span className="font-inter lowercase tracking-normal text-gray-300">•</span> <span>{m.mandals?.name}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                     if (m.is_present && !confirm(`Mark ${m.name} as ABSENT?`)) return;
                     toggleAttendance.mutate(m);
                  }}
                  disabled={isProcessing}
                  className={`shrink-0 w-20 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    m.is_present
                      ? 'bg-white text-emerald-600 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                      : 'bg-[#5C3030] text-white border-transparent hover:bg-[#4a2626] shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                  }`}
                >
                  {isProcessing ? <Loader2 size={12} className="animate-spin mx-auto"/> : m.is_present ? "Undo" : "Check In"}
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="p-2 bg-gray-50 border-t border-gray-100 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
        Showing {filteredList.length} members
      </div>
    </div>
  );
}