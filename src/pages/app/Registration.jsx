import React, { useEffect, useState, useRef } from 'react';
import { 
  Search, Filter, SortAsc, X, Check, ChevronDown, 
  Plus, ArrowLeft, Phone, FileText, Folder, Users, GripVertical, ArrowUp, ArrowDown, Trash2, Loader2, Lock, Unlock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MemberModal from '../../components/MemberModal';
import ProjectReports from '../../components/ProjectReports';
import { useAuth } from '../../contexts/AuthContext'; 

// --- CONSTANTS ---
const DESIGNATION_HIERARCHY = ['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Yuvak'];

const ALL_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'surname', label: 'Surname' },
  { key: 'mobile_number', label: 'Mobile' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'designation', label: 'Designation' },
  { key: 'tags', label: 'Tags' }
];

export default function Registration() {
  const { profile } = useAuth(); 
  
  // --- PERMISSIONS ---
  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isNirdeshak = userRole === 'nirdeshak';
  const isMandalLeader = ['sanchalak', 'nirikshak'].includes(userRole);
  const isTaker = userRole === 'taker';
  const canRegister = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'].includes(userRole);

  const [view, setView] = useState('projects'); 
  const [selectedProject, setSelectedProject] = useState(null);

  const [projects, setProjects] = useState([]);
  const [projectCounts, setProjectCounts] = useState({}); 
  const [projectLoading, setProjectLoading] = useState(true);

  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [registeredIds, setRegisteredIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  // UI States
  const [search, setSearch] = useState('');
  const [quickDesigFilter, setQuickDesigFilter] = useState('All'); 
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('filter');
  const [activeFilters, setActiveFilters] = useState([]);
  const [activeSorts, setActiveSorts] = useState([{ id: 1, column: 'designation', asc: true }]);

  useEffect(() => { 
    if(profile) fetchProjects(); 
  }, [profile]);

  // --- 1. FETCH PROJECTS (Scoped Visibility & Counts) ---
  const fetchProjects = async () => {
    setProjectLoading(true);
    
    // A. Fetch All Projects
    // ✅ FIXED: Removed filter on non-existent column 'reg_visibility'
    const { data: allProjects } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (allProjects) {
      // B. Apply Visibility Logic (Matching Projects.jsx)
      const visibleProjects = allProjects.filter(p => {
        if (isAdmin) return true;
        
        // Gender Scope
        if (p.allowed_gender !== 'Both' && p.allowed_gender !== profile.gender) return false;
        
        // Region Scope (Kshetra)
        if (p.allowed_kshetras && p.allowed_kshetras.length > 0) {
           if (!profile.kshetra_id) return false;
           if (!p.allowed_kshetras.includes(profile.kshetra_id)) return false;
        }
        return true;
      });

      setProjects(visibleProjects);
      
      // C. Fetch Scoped Counts
      if (visibleProjects.length > 0) {
          let query = supabase
            .from('project_registrations')
            .select('project_id, members!inner(mandal_id, kshetra_id, gender)'); 

          // Apply Scope Filters to the COUNT query
          if (!isAdmin) {
             if (isMandalLeader && profile.mandal_id) {
                query = query.eq('members.mandal_id', profile.mandal_id);
             }
             else if (isNirdeshak && profile.kshetra_id) {
                query = query.eq('members.kshetra_id', profile.kshetra_id);
             }
             if (profile.gender) {
                query = query.eq('members.gender', profile.gender);
             }
          }

          const { data: regData } = await query;
          
          const counts = {};
          regData?.forEach(r => { 
             counts[r.project_id] = (counts[r.project_id] || 0) + 1; 
          });
          setProjectCounts(counts);
      }
    }
    setProjectLoading(false);
  };

  // --- 2. FETCH MEMBERS (Scoped List) ---
  const fetchData = async (project) => {
    // A. Get Registered IDs
    const { data: regData } = await supabase
        .from('project_registrations')
        .select('member_id')
        .eq('project_id', project.id);
        
    const regSet = new Set(regData?.map(r => r.member_id) || []);
    setRegisteredIds(regSet);

    // B. Fetch Members (Database Scoped)
    let query = supabase.from('members').select('*');

    // ✅ APPLY DB FILTERING (User can only see people in their scope)
    if (!isAdmin) {
        if (isMandalLeader && profile.mandal_id) {
            query = query.eq('mandal_id', profile.mandal_id);
        } else if (isNirdeshak && profile.kshetra_id) {
            query = query.eq('kshetra_id', profile.kshetra_id);
        } 
        if (profile.gender) {
            query = query.eq('gender', profile.gender);
        }
    }

    // Special Case: If registration is CLOSED, ONLY show people who are already registered
    // ✅ FIXED: Correct variable 'is_reg_open'
    if (project.is_reg_open === false) {
      if (regSet.size === 0) { setMembers([]); return; }
      query = query.in('id', Array.from(regSet));
    }

    const { data: membersData } = await query;

    // C. Fetch Tags
    const { data: tagsData } = await supabase.from('entity_tags').select(`entity_id, tag_id, tags ( name, color )`).eq('entity_type', 'Member');

    // D. Merge
    const membersWithTags = (membersData || []).map(member => {
      const myTags = tagsData ? tagsData.filter(t => t.entity_id === member.id) : [];
      return { ...member, entity_tags: myTags };
    });

    setMembers(membersWithTags);
  };

  const handleSelectProject = async (project) => {
    setSelectedProject(project);
    setView('members');
    setLoading(true);
    await fetchData(project);
    setLoading(false);
  };

  const toggleRegistration = async (memberId) => {
    // ✅ FIXED: Strict Logic Check
    if (!canRegister) return;
    if (selectedProject?.is_reg_open === false) return alert("Registration is closed for this project.");

    const isRegistered = registeredIds.has(memberId);
    
    // Optimistic Update
    setRegisteredIds(prev => {
        const next = new Set(prev);
        if (isRegistered) next.delete(memberId); else next.add(memberId);
        return next;
    });

    if (isRegistered) {
      await supabase.from('project_registrations').delete().eq('project_id', selectedProject.id).eq('member_id', memberId);
    } else {
      await supabase.from('project_registrations').insert([{ project_id: selectedProject.id, member_id: memberId }]);
    }
    // Refresh counts in background
    fetchProjects(); 
  };

  const registerAllVisible = async () => {
    // ✅ FIXED: Strict Logic Check
    if (!canRegister) return;
    if (selectedProject?.is_reg_open === false) return alert("Registration is closed.");

    const unregistered = filteredMembers.filter(m => !registeredIds.has(m.id));
    if (unregistered.length === 0) return alert("All visible members are already registered!");
    if (!window.confirm(`Register all ${unregistered.length} visible members?`)) return;

    setLoading(true);
    const payload = unregistered.map(m => ({ project_id: selectedProject.id, member_id: m.id }));
    const { error } = await supabase.from('project_registrations').insert(payload);

    if (!error) {
       const newSet = new Set(registeredIds);
       unregistered.forEach(m => newSet.add(m.id));
       setRegisteredIds(newSet);
       fetchProjects();
    }
    setLoading(false);
  };

  const handleNewMemberSaved = async (newMemberId) => {
    if (!newMemberId) return;
    if (selectedProject?.is_reg_open === false) return alert("Member created, but Registration is closed.");
    
    await supabase.from('project_registrations').insert([{ project_id: selectedProject.id, member_id: newMemberId }]);
    await fetchData(selectedProject);
    fetchProjects(); 
  };

  // --- FILTER ENGINE (Same as before) ---
  useEffect(() => {
    let result = [...members];
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(m => (m.name?.toLowerCase().includes(lower)) || (m.surname?.toLowerCase().includes(lower)) || (m.mobile_number?.includes(lower)));
    }
    if (quickDesigFilter !== 'All') {
      result = result.filter(m => m.designation === quickDesigFilter);
    }
    activeFilters.forEach(filter => {
      if (filter.column && filter.values.length > 0) {
        if (filter.column === 'tags') {
          result = result.filter(m => m.entity_tags?.some(et => filter.values.includes(et.tags?.name)));
        } else {
          result = result.filter(m => filter.values.includes(m[filter.column]));
        }
      }
    });
    result.sort((a, b) => {
      for (const sort of activeSorts) {
        if (!sort.column) continue;
        let valA = a[sort.column];
        let valB = b[sort.column];
        if (sort.column === 'designation') {
          valA = DESIGNATION_HIERARCHY.indexOf(valA);
          valB = DESIGNATION_HIERARCHY.indexOf(valB);
          if (valA === -1) valA = 999; if (valB === -1) valB = 999;
        } else if (sort.column === 'tags') {
           valA = a.entity_tags?.[0]?.tags?.name || '';
           valB = b.entity_tags?.[0]?.tags?.name || '';
        } else {
          valA = (valA || '').toString().toLowerCase();
          valB = (valB || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.asc ? -1 : 1;
        if (valA > valB) return sort.asc ? 1 : -1;
      }
      return 0;
    });
    setFilteredMembers(result);
  }, [members, search, quickDesigFilter, activeFilters, activeSorts]);

  // Grouping Logic
  const groupedMembers = filteredMembers.reduce((acc, member) => {
    const mandal = member.mandal || 'Other';
    if (!acc[mandal]) acc[mandal] = [];
    acc[mandal].push(member);
    return acc;
  }, {});

  const getVisibleDesignationChips = () => {
     const counts = { 'All': filteredMembers.length };
     DESIGNATION_HIERARCHY.forEach(d => counts[d] = 0);
     filteredMembers.forEach(m => { if (counts[m.designation] !== undefined) counts[m.designation]++; });
     return ['All', ...DESIGNATION_HIERARCHY].filter(d => counts[d] > 0).map(d => ({ label: d, count: counts[d] }));
  };

  const openDrawer = (mode) => {
    setDrawerMode(mode);
    setIsDrawerOpen(true);
  };

  // ✅ LOCALIZED STATS & LOCK
  const isClosed = selectedProject?.is_reg_open === false; // ✅ Correct Variable
  const myTotalMembers = filteredMembers.length; 
  const myRegisteredCount = filteredMembers.filter(m => registeredIds.has(m.id)).length; 
  const unregisteredCount = myTotalMembers - myRegisteredCount;

  // --- VIEW 1: PROJECTS LIST ---
  if (view === 'projects') {
    return (
      <div className="flex flex-col h-full bg-slate-50 p-4 pt-safe-top">
        <h1 className="text-2xl font-bold text-[#002B3D] mb-6">Registration</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectLoading ? <div className="flex justify-center p-10 col-span-full"><Loader2 className="animate-spin text-[#002B3D]"/></div> : (
            projects.length === 0 ? <div className="col-span-full text-center text-slate-400">No projects available for registration.</div> :
            projects.map(project => (
              <div key={project.id} onClick={() => handleSelectProject(project)} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 bg-sky-50 text-[#002B3D] rounded-lg group-hover:bg-[#002B3D] group-hover:text-white transition-colors"><Folder size={24} /></div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${project.is_reg_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{project.is_reg_open ? 'Open' : 'Closed'}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-800">{project.name}</h3>
                <div className="flex items-center gap-2 mt-3 text-slate-500 text-sm font-medium">
                  <Users size={16} />
                  <span>{projectCounts[project.id] || 0} Members</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // --- VIEW 2: REGISTRATION DETAILS ---
  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      
      {/* HEADER */}
      <div className="bg-white p-4 pb-2 shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setView('projects')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ArrowLeft size={24} /></button>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
               <h1 className="text-lg font-bold text-[#002B3D] truncate">{selectedProject.name}</h1>
               {isClosed && <Lock size={14} className="text-red-500"/>}
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {isClosed ? `Closed • ${myRegisteredCount} Registered` : `Open • ${myRegisteredCount} / ${myTotalMembers} Registered`}
            </span>
          </div>
          
          <div className="flex gap-2 items-center">
            {/* Register All Button (Hidden if Closed) */}
            {!isClosed && unregisteredCount > 0 && canRegister && (
               <button onClick={registerAllVisible} className="hidden md:flex items-center gap-2 px-3 py-2 bg-[#002B3D] text-white rounded-xl font-bold text-xs shadow-lg hover:bg-[#155e7a] transition-colors whitespace-nowrap">
                  <Check size={18} /> Register All
               </button>
            )}
            <button onClick={() => openDrawer('sort')} className="relative p-2 bg-slate-100 rounded-xl text-slate-600"><SortAsc size={20} />{activeSorts.length > 1 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></span>}</button>
            <button onClick={() => openDrawer('filter')} className="relative p-2 bg-slate-100 rounded-xl text-slate-600"><Filter size={20} />{activeFilters.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></span>}</button>
            <button onClick={() => setIsReportsOpen(true)} className="p-2 bg-[#002B3D] text-white rounded-xl shadow-lg shadow-sky-900/20"><FileText size={20} /></button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
           <Search className="absolute left-3 top-3 text-slate-400" size={20} />
           <input type="text" placeholder="Search Member..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D] transition-colors" />
           {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>

        {/* Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {getVisibleDesignationChips().map(chip => (
            <button key={chip.label} onClick={() => setQuickDesigFilter(chip.label)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${quickDesigFilter === chip.label ? 'bg-[#002B3D] text-white border-[#002B3D]' : 'bg-white text-slate-500 border-slate-200'}`}>
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>
      </div>

      {/* MEMBER LIST */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6">
        {loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-[#002B3D]"/></div> : (
           Object.keys(groupedMembers).sort().map(mandalName => (
             <div key={mandalName}>
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">{mandalName} ({groupedMembers[mandalName].length})</h3>
               <div className="space-y-3">
                 {groupedMembers[mandalName].map(m => {
                   const isRegistered = registeredIds.has(m.id);
                   return (
                     <div key={m.id} className={`bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center ${isRegistered ? 'border-green-200 bg-green-50/30' : 'border-slate-100'}`}>
                        <div className="flex-1 min-w-0 pr-2">
                           <div className="flex items-center gap-2 mb-1">
                             <h3 className="text-lg font-bold text-slate-800 truncate">{m.name} {m.surname}</h3>
                           </div>
                           <p className="text-sm text-slate-500 font-medium mb-2">{m.designation}</p>
                           <div className="flex flex-wrap gap-1">
                               {m.entity_tags?.map((et, i) => (
                                 <span key={i} className="text-[9px] px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: et.tags?.color || '#94a3b8' }}>{et.tags?.name}</span>
                               ))}
                           </div>
                        </div>
                        <div className="flex flex-row items-center gap-2 shrink-0">
                           {m.mobile_number && (
                             <a href={`tel:${m.mobile_number}`} className="p-2 text-[#0EA5E9] bg-sky-50 rounded-full hover:bg-sky-100 transition-colors"><Phone size={18} /></a>
                           )}
                           
                           {/* Register Button (Logic Fix) */}
                           {canRegister && (
                              isClosed && !isRegistered ? (
                                // Case: Closed & Not Registered -> Show nothing or 'Closed' label
                                <span className="text-xs text-red-400 font-bold px-2">Closed</span>
                              ) : (
                                // Case: Open OR (Closed & Registered -> allow removing if needed, or hide)
                                <button 
                                  onClick={() => toggleRegistration(m.id)} 
                                  disabled={isClosed} // Disable interactions if closed
                                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm whitespace-nowrap ${
                                    isRegistered 
                                      ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' 
                                      : (isClosed ? 'bg-slate-50 text-slate-300' : 'bg-green-600 text-white hover:bg-green-700')
                                  }`}
                                >
                                  {isRegistered ? 'Remove' : 'Register'}
                                </button>
                              )
                           )}
                        </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           ))
        )}
      </div>

      {/* MOBILE FOOTER */}
      {!isClosed && unregisteredCount > 0 && canRegister && (
         <div className="md:hidden p-4 bg-white border-t fixed bottom-0 left-0 right-0 z-20 pb-safe-bottom">
            <button onClick={registerAllVisible} className="w-full py-3 bg-[#002B3D] text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
               <Check size={20} /> Register All ({unregisteredCount})
            </button>
         </div>
      )}

      {/* FLOATING ADD BUTTON */}
      {!isClosed && canRegister && (
        <button onClick={() => setIsMemberModalOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-[#002B3D] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#155e7a] hover:scale-105 transition-all z-20"><Plus size={28} /></button>
      )}

      <MemberModal isOpen={isMemberModalOpen} onClose={() => setIsMemberModalOpen(false)} onSave={handleNewMemberSaved} />
      
      {selectedProject && (
        <ProjectReports 
          isOpen={isReportsOpen} 
          onClose={() => setIsReportsOpen(false)} 
          project={selectedProject}
          members={members}
          registeredIds={registeredIds}
        />
      )}

      <RightDrawer isOpen={isDrawerOpen} mode={drawerMode} onClose={() => setIsDrawerOpen(false)} initialFilters={activeFilters} initialSorts={activeSorts} onApply={(newFilters, newSorts) => { setActiveFilters(newFilters); setActiveSorts(newSorts); setIsDrawerOpen(false); }} membersData={members} />
    </div>
  );
}

// ... Subcomponents remain the same ...
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
  return (<div className="fixed inset-0 z-[1000] flex justify-end"><div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div><div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 pt-safe-top"><div className="p-5 border-b flex justify-between items-center bg-white"><h2 className="text-xl font-bold text-[#002B3D] capitalize">{mode === 'filter' ? 'Filter Members' : 'Sort Order'}</h2><button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button></div><div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 pb-24">{mode === 'filter' && (<div className="space-y-3">{localFilters.map((filter) => (<div key={filter.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3"><div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400 uppercase">Field</span><button onClick={() => removeFilterRow(filter.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div><select value={filter.column} onChange={(e) => updateFilterRow(filter.id, 'column', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Column</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select>{filter.column && (<div className="relative"><MultiSelectDropdown options={getOptionsForColumn(filter.column)} selected={filter.values} onChange={(newValues) => updateFilterRow(filter.id, 'values', newValues)} /></div>)}</div>))}<button onClick={addFilterRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Filter</button></div>)}{mode === 'sort' && (<div className="space-y-3">{localSorts.map((sort) => (<div key={sort.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2"><div className="text-slate-300 cursor-grab"><GripVertical size={20} /></div><div className="flex-1 space-y-2"><select value={sort.column} onChange={(e) => updateSortRow(sort.id, 'column', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none"><option value="" disabled>Select Field</option>{ALL_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div><button onClick={() => updateSortRow(sort.id, 'asc', !sort.asc)} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs min-w-[60px] flex flex-col items-center justify-center">{sort.asc ? <ArrowUp size={14} className="text-sky-600 mb-1"/> : <ArrowDown size={14} className="text-orange-500 mb-1"/>} {sort.asc ? 'ASC' : 'DESC'}</button><button onClick={() => removeSortRow(sort.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button></div>))}<button onClick={addSortRow} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-white transition-all flex items-center justify-center gap-2"><Plus size={18} /> Add Sort</button></div>)}</div><div className="p-4 border-t bg-white shrink-0 flex gap-3 pb-safe-bottom"><button onClick={() => { if(mode === 'filter') setLocalFilters([]); else setLocalSorts([]); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Clear</button><button onClick={() => onApply(localFilters, localSorts)} className="flex-1 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] shadow-lg">Apply</button></div></div></div>);
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