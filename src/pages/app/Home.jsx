import React, { useEffect, useState, useCallback } from 'react';
import { 
  Search, Phone, FileText, Zap, QrCode, Filter, SortAsc, 
  Check, X, Trash2, ArrowUp, ArrowDown, ChevronDown, GripVertical, Plus
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EventReports from '../../components/EventReports'; 
import { useAuth } from '../../contexts/AuthContext'; 
// ✅ Import your reusable scanner
import QRScanner from '../../components/QRScanner'; 

// ✅ 1. ADD 'tags' TO COLUMNS (So it appears in the Filter Drawer)
const ALL_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'surname', label: 'Surname' },
  { key: 'mobile_number', label: 'Mobile' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'designation', label: 'Designation' },
  { key: 'tags', label: 'Tags' } // <-- Added Tags here
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

  // --- 1. DATA FETCHING (Corrected to prevent loops) ---
  const fetchAttendanceData = useCallback(async (event) => {
    // 1. Get List of Member IDs registered for the project
    const { data: regData } = await supabase
      .from('project_registrations')
      .select('member_id')
      .eq('project_id', event.project_id);
      
    const ids = regData?.map(r => r.member_id) || [];
    
    if (ids.length === 0) { 
      setMembers([]); 
      return; 
    }

    // 2. FETCH MEMBERS (Clean, no complex joins to avoid 400 Error)
    const { data: memData, error: memError } = await supabase
      .from('members')
      .select('id, name, surname, mandal, mandal_id, kshetra_id, gender, mobile_number, designation')
      .in('id', ids)
      .order('name');

    if (memError) {
      console.error("Error fetching members:", memError);
      return;
    }

    // 3. FETCH TAGS SEPARATELY (Safe Method)
    // We fetch all tags associated with these Member IDs
    const { data: tagData } = await supabase
      .from('entity_tags')
      .select(`
        entity_id,
        tags ( name )
      `)
      .in('entity_id', ids)
      .eq('entity_type', 'Member'); // Ensure we only get Member tags

    // 4. FETCH ATTENDANCE STATUS
    const { data: attData } = await supabase
      .from('attendance')
      .select('member_id')
      .eq('event_id', event.id);
      
    setPresentIds(new Set(attData?.map(a => a.member_id) || []));

    // 5. MERGE DATA (Javascript Mapping)
    // Create a map for fast lookup: { "member_id": ["Singer", "Admin"] }
    const tagsMap = {};
    if (tagData) {
      tagData.forEach(item => {
        if (!tagsMap[item.entity_id]) tagsMap[item.entity_id] = [];
        if (item.tags?.name) tagsMap[item.entity_id].push(item.tags.name);
      });
    }

    // Attach tags to members
    let processedMembers = (memData || []).map(m => ({
      ...m,
      tags: tagsMap[m.id] || [] // Attach the array found in the map
    }));

    // 6. APPLY ROLE SCOPING
    if (!isAdmin && profile) {
       if (['sanchalak', 'nirikshak'].includes(userRole) && profile.mandal_id) {
          processedMembers = processedMembers.filter(m => m.mandal_id === profile.mandal_id);
       }
       else if (userRole === 'nirdeshak' && profile.kshetra_id) {
          processedMembers = processedMembers.filter(m => m.kshetra_id === profile.kshetra_id);
       }
       else if (isTaker && profile.gender) {
          processedMembers = processedMembers.filter(m => m.gender === profile.gender);
       }
    }
    
    setMembers(processedMembers);
  }, [profile?.id, profile?.mandal_id, profile?.kshetra_id, profile?.gender, isAdmin, isTaker, userRole]);
  // 👆 DEPENDENCY FIX: Used specific IDs instead of the whole 'profile' object

  const fetchPrimaryEvent = useCallback(async (silent = false) => {
    if (authLoading || !profile?.id) return;
    if (!silent) setLoading(true);
    
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
  }, [profile?.id, authLoading, fetchAttendanceData]);

  // --- 2. EFFECT HOOKS (Realtime) ---
  useEffect(() => {
    fetchPrimaryEvent();

    // Listen for attendance changes LIVE
    const channel = supabase.channel('home-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, (payload) => {
          if (payload.eventType === 'INSERT') {
             setPresentIds(prev => new Set(prev).add(payload.new.member_id));
          } else if (payload.eventType === 'DELETE') {
             // For deletes, we reload to be safe (unless Replica Identity is set)
             fetchPrimaryEvent(true);
          }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPrimaryEvent]);

  // --- 3. FILTER LOGIC ---
  useEffect(() => {
    let result = [...members];
    
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(m => (m.name + m.surname + m.id).toLowerCase().includes(lower));
    }

    // Filter Logic
    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        if (filter.column === 'tags') {
          // Array Logic: Member has ANY of selected tags
          result = result.filter(m => m.tags && m.tags.some(tag => filter.values.includes(tag)));
        } else {
          // String Logic: Exact match
          result = result.filter(m => filter.values.includes(m[filter.column]));
        }
      }
    });

    // Sort Logic
    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        
        // Handle sorting if column is an array (tags)
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

  // --- 4. ACTIONS ---
  const toggleAttendance = async (memberId) => {
    if (!activeEvent || !canMark) return; 
    const isPresent = presentIds.has(memberId);
    
    // Optimistic Update
    setPresentIds(prev => {
      const next = new Set(prev);
      if (isPresent) next.delete(memberId); else next.add(memberId);
      return next;
    });

    if (isPresent) { 
      await supabase.from('attendance').delete().eq('event_id', activeEvent.id).eq('member_id', memberId); 
    } else { 
      await supabase.from('attendance').insert([{ event_id: activeEvent.id, member_id: memberId }]); 
    }
  };

  const handleScanSuccess = async (memberId) => {
    setPresentIds(prev => new Set(prev).add(memberId));
    try {
      await supabase.from('attendance').upsert([{ 
        event_id: activeEvent.id, 
        member_id: memberId 
      }], { onConflict: 'event_id, member_id' });
    } catch (error) { 
      console.error("Failed to save scan:", error); 
    }
  };

  if (authLoading || !profile) {
    return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#002B3D]"></div></div>;
  }

  // --- 5. RENDER ---
  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative">
      
      {/* Scanner Component */}
      <QRScanner 
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        event={activeEvent}
        members={members}
        onScanSuccess={handleScanSuccess}
      />

      <div className="bg-white p-4 shadow-sm z-10 sticky top-0 pt-safe-top">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-100 rounded-full text-yellow-600"><Zap size={20} className="fill-yellow-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-[#002B3D] leading-none">{activeEvent?.name}</h1>
            {showStats && <span className="text-xs text-slate-400 font-bold">{presentIds.size} / {members.length} Present</span>}
          </div>
          <div className="ml-auto flex gap-2">
            {canMark && (
              <button onClick={() => setIsScannerOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-[#002B3D] text-white rounded-xl font-bold text-xs shadow-lg">
                <QrCode size={18} /> <span>Scan</span>
              </button>
            )}
            <button onClick={() => openDrawer('sort')} className="p-2.5 bg-slate-100 rounded-xl text-slate-600"><SortAsc size={20} /></button>
            <button onClick={() => openDrawer('filter')} className="p-2.5 bg-slate-100 rounded-xl text-slate-600"><Filter size={20} /></button>
            {showStats && (
               <button onClick={() => setIsReportsOpen(true)} className="p-2.5 bg-slate-100 rounded-xl text-[#002B3D]"><FileText size={20} /></button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading Attendance...</div> : (
          filteredMembers.map(m => {
            const isPresent = presentIds.has(m.id);
            return (
              <div key={m.id} className="p-4 rounded-xl shadow-sm border flex justify-between items-center bg-white border-slate-100">
                 <div>
                    <h3 className="text-lg font-bold text-slate-800">{m.name} {m.surname}</h3>
                    <p className="text-xs font-medium text-slate-500">{m.mandal} • {m.designation}</p>
                    
                    {/* Tags Display */}
                    {m.tags && m.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">{tag}</span>
                        ))}
                      </div>
                    )}
                 </div>
                 <div className="flex items-center gap-2">
                    {m.mobile_number && <a href={`tel:${m.mobile_number}`} className="p-2.5 text-[#0EA5E9] bg-sky-50 rounded-full"><Phone size={18} /></a>}
                    {canMark ? (
                      <button onClick={() => toggleAttendance(m.id)} className={`px-4 py-2 rounded-lg text-sm font-bold min-w-[90px] ${isPresent ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isPresent ? 'Present' : 'Absent'}
                      </button>
                    ) : (
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isPresent ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'}`}>
                        {isPresent ? 'Present' : 'Absent'}
                      </span>
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

// ... SUB COMPONENTS ...

function RightDrawer({ isOpen, mode, onClose, onApply, initialFilters, initialSorts, data }) {
  const [localFilters, setLocalFilters] = useState([]);
  const [localSorts, setLocalSorts] = useState([]);
  
  useEffect(() => { 
    if (isOpen) { 
      setLocalFilters(JSON.parse(JSON.stringify(initialFilters))); 
      setLocalSorts(JSON.parse(JSON.stringify(initialSorts))); 
    } 
  }, [isOpen, initialFilters, initialSorts]);

  const addFilterRow = () => setLocalFilters([...localFilters, { id: Math.random(), column: '', values: [] }]);
  const removeFilterRow = (id) => setLocalFilters(localFilters.filter(f => f.id !== id));
  const updateFilterRow = (id, key, value) => setLocalFilters(localFilters.map(f => f.id === id ? { ...f, [key]: value } : f));
  
  const addSortRow = () => setLocalSorts([...localSorts, { id: Math.random(), column: '', asc: true }]);
  const removeSortRow = (id) => setLocalSorts(localSorts.filter(s => s.id !== id));
  const updateSortRow = (id, key, value) => setLocalSorts(localSorts.map(s => s.id === id ? { ...s, [key]: value } : s));
  
  // ✅ FIX: Dropdown now handles arrays (Tags) correctly
  const getOptionsForColumn = (column) => {
    if (!column) return [];
    
    // Flatten array of tags if needed
    const rawValues = data.map(m => m[column]);
    const flattened = rawValues.flat().filter(Boolean); 
    
    const unique = [...new Set(flattened)];
    return unique.sort();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pt-safe-top">
        <div className="p-5 border-b flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-[#002B3D] capitalize">{mode === 'filter' ? 'Filter' : 'Sort'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 pb-24">
          {mode === 'filter' && (
            <div className="space-y-3">
              {localFilters.map((filter) => (
                <div key={filter.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase">Field</span>
                    <button onClick={() => removeFilterRow(filter.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                  </div>
                  <select value={filter.column} onChange={(e) => updateFilterRow(filter.id, 'column', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none">
                    <option value="" disabled>Select Column</option>
                    {ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                  </select>
                  {filter.column && (
                    <div className="relative">
                      <MultiSelectDropdown options={getOptionsForColumn(filter.column)} selected={filter.values} onChange={(newValues) => updateFilterRow(filter.id, 'values', newValues)} />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addFilterRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Filter</button>
            </div>
          )}
          
          {mode === 'sort' && (
            <div className="space-y-3">
              {localSorts.map((sort) => (
                <div key={sort.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
                  <div className="text-slate-300 cursor-grab"><GripVertical size={20} /></div>
                  <div className="flex-1 space-y-2">
                    <select value={sort.column} onChange={(e) => updateSortRow(sort.id, 'column', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none">
                      <option value="" disabled>Select Field</option>
                      {ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
                    </select>
                  </div>
                  <button onClick={() => updateSortRow(sort.id, 'asc', !sort.asc)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs min-w-[60px] flex flex-col items-center justify-center">{sort.asc ? <ArrowUp size={14} className="text-sky-600 mb-1"/> : <ArrowDown size={14} className="text-orange-500 mb-1"/>} {sort.asc ? 'ASC' : 'DESC'}</button>
                  <button onClick={() => removeSortRow(sort.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                </div>
              ))}
              <button onClick={addSortRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Sort</button>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-white shrink-0 flex gap-3 pb-safe-bottom">
          <button onClick={() => { if(mode === 'filter') setLocalFilters([]); else setLocalSorts([]); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Clear</button>
          <button onClick={() => onApply(localFilters, localSorts)} className="flex-1 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] shadow-lg">Apply</button>
        </div>
      </div>
    </div>
  );
}

function MultiSelectDropdown({ options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  useEffect(() => { 
    function handleClickOutside(event) { 
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) { 
        setIsOpen(false); 
      } 
    } 
    document.addEventListener("mousedown", handleClickOutside); 
    return () => document.removeEventListener("mousedown", handleClickOutside); 
  }, []);

  const toggleValue = (val) => { 
    if (selected.includes(val)) onChange(selected.filter(v => v !== val)); 
    else onChange([...selected, val]); 
  };
  
  const getLabel = () => { 
    if (selected.length === 0) return "Select Criteria"; 
    if (selected.length === 1) return selected[0]; 
    return `${selected[0]} +${selected.length - 1}`; 
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-left flex justify-between items-center text-[#002B3D]">
        <span className="truncate pr-2">{getLabel()}</span>
        <ChevronDown size={16} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1">
          {options.length === 0 ? <div className="p-3 text-xs text-slate-400 text-center">No options available</div> : options.map(opt => (
            <div key={opt} onClick={() => toggleValue(opt)} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.includes(opt) ? 'bg-[#002B3D] border-[#002B3D]' : 'bg-white border-slate-300'}`}>
                {selected.includes(opt) && <Check size={10} className="text-white"/>}
              </div>
              <span className="text-sm text-slate-700">{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}