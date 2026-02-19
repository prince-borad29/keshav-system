import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Phone, Calendar, Users, BarChart3, QrCode } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Attendance from '../attendance/Attendance';

export default function HomeDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [primaryEvent, setPrimaryEvent] = useState(null);
  const [primaryProject, setPrimaryProject] = useState(null);

  useEffect(() => {    
    fetchPrimaryEvent();
  }, []);

  const fetchPrimaryEvent = async () => {
    try {
      // Find the nearest upcoming or active primary event
      const { data: events } = await supabase
        .from('events')
        .select('*, projects(*)')
        .eq('is_primary', true)
        .gte('date', new Date(new Date().setDate(new Date().getDate() - 1)).toISOString()) // Show today's or future events
        .order('date', { ascending: true })
        .limit(1);

      if (events && events.length > 0) {
        setPrimaryEvent(events[0]);
        setPrimaryProject(events[0].projects);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  if (!primaryEvent) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto mt-10 bg-slate-50 rounded-2xl border border-slate-200">
        <Calendar className="mx-auto h-12 w-12 text-slate-300 mb-4"/>
        <h2 className="text-xl font-bold text-slate-800">No Active Event</h2>
        <p className="text-slate-500 mt-2">There are no primary events scheduled for today or the future. Please check back later.</p>
      </div>
    );
  }

  // --- ROLE BASED RENDERING ---

  // 1. ADMIN: Full Control
  // 2. TAKER: Attendance Only (No Summary)
  if (['admin', 'taker'].includes(profile.role)) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-bold text-slate-800">Jay Swaminarayan, {profile.full_name?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-sm">
            {profile.role === 'admin' ? 'Master Control' : 'Attendance Mode'}
          </p>
        </div>
        
        <div className="flex-1 min-h-0 p-4 pt-0">
            <Attendance 
            projectId={primaryProject.id} 
            eventId={primaryEvent.id} 
            embedded={true}
            hideSummary={profile.role === 'taker'} // Hide summary for Taker
            />
        </div>
      </div>
    );
  }

  // 3. SANCHALAK: "My Team" List (Read Only + Call)
  if (profile.role === 'sanchalak') {
    return (
      <SanchalakView 
        event={primaryEvent} 
        project={primaryProject} 
        mandalId={profile.assigned_mandal_id} 
        gender={profile.gender}
      />
    );
  }

  // 4. LEADERSHIP: Summary View (Read Only List + Stats)
  if (['nirdeshak', 'nirikshak'].includes(profile.role)) {
    return (
      <LeadershipView 
        event={primaryEvent} 
        project={primaryProject} 
        profile={profile}
      />
    );
  }

  return <div className="p-10 text-center">Role not recognized.</div>;
}

// --- SUB-COMPONENT: SANCHALAK VIEW ---
function SanchalakView({ event, project, mandalId, gender }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyTeam = async () => {
      // 1. Get My Members
      const { data: regData } = await supabase
        .from('project_registrations')
        .select(`
          member_id,
          members (id, name, surname, mobile, internal_code, gender, mandal_id, designation)
        `)
        .eq('project_id', project.id);

      // 2. Filter Client Side (Strict + Null Check Fix)
      let myMembers = (regData || [])
        .map(r => r.members)
        .filter(m => m && m.mandal_id === mandalId && m.gender === gender); // ✅ Added 'm &&' check
      
      myMembers.sort((a, b) => a.name.localeCompare(b.name));

      // 3. Get Status
      const { data: attData } = await supabase
        .from('attendance')
        .select('member_id')
        .eq('event_id', event.id);
      
      const presentSet = new Set(attData?.map(a => a.member_id));
      
      setMembers(myMembers.map(m => ({ ...m, isPresent: presentSet.has(m.id) })));
      setLoading(false);
    };
    fetchMyTeam();
  }, [event.id]);

  if (loading) return <div className="p-10 text-center text-slate-400">Loading your team...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 pb-20 space-y-4 animate-in fade-in">
      <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold">{event.name}</h1>
                <p className="text-indigo-200 text-sm">{project.name}</p>
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm">
                <span className="font-bold">{members.filter(m => m.isPresent).length}</span>
                <span className="opacity-75"> / {members.length}</span>
            </div>
        </div>
        <div className="mt-4 text-xs font-medium uppercase tracking-wide opacity-80">
            Your Mandal Status
        </div>
      </div>

      <div className="space-y-3">
        {members.map(m => (
          <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${m.isPresent ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                 {m.isPresent ? 'P' : 'A'}
               </div>
               <div>
                 <div className="font-bold text-slate-800">{m.name} {m.surname}</div>
                 <div className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="bg-slate-100 px-1.5 rounded text-[10px]">{m.designation}</span>
                 </div>
               </div>
            </div>
            
            {/* CALL BUTTON */}
            {m.mobile && (
              <a 
                href={`tel:${m.mobile}`} 
                className="bg-indigo-50 text-indigo-600 p-3 rounded-full hover:bg-indigo-100 transition-colors"
              >
                <Phone size={20} />
              </a>
            )}
          </div>
        ))}
        
        {members.length === 0 && (
            <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed">No registered members found in your Mandal for this event.</div>
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: LEADERSHIP VIEW ---
function LeadershipView({ event, project, profile }) {
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="px-4 pt-4 pb-2">
         <h1 className="text-xl font-bold text-slate-800">Performance Summary</h1>
         <p className="text-slate-500 text-sm">{profile.role === 'nirdeshak' ? 'Kshetra Overview' : 'Mandal Overview'}</p>
      </div>
      <div className="flex-1 min-h-0 p-4 pt-0">
        <Attendance 
            projectId={project.id} 
            eventId={event.id} 
            embedded={true}
            readOnly={true} // Cannot mark attendance
            hideSummary={false} // Can see summary
        />
      </div>
    </div>
  );
}