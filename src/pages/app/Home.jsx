import React, { useEffect, useState, useCallback ,useRef } from 'react';
import { 
  Search, Phone, FileText, Zap, QrCode, Filter, SortAsc, 
  Check, X, Trash2, ArrowUp, ArrowDown, ChevronDown, GripVertical, Plus, Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EventReports from '../../components/EventReports'; 
import { useAuth } from '../../contexts/AuthContext'; 
import QRScanner from '../../components/QRScanner'; 

const ALL_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'surname', label: 'Surname' },
  { key: 'mobile_number', label: 'Mobile' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'designation', label: 'Designation' },
  { key: 'tags', label: 'Tags' }
];

export default function Home() {
  const { profile, loading: authLoading } = useAuth();
  
  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isTaker = userRole === 'taker';
  const canMark = isAdmin || isTaker;
  const showStats = !isTaker;

  // Data State
  const [activeEvent, setActiveEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [presentIds, setPresentIds] = useState(new Set());
  
  // UI State
  const [search, setSearch] = useState('');
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false); 

  // Filter State
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeSorts, setActiveSorts] = useState([{ id: 1, column: 'name', asc: true }]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('filter');

  // --- 1. DATA FETCHING ---
  const fetchAttendanceData = useCallback(async (event) => {
    if (!event?.project_id) return;

    // A. Get Member IDs
    const { data: regData } = await supabase
      .from('project_registrations')
      .select('member_id')
      .eq('project_id', event.project_id);
      
    const ids = regData?.map(r => r.member_id) || [];
    
    if (ids.length === 0) { 
      setMembers([]); 
      return; 
    }

    // B. Fetch Members
    const { data: memData, error: memError } = await supabase
      .from('members')
      .select('id, name, surname, mandal, mandal_id, kshetra_id, gender, mobile_number, designation')
      .in('id', ids)
      .order('name');

    if (memError) {
      console.error("Error fetching members:", memError);
      return;
    }

    // C. Fetch Tags
    const { data: tagData } = await supabase
      .from('entity_tags')
      .select(`entity_id, tags ( name )`)
      .in('entity_id', ids)
      .eq('entity_type', 'Member');

    // D. Fetch Attendance (Global)
    const { data: attData } = await supabase
      .from('attendance')
      .select('member_id')
      .eq('event_id', event.id);
      
    setPresentIds(new Set(attData?.map(a => a.member_id) || []));

    // E. Process Data
    const tagsMap = {};
    if (tagData) {
      tagData.forEach(item => {
        if (!tagsMap[item.entity_id]) tagsMap[item.entity_id] = [];
        if (item.tags?.name) tagsMap[item.entity_id].push(item.tags.name);
      });
    }

    let processedMembers = (memData || []).map(m => ({
      ...m,
      tags: tagsMap[m.id] || []
    }));

    // F. Apply Scoping (Who sees what)
    if (!isAdmin && profile) {
       if (['sanchalak', 'nirikshak'].includes(userRole) && profile.mandal_id) {
          processedMembers = processedMembers.filter(m => m.mandal_id === profile.mandal_id);
       } else if (userRole === 'nirdeshak' && profile.kshetra_id) {
          processedMembers = processedMembers.filter(m => m.kshetra_id === profile.kshetra_id);
       } else if (isTaker && profile.gender) {
          processedMembers = processedMembers.filter(m => m.gender === profile.gender);
       }
    }
    
    setMembers(processedMembers);
  }, [profile, isAdmin, isTaker, userRole]);

  // --- 2. INITIAL LOAD ---
  useEffect(() => {
    if (authLoading || !profile?.id) return;

    const init = async () => {
      setLoading(true);
      // Fetch Primary Active Event
      const { data: events } = await supabase
        .from('events')
        .select('*, projects(id, name)')
        .eq('is_active', true)
        .limit(1);
      
      if (events && events.length > 0) {
        setActiveEvent(events[0]);
        await fetchAttendanceData(events[0]);
      } else {
        setMembers([]);
      }
      setLoading(false);
    };

    init();
  }, [profile?.id, authLoading, fetchAttendanceData]);

  // --- 3. REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    if (!activeEvent?.id) return;

    const channel = supabase
      .channel(`home_live_${activeEvent.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${activeEvent.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
             setPresentIds(prev => new Set(prev).add(payload.new.member_id));
          } 
          else if (payload.eventType === 'DELETE') {
             if (payload.old && payload.old.member_id) {
                setPresentIds(prev => { const next = new Set(prev); next.delete(payload.old.member_id); return next; });
             } else {
                fetchAttendanceData(activeEvent); // Safety fallback
             }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeEvent?.id, fetchAttendanceData]);

  // --- 4. CALCULATE SCOPED STATS (Fixes 340% Bug) ---
  // Count ONLY members who are in the current filtered list AND are present
  const scopedPresentCount = members.filter(m => presentIds.has(m.id)).length;
  const scopedTotalCount = members.length;

  // --- 5. FILTER ENGINE ---
  useEffect(() => {
    let result = [...members];
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(m => (m.name + m.surname + m.id).toLowerCase().includes(lower));
    }
    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        if (filter.column === 'tags') {
          result = result.filter(m => m.tags && m.tags.some(tag => filter.values.includes(tag)));
        } else {
          result = result.filter(m => filter.values.includes(m[filter.column]));
        }
      }
    });
    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        let valA = Array.isArray(a[sort.column]) ? a[sort.column][0] : a[sort.column];
        let valB = Array.isArray(b[sort.column]) ? b[sort.column][0] : b[sort.column];
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
        if (valA < valB) return sort.asc ? -1 : 1;
        if (valA > valB) return sort.asc ? 1 : -1;
      }
      return 0;
    });
    setFilteredMembers(result);
  }, [members, search, activeFilters, activeSorts]);

  // --- ACTIONS ---
  const toggleAttendance = async (memberId) => {
    if (!activeEvent || !canMark) return; 
    const isPresent = presentIds.has(memberId);
    
    setPresentIds(prev => { 
        const next = new Set(prev); 
        if (isPresent) next.delete(memberId); 
        else next.add(memberId); 
        return next; 
    });

    if (isPresent) { 
        await supabase.from('attendance').delete().eq('event_id', activeEvent.id).eq('member_id', memberId); 
    } else { 
        await supabase.from('attendance').insert([{ event_id: activeEvent.id, member_id: memberId }]); 
    }
  };

  const handleScanSuccess = async (memberId) => {
    // Only accept scan if member is in our scoped list
    if (!members.some(m => m.id === memberId)) {
       return alert("Member not found in your list.");
    }
    setPresentIds(prev => new Set(prev).add(memberId));
    try { 
        await supabase.from('attendance').upsert(
            [{ event_id: activeEvent.id, member_id: memberId }], 
            { onConflict: 'event_id, member_id' }
        ); 
    } catch (e) { console.error("Scan Error:", e); }
  };

  if (authLoading || !profile) return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-[#002B3D]" size={40} /></div>;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative">
      
      <QRScanner 
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        event={activeEvent}
        members={members}
        onScanSuccess={handleScanSuccess}
      />

      <div className="bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2">
                <Zap size={16} className="text-yellow-500 fill-yellow-500 hidden sm:block"/>
                <h1 className="text-lg font-bold text-[#002B3D] truncate">{activeEvent?.name || "No Active Event"}</h1>
             </div>
             
             {/* ✅ CORRECTED STATS DISPLAY */}
             {showStats && activeEvent && (
               <div className="flex items-center gap-2 mt-0.5">
                 <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                 <span className="text-xs font-semibold text-slate-500">
                   {scopedPresentCount} / {scopedTotalCount} Present ({scopedTotalCount > 0 ? Math.round((scopedPresentCount / scopedTotalCount) * 100) : 0}%)
                 </span>
               </div>
             )}
          </div>

          <div className="flex gap-2">
             {canMark && activeEvent && (
               <button onClick={() => setIsScannerOpen(true)} className="bg-[#002B3D] text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all">
                 <QrCode size={20} />
               </button>
             )}
             <div className="flex bg-slate-100 rounded-xl p-1">
               <button onClick={() => openDrawer('sort')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all"><SortAsc size={18} /></button>
               <div className="w-px bg-slate-200 my-1"></div>
               <button onClick={() => openDrawer('filter')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all relative">
                 <Filter size={18} />
                 {activeFilters.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
               </button>
             </div>
             {showStats && activeEvent && (
                <button onClick={() => setIsReportsOpen(true)} className="p-2.5 bg-slate-100 text-[#002B3D] rounded-xl hover:bg-slate-200 active:scale-95 transition-all">
                  <FileText size={20} />
                </button>
             )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by Name or ID..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-[#002B3D]" 
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 scroll-smooth">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
            <Loader2 size={32} className="animate-spin text-[#002B3D]"/>
            <span className="text-xs font-medium">Loading Roster...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No members found matching your search.</div>
        ) : (
          filteredMembers.map(m => {
            const isPresent = presentIds.has(m.id);
            return (
              <div key={m.id} className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group active:scale-[0.99] transition-transform">
                 <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{m.name} {m.surname}</h3>
                      {isPresent && <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Present</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                       <span className="truncate max-w-[120px]">{m.mandal}</span>
                       <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                       <span className="truncate">{m.designation}</span>
                    </div>
                    {m.tags && m.tags.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                        {m.tags.map(tag => (
                          <span key={tag} className="text-[9px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-md font-medium uppercase whitespace-nowrap shrink-0">{tag}</span>
                        ))}
                      </div>
                    )}
                 </div>
                 <div className="flex items-center gap-2 shrink-0">
                    {m.mobile_number && <a href={`tel:${m.mobile_number}`} className="p-2.5 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-colors"><Phone size={18} /></a>}
                    {canMark ? (
                      <button onClick={() => toggleAttendance(m.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm ${isPresent ? 'bg-green-500 text-white shadow-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                        {isPresent ? <Check size={20} strokeWidth={3} /> : <div className="w-3 h-3 rounded-full border-2 border-slate-300"></div>}
                      </button>
                    ) : (
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isPresent ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'}`}>{isPresent ? 'Present' : 'Absent'}</div>
                    )}
                 </div>
              </div>
            );
          })
        )}
      </div>

      {activeEvent && (
        <>
          <EventReports isOpen={isReportsOpen} onClose={() => setIsReportsOpen(false)} event={activeEvent} members={members} presentIds={presentIds} />
          <RightDrawer isOpen={isDrawerOpen} mode={drawerMode} onClose={() => setIsDrawerOpen(false)} initialFilters={activeFilters} initialSorts={activeSorts} onApply={(f, s) => { setActiveFilters(f); setActiveSorts(s); setIsDrawerOpen(false); }} data={members} />
        </>
      )}
    </div>
  );

  function openDrawer(mode) { setDrawerMode(mode); setIsDrawerOpen(true); }
}

// ... (Subcomponents RightDrawer & MultiSelectDropdown remain as provided previously) ...
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
  const getOptionsForColumn = (column) => { if (!column) return []; const unique = [...new Set(data.map(m => m[column]).flat().filter(Boolean))]; return unique.sort(); };
  
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[1000] flex justify-end"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div><div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pt-safe-top"><div className="p-5 border-b flex justify-between items-center bg-white"><h2 className="text-xl font-bold text-[#002B3D] capitalize">{mode === 'filter' ? 'Filter List' : 'Sort List'}</h2><button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button></div><div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 pb-24">{mode === 'filter' && (<div className="space-y-4">{localFilters.map((filter) => (<div key={filter.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3"><div className="flex justify-between items-center"><span className="text-xs font-bold text-[#002B3D] uppercase tracking-wider">Field</span><button onClick={() => removeFilterRow(filter.id)} className="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded-lg"><Trash2 size={14}/></button></div><select value={filter.column} onChange={(e) => updateFilterRow(filter.id, 'column', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:border-[#002B3D]"><option value="" disabled>Select Column</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select>{filter.column && (<div className="relative"><MultiSelectDropdown options={getOptionsForColumn(filter.column)} selected={filter.values} onChange={(newValues) => updateFilterRow(filter.id, 'values', newValues)} /></div>)}</div>))}<button onClick={addFilterRow} className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white hover:border-[#002B3D] hover:text-[#002B3D] transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add New Filter</button></div>)}{mode === 'sort' && (<div className="space-y-3">{localSorts.map((sort) => (<div key={sort.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2"><div className="text-slate-300 cursor-grab"><GripVertical size={20} /></div><div className="flex-1 space-y-2"><select value={sort.column} onChange={(e) => updateSortRow(sort.id, 'column', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Field</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div><button onClick={() => updateSortRow(sort.id, 'asc', !sort.asc)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs min-w-[60px] flex flex-col items-center justify-center">{sort.asc ? <ArrowUp size={14} className="text-sky-600 mb-1"/> : <ArrowDown size={14} className="text-orange-500 mb-1"/>} {sort.asc ? 'ASC' : 'DESC'}</button><button onClick={() => removeSortRow(sort.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button></div>))}<button onClick={addSortRow} className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Sort</button></div>)}</div><div className="p-4 border-t bg-white shrink-0 flex gap-3 pb-safe-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"><button onClick={() => { if(mode === 'filter') setLocalFilters([]); else setLocalSorts([]); }} className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Clear All</button><button onClick={() => onApply(localFilters, localSorts)} className="flex-1 py-3.5 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] shadow-lg shadow-[#002B3D]/20 transition-all active:scale-95">Apply Changes</button></div></div></div>);
}

function MultiSelectDropdown({ options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  useEffect(() => { function handleClickOutside(event) { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) { setIsOpen(false); } } document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
  const toggleValue = (val) => { if (selected.includes(val)) onChange(selected.filter(v => v !== val)); else onChange([...selected, val]); };
  const getLabel = () => { if (selected.length === 0) return "Select Criteria"; if (selected.length === 1) return selected[0]; return `${selected[0]} +${selected.length - 1}`; };
  return (<div className="relative w-full" ref={dropdownRef}><button onClick={() => setIsOpen(!isOpen)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-left flex justify-between items-center text-[#002B3D] hover:bg-white transition-colors"><span className="truncate pr-2">{getLabel()}</span><ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} /></button>{isOpen && (<div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-2 animate-in fade-in slide-in-from-top-2">{options.length === 0 ? <div className="p-3 text-xs text-slate-400 text-center">No options available</div> : options.map(opt => (<div key={opt} onClick={() => toggleValue(opt)} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"><div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selected.includes(opt) ? 'bg-[#002B3D] border-[#002B3D]' : 'bg-white border-slate-300'}`}>{selected.includes(opt) && <Check size={12} className="text-white"/>}</div><span className="text-sm text-slate-700 font-medium">{opt}</span></div>))}</div>)}</div>);
}