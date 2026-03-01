import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Loader2, Calendar, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Attendance from '../attendance/Attendance';
import Badge from '../../components/ui/Badge';

export default function HomeDashboard() {
  const { profile } = useAuth();
  const role = (profile?.role || '').toLowerCase();

  const { data, isLoading } = useQuery({
    queryKey: ['home-dashboard', profile?.id],
    queryFn: async () => {
      let allowedProjectIds = [];

      if (role !== 'admin') {
        const { data: assignments } = await supabase.from('project_assignments').select('project_id').eq('user_id', profile.id);
        const assignedIds = assignments?.map(a => a.project_id) || [];

        let standardIds = [];
        if (role !== 'project_admin') {
          const { data: standardProjects } = await supabase.from('projects').select('id').eq('type', 'Standard').eq('is_active', true);
          standardIds = standardProjects?.map(p => p.id) || [];
        }

        allowedProjectIds = [...new Set([...assignedIds, ...standardIds])];
        if (allowedProjectIds.length === 0) return { event: null, project: null };
      }

      let query = supabase.from('events').select(`*, projects!inner (id, name, type, is_active, allowed_gender)`)
        .eq('is_primary', true)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(1);

      if (role !== 'admin') query = query.in('project_id', allowedProjectIds);

      const { data: eventsData, error } = await query;
      if (error) throw error;
      
      if (eventsData && eventsData.length > 0) {
         const upcomingEvent = eventsData[0];
         const projectData = Array.isArray(upcomingEvent.projects) ? upcomingEvent.projects[0] : upcomingEvent.projects;
         
         if (role !== 'admin' && projectData.allowed_gender !== 'Both' && projectData.allowed_gender !== profile?.gender) {
            return { event: null, project: null };
         }
         return { event: upcomingEvent, project: projectData };
      }
      return { event: null, project: null };
    },
    enabled: !!profile?.id
  });

  if (isLoading) return <div className="h-[80vh] flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" size={32} strokeWidth={1.5}/></div>;

  const { event: primaryEvent, project: primaryProject } = data || {};

  if (!primaryEvent || !primaryProject) {
    return (
      <div className="p-10 text-center max-w-lg mx-auto mt-10 bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <Calendar className="mx-auto h-10 w-10 text-gray-300 mb-3" strokeWidth={1.5}/>
        <h2 className="text-lg font-semibold text-gray-900">No Active Event</h2>
        <p className="text-gray-500 text-sm mt-1">There are no primary events scheduled for today. Check back later.</p>
      </div>
    );
  }

  // 1. Full Control / Attendance Mode
  if (['admin', 'taker' , 'project_admin'].includes(role)) {
    return (
      <div className="h-[calc(100vh-80px)] flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Jay Swaminarayan, {profile.full_name?.split(' ')[0]}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {role === 'admin' ? 'Master Control' : 'Attendance Workspace'}
          </p>
        </div>
        <div className="flex-1 min-h-0">
            <Attendance projectId={primaryProject.id} eventId={primaryEvent.id} embedded={true} hideSummary={role === 'taker'} />
        </div>
      </div>
    );
  }

  // 2. Sanchalak View
  if (role === 'sanchalak') {
    return <SanchalakView event={primaryEvent} project={primaryProject} mandalId={profile.assigned_mandal_id} gender={profile.gender} />;
  }

  // 3. Leadership View
  if (['nirdeshak', 'nirikshak'].includes(role)) {
    return (
      <div className="h-[calc(100vh-80px)] flex flex-col">
        <div className="mb-4">
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Performance Summary</h1>
           <p className="text-gray-500 text-sm mt-0.5">{role === 'nirdeshak' ? 'Kshetra Overview' : 'Mandal Overview'}</p>
        </div>
        <div className="flex-1 min-h-0">
          <Attendance projectId={primaryProject.id} eventId={primaryEvent.id} embedded={true} readOnly={true} hideSummary={false} />
        </div>
      </div>
    );
  }

  return <div className="p-10 text-center text-gray-500">Role configuration error.</div>;
}

// --- SUB-COMPONENT: SANCHALAK VIEW ---
function SanchalakView({ event, project, mandalId, gender }) {
  const { data: members, isLoading } = useQuery({
    queryKey: ['sanchalak-team', event.id, project.id, mandalId, gender],
    queryFn: async () => {
      const { data: regData } = await supabase.from('project_registrations').select(`member_id, members (id, name, surname, mobile, internal_code, gender, mandal_id, designation)`).eq('project_id', project.id);
      
      let myMembers = (regData || []).map(r => r.members).filter(m => m && m.mandal_id === mandalId && m.gender === gender); 
      myMembers.sort((a, b) => a.name.localeCompare(b.name));

      const { data: attData } = await supabase.from('attendance').select('member_id').eq('event_id', event.id);
      const presentSet = new Set(attData?.map(a => a.member_id));
      
      return myMembers.map(m => ({ ...m, isPresent: presentSet.has(m.id) }));
    }
  });

  if (isLoading) return <div className="p-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading your team...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20">
      <div className="bg-[#5C3030] text-white p-5 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-xl font-bold leading-tight">{event.name}</h1>
                <p className="text-white/70 text-xs mt-1 font-semibold">{project.name}</p>
            </div>
            <div className="bg-white/10 px-3 py-1.5 rounded-md border border-white/20">
                <span className="font-bold text-lg font-inter">{members?.filter(m => m.isPresent).length}</span>
                <span className="text-white/60 font-semibold font-inter"> / {members?.length}</span>
            </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] divide-y divide-gray-100">
        {members?.map(m => (
          <div key={m.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
               <div className={`w-9 h-9 rounded-md flex items-center justify-center font-bold text-xs shrink-0 border font-inter ${m.isPresent ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                 {m.isPresent ? 'IN' : 'A'}
               </div>
               <div>
                 <div className={`font-semibold text-sm ${m.isPresent ? 'text-gray-900' : 'text-gray-600'}`}>{m.name} {m.surname}</div>
                 <div className="mt-0.5"><Badge>{m.designation}</Badge></div>
               </div>
            </div>
            {m.mobile && (
              <a href={`tel:${m.mobile}`} className="p-2 text-gray-400 hover:text-[#5C3030] hover:bg-gray-100 rounded-md transition-colors border border-transparent hover:border-gray-200">
                <Phone size={16} strokeWidth={1.5} />
              </a>
            )}
          </div>
        ))}
        {members?.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">No registered members found in your Mandal for this event.</div>
        )}
      </div>
    </div>
  );
}