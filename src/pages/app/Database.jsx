import React, { useEffect, useState,useRef } from 'react';
import { 
  Plus, Search, Phone, MoreVertical, X, Filter, SortAsc, 
  ChevronDown, Trash2, Edit2, GripVertical, Check
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MemberModal from '../../components/MemberModal';
import ConfirmModal from '../../components/ConfirmModal'; 
import { useAuth } from '../../contexts/AuthContext'; 

// --- CONSTANTS ---
const DESIGNATION_HIERARCHY = ['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Yuvak'];
const ALL_COLUMNS = [
  { key: 'name', label: 'Name' }, { key: 'surname', label: 'Surname' }, { key: 'father_name', label: 'Father Name' },
  { key: 'mobile_number', label: 'Mobile' }, { key: 'designation', label: 'Designation' }, { key: 'mandal', label: 'Mandal' },
  { key: 'kshetra', label: 'Kshetra' }, { key: 'gender', label: 'Gender' }, { key: 'tags', label: 'Tags' }
];

export default function Database() {
  const { profile } = useAuth(); 
  
  // ✅ PERMISSION LOGIC:
  // Admin = All. 
  // Nirdeshak/Nirikshak/Sanchalak = Can Edit AND Delete their own people.
  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const canEdit = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'].includes(userRole);

  const [members, setMembers] = useState([]); 
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI States
  const [search, setSearch] = useState('');
  const [quickDesigFilter, setQuickDesigFilter] = useState('All'); 
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState(null);

  // Filter States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('filter'); 
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeSorts, setActiveSorts] = useState([{ id: 1, column: 'designation', asc: true }]);
  const [deleteId, setDeleteId] = useState(null);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data: membersData } = await supabase.from('members').select('*');
      const { data: tagsData } = await supabase.from('entity_tags').select(`entity_id, tag_id, tags ( name, color )`).eq('entity_type', 'Member');

      const membersWithTags = (membersData || []).map(member => {
        const myTags = tagsData ? tagsData.filter(t => t.entity_id === member.id) : [];
        return { ...member, entity_tags: myTags };
      });

      setMembers(membersWithTags);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  // --- ENGINE: FILTER, SORT, SCOPE ---
  useEffect(() => {
    let result = [...members];

    // 1. SCOPE SECURITY
    if (profile && !isAdmin) {
      if (['sanchalak', 'nirikshak'].includes(userRole) && profile.mandal_id) {
        result = result.filter(m => m.mandal_id === profile.mandal_id);
      }
      if (userRole === 'nirdeshak' && profile.kshetra_id) {
        result = result.filter(m => m.kshetra_id === profile.kshetra_id);
      }
    }

    // 2. Search
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(m => (m.name?.toLowerCase().includes(lower)) || (m.surname?.toLowerCase().includes(lower)) || (m.mobile_number?.includes(lower)) || (m.id?.toLowerCase().includes(lower)));
    }
    
    // 3. Quick Filter
    if (quickDesigFilter !== 'All') {
      result = result.filter(m => m.designation === quickDesigFilter);
    }

    // 4. Advanced Filters
    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        if (filter.column === 'tags') {
          result = result.filter(m => m.entity_tags?.some(et => filter.values.includes(et.tags?.name)));
        } else {
          result = result.filter(m => filter.values.includes(m[filter.column]));
        }
      }
    });

    // 5. Sort
    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        let valA = a[sort.column];
        let valB = b[sort.column];
        if (sort.column === 'designation') {
          valA = DESIGNATION_HIERARCHY.indexOf(valA); valB = DESIGNATION_HIERARCHY.indexOf(valB);
          if (valA === -1) valA = 999; if (valB === -1) valB = 999;
        } else if (sort.column === 'tags') {
           valA = a.entity_tags?.[0]?.tags?.name || ''; valB = b.entity_tags?.[0]?.tags?.name || '';
        } else {
          valA = (valA || '').toString().toLowerCase(); valB = (valB || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.asc ? -1 : 1;
        if (valA > valB) return sort.asc ? 1 : -1;
      }
      return 0;
    });

    setFilteredMembers(result);
  }, [members, search, quickDesigFilter, activeFilters, activeSorts, profile, isAdmin, userRole]);

  const getVisibleDesignationChips = () => {
    const existing = new Set(filteredMembers.map(m => m.designation));
    return ['All', ...DESIGNATION_HIERARCHY.filter(d => existing.has(d))];
  };

  const getGroupedMembers = () => {
    const groups = {};
    filteredMembers.forEach(m => {
      const mandal = m.mandal || 'Unknown Mandal';
      if (!groups[mandal]) groups[mandal] = [];
      groups[mandal].push(m);
    });
    return groups;
  };

  const handleDelete = (id) => { setDeleteId(id); setActiveMenuId(null); };
  
  const confirmDelete = async () => {
    if (deleteId) {
      const { error } = await supabase.from('members').delete().eq('id', deleteId);
      if (error) {
        alert("Delete Failed: " + error.message);
      } else {
        fetchMembers();
      }
      setDeleteId(null);
    }
  };

  const openDrawer = (mode) => { setDrawerMode(mode); setIsDrawerOpen(true); };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden" onClick={() => setActiveMenuId(null)}>
      {/* HEADER */}
      <div className="bg-white p-4 pb-2 shadow-sm z-10 sticky top-0 pt-safe-top">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-[#002B3D]">Member Database</h1>
          <div className="flex gap-2">
            <button onClick={() => openDrawer('sort')} className="relative p-2.5 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200"><SortAsc size={20} /></button>
            <button onClick={() => openDrawer('filter')} className="relative p-2.5 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200"><Filter size={20} /></button>
          </div>
        </div>
        <div className="relative mb-3">
           <Search className="absolute left-3 top-3 text-slate-400" size={20} />
           <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" />
           {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {getVisibleDesignationChips().map(d => {
            const count = d === 'All' ? filteredMembers.length : filteredMembers.filter(m => m.designation === d).length;
            return (
              <button key={d} onClick={() => setQuickDesigFilter(d)} className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border flex items-center gap-2 ${quickDesigFilter === d ? 'bg-[#002B3D] text-white border-[#002B3D]' : 'bg-white text-slate-500 border-slate-200'}`}>
                {d} <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${quickDesigFilter === d ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6 pb-safe-bottom">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading...</div> : (
           Object.keys(getGroupedMembers()).sort().length === 0 ? <div className="text-center text-slate-400 mt-10">No members found.</div> : 
             Object.keys(getGroupedMembers()).sort().map(mandal => (
               <div key={mandal} className="space-y-3">
                 <div className="flex items-center gap-2 px-1">
                    <h2 className="text-[#002B3D] font-bold text-lg">{mandal}</h2>
                    <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">{getGroupedMembers()[mandal].length}</span>
                 </div>
                 {getGroupedMembers()[mandal].map(m => (
                   <div key={m.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative group active:scale-[0.99] transition-all">
                      <div className="flex justify-between items-start">
                          <div>
                             <h3 className="text-lg font-bold text-slate-800">{m.name} {m.surname}</h3>
                             <p className="text-sm text-slate-500 font-medium mb-2">{m.designation} • {m.mobile_number}</p>
                             <div className="flex flex-wrap gap-1">{m.entity_tags?.map((et, i) => (<span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shadow-sm" style={{ backgroundColor: et.tags?.color || '#94a3b8' }}>{et.tags?.name}</span>))}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            {m.mobile_number && <a href={`tel:${m.mobile_number}`} className="p-2 text-[#0EA5E9] bg-sky-50 rounded-full hover:bg-sky-100"><Phone size={18} /></a>}
                            
                            {/* ✅ Show Menu for anyone with Edit Access */}
                            {canEdit && <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === m.id ? null : m.id); }} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"><MoreVertical size={18} /></button>}
                          </div>
                      </div>
                      
                      {activeMenuId === m.id && (
                        <div className="absolute right-4 top-14 bg-white shadow-xl border border-slate-100 rounded-lg w-32 py-1 z-30 animate-in zoom-in-95 origin-top-right">
                           {/* Edit Button */}
                           <button onClick={() => { setMemberToEdit(m); setIsModalOpen(true); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                             <Edit2 size={14}/> Edit
                           </button>
                           
                           {/* ✅ DELETE BUTTON FOR CAN_EDIT (INCLUDING NIRIKSHAK) */}
                           {canEdit && (
                             <button onClick={() => handleDelete(m.id)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
                               <Trash2 size={14}/> Delete
                             </button>
                           )}
                        </div>
                      )}
                   </div>
                 ))}
               </div>
             ))
        )}
      </div>

      {canEdit && (
        <button onClick={() => { setMemberToEdit(null); setIsModalOpen(true); }} className="fixed bottom-6 right-6 w-14 h-14 bg-[#002B3D] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#155e7a] z-20"><Plus size={28} /></button>
      )}
      <MemberModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} memberToEdit={memberToEdit} onSave={fetchMembers} />
      <RightDrawer isOpen={isDrawerOpen} mode={drawerMode} onClose={() => setIsDrawerOpen(false)} initialFilters={activeFilters} initialSorts={activeSorts} onApply={(newFilters, newSorts) => { setActiveFilters(newFilters); setActiveSorts(newSorts); setIsDrawerOpen(false); }} membersData={members} />
      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} title="Delete Member?" message="This will permanently delete this member." confirmText="Delete" isDanger={true} />
    </div>
  );
}

// ... (RightDrawer and MultiSelectDropdown code remains unchanged)
function RightDrawer({ isOpen, mode, onClose, onApply, initialFilters, initialSorts, membersData }) {
  const [localFilters, setLocalFilters] = useState([]);
  const [localSorts, setLocalSorts] = useState([]);
  useEffect(() => { if (isOpen) { setLocalFilters(JSON.parse(JSON.stringify(initialFilters))); setLocalSorts(JSON.parse(JSON.stringify(initialSorts))); } }, [isOpen, initialFilters, initialSorts]);
  const addFilterRow = () => setLocalFilters([...localFilters, { id: Math.random(), column: '', values: [] }]);
  const removeFilterRow = (id) => setLocalFilters(localFilters.filter(f => f.id !== id));
  const updateFilterRow = (id, key, value) => setLocalFilters(localFilters.map(f => f.id === id ? { ...f, [key]: value } : f));
  const addSortRow = () => setLocalSorts([...localSorts, { id: Math.random(), column: '', asc: true }]);
  const removeSortRow = (id) => setLocalSorts(localSorts.filter(s => s.id !== id));
  const updateSortRow = (id, key, value) => setLocalSorts(localSorts.map(s => s.id === id ? { ...s, [key]: value } : s));
  const getOptionsForColumn = (column) => { if (!column) return []; if (column === 'tags') { const allTags = membersData.flatMap(m => m.entity_tags?.map(et => et.tags?.name) || []); return [...new Set(allTags)].sort(); } const unique = [...new Set(membersData.map(m => m[column]))].filter(Boolean); return unique.sort(); };
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[1000] flex justify-end"><div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div><div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pt-safe-top"><div className="p-5 border-b flex justify-between items-center bg-white"><h2 className="text-xl font-bold text-[#002B3D] capitalize">{mode === 'filter' ? 'Filter Members' : 'Sort Order'}</h2><button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button></div><div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 pb-24">{mode === 'filter' && (<div className="space-y-3">{localFilters.map((filter) => (<div key={filter.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3"><div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400 uppercase">Field</span><button onClick={() => removeFilterRow(filter.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div><select value={filter.column} onChange={(e) => updateFilterRow(filter.id, 'column', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Column</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select>{filter.column && (<div className="relative"><MultiSelectDropdown options={getOptionsForColumn(filter.column)} selected={filter.values} onChange={(newValues) => updateFilterRow(filter.id, 'values', newValues)} /></div>)}</div>))}<button onClick={addFilterRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Filter</button></div>)}{mode === 'sort' && (<div className="space-y-3">{localSorts.map((sort) => (<div key={sort.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2"><div className="text-slate-300 cursor-grab"><GripVertical size={20} /></div><div className="flex-1 space-y-2"><select value={sort.column} onChange={(e) => updateSortRow(sort.id, 'column', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Field</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div><button onClick={() => updateSortRow(sort.id, 'asc', !sort.asc)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs min-w-[60px] flex flex-col items-center justify-center">{sort.asc ? <ArrowUp size={14} className="text-sky-600 mb-1"/> : <ArrowDown size={14} className="text-orange-500 mb-1"/>} {sort.asc ? 'ASC' : 'DESC'}</button><button onClick={() => removeSortRow(sort.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button></div>))}<button onClick={addSortRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Sort</button></div>)}</div><div className="p-4 border-t bg-white shrink-0 flex gap-3 pb-safe-bottom"><button onClick={() => { if(mode === 'filter') setLocalFilters([]); else setLocalSorts([]); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Clear {mode}s</button><button onClick={() => onApply(localFilters, localSorts)} className="flex-1 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] shadow-lg">Apply Changes</button></div></div></div>);
}

function MultiSelectDropdown({ options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  useEffect(() => { function handleClickOutside(event) { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) { setIsOpen(false); } } document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }, []);
  const toggleValue = (val) => { if (selected.includes(val)) onChange(selected.filter(v => v !== val)); else onChange([...selected, val]); };
  const getLabel = () => { if (selected.length === 0) return "Select Criteria"; if (selected.length === 1) return selected[0]; return `${selected[0]} +${selected.length - 1}`; };
  return (<div className="relative w-full" ref={dropdownRef}><button onClick={() => setIsOpen(!isOpen)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-left flex justify-between items-center text-[#002B3D]"><span className="truncate pr-2">{getLabel()}</span><ChevronDown size={16} /></button>{isOpen && (<div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1">{options.length === 0 ? <div className="p-3 text-xs text-slate-400 text-center">No options available</div> : options.map(opt => (<div key={opt} onClick={() => toggleValue(opt)} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"><div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.includes(opt) ? 'bg-[#002B3D] border-[#002B3D]' : 'bg-white border-slate-300'}`}>{selected.includes(opt) && <Check size={10} className="text-white"/>}</div><span className="text-sm text-slate-700">{opt}</span></div>))}</div>)}</div>);
}