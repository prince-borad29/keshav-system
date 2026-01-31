import React, { useEffect, useState } from 'react';
import { 
  Plus, Search, Folder, MoreVertical, Edit2, Trash2, 
  PlayCircle, StopCircle, X, Calendar 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import ProjectModal from '../../components/ProjectModal';
import ConfirmModal from '../../components/ConfirmModal'; 

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);

    // 1. Fetch Projects
    const { data: projectsData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

    if (projectError) {
      console.error(projectError);
      setLoading(false);
      return;
    }

    // 2. Fetch Tags for Projects
    const { data: tagsData } = await supabase
      .from('entity_tags')
      .select('entity_id, tag_id, tags ( name, color )')
      .eq('entity_type', 'Project');

    // 3. Merge Tags into Projects
    const combinedData = projectsData.map(project => {
      const myTags = tagsData ? tagsData.filter(t => t.entity_id === project.id) : [];
      return { ...project, entity_tags: myTags };
    });

    setProjects(combinedData);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, []);

  const toggleRegistration = async (project) => {
    const newStatus = project.reg_visibility === 'open' ? 'closed' : 'open';
    await supabase.from('projects').update({ reg_visibility: newStatus }).eq('id', project.id);
    fetchProjects();
  };

  const handleDelete = (id) => {
    setDeleteId(id);
    setActiveMenuId(null);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await supabase.from('projects').delete().eq('id', deleteId);
      setDeleteId(null);
      fetchProjects();
    }
  };

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => setActiveMenuId(null)}>
      
      {/* HEADER */}
      <div className="bg-white p-4 pb-2 shadow-sm z-10 sticky top-0 pt-safe-top">
        <h1 className="text-2xl font-bold text-[#002B3D] mb-4">Projects</h1>
        <div className="relative mb-2">
           <Search className="absolute left-3 top-3 text-slate-400" size={20} />
           <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" />
           {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400"><X size={18} /></button>}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 pb-safe-bottom">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading...</div> : (
           filteredProjects.map(project => (
             <div 
                key={project.id} 
                onClick={() => navigate('/events', { state: { project } })} 
                // ✅ Z-INDEX FIX: activeMenuId check forces this card to top
                className={`bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative group active:scale-[0.99] transition-all ${activeMenuId === project.id ? 'z-20' : ''}`}
             >
                <div className="flex justify-between items-start">
                   <div className="flex items-start gap-3 w-full">
                      <div className="p-3 bg-sky-50 text-[#002B3D] rounded-xl shrink-0"><Folder size={24} /></div>
                      <div className="min-w-0 flex-1">
                         <h3 className="text-lg font-bold text-slate-800 truncate">{project.name}</h3>
                         
                         <p className="text-sm text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                           {project.description || 'No description provided.'}
                         </p>

                         {/* TAGS DISPLAY AREA */}
                         <div className="flex flex-wrap gap-1 mt-2 mb-2">
                           {project.entity_tags?.map((et, index) => (
                             <span 
                               key={index} 
                               className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white shadow-sm"
                               style={{ backgroundColor: et.tags?.color || '#94a3b8' }}
                             >
                               {et.tags?.name}
                             </span>
                           ))}
                         </div>

                         <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                            {/* Open/Closed Chip REMOVED from here as requested */}
                            {project.created_at && <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(project.created_at).toLocaleDateString()}</span>}
                         </div>
                      </div>
                   </div>
                   <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === project.id ? null : project.id); }} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full shrink-0"><MoreVertical size={20} /></button>
                </div>

                {activeMenuId === project.id && (
                  <div className="absolute right-4 top-14 bg-white shadow-xl border border-slate-100 rounded-xl w-48 py-2 z-30 animate-in zoom-in-95 duration-100 origin-top-right" onClick={(e) => e.stopPropagation()}>
                     <button onClick={() => { setProjectToEdit(project); setIsModalOpen(true); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2"><Edit2 size={16} /> Edit Details</button>
                     <button onClick={() => toggleRegistration(project)} className={`w-full text-left px-4 py-3 text-sm font-medium flex items-center gap-2 ${project.reg_visibility === 'open' ? 'text-orange-600' : 'text-green-600'}`}>{project.reg_visibility === 'open' ? <StopCircle size={16}/> : <PlayCircle size={16}/>} {project.reg_visibility === 'open' ? 'Close Reg' : 'Start Reg'}</button>
                     <div className="h-px bg-slate-100 my-1"></div>
                     <button onClick={() => handleDelete(project.id)} className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 font-medium flex items-center gap-2"><Trash2 size={16} /> Delete</button>
                  </div>
                )}
             </div>
           ))
        )}
        {!loading && filteredProjects.length === 0 && <div className="text-center text-slate-400 mt-10">No projects found.</div>}
      </div>

      <button onClick={() => { setProjectToEdit(null); setIsModalOpen(true); }} className="fixed bottom-6 right-6 w-14 h-14 bg-[#002B3D] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#155e7a] hover:scale-105 transition-all z-20"><Plus size={28} /></button>
      
      <ProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} projectToEdit={projectToEdit} onSave={fetchProjects} />
      
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Project?"
        message="Are you sure? This will permanently delete the project, all events, and attendance records."
        confirmText="Yes, Delete"
        isDanger={true}
      />
    </div>
  );
}