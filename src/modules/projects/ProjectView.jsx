import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Calendar, Plus, Clock, 
  Edit3, Trash2, Star, Users, QrCode, Loader2, Shield 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EventForm from './EventForm';
import ProjectRoster from './ProjectRoster'; 
import ProjectStaff from './ProjectStaff';
import { useAuth } from "../../contexts/AuthContext"; 

export default function ProjectView({ project, onBack }) {
  const navigate = useNavigate();
  const { profile } = useAuth(); 
  
  const isAdmin = profile?.role === 'admin';
  const isProjectAdminAppRole = profile?.role === 'project_admin'; // Identifies JIT users

  const [activeTab, setActiveTab] = useState('events'); 
  const [events, setEvents] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  
  const [projectRole, setProjectRole] = useState(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (isAdmin) return; 
      
      try {
        const { data, error } = await supabase
          .from('project_assignments')
          .select('role')
          .eq('project_id', project.id)
          .eq('user_id', profile.id)
          .maybeSingle();

        if (error) throw error;
        if (data) setProjectRole(data.role); 
        
      } catch (err) {
        console.error("Error fetching project role:", err);
      }
    };

    if (profile) fetchRole();
  }, [project.id, profile, isAdmin]);

  useEffect(() => {
    if (activeTab === 'events') fetchEvents();
  }, [project.id, activeTab]);

  const fetchEvents = async () => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase.from('events').select('*').eq('project_id', project.id).order('date', { ascending: true });
      if (error) throw error;
      setEvents(data || []);
    } catch (err) { console.error(err); } finally { setLoadingSchedule(false); }
  };

  const handleDeleteEvent = async (id) => {
    if(!confirm("Delete this event?")) return;
    await supabase.from('events').delete().eq('id', id);
    fetchEvents();
  };

  const handleEditEvent = (e) => { setSelectedEvent(e); setIsEventFormOpen(true); };
  const handleCreateEvent = () => { setSelectedEvent(null); setIsEventFormOpen(true); };
  const handleTrackAttendance = (event) => navigate(`/attendance/${project.id}/${event.id}`);
  const isPast = (date) => new Date(date) < new Date().setHours(0,0,0,0);

  // --- UI CAPABILITY FLAGS ---
  const isCoordinator = projectRole === 'Coordinator';
  const isEditor = projectRole === 'Editor';
  const isVolunteer = projectRole === 'volunteer';

  const canManageEvents = isAdmin || isCoordinator;
  const canMarkAttendance = isAdmin || isCoordinator || isEditor || isVolunteer;
  
  // SECURE STAFF TAB: Admins can see it. Coordinators can see it ONLY IF they are not a restricted project_admin app role.
  const canManageStaff = isAdmin || (isCoordinator && !isProjectAdminAppRole);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in slide-in-from-right-4 duration-300">
      
      {/* NAV & HEADER */}
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors">
        <ArrowLeft size={20} /> Back to Projects
      </button>

      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-bl-full -mr-16 -mt-16 z-0 pointer-events-none"/>
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex gap-2 mb-3">
              <Badge variant="primary">{project.type}</Badge>
              <Badge variant="secondary">{project.allowed_gender}</Badge>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{project.name}</h1>
            <p className="text-slate-500 max-w-2xl text-lg">{project.description || "No description provided."}</p>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="border-b border-slate-200 flex gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button onClick={() => setActiveTab('events')} className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'events' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Calendar size={18}/> Schedule & Events
        </button>
        <button onClick={() => setActiveTab('registrations')} className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'registrations' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Users size={18}/> Registrations (Roster)
        </button>
        
        {canManageStaff && (
          <button onClick={() => setActiveTab('staff')} className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'staff' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Shield size={18}/> Project Staff
          </button>
        )}
      </div>

      {/* TAB CONTENT: EVENTS */}
      {activeTab === 'events' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex justify-end">
            {canManageEvents && <Button size="sm" icon={Plus} onClick={handleCreateEvent}>Add Event</Button>}
          </div>
          
          {loadingSchedule ? (
            <div className="text-center p-12 text-slate-400">
              <Loader2 className="animate-spin inline mr-2"/> Loading schedule...
            </div>
          ) : events.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <Calendar className="mx-auto h-12 w-12 text-slate-300 mb-3" />
              <h3 className="font-medium text-slate-900">No events scheduled</h3>
              <p className="text-slate-500 mb-4">No events have been created for this project yet.</p>
              {canManageEvents && <Button variant="secondary" size="sm" onClick={handleCreateEvent}>Add First Event</Button>}
            </div>
          ) : (
            <div className="grid gap-4">
              {events.map((event) => (
                <div key={event.id} className={`bg-white p-5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center gap-5 group ${event.is_primary ? 'border-amber-200 shadow-sm ring-1 ring-amber-50' : 'border-slate-200 hover:border-indigo-300'} ${isPast(event.date) ? 'opacity-75 grayscale-[0.5]' : ''}`}>
                  <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl shrink-0 ${event.is_primary ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    <span className="text-xs font-bold uppercase">{new Date(event.date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-2xl font-bold">{new Date(event.date).getDate()}</span>
                  </div>

                  <div className="flex-1 min-w-0 w-full sm:w-auto">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg text-slate-800 truncate">{event.name}</h3>
                      {event.is_primary && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1 shrink-0"><Star size={10} className="fill-amber-700"/> Primary</span>}
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                       <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={14}/> All Day</span>
                       </div>
                       
                       {canMarkAttendance && (
                         <button onClick={() => handleTrackAttendance(event)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm shadow-indigo-200 active:scale-95 transition-all">
                           <QrCode size={16}/> Track Attendance
                         </button>
                       )}
                    </div>
                  </div>

                  {canManageEvents && (
                    <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-center border-t sm:border-t-0 pt-3 sm:pt-0 mt-2 sm:mt-0 w-full sm:w-auto justify-end">
                      <button onClick={() => handleEditEvent(event)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit3 size={18}/></button>
                      <button onClick={() => handleDeleteEvent(event.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18}/></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: REGISTRATIONS (ROSTER) */}
      {activeTab === 'registrations' && (
        <div className="animate-in fade-in">
          <ProjectRoster project={project} projectRole={projectRole} isAdmin={isAdmin} /> 
        </div>
      )}

      {/* TAB CONTENT: PROJECT STAFF */}
      {activeTab === 'staff' && canManageStaff && (
        <ProjectStaff project={project} isAdmin={isAdmin} isCoordinator={isCoordinator} />
      )}

      <EventForm isOpen={isEventFormOpen} onClose={() => setIsEventFormOpen(false)} onSuccess={fetchEvents} projectId={project.id} initialData={selectedEvent} />
    </div>
  );
}