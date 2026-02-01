import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, ArrowLeft, Phone, FileText, Check, X, QrCode, 
  Filter, SortAsc, Plus, ChevronDown, GripVertical, ArrowUp, ArrowDown, Trash2, Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EventReports from '../../components/EventReports'; 
import QRScanner from '../../components/QRScanner';
import { useAuth } from '../../contexts/AuthContext'; 

// --- CONSTANTS ---
const ALL_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'surname', label: 'Surname' },
  { key: 'mobile_number', label: 'Mobile' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'designation', label: 'Designation' }
];

export default function Attendance() {
  const { state } = useLocation();
  const navigate = useNavigate();
  // Safe destructuring with fallback to prevent crash if state is missing
  const { event, project } = state || {};
  
  const { profile } = useAuth(); 
  
  // --- PERMISSIONS ---
  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isTaker = userRole === 'taker';
  
  const canMark = isAdmin || isTaker;
  const showStats = !isTaker; // Takers just scan, they don't analyze

  // Data State
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [presentIds, setPresentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // UI State
  const [search, setSearch] = useState('');
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
   
  // Filter & Sort State
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeSorts, setActiveSorts] = useState([{ id: 1, column: 'name', asc: true }]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('filter');

  // --- 1. DATA FETCHING ---
  const fetchEventData = useCallback(async () => {
    if (!event?.id || !project?.id) return;
    setLoading(true);

    try {
        // A. Get Members in this Project
        const { data: regData } = await supabase
            .from('project_registrations')
            .select('member_id')
            .eq('project_id', project.id);
        
        if (regData && regData.length > 0) {
            const ids = regData.map(r => r.member_id);
            
            // B. Fetch Member Details
            const { data: memData } = await supabase
                .from('members')
                .select('id, name, surname, mandal, mandal_id, kshetra_id, gender, mobile_number, designation')
                .in('id', ids)
                .order('name');
            
            // C. Apply Strict Scoping (Who sees what?)
            let scopedMembers = memData || [];
            if (profile && !isAdmin) {
                // Mandal Leader Scope
                if (['sanchalak', 'nirikshak'].includes(userRole) && profile.mandal_id) {
                    scopedMembers = scopedMembers.filter(m => m.mandal_id === profile.mandal_id);
                }
                // Kshetra Leader Scope
                if (userRole === 'nirdeshak' && profile.kshetra_id) {
                    scopedMembers = scopedMembers.filter(m => m.kshetra_id === profile.kshetra_id);
                }
                // Taker Scope (Gender Only)
                if (isTaker) {
                    // Assuming profile.gender matches member.gender values (e.g. 'Yuvak'/'Yuvati')
                    // Case-insensitive check just in case
                    scopedMembers = scopedMembers.filter(m => m.gender?.toLowerCase() === profile.gender?.toLowerCase());
                }
            }

            setMembers(scopedMembers);

            // D. Fetch Initial Attendance
            const { data: attData } = await supabase
                .from('attendance')
                .select('member_id')
                .eq('event_id', event.id);
            
            setPresentIds(new Set(attData?.map(a => a.member_id) || []));
        }
    } catch (err) {
        console.error("Error fetching data:", err);
    } finally {
        setLoading(false);
    }
  }, [event?.id, project?.id, profile, isAdmin, isTaker, userRole]);

  // --- 2. REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    // Initial Load
    fetchEventData();

    if (!event?.id) return;

    // Realtime Listener
    const channel = supabase
      .channel(`live-attendance-${event.id}`) // ✅ Fixed: Use event.id variable
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${event.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
             // Add ID to set (Instant Green Tick)
             const newMemberId = payload.new.member_id;
             setPresentIds(prev => new Set(prev).add(newMemberId));
          } 
          else if (payload.eventType === 'DELETE') {
             // Remove ID (Instant Absent)
             if (payload.old && payload.old.member_id) {
                setPresentIds(prev => {
                  const next = new Set(prev);
                  next.delete(payload.old.member_id);
                  return next;
                });
             } else {
                // Safety Net: Refresh if ID missing in payload
                fetchEventData();
             }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id, fetchEventData]); 

  // --- 3. STATS CALCULATION (Scoped) ---
  // Only count people who are BOTH present AND in the visible list (Scoped)
  const myPresentCount = members.filter(m => presentIds.has(m.id)).length;
  const myTotalCount = members.length;

  // --- 4. FILTER & SORT ENGINE ---
  useEffect(() => {
    let result = [...members];

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(m => (m.name + m.surname + m.id).toLowerCase().includes(lower));
    }

    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        result = result.filter(m => filter.values.includes(m[filter.column]));
      }
    });

    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        let valA = a[sort.column];
        let valB = b[sort.column];
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
    if (!canMark) return; 

    const isPresent = presentIds.has(memberId);
    
    // Optimistic Update (Immediate UI Change)
    setPresentIds(prev => {
        const next = new Set(prev);
        if (isPresent) next.delete(memberId); else next.add(memberId);
        return next;
    });

    try {
        if (isPresent) {
            await supabase.from('attendance').delete().eq('event_id', event.id).eq('member_id', memberId);
        } else {
            await supabase.from('attendance').insert([{ event_id: event.id, member_id: memberId }]);
        }
    } catch (err) {
        console.error("Attendance Toggle Error:", err);
        // Revert on error would go here if strict
    }
  };

  const handleScanSuccess = async (memberId) => {
    if (!canMark) return;
    // Check if member exists in our scoped list (Valid scan)
    const isValidMember = members.some(m => m.id === memberId);
    
    if (isValidMember) {
        setPresentIds(prev => new Set(prev).add(memberId)); // Optimistic
        await supabase.from('attendance').upsert(
            [{ event_id: event.id, member_id: memberId }], 
            { onConflict: 'event_id, member_id' }
        );
    } else {
        alert("Member not found in this list (Wrong Gender or Region?)");
    }
  };

  const openDrawer = (mode) => {
    setDrawerMode(mode);
    setIsDrawerOpen(true);
  };

  if (!event) return <div className="p-10 text-center text-slate-400">Event Not Found</div>;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative">
      
      {/* HEADER */}
      <div className="bg-white px-4 py-3 shadow-sm z-10 sticky top-0 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ArrowLeft size={22} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#002B3D] truncate leading-tight">{event?.name}</h1>
            {/* ✅ FIXED STATS DISPLAY */}
            {showStats && (
               <div className="flex items-center gap-2 mt-0.5">
                   <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                   <span className="text-xs font-semibold text-slate-500">
                     {myPresentCount} / {myTotalCount} Present ({myTotalCount > 0 ? Math.round((myPresentCount/myTotalCount)*100) : 0}%)
                   </span>
               </div>
            )}
          </div>
          
          <div className="flex gap-2">
             {canMark && (
               <button onClick={() => setIsScannerOpen(true)} className="bg-[#002B3D] text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all">
                 <QrCode size={20} />
               </button>
             )}

             <div className="flex bg-slate-100 rounded-xl p-1">
                <button onClick={() => openDrawer('sort')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all relative">
                    <SortAsc size={18} />
                    {activeSorts.length > 1 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
                </button>
                <div className="w-px bg-slate-200 my-1"></div>
                <button onClick={() => openDrawer('filter')} className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all relative">
                    <Filter size={18} />
                    {activeFilters.length > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
                </button>
             </div>

             {showStats && (
               <button onClick={() => setIsReportsOpen(true)} className="p-2.5 bg-slate-100 rounded-xl text-[#002B3D] hover:bg-slate-200 active:scale-95 transition-all">
                 <FileText size={20} />
               </button>
             )}
          </div>
        </div>

        <div className="relative">
           <Search className="absolute left-3 top-3 text-slate-400" size={18} />
           <input 
             type="text" 
             placeholder="Search member..." 
             value={search} 
             onChange={e => setSearch(e.target.value)} 
             className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D] text-sm font-medium transition-all" 
           />
           {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X size={16} /></button>}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 scroll-smooth">
        {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 size={32} className="animate-spin text-[#002B3D]"/>
                <span className="text-xs font-bold uppercase tracking-wider">Loading Roster...</span>
            </div>
        ) : filteredMembers.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">No members found.</div>
        ) : (
          filteredMembers.map(m => {
            const isPresent = presentIds.has(m.id);
            return (
              <div key={m.id} className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between active:scale-[0.99] transition-transform">
                 <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-slate-800 truncate">{m.name} {m.surname}</h3>
                        {isPresent && <span className="hidden sm:inline-flex px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">Present</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate max-w-[100px]">{m.mandal}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                        <span className="truncate">{m.designation}</span>
                    </div>
                 </div>

                 <div className="flex items-center gap-2 shrink-0">
                    {m.mobile_number && (
                      <a href={`tel:${m.mobile_number}`} className="p-2.5 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-colors">
                        <Phone size={18} />
                      </a>
                    )}

                    {canMark ? (
                      // TOGGLE BUTTON (Admin/Taker)
                      <button 
                        onClick={() => toggleAttendance(m.id)} 
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                          isPresent 
                            ? 'bg-green-500 text-white shadow-green-200' 
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {isPresent ? <Check size={20} strokeWidth={3} /> : <div className="w-3 h-3 rounded-full border-2 border-slate-300"></div>}
                      </button>
                    ) : (
                      // STATUS BADGE (Leaders)
                      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isPresent ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'}`}>
                        {isPresent ? 'Present' : 'Absent'}
                      </div>
                    )}
                 </div>
              </div>
            );
          })
        )}
      </div>

      {showStats && (
        <EventReports isOpen={isReportsOpen} onClose={() => setIsReportsOpen(false)} event={event} members={members} presentIds={presentIds} />
      )}

      <QRScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        event={event} 
        onScanSuccess={handleScanSuccess} 
        members={members}
      />

      <RightDrawer isOpen={isDrawerOpen} mode={drawerMode} onClose={() => setIsDrawerOpen(false)} initialFilters={activeFilters} initialSorts={activeSorts} onApply={(newFilters, newSorts) => { setActiveFilters(newFilters); setActiveSorts(newSorts); setIsDrawerOpen(false); }} data={members} />
    </div>
  );
}

// --- REUSABLE DRAWER COMPONENT (Keep as provided in snippet, just ensuring export is clean) ---
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
  const getOptionsForColumn = (column) => { if (!column) return []; const unique = [...new Set(data.map(m => m[column]))].filter(Boolean); return unique.sort(); };
  
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