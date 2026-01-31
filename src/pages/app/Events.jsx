import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Clock, MoreVertical, Trash2, Edit2, 
  ArrowLeft, FileText, CheckCircle, Filter, SortAsc, 
  X, Check, ChevronDown, GripVertical, ArrowUp, ArrowDown, RefreshCcw 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EventModal from '../../components/EventModal';
import EventReports from '../../components/EventReports';
import ConfirmModal from '../../components/ConfirmModal'; 
import { useAuth } from '../../contexts/AuthContext'; // <--- 1. IMPORT AUTH

// ... (Keep CONSTANTS) ...
const ALL_COLUMNS = [
  { key: 'name', label: 'Event Name' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'is_active', label: 'Primary Status' }
];

export default function Events() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const project = state?.project;
  
  const { profile } = useAuth(); // <--- 2. GET PROFILE
  // 3. DEFINE PERMISSIONS
  const canManageEvents = ['admin'].includes(profile?.role);

  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [regCount, setRegCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // UI States
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeSorts, setActiveSorts] = useState([{ id: 1, column: 'start_date', asc: true }]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('filter');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [reportModalData, setReportModalData] = useState(null);

  const [deleteId, setDeleteId] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!project) return;
    setLoading(true);

    const { count } = await supabase.from('project_registrations').select('*', { count: 'exact', head: true }).eq('project_id', project.id);
    setRegCount(count || 0);

    const { data: eventsData } = await supabase.from('events').select('*').eq('project_id', project.id);

    if (eventsData) {
      const now = new Date();
      eventsData.forEach(async (e) => {
        if (e.is_active && e.end_date) {
           const end = new Date(e.end_date);
           if (end < now) {
             await supabase.from('events').update({ is_active: false }).eq('id', e.id);
             e.is_active = false; 
           }
        }
      });

      const eventIds = eventsData.map(e => e.id);
      
      let attCounts = {};
      if (eventIds.length > 0) {
        const { data: attData } = await supabase.from('attendance').select('event_id').in('event_id', eventIds);
        if (attData) {
            attData.forEach(r => attCounts[r.event_id] = (attCounts[r.event_id] || 0) + 1);
        }
      }

      const { data: tagsData } = await supabase
        .from('entity_tags')
        .select('entity_id, tag_id, tags ( name, color )')
        .eq('entity_type', 'Event')
        .in('entity_id', eventIds);

      const finalEvents = eventsData.map(e => {
        const myTags = tagsData ? tagsData.filter(t => t.entity_id === e.id) : [];
        return { 
          ...e, 
          present_count: attCounts[e.id] || 0,
          entity_tags: myTags
        };
      });

      setEvents(finalEvents);
    }
    setLoading(false);
  }, [project]);

  useEffect(() => {
    if (!project) { navigate('/projects'); return; }
    
    fetchEvents();

    const channels = supabase.channel('custom-events-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchEvents())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchEvents())
      .subscribe();

    return () => {
      supabase.removeChannel(channels);
    };
  }, [project, fetchEvents]);

  // --- FILTER & SORT ENGINE ---
  useEffect(() => {
    let result = [...events];
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(lower));
    }
    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        if (filter.column === 'is_active') {
             const boolValues = filter.values.map(v => v === 'True');
             result = result.filter(e => boolValues.includes(e.is_active));
        } else if (filter.column === 'start_date') {
             result = result.filter(e => filter.values.some(val => e.start_date.startsWith(val)));
        } else {
             result = result.filter(e => filter.values.includes(e[filter.column]));
        }
      }
    });
    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        let valA = a[sort.column];
        let valB = b[sort.column];
        if (sort.column === 'start_date') {
            valA = new Date(valA).getTime();
            valB = new Date(valB).getTime();
        } else {
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.asc ? -1 : 1;
        if (valA > valB) return sort.asc ? 1 : -1;
      }
      return 0;
    });
    setFilteredEvents(result);
  }, [events, search, activeFilters, activeSorts]);

  const togglePrimary = async (event) => {
    await supabase.from('events').update({ is_active: !event.is_active }).eq('id', event.id);
  };

  const handleDelete = (id) => {
    setDeleteId(id); 
    setActiveMenuId(null); 
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await supabase.from('events').delete().eq('id', deleteId);
      setDeleteId(null);
    }
  };

  const openReportForEvent = async (event) => {
    setActiveMenuId(null);
    const { data: regData } = await supabase.from('project_registrations').select('member_id').eq('project_id', project.id);
    const ids = regData?.map(r => r.member_id) || [];
    const { data: memData } = await supabase.from('members').select('*').in('id', ids).order('name');
    const { data: attData } = await supabase.from('attendance').select('member_id').eq('event_id', event.id);
    const presentIds = new Set(attData?.map(a => a.member_id));
    setReportModalData({ event, members: memData, presentIds });
  };

  const openDrawer = (mode) => {
    setDrawerMode(mode);
    setIsDrawerOpen(true);
  };

  const formatTimeRange = (start, end) => {
    if (!start) return '-';
    const s = new Date(start);
    const startTime = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    if (end) {
      const e = new Date(end);
      if (s.toDateString() === e.toDateString()) {
         const endTime = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
         return `${startTime} - ${endTime}`;
      }
    }
    return startTime;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => setActiveMenuId(null)}>
      
      {/* HEADER */}
      <div className="bg-white p-4 pb-2 shadow-sm z-10 sticky top-0 pt-safe-top">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/projects')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-xl font-bold text-[#002B3D] leading-none">{project?.name}</h1>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={fetchEvents} className="p-2.5 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform">
                <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => openDrawer('sort')} className="relative p-2.5 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200"><SortAsc size={20} />{activeSorts.length > 1 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></span>}</button>
            <button onClick={() => openDrawer('filter')} className="relative p-2.5 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200"><Filter size={20} />{activeFilters.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></span>}</button>
          </div>
        </div>
        <div className="relative mb-3">
           <Search className="absolute left-3 top-3 text-slate-400" size={20} />
           <input type="text" placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" />
           {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 pb-safe-bottom">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading...</div> : (
           filteredEvents.map(e => {
             const date = new Date(e.start_date);
             return (
               <div 
                 key={e.id} 
                 onClick={() => navigate('/attendance', { state: { event: e, project, totalReg: regCount } })} 
                 className={`bg-white p-4 rounded-xl shadow-sm border relative cursor-pointer active:scale-[0.99] transition-all ${e.is_active ? 'border-sky-300 ring-1 ring-sky-100' : 'border-slate-100'} ${activeMenuId === e.id ? 'z-20' : ''}`}
               >
                  <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3 w-full">
                          <div className="bg-slate-100 p-2.5 rounded-xl text-center min-w-[60px] shrink-0">
                             <div className="text-xs font-bold text-slate-500 uppercase">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                             <div className="text-xl font-bold text-[#002B3D]">{date.getDate()}</div>
                          </div>
                          <div className="min-w-0 flex-1">
                             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">
                               {e.name}
                               {e.is_active && <span className="bg-sky-100 text-sky-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0">Primary</span>}
                             </h3>
                             
                             <div className="flex flex-wrap gap-1 mt-1">
                               {e.entity_tags?.map((et, index) => (
                                 <span key={index} className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shadow-sm" style={{ backgroundColor: et.tags?.color || '#94a3b8' }}>{et.tags?.name}</span>
                               ))}
                             </div>

                             <div className="flex items-center gap-2 text-xs text-slate-500 font-bold mt-2 bg-slate-50 px-2 py-1 rounded w-fit">
                                <Clock size={12} className="text-slate-400" /> {formatTimeRange(e.start_date, e.end_date)}
                             </div>
                             <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 bg-[#002B3D] text-white text-xs font-bold rounded-full">
                                {e.present_count} <span className="text-white/60">/ {regCount} Present</span>
                             </div>
                          </div>
                      </div>
                      <button onClick={(ev) => { ev.stopPropagation(); setActiveMenuId(activeMenuId === e.id ? null : e.id); }} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full shrink-0"><MoreVertical size={20} /></button>
                  </div>

                  {activeMenuId === e.id && (
                    <div className="absolute right-4 top-12 bg-white shadow-xl border border-slate-100 rounded-xl w-48 py-2 z-30 animate-in zoom-in-95 duration-100 origin-top-right" onClick={(ev) => ev.stopPropagation()}>
                       <button onClick={() => openReportForEvent(e)} className="w-full text-left px-4 py-2 text-sm text-[#002B3D] hover:bg-slate-50 font-medium flex items-center gap-2"><FileText size={16} /> Reports</button>
                       
                       {/* 4. CONDITIONAL RENDER: MANAGEMENT ACTIONS */}
                       {canManageEvents && (
                         <>
                           <button onClick={() => togglePrimary(e)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"><CheckCircle size={16} className={e.is_active ? 'text-sky-600' : ''}/> {e.is_active ? 'Unmark Primary' : 'Make Primary'}</button>
                           <button onClick={() => { setEventToEdit(e); setIsModalOpen(true); setActiveMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"><Edit2 size={16} /> Edit</button>
                           <button onClick={() => handleDelete(e.id)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 font-medium flex items-center gap-2"><Trash2 size={16} /> Delete</button>
                         </>
                       )}
                    </div>
                  )}
               </div>
             );
           })
        )}
      </div>

      {/* 5. HIDE ADD BUTTON FOR NON-MANAGERS */}
      {canManageEvents && (
        <button onClick={() => { setEventToEdit(null); setIsModalOpen(true); }} className="fixed bottom-6 right-6 w-14 h-14 bg-[#002B3D] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#155e7a] hover:scale-105 transition-all z-20"><Plus size={28} /></button>
      )}
      
      <EventModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} eventToEdit={eventToEdit} projectId={project?.id} onSave={fetchEvents} />
      <EventReports isOpen={!!reportModalData} onClose={() => setReportModalData(null)} event={reportModalData?.event} members={reportModalData?.members} presentIds={reportModalData?.presentIds} />
      <RightDrawer isOpen={isDrawerOpen} mode={drawerMode} onClose={() => setIsDrawerOpen(false)} initialFilters={activeFilters} initialSorts={activeSorts} onApply={(newFilters, newSorts) => { setActiveFilters(newFilters); setActiveSorts(newSorts); setIsDrawerOpen(false); }} data={events} />
      
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Event?"
        message="All attendance records for this event will be permanently deleted."
        confirmText="Yes, Delete"
        isDanger={true}
      />
    </div>
  );
}

// ... (KEEP RightDrawer and MultiSelectDropdown EXACTLY AS THEY WERE) ...

// --- REUSED DRAWER & DROPDOWN ---
function RightDrawer({ isOpen, mode, onClose, onApply, initialFilters, initialSorts, data }) {
  const [localFilters, setLocalFilters] = useState([]);
  const [localSorts, setLocalSorts] = useState([]);
  useEffect(() => { if (isOpen) { setLocalFilters(JSON.parse(JSON.stringify(initialFilters))); setLocalSorts(JSON.parse(JSON.stringify(initialSorts))); } }, [isOpen, initialFilters, initialSorts]);
  const addFilterRow = () => setLocalFilters([...localFilters, { id: Math.random(), column: '', values: [] }]);
  const removeFilterRow = (id) => setLocalFilters(localFilters.filter(f => f.id !== id));
  const updateFilterRow = (id, key, value) => setLocalFilters(localFilters.map(f => f.id === id ? { ...f, [key]: value } : f));
  const addSortRow = () => setLocalSorts([...localSorts, { id: Math.random(), column: '', asc: true }]);
  const removeSortRow = (id) => setLocalSorts(localSorts.filter(s => s.id !== id));
  const updateSortRow = (id, key, value) => setLocalSorts(localSorts.map(s => s.id === id ? { ...s, [key]: value } : s));
  const getOptionsForColumn = (column) => {
    if (!column) return [];
    if (column === 'is_active') return ['True', 'False'];
    if (column === 'start_date') return [...new Set(data.map(d => d.start_date?.split('T')[0]))].filter(Boolean).sort();
    const unique = [...new Set(data.map(m => m[column]))].filter(Boolean);
    return unique.sort();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pt-safe-top">
        <div className="p-5 border-b flex justify-between items-center bg-white"><h2 className="text-xl font-bold text-[#002B3D] capitalize">{mode === 'filter' ? 'Filter' : 'Sort'}</h2><button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 pb-24">
          {mode === 'filter' && (<div className="space-y-3">{localFilters.map((filter) => (<div key={filter.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3"><div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400 uppercase">Field</span><button onClick={() => removeFilterRow(filter.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div><select value={filter.column} onChange={(e) => updateFilterRow(filter.id, 'column', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Column</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select>{filter.column && (<div className="relative"><MultiSelectDropdown options={getOptionsForColumn(filter.column)} selected={filter.values} onChange={(newValues) => updateFilterRow(filter.id, 'values', newValues)} /></div>)}</div>))}<button onClick={addFilterRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Filter</button></div>)}
          {mode === 'sort' && (<div className="space-y-3">{localSorts.map((sort) => (<div key={sort.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2"><div className="text-slate-300 cursor-grab"><GripVertical size={20} /></div><div className="flex-1 space-y-2"><select value={sort.column} onChange={(e) => updateSortRow(sort.id, 'column', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Field</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div><button onClick={() => updateSortRow(sort.id, 'asc', !sort.asc)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs min-w-[60px] flex flex-col items-center justify-center">{sort.asc ? <ArrowUp size={14} className="text-sky-600 mb-1"/> : <ArrowDown size={14} className="text-orange-500 mb-1"/>} {sort.asc ? 'ASC' : 'DESC'}</button><button onClick={() => removeSortRow(sort.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button></div>))}<button onClick={addSortRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Sort</button></div>)}
        </div>
        <div className="p-4 border-t bg-white shrink-0 flex gap-3 pb-safe-bottom"><button onClick={() => { if(mode === 'filter') setLocalFilters([]); else setLocalSorts([]); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Clear</button><button onClick={() => onApply(localFilters, localSorts)} className="flex-1 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] shadow-lg">Apply</button></div>
      </div>
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  useEffect(() => { function handleClickOutside(event) { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) { setIsOpen(false); } } document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
  const toggleValue = (val) => { if (selected.includes(val)) onChange(selected.filter(v => v !== val)); else onChange([...selected, val]); };
  const getLabel = () => { if (selected.length === 0) return "Select Criteria"; if (selected.length === 1) return selected[0]; return `${selected[0]} +${selected.length - 1}`; };
  return (
    <div className="relative w-full" ref={dropdownRef}><button onClick={() => setIsOpen(!isOpen)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-left flex justify-between items-center text-[#002B3D]"><span className="truncate pr-2">{getLabel()}</span><ChevronDown size={16} /></button>{isOpen && (<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1">{options.length === 0 ? <div className="p-3 text-xs text-slate-400 text-center">No options available</div> : options.map(opt => (<div key={opt} onClick={() => toggleValue(opt)} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"><div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.includes(opt) ? 'bg-[#002B3D] border-[#002B3D]' : 'bg-white border-slate-300'}`}>{selected.includes(opt) && <Check size={10} className="text-white"/>}</div><span className="text-sm text-slate-700">{opt}</span></div>))}</div>)}</div>
  );
}