import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, withTimeout } from '../../lib/supabase'; // 🛡️ Imported withTimeout
import { Loader2, Calendar, FolderKey, Clock, QrCode, ArrowRight, LayoutDashboard, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Attendance from '../attendance/Attendance';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

export default function HomeDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';

  // 🛡️ Bulletproof Unified Dashboard Query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home-dashboard', profile?.id],
    queryFn: async () => {
      let allowedProjectIds = [];

      // 1. Determine Scope (If not admin)
      if (!isAdmin) {
        const { data: assignments } = await withTimeout(
          supabase.from('project_assignments').select('project_id').eq('user_id', profile.id)
        );
        const assignedIds = assignments?.map(a => a.project_id) || [];

        let standardIds = [];
        if (role !== 'project_admin') {
          const { data: standardProjects } = await withTimeout(
            supabase.from('projects').select('id').eq('type', 'Standard').eq('is_active', true)
          );
          standardIds = standardProjects?.map(p => p.id) || [];
        }

        allowedProjectIds = [...new Set([...assignedIds, ...standardIds])];
        if (allowedProjectIds.length === 0) return { primaryEvent: null, primaryProject: null, openRegistrations: [], recentProjects: [] };
      }

      // 2. Fetch Primary Event
      let eventQuery = supabase.from('events')
        .select(`*, projects!inner (id, name, type, is_active, allowed_gender)`)
        .eq('is_primary', true)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(1);

      if (!isAdmin) eventQuery = eventQuery.in('project_id', allowedProjectIds);
      const { data: eventsData } = await withTimeout(eventQuery);
      
      let primaryEvent = eventsData?.[0] || null;
      let primaryProject = primaryEvent ? (Array.isArray(primaryEvent.projects) ? primaryEvent.projects[0] : primaryEvent.projects) : null;
      
      // Gender Gate for Event
      if (primaryProject && !isAdmin && primaryProject.allowed_gender !== 'Both' && primaryProject.allowed_gender !== profile?.gender) {
        primaryEvent = null; 
        primaryProject = null;
      }

      // 🛑 Early return for Taker (They don't need the rest of the dashboard data)
      if (role === 'taker') {
        return { primaryEvent, primaryProject, openRegistrations: [], recentProjects: [] };
      }

      // 3. Fetch Open Registrations
      let regQuery = supabase.from('projects')
        .select('id, name, type, allowed_gender')
        .eq('is_active', true)
        .eq('registration_open', true)
        .order('created_at', { ascending: false });
        
      if (!isAdmin) regQuery = regQuery.in('id', allowedProjectIds);
      const { data: openRegistrations } = await withTimeout(regQuery);
      const validRegs = (openRegistrations || []).filter(p => isAdmin || p.allowed_gender === 'Both' || p.allowed_gender === profile?.gender);

      // 4. Fetch Recent Projects
      let projQuery = supabase.from('projects')
        .select('id, name, type, is_active, created_at, allowed_gender')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (!isAdmin) projQuery = projQuery.in('id', allowedProjectIds);
      const { data: recentProjects } = await withTimeout(projQuery);
      const validRecent = (recentProjects || []).filter(p => isAdmin || p.allowed_gender === 'Both' || p.allowed_gender === profile?.gender);

      return { primaryEvent, primaryProject, openRegistrations: validRegs, recentProjects: validRecent };
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 2 // 2 minute cache for dashboard
  });

  // --- LOADING & ERROR STATES ---
  if (isLoading) return (
    <div className="h-[80vh] flex flex-col items-center justify-center text-gray-400">
      <Loader2 className="animate-spin mb-3 text-[#5C3030]" size={32} strokeWidth={1.5}/>
      <span className="text-xs font-semibold uppercase tracking-widest">Loading Workspace...</span>
    </div>
  );

  if (isError) return (
    <div className="p-12 text-center bg-red-50 rounded-md border border-red-200 mt-10 max-w-lg mx-auto">
      <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} strokeWidth={1.5}/>
      <h3 className="text-gray-900 font-bold mb-1">Failed to load dashboard</h3>
      <p className="text-gray-500 text-sm mb-4">Please check your internet connection.</p>
      <Button variant="secondary" size="sm" onClick={() => refetch()}><RefreshCw size={14} className="mr-2"/> Try Again</Button>
    </div>
  );

  const { primaryEvent, primaryProject, openRegistrations, recentProjects } = data || {};

  // --- 1. TAKER VIEW (Hyper-Focused) ---
  if (role === 'taker') {
    if (!primaryEvent || !primaryProject) {
      return (
        <div className="p-10 text-center max-w-lg mx-auto mt-10 bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <Calendar className="mx-auto h-10 w-10 text-gray-300 mb-3" strokeWidth={1.5}/>
          <h2 className="text-lg font-semibold text-gray-900">No Active Event</h2>
          <p className="text-gray-500 text-sm mt-1">There are no primary events scheduled for today.</p>
        </div>
      );
    }
    return (
      <div className="h-[calc(100vh-80px)] flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Jay Swaminarayan, {profile.full_name?.split(' ')[0]}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Attendance Workspace</p>
        </div>
        <div className="flex-1 min-h-0">
            <Attendance projectId={primaryProject.id} eventId={primaryEvent.id} embedded={true} hideSummary={true} />
        </div>
      </div>
    );
  }

  // --- 2. COMMAND CENTER DASHBOARD (Admin, Nirdeshak, Nirikshak, Sanchalak, Project Admin) ---
  return (
    <div className="space-y-6 pb-20">
      {/* Dashboard Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#5C3030]/10 text-[#5C3030] rounded-lg">
          <LayoutDashboard size={24} strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome, {profile.full_name?.split(' ')[0]}</h1>
          <p className="text-gray-500 text-sm font-medium mt-0.5">Command Center Overview</p>
        </div>
      </div>

      {/* MODULE 1: PRIMARY EVENT HERO */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
          <Calendar size={16} className="text-[#5C3030]"/> Upcoming Main Event
        </h2>
        {primaryEvent ? (
          <div className="bg-gradient-to-br from-[#5C3030] to-[#3A1E1E] rounded-xl p-6 shadow-md text-white relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Calendar size={180} strokeWidth={1} />
            </div>
            
            <div className="relative z-10">
              <Badge className="bg-white/20 text-white border-white/30 mb-3 backdrop-blur-sm">Today</Badge>
              <h3 className="text-2xl font-bold mb-1 leading-tight">{primaryEvent.name}</h3>
              <p className="text-white/80 text-sm font-medium mb-6">{primaryProject?.name}</p>
              
              <div className="flex flex-wrap gap-3">
                <Button 
                  className="bg-white text-[#5c3030] hover:bg-gray-100 border-white shadow-sm"
                  onClick={() => navigate(`/attendance/${primaryProject.id}/${primaryEvent.id}`)}
                >
                  <QrCode size={16} className="mr-2 text-[#5c3030]" strokeWidth={2}/> 
                  <p className='text-[#5c3030]'>
                  {role === 'sanchalak' ? 'View Team Attendance' : 'Manage Attendance'}
                  </p>
                </Button>
                {isAdmin && (
                  <Button 
                    variant="secondary" 
                    className="bg-black/20 text-[#5c3030] border-black/10 hover:bg-black/30 backdrop-blur-sm"
                    onClick={() => navigate(`/projects/${primaryProject.id}`)}
                  >
                    Event Settings
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center gap-4">
            <div className="p-3 bg-gray-50 rounded-full text-gray-400"><Calendar size={24} strokeWidth={1.5}/></div>
            <div>
              <h3 className="font-semibold text-gray-900">No Main Events Scheduled</h3>
              <p className="text-sm text-gray-500 mt-0.5">There are no primary events happening today.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* MODULE 2: OPEN REGISTRATIONS */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600"/> Open Registrations
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            {openRegistrations?.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No projects are currently accepting registrations.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {openRegistrations.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => navigate('/registration')} // Sends to reg desk
                    className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-md group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <FolderKey size={16} strokeWidth={2}/>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">{p.name}</h4>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Accepting Entries</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-gray-300 group-hover:text-[#5C3030] group-hover:translate-x-1 transition-all"/>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MODULE 3: RECENT PROJECTS */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} className="text-gray-500"/> Recent Projects
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            {recentProjects?.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No recent projects found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentProjects.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <div className="min-w-0 pr-4">
                      <h4 className="font-semibold text-gray-900 text-sm truncate">{p.name}</h4>
                      <div className="text-[10px] text-gray-500 font-medium mt-0.5 flex items-center gap-2">
                        <Badge variant={p.type === 'Restricted' ? 'danger' : 'default'} className="!text-[9px] !py-0">{p.type}</Badge>
                        <span className="font-inter">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-gray-300 group-hover:text-[#5C3030] group-hover:translate-x-1 transition-all shrink-0"/>
                  </div>
                ))}
              </div>
            )}
            
            {/* View All Projects Footer Link */}
            <div 
              onClick={() => navigate('/projects')}
              className="bg-gray-50 p-3 text-center text-xs font-bold text-[#5C3030] hover:bg-gray-100 cursor-pointer transition-colors border-t border-gray-200"
            >
              View All Projects
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}