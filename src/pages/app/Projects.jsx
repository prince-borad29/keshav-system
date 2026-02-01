import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Folder, Plus, Trash2, Calendar, Users, Lock, Unlock, Edit2, X, Save, Tag, Check, Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function Projects() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  // Permissions
  const isAdmin = profile?.role === 'admin';
  const canManage = isAdmin; 

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Data for Form
  const [availableTags, setAvailableTags] = useState([]);
  const [kshetras, setKshetras] = useState([]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({ 
    id: null, 
    name: '', 
    description: '', 
    is_reg_open: true, // ✅ Registration Toggle State
    selectedKshetras: new Set(),
    selectedGenders: 'Both',
    selectedTags: new Set()
  });

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Tags & Kshetras
    if (isAdmin) {
        const { data: tData } = await supabase.from('tags').select('*').order('name');
        const { data: kData } = await supabase.from('kshetras').select('id, name').order('name');
        setAvailableTags(tData || []);
        setKshetras(kData || []);
    }

    // 2. Fetch Projects
    const { data, error } = await supabase
      .from('projects')
      .select('*, project_registrations(count)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching projects:", error);
      setLoading(false);
      return;
    }

    // 3. VISIBILITY SCOPING
    const visibleProjects = data.filter(p => {
      if (isAdmin) return true;
      if (p.allowed_gender !== 'Both' && p.allowed_gender !== profile.gender) return false;
      if (p.allowed_kshetras && p.allowed_kshetras.length > 0) {
        if (!profile.kshetra_id) return false;
        if (!p.allowed_kshetras.includes(profile.kshetra_id)) return false;
      }
      return true;
    });

    setProjects(visibleProjects);
    setLoading(false);
  };

  // --- ACTIONS ---

  const openCreateModal = () => {
    if (!canManage) return;
    setFormData({ 
      id: null, name: '', description: '', is_reg_open: true,
      selectedKshetras: new Set(), selectedGenders: 'Both', selectedTags: new Set()
    });
    setTagInput('');
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = async (e, project) => {
    e.stopPropagation(); 
    if (!canManage) return;
    
    // Fetch tags
    const { data: projectTags } = await supabase
      .from('entity_tags')
      .select('tag_id')
      .eq('entity_id', project.id)
      .eq('entity_type', 'Project');

    setFormData({ 
      id: project.id, 
      name: project.name, 
      description: project.description || '', 
      is_reg_open: project.is_reg_open, // ✅ Load Status
      selectedGenders: project.allowed_gender || 'Both',
      selectedKshetras: new Set(project.allowed_kshetras || []),
      selectedTags: new Set(projectTags?.map(t => t.tag_id) || [])
    });

    setIsEditing(true);
    setShowModal(true);
  };

  // Toggles
  const toggleTag = (id) => {
    const next = new Set(formData.selectedTags);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFormData({ ...formData, selectedTags: next });
  };

  const toggleKshetra = (id) => {
    const next = new Set(formData.selectedKshetras);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFormData({ ...formData, selectedKshetras: next });
  };

  // Add new tags on the fly
  const handleAddTag = async (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && tagInput.trim()) {
        e.preventDefault();
        const tagName = tagInput.trim();
        
        // Optimistic UI update
        // (Real implementation should insert into 'tags' table first if it doesn't exist)
        // For now, we assume user selects from existing or we just handle ID mapping later.
        // If your 'tags' table requires an insert for new tags:
        const { data: newTag } = await supabase.from('tags').insert([{ name: tagName }]).select().single();
        if (newTag) {
            setAvailableTags([...availableTags, newTag]);
            toggleTag(newTag.id);
        }
        setTagInput('');
    }
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Project Name is required");
    setSubmitting(true);

    const payload = {
      name: formData.name, 
      description: formData.description,
      is_reg_open: formData.is_reg_open, // ✅ Save Status
      allowed_gender: formData.selectedGenders,
      allowed_kshetras: Array.from(formData.selectedKshetras)
    };

    let projectId = formData.id;
    let error;

    if (isEditing) {
      const { error: err } = await supabase.from('projects').update(payload).eq('id', projectId);
      error = err;
    } else {
      const { data: newP, error: err } = await supabase.from('projects').insert([payload]).select().single();
      if (newP) projectId = newP.id;
      error = err;
    }

    if (error) {
      setSubmitting(false);
      return alert("Error: " + error.message);
    }

    // Handle Tags
    if (projectId) {
      await supabase.from('entity_tags').delete().eq('entity_id', projectId).eq('entity_type', 'Project');
      if (formData.selectedTags.size > 0) {
        const tagInserts = Array.from(formData.selectedTags).map(tagId => ({
          entity_id: projectId, entity_type: 'Project', tag_id: tagId
        }));
        await supabase.from('entity_tags').insert(tagInserts);
      }
    }

    setSubmitting(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project? This removes ALL attendance data.")) return;
    await supabase.from('projects').delete().eq('id', id);
    fetchData();
  };

  const toggleStatus = async (e, project) => {
    e.stopPropagation();
    if (!canManage) return; 
    setProjects(projects.map(p => p.id === project.id ? { ...p, is_reg_open: !p.is_reg_open } : p));
    await supabase.from('projects').update({ is_reg_open: !project.is_reg_open }).eq('id', project.id);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* HEADER */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center border-b border-gray-100">
        <div>
           <h1 className="text-2xl font-bold text-[#002B3D]">Projects</h1>
           <p className="text-xs text-slate-500 font-medium">Containerized Events & Attendance</p>
        </div>
        {canManage && (
          <button onClick={openCreateModal} className="bg-[#002B3D] text-white p-3 rounded-xl shadow-lg hover:bg-[#0b3d52] transition-all flex items-center gap-2 active:scale-95">
            <Plus size={20} /> <span className="hidden sm:inline font-bold">New Project</span>
          </button>
        )}
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {loading ? (
          <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-[#002B3D]" /></div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
             <Folder size={48} className="opacity-20 mb-2"/>
             <p>No projects visible to you.</p>
          </div>
        ) : (
          projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => navigate('/events', { state: { project: p } })}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative group cursor-pointer hover:shadow-md hover:border-[#002B3D]/30 transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-sky-50 text-[#002B3D] rounded-xl">
                      <Folder size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 leading-tight">{p.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-medium">
                         <Calendar size={12}/> 
                         <span>{new Date(p.created_at).toLocaleDateString()}</span>
                         {isAdmin && (
                           <>
                             {p.allowed_gender !== 'Both' && <span className="bg-pink-50 text-pink-600 px-1.5 rounded border border-pink-100">{p.allowed_gender} Only</span>}
                             {p.allowed_kshetras?.length > 0 && <span className="bg-indigo-50 text-indigo-600 px-1.5 rounded border border-indigo-100">{p.allowed_kshetras.length} Regions</span>}
                           </>
                         )}
                      </div>
                    </div>
                </div>
                
                {canManage && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => openEditModal(e, p)} className="p-2 text-slate-400 hover:text-[#002B3D] bg-slate-50 rounded-lg"><Edit2 size={18} /></button>
                    <button onClick={(e) => handleDelete(e, p.id)} className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded-lg"><Trash2 size={18} /></button>
                  </div>
                )}
              </div>

              <p className="text-slate-500 text-sm mb-4 line-clamp-2">{p.description || "No description provided."}</p>

              <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                 <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                    <Users size={16} /> {p.project_registrations?.[0]?.count || 0} Members
                 </div>
                 
                 {/* ✅ List View Toggle */}
                 <div onClick={(e) => toggleStatus(e, p)} className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-all ${p.is_reg_open ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {p.is_reg_open ? <><Unlock size={12}/> Open</> : <><Lock size={12}/> Closed</>}
                 </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* --- MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-white shrink-0">
              <h3 className="font-bold text-lg text-[#002B3D]">{isEditing ? 'Edit Project' : 'New Project'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
               {/* 1. Basic Info */}
               <div className="space-y-4">
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-400 uppercase">Project Name</label>
                   <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Winter Sabha 2024"/>
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-400 uppercase">Description</label>
                   <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[80px]" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Event details..."/>
                 </div>
               </div>

               {/* 2. Visibility Scoping */}
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2 text-[#002B3D] font-bold text-sm border-b border-slate-200 pb-2">
                    <Lock size={14}/> Visibility Scoping
                  </div>
                  
                  {/* Gender Scope */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Allowed Gender</label>
                    <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                      {['Both', 'Yuvak', 'Yuvati'].map(g => (
                        <button key={g} onClick={() => setFormData({...formData, selectedGenders: g})} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${formData.selectedGenders === g ? 'bg-[#002B3D] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Region Scope */}
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Region Restriction (Optional)</label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {kshetras.map(k => (
                        <button key={k.id} onClick={() => toggleKshetra(k.id)} className={`px-2 py-1 rounded text-[10px] font-bold border ${formData.selectedKshetras.has(k.id) ? 'bg-[#002B3D] text-white border-[#002B3D]' : 'bg-white text-slate-500 border-slate-300'}`}>
                          {k.name}
                        </button>
                      ))}
                    </div>
                    {formData.selectedKshetras.size === 0 && <p className="text-[10px] text-slate-400 mt-1 italic">Visible to all regions by default.</p>}
                  </div>
               </div>

               {/* 3. Tagging */}
               <div>
                 <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Tag size={12}/> Tags</label>
                 
                 {/* Tag Input */}
                 <div className="flex gap-2 mb-3">
                    <input className="flex-1 p-2 border rounded-lg text-sm" placeholder="New Tag..." value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag}/>
                    <button onClick={handleAddTag} className="p-2 bg-slate-100 rounded-lg text-slate-600"><Plus size={18}/></button>
                 </div>

                 <div className="flex flex-wrap gap-2">
                   {availableTags.map(tag => (
                     <button key={tag.id} onClick={() => toggleTag(tag.id)} className={`px-3 py-1 rounded-full text-xs font-bold border ${formData.selectedTags.has(tag.id) ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                       {tag.name}
                     </button>
                   ))}
                 </div>
               </div>

               {/* 4. ✅ REGISTRATION TOGGLE (Restored) */}
               <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:border-[#002B3D] transition-colors" onClick={() => setFormData({...formData, is_reg_open: !formData.is_reg_open})}>
                  <div className={`p-2 rounded-lg ${formData.is_reg_open ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {formData.is_reg_open ? <Unlock size={20}/> : <Lock size={20}/>}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-slate-700">Registration Status</div>
                    <div className="text-xs text-slate-400">{formData.is_reg_open ? 'Open for new members' : 'Closed for registration'}</div>
                  </div>
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.is_reg_open ? 'bg-green-500' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.is_reg_open ? 'left-5' : 'left-1'}`}></div>
                  </div>
               </div>

            </div>

            <div className="p-5 border-t bg-slate-50 shrink-0 flex gap-3">
               <button onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">Cancel</button>
               <button onClick={handleSave} disabled={submitting} className="flex-1 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#0b3d52] flex justify-center items-center gap-2">
                 {submitting ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Save Project</>}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}