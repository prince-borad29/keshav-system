import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Folder, Plus, Trash2, Calendar, Users, Lock, Unlock, Edit2, X, Save, Tag 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function Projects() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const canManage = profile?.role === 'admin';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Tag State
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState(new Set());

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({ 
    id: null, 
    name: '', 
    description: '', 
    is_reg_open: true 
  });

  useEffect(() => {
    fetchProjects();
    fetchTags(); // ✅ Fetch tags on load
  }, []);

  const fetchTags = async () => {
    const { data } = await supabase.from('tags').select('*').order('name');
    if (data) setAvailableTags(data);
  };

  const fetchProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*, project_registrations(count)')
      .order('created_at', { ascending: false }); 
    
    if (data) setProjects(data);
    setLoading(false);
  };

  // --- ACTIONS ---

  const openCreateModal = () => {
    if (!canManage) return;
    setFormData({ id: null, name: '', description: '', is_reg_open: true });
    setSelectedTags(new Set()); // Reset tags
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = async (e, project) => {
    e.stopPropagation(); 
    if (!canManage) return;
    
    setFormData({ 
      id: project.id, 
      name: project.name, 
      description: project.description, 
      is_reg_open: project.is_reg_open 
    });

    // ✅ Fetch existing tags for this project
    const { data: projectTags } = await supabase
      .from('entity_tags')
      .select('tag_id')
      .eq('entity_id', project.id)
      .eq('entity_type', 'Project');

    const tagSet = new Set(projectTags?.map(t => t.tag_id) || []);
    setSelectedTags(tagSet);

    setIsEditing(true);
    setShowModal(true);
  };

  const toggleTag = (tagId) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tagId)) {
      newTags.delete(tagId);
    } else {
      newTags.add(tagId);
    }
    setSelectedTags(newTags);
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!formData.name) return alert("Project Name is required");

    let projectId = formData.id;
    let error;

    // 1. Save Project Details
    if (isEditing) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ 
          name: formData.name, 
          description: formData.description,
          is_reg_open: formData.is_reg_open
        })
        .eq('id', projectId);
      error = updateError;
    } else {
      const { data: newProject, error: insertError } = await supabase
        .from('projects')
        .insert([{ 
          name: formData.name, 
          description: formData.description,
          is_reg_open: formData.is_reg_open
        }])
        .select()
        .single();
      
      if (newProject) projectId = newProject.id;
      error = insertError;
    }

    if (error) {
      return alert("Error saving project: " + error.message);
    }

    // 2. ✅ Save Tags (Delete old -> Insert new)
    if (projectId) {
      // Clear existing tags
      await supabase
        .from('entity_tags')
        .delete()
        .eq('entity_id', projectId)
        .eq('entity_type', 'Project');

      // Insert selected tags
      if (selectedTags.size > 0) {
        const tagInserts = Array.from(selectedTags).map(tagId => ({
          entity_id: projectId,
          entity_type: 'Project',
          tag_id: tagId
        }));
        await supabase.from('entity_tags').insert(tagInserts);
      }
    }

    setShowModal(false);
    fetchProjects();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!canManage) return;
    if (!window.confirm("WARNING: This will delete the project and ALL associated attendance data. Are you sure?")) return;
    
    await supabase.from('projects').delete().eq('id', id);
    fetchProjects();
  };

  const toggleStatus = async (e, project) => {
    e.stopPropagation();
    if (!canManage) return; 
    await supabase.from('projects').update({ is_reg_open: !project.is_reg_open }).eq('id', project.id);
    fetchProjects();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* HEADER */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
        </div>
        {canManage && (
          <button 
            onClick={openCreateModal} 
            className="bg-[#002B3D] text-white p-3 rounded-xl shadow-lg hover:bg-[#0b3d52] transition-all flex items-center gap-2"
          >
            <Plus size={20} /> <span className="hidden sm:inline font-bold">New Project</span>
          </button>
        )}
      </div>

      {/* MODAL (Create / Edit) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 p-4 border-b flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800">{isEditing ? 'Edit Project' : 'Create New Project'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto">
               <div>
                 <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Project Name</label>
                 <input 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-sky-500 font-bold text-slate-700" 
                   placeholder="e.g. Summer Camp 2026"
                   value={formData.name}
                   onChange={e => setFormData({...formData, name: e.target.value})}
                   autoFocus
                 />
               </div>
               
               <div>
                 <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Description</label>
                 <textarea 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-sky-500 min-h-[100px]" 
                   placeholder="Brief details about this event..."
                   value={formData.description}
                   onChange={e => setFormData({...formData, description: e.target.value})}
                 />
               </div>

               {/* ✅ TAGS SELECTION SECTION */}
               <div>
                 <label className="text-xs font-bold text-slate-400 uppercase block mb-2 flex items-center gap-2">
                   <Tag size={12} /> Assign Tags
                 </label>
                 <div className="flex flex-wrap gap-2">
                   {availableTags.length === 0 ? (
                     <p className="text-xs text-slate-400 italic">No tags available.</p>
                   ) : (
                     availableTags.map(tag => {
                       const isActive = selectedTags.has(tag.id);
                       return (
                         <button
                           key={tag.id}
                           onClick={() => toggleTag(tag.id)}
                           className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                             isActive 
                               ? 'bg-[#002B3D] text-white border-[#002B3D] shadow-md' 
                               : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                           }`}
                         >
                           {tag.name}
                         </button>
                       );
                     })
                   )}
                 </div>
               </div>

               <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer" onClick={() => setFormData({...formData, is_reg_open: !formData.is_reg_open})}>
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

            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
               <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
               <button onClick={handleSave} className="px-6 py-2 bg-[#002B3D] text-white font-bold rounded-lg hover:bg-[#0b3d52] flex items-center gap-2">
                 <Save size={18}/> {isEditing ? 'Update Project' : 'Create Project'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading Projects...</div> : projects.map(p => (
          <div 
            key={p.id} 
            onClick={() => navigate('/events', { state: { project: p } })}
            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative group cursor-pointer hover:shadow-md hover:border-sky-100 transition-all"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                  <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                    <Folder size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 leading-tight">{p.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                       <Calendar size={12}/> 
                       <span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : 'No Date'}</span>
                    </div>
                  </div>
              </div>
              
              {/* EDIT/DELETE BUTTONS */}
              {canManage && (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => openEditModal(e, p)}
                    className="p-2 text-slate-300 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                    title="Edit Project"
                  >
                    <Edit2 size={18} />
                  </button>
                  
                  <button 
                    onClick={(e) => handleDelete(e, p.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>

            <p className="text-slate-500 text-sm mb-4 line-clamp-2 pl-1">
              {p.description || "No description provided."}
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
               <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                  <Users size={16} /> {p.project_registrations?.[0]?.count || 0} Members
               </div>
               
               <div 
                 className={`flex items-center gap-2 ${canManage ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`} 
                 onClick={(e) => toggleStatus(e, p)}
               >
                  {p.is_reg_open ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">
                      <Unlock size={12}/> Open
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                      <Lock size={12}/> Closed
                    </span>
                  )}
               </div>
            </div>
          </div>
        ))}
        
        {projects.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <div className="bg-slate-100 p-4 rounded-full mb-3">
                <Folder size={32} className="opacity-40"/>
              </div>
              <p className="font-medium">No projects found.</p>
              {canManage && <p className="text-xs">Click "New Project" to start.</p>}
          </div>
        )}
      </div>
    </div>
  );
}