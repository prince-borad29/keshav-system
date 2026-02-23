  import React, { useState, useEffect } from "react";
  import { Plus, Search, Folder, ArrowRight, Loader2, Edit3, Trash2, Tag, Calendar, Lock } from "lucide-react";
  import { supabase } from "../../lib/supabase";
  import Button from "../../components/ui/Button";
  import Badge from "../../components/ui/Badge";
  import ProjectForm from "./ProjectForm";
  import ProjectView from "./ProjectView";
  import { useAuth } from "../../contexts/AuthContext"; 

  export default function ProjectDashboard() {
    const { profile } = useAuth(); 
    const isAdmin = profile?.role === 'admin';
    const isProjectAdmin = profile?.role === 'project_admin'; // The new JIT role

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [viewProject, setViewProject] = useState(null);

    useEffect(() => {
      if (profile?.id) fetchProjects();
    }, [profile]);

  const fetchProjects = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("projects")
          .select(`*, project_tags(tag_id, tags(name, color))`)
          .order("created_at", { ascending: false });

        // SECURITY & VISIBILITY LOGIC
        if (!isAdmin) {
          query = query.eq('is_active', true);
          
          // 1. Fetch explicit assignments for this specific logged-in user
          const { data: assignments, error: assignError } = await supabase
            .from('project_assignments')
            .select('project_id')
            .eq('user_id', profile.id);
            
          if (assignError) throw assignError;
          
          const assignedIds = assignments?.map(a => a.project_id) || [];

          // 2. Filter based on Role
          if (isProjectAdmin) {
            // PROJECT_ADMIN: Can ONLY see projects they are assigned to. 
            // If they have no assignments, show an empty list.
            if (assignedIds.length === 0) {
                setProjects([]); 
                setLoading(false); 
                return;
            }
            query = query.in('id', assignedIds);
          } else {
            // REGIONAL (Sanchalak/Nirdeshak): See 'Standard' projects + any assigned 'Restricted'
            if (assignedIds.length > 0) {
                // This SQL syntax allows (Type is Standard) OR (ID is in assigned list)
                query = query.or(`type.eq.Standard,id.in.(${assignedIds.join(',')})`);
            } else {
                query = query.eq('type', 'Standard');
            }
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        setProjects(data || []);
      } catch (err) {
        console.error("Dashboard Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };

    const handleCreate = () => { setSelectedProject(null); setIsFormOpen(true); };
    const handleEdit = (p) => { setSelectedProject(p); setIsFormOpen(true); };

    const handleDelete = async (id) => {
      if (!confirm("Are you sure? This will delete the project and all associated events.")) return;
      await supabase.from("projects").delete().eq("id", id);
      fetchProjects();
    };

    const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (viewProject) {
      return <ProjectView project={viewProject} onBack={() => setViewProject(null)} />;
    }

    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Projects & Shibirs</h1>
            <p className="text-slate-500 text-sm">Manage initiatives, shibirs, and meetings.</p>
          </div>
          {isAdmin && <Button icon={Plus} onClick={handleCreate}>New Project</Button>}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none text-sm shadow-sm" placeholder="Search projects..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <Folder className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No projects found</h3>
            <p className="text-slate-500">{isAdmin ? "Get started by creating a new project." : "No projects are currently available to you."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg transition-all group flex flex-col h-full cursor-pointer" onClick={() => setViewProject(p)}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-2">
                    <Badge variant={p.is_active ? "success" : "default"}>{p.is_active ? "Active" : "Archived"}</Badge>
                    <Badge variant={p.type === 'Restricted' ? 'danger' : 'secondary'}>
                      {p.type === 'Restricted' && <Lock size={10} className="inline mr-1" />}
                      {p.type}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(p); }} className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg"><Edit3 size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-800 mb-1">{p.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">{p.description || "No description provided."}</p>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={12} /> {new Date(p.created_at).toLocaleDateString()}</span>
                  <span className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group-hover:gap-2 transition-all">
                    View Details <ArrowRight size={16} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <ProjectForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={fetchProjects} initialData={selectedProject} />
      </div>
    );
  }