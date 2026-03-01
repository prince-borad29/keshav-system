import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, QrCode, ArrowLeft, Loader2, BarChart2 } from 'lucide-react';
import ScannerView from './QrScanner';
import ManualList from './ManualList';
import AttendanceSummary from './AttendanceSummary';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';

export default function AttendanceDashboard({ preSelectedProject = null, preSelectedEvent = null, onBack = null }) {
  const [selectedProject, setSelectedProject] = useState(preSelectedProject);
  const [selectedEvent, setSelectedEvent] = useState(preSelectedEvent);

  const [isScanning, setIsScanning] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [drillDownMandal, setDrillDownMandal] = useState(null); 
  const [userScope, setUserScope] = useState({ role: '', gender: '', mandalIds: [], kshetraId: null, isGlobal: false });

  useEffect(() => {
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
    fetchUserScope();
  }, []);

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['active-projects'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, type').eq('is_active', true).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !selectedProject
  });

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['events', selectedProject?.id],
    queryFn: async () => {
      const { data } = await supabase.from('events').select('*').eq('project_id', selectedProject.id).order('date', { ascending: true });
      return data || [];
    },
    enabled: !!selectedProject && !selectedEvent
  });

  const handleBack = () => {
    if (isScanning) { setIsScanning(false); return; }
    if (onBack) onBack();
    else if (selectedEvent && !preSelectedEvent) setSelectedEvent(null);
    else setSelectedProject(null);
  };

  if (isScanning) {
    return <ScannerView eventName={selectedEvent?.name} onBack={() => setIsScanning(false)} />;
  }

  return (
    <div className="space-y-6 pb-10">
      {!selectedProject ? (
        <div className="space-y-4 max-w-2xl mx-auto mt-4">
          <h1 className="text-xl font-bold text-gray-900">Select Project</h1>
          {loadingProjects ? <Loader2 className="animate-spin text-gray-400"/> : (
            <div className="grid gap-3">
              {projects?.map(p => (
                <button key={p.id} onClick={() => setSelectedProject(p)} className="w-full bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] text-left font-semibold text-gray-800 hover:border-[#5C3030] transition-colors">{p.name}</button>
              ))}
            </div>
          )}
        </div>
      ) : !selectedEvent ? (
        <div className="space-y-4 max-w-2xl mx-auto mt-4">
          <div className="flex items-center gap-2">
            <button onClick={handleBack} className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-md text-gray-500"><ArrowLeft size={18} strokeWidth={2}/></button>
            <h1 className="text-xl font-bold text-gray-900">Select Session</h1>
          </div>
          {loadingEvents ? <Loader2 className="animate-spin text-gray-400"/> : (
            <div className="grid gap-3">
              {events?.map(e => (
                <button key={e.id} onClick={() => setSelectedEvent(e)} className="p-4 rounded-md border border-gray-200 bg-white text-left font-semibold text-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-[#5C3030] transition-colors">{e.name}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex items-center justify-between sticky top-0 z-10 bg-gray-50 pt-2 pb-3">
            <div className="flex items-center gap-3">
              <button onClick={handleBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-200 text-gray-500"><ArrowLeft size={18} strokeWidth={2}/></button>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">{selectedEvent.name}</h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">{selectedProject.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowSummary(true)} className="!px-3"><BarChart2 size={16} strokeWidth={2}/></Button>
              <Button icon={QrCode} onClick={() => setIsScannerOpen(true)}>Scan</Button>
            </div>
          </div>

          <AttendanceSummary isVisible={showSummary} onClose={() => setShowSummary(false)} event={selectedEvent} project={selectedProject} userScope={userScope} onMandalClick={(id, name) => { setDrillDownMandal({id, name}); setShowSummary(false); }} />

          <div className="flex-1">
            <ManualList event={selectedEvent} project={selectedProject} mandalFilterId={drillDownMandal?.id} mandalFilterName={drillDownMandal?.name} onBack={() => setDrillDownMandal(null)} />
          </div>
        </div>
      )}
    </div>
  );
}