import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, QrCode, ArrowLeft, Loader2, BarChart2 } from 'lucide-react';
import ScannerView from './QrScanner';
import ManualList from './ManualList';
import AttendanceSummary from './AttendanceSummary';

export default function AttendanceDashboard({ preSelectedProject = null, preSelectedEvent = null, onBack = null }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(preSelectedProject);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(preSelectedEvent);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI State
  const [isScanning, setIsScanning] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [drillDownMandal, setDrillDownMandal] = useState(null); 
  const [userScope, setUserScope] = useState({ role: '', gender: '', mandalIds: [], kshetraId: null, isGlobal: false });

  // 1. INIT: Fetch Scope & Check URL for Persistence
  useEffect(() => {
    fetchUserScope();
    fetchProjects();

    // URL PERSISTENCE LOGIC
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('projectId');
    const eId = params.get('eventId');

    if (pId && !selectedProject) {
      loadFromUrl(pId, eId);
    }
  }, []);

  const loadFromUrl = async (pId, eId) => {
    // Fetch Project Details
    const { data: p } = await supabase.from('projects').select('id, name, type').eq('id', pId).single();
    if (p) {
      setSelectedProject(p);
      fetchEvents(p.id);
      
      // Fetch Event Details
      if (eId) {
        const { data: e } = await supabase.from('events').select('*').eq('id', eId).single();
        if (e) setSelectedEvent(e);
      }
    }
  };

  const updateUrl = (p, e) => {
    const params = new URLSearchParams(window.location.search);
    if (p) params.set('projectId', p.id); else params.delete('projectId');
    if (e) params.set('eventId', e.id); else params.delete('eventId');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  const fetchUserScope = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('user_profiles').select('role, gender, assigned_mandal_id').eq('id', user.id).single();
    let scope = { role: profile.role, gender: profile.gender || null, mandalIds: [], kshetraId: null, isGlobal: profile.role === 'admin' };
    
    if (profile.role === 'sanchalak') scope.mandalIds = [profile.assigned_mandal_id];
    else if (profile.role === 'nirikshak') {
      const { data } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', user.id);
      scope.mandalIds = data?.map(d => d.mandal_id) || [];
    } else if (profile.role === 'nirdeshak' && profile.assigned_mandal_id) {
       const { data: m } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
       if(m) scope.kshetraId = m.kshetra_id;
    }
    setUserScope(scope);
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name, type').eq('is_active', true).order('created_at', { ascending: false });
    setProjects(data || []); setLoading(false);
  };

  const fetchEvents = async (projectId) => {
    const { data } = await supabase.from('events').select('*').eq('project_id', projectId).order('date', { ascending: true });
    setEvents(data || []);
  };

  // HANDLERS
  const handleSelectProject = (p) => {
    setSelectedProject(p);
    updateUrl(p, null);
    fetchEvents(p.id);
  };

  const handleSelectEvent = (e) => {
    setSelectedEvent(e);
    updateUrl(selectedProject, e);
  };

  const handleMandalClick = (mandalId, mandalName) => {
    setDrillDownMandal({ id: mandalId, name: mandalName });
    setShowSummary(false);
  };

  const handleBack = () => {
    if (isScanning) { setIsScanning(false); return; }
    
    if (onBack) onBack();
    else if (selectedEvent && !preSelectedEvent) {
      setSelectedEvent(null);
      updateUrl(selectedProject, null);
    }
    else {
      setSelectedProject(null);
      updateUrl(null, null);
    }
  };

  // --- RENDER ---

  // 1. SCANNER VIEW (Full Screen)
  if (isScanning) {
    return <ScannerView event={selectedEvent} onBack={() => { setIsScanning(false); setRefreshKey(prev => prev+1); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 p-4 animate-in fade-in">
      
      {/* 1. PROJECT SELECTOR */}
      {!selectedProject ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">Attendance</h1>
          {loading ? <Loader2 className="animate-spin text-slate-400"/> : projects.map(p => (
            <button key={p.id} onClick={() => handleSelectProject(p)} className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-left font-bold">{p.name}</button>
          ))}
        </div>
      ) : !selectedEvent ? (
        /* 2. EVENT SELECTOR */
        <div className="space-y-6">
          <div className="flex items-center gap-2"><button onClick={handleBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full"><ArrowLeft size={20}/></button><h1 className="text-2xl font-bold text-slate-800">Select Session</h1></div>
          <div className="grid gap-3">
            {events.map(e => (
              <button key={e.id} onClick={() => handleSelectEvent(e)} className="p-4 rounded-xl border bg-white text-left font-bold">{e.name}</button>
            ))}
          </div>
        </div>
      ) : (
        /* 3. MAIN DASHBOARD */
        <div className="space-y-4 h-full flex flex-col">
          
          {/* TOP BAR */}
          <div className="flex items-center justify-between sticky top-0 z-10 bg-slate-50/95 backdrop-blur py-2">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-white"><ArrowLeft size={20}/></button>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">{selectedEvent.name}</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{selectedProject.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSummary(true)} className="p-3 bg-white text-indigo-600 border border-indigo-100 rounded-xl shadow-sm active:scale-95 transition-transform"><BarChart2 size={20}/></button>
              <button onClick={() => setIsScanning(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-md shadow-indigo-200 font-bold text-sm active:scale-95 transition-transform"><QrCode size={18}/> Scan</button>
            </div>
          </div>

          <AttendanceSummary isVisible={showSummary} onClose={() => setShowSummary(false)} event={selectedEvent} project={selectedProject} userScope={userScope} onMandalClick={handleMandalClick} />

          <div className="flex-1">
            <ManualList 
              key={`list-${refreshKey}`} 
              event={selectedEvent} 
              project={selectedProject} 
              mandalFilterId={drillDownMandal?.id} 
              mandalFilterName={drillDownMandal?.name} 
              onBack={() => setDrillDownMandal(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}