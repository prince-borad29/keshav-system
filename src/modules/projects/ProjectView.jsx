import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Plus, Clock, Edit3, Trash2, Star, QrCode, Loader2, Shield } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EventForm from './EventForm';
import ProjectStaff from './ProjectStaff';
import { useAuth } from "../../contexts/AuthContext"; 

export default function ProjectView({ project, onBack }) {
  const navigate = useNavigate();
  const { profile } = useAuth(); 
  const queryClient = useQueryClient();
  
  const isAdmin = profile?.role === 'admin';
  const isProjectAdminAppRole = profile?.role === 'project_admin';

  const [activeTab, setActiveTab] = useState('events'); 
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // 1. Fetch Role Data
  const { data: projectRole } = useQuery({
    queryKey: ['project-role', project.id, profile?.id],
    queryFn: async () => {
      if (isAdmin) return 'admin';
      const { data } = await supabase.from('project_assignments').select('role').eq('project_id', project.id).eq('user_id', profile.id).maybeSingle();
      return data?.role || null;
    },
    enabled: !!profile
  });

  // 2. Fetch Events
  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['events', project.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('project_id', project.id).order('date', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // 3. Delete Event Mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (id) => await supabase.from('events').delete().eq('id', id),
    onSuccess: () => queryClient.invalidateQueries(['events', project.id])
  });

  const isPast = (date) => new Date(date) < new Date().setHours(0,0,0,0);

  // Capabilities
  const isCoordinator = projectRole === 'Coordinator';
  const canManageEvents = isAdmin || isCoordinator;
  const canMarkAttendance = isAdmin || isCoordinator || projectRole === 'Editor' || projectRole === 'volunteer';
  const canManageStaff = isAdmin || (isCoordinator && !isProjectAdminAppRole);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-semibold text-sm transition-colors w-fit">
        <ArrowLeft size={16} strokeWidth={2} /> Back to Projects
      </button>

      <div className="bg-white rounded-md p-6 border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex gap-2 mb-2">
          <Badge variant="default">{project.type}</Badge>
          <Badge variant="default">{project.allowed_gender}</Badge>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1 leading-tight">{project.name}</h1>
        <p className="text-gray-500 text-sm max-w-2xl">{project.description || "No description provided."}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-6 overflow-x-auto whitespace-nowrap">
        <button onClick={() => setActiveTab('events')} className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'events' ? 'border-[#5C3030] text-[#5C3030]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
          <Calendar size={16} strokeWidth={1.5}/> Schedule & Events
        </button>
        {canManageStaff && (
          <button onClick={() => setActiveTab('staff')} className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'staff' ? 'border-[#5C3030] text-[#5C3030]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
            <Shield size={16} strokeWidth={1.5}/> Project Staff
          </button>
        )}
      </div>

      {/* Content: Events */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          {canManageEvents && (
            <div className="flex justify-end">
              <Button size="sm" icon={Plus} onClick={() => { setSelectedEvent(null); setIsEventFormOpen(true); }}>Add Event</Button>
            </div>
          )}
          
          {loadingEvents ? (
            <div className="text-center p-12 text-gray-400"><Loader2 className="animate-spin inline" size={24} strokeWidth={1.5}/></div>
          ) : events?.length === 0 ? (
            <div className="bg-white rounded-md p-10 text-center border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <p className="text-gray-500 text-sm font-medium">No events have been scheduled.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {events?.map((event) => (
                <div key={event.id} className={`bg-white p-4 rounded-md border shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row items-start sm:items-center gap-4 group ${event.is_primary ? 'border-[#5C3030]/20 bg-[#5C3030]/[0.02]' : 'border-gray-200'} ${isPast(event.date) ? 'opacity-60 grayscale' : ''}`}>
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-md border shrink-0 ${event.is_primary ? 'border-[#5C3030]/20 bg-white text-[#5C3030]' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none mt-1">{new Date(event.date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-xl font-inter font-bold leading-none mt-0.5">{new Date(event.date).getDate()}</span>
                  </div>

                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{event.name}</h3>
                      {event.is_primary && <Badge variant="primary"><Star size={10} className="inline mr-1 fill-current"/> Primary</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 font-medium">
                       <span className="flex items-center gap-1"><Clock size={12} strokeWidth={1.5}/> All Day</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 mt-2 sm:mt-0">
                    {canMarkAttendance && (
                      <Button variant="secondary" size="sm" icon={QrCode} onClick={() => navigate(`/attendance/${project.id}/${event.id}`)}>
                        Track Attendance
                      </Button>
                    )}
                    {canManageEvents && (
                      <div className="flex gap-1 ml-2 border-l border-gray-200 pl-2">
                        <button onClick={() => { setSelectedEvent(event); setIsEventFormOpen(true); }} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"><Edit3 size={16} strokeWidth={1.5}/></button>
                        <button onClick={() => { if(confirm("Delete event?")) deleteEventMutation.mutate(event.id); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"><Trash2 size={16} strokeWidth={1.5}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content: Staff */}
      {activeTab === 'staff' && canManageStaff && (
        <ProjectStaff project={project} isAdmin={isAdmin} isCoordinator={isCoordinator} />
      )}

      <EventForm isOpen={isEventFormOpen} onClose={() => setIsEventFormOpen(false)} onSuccess={() => queryClient.invalidateQueries(['events', project.id])} projectId={project.id} initialData={selectedEvent} />
    </div>
  );
}