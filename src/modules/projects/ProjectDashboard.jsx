import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; // 🛡️ Added useNavigate
import { Plus, Search, Folder, ArrowRight, Loader2, Edit3, Trash2, Calendar, Lock, X, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, withTimeout } from "../../lib/supabase"; // 🛡️ Added withTimeout
import toast from "react-hot-toast"; // 🛡️ Added toast
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";
import ProjectForm from "./ProjectForm";
import { useAuth } from "../../contexts/AuthContext";

export default function ProjectDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate(); // 🛡️ Replaces setViewProject
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'admin';
  const isProjectAdmin = profile?.role === 'project_admin';

  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null); // 🛡️ Replaces confirm()

  // 1. Fetch Projects
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', profile?.id],
    queryFn: async () => {
      let query = supabase.from("projects").select(`*, project_tags(tag_id, tags(name, color))`).order("created_at", { ascending: false });

      if (!isAdmin) {
        query = query.eq('is_active', true);
        const { data: assignments } = await withTimeout(supabase.from('project_assignments').select('project_id').eq('user_id', profile.id));
        const assignedIds = assignments?.map(a => a.project_id) || [];

        if (isProjectAdmin) {
          if (assignedIds.length === 0) return [];
          query = query.in('id', assignedIds);
        } else {
          if (assignedIds.length > 0) {
            query = query.or(`type.eq.Standard,id.in.(${assignedIds.join(',')})`);
          } else {
            query = query.eq('type', 'Standard');
          }
        }
      }

      // 🛡️ Wrapped in withTimeout
      const { data, error } = await withTimeout(query);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await withTimeout(supabase.from("projects").delete().eq("id", id));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects']);
      toast.success("Project deleted successfully");
      setProjectToDelete(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setProjectToDelete(null);
    }
  });

  const filteredProjects = projects?.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Projects & Shibirs</h1>
          <p className="text-xs text-gray-500 mt-1">Manage initiatives, shibirs, and meetings.</p>
        </div>
        {isAdmin && <Button icon={Plus} onClick={() => { setSelectedProject(null); setIsFormOpen(true); }}>New Project</Button>}
      </div>

      {/* Filter Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
        {/* 🛡️ 'X' Clear Button Added Here */}
        <input 
          className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-[#5C3030] transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02)]" 
          placeholder="Search projects..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-400" size={24} strokeWidth={1.5} /></div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <Folder className="mx-auto h-10 w-10 text-gray-300 mb-3" strokeWidth={1} />
          <h3 className="text-sm font-semibold text-gray-900">No projects found</h3>
          <p className="text-xs text-gray-500 mt-1">{isAdmin ? "Get started by creating a new project." : "No projects are currently available to you."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => (
            // 🛡️ Changed onClick to use navigate() so URL updates
            <div key={p.id} className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] p-4 flex flex-col h-full hover:border-[#5C3030]/30 transition-colors group cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex gap-2">
                  <Badge variant={p.is_active ? "success" : "default"}>{p.is_active ? "Active" : "Archived"}</Badge>
                  {p.type === 'Restricted' && <Badge variant="danger"><Lock size={10} className="inline mr-1"/> Restricted</Badge>}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedProject(p); setIsFormOpen(true); }} className="p-1 text-gray-400 hover:text-[#5C3030] hover:bg-gray-50 rounded"><Edit3 size={14} strokeWidth={1.5} /></button>
                    {/* 🛡️ Replaced confirm() with Modal state */}
                    <button onClick={(e) => { e.stopPropagation(); setProjectToDelete(p); }} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} strokeWidth={1.5} /></button>
                  </div>
                )}
              </div>

              <h3 className="text-base font-semibold text-gray-900 mb-1">{p.name}</h3>
              <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-1">{p.description || "No description provided."}</p>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
                <span className="text-[10px] font-inter font-semibold text-gray-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Calendar size={12} strokeWidth={1.5} /> {new Date(p.created_at).toLocaleDateString()}
                </span>
                <span className="text-xs font-semibold text-[#5C3030] flex items-center gap-1 group-hover:gap-1.5 transition-all">
                  Open <ArrowRight size={14} strokeWidth={1.5} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <ProjectForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={() => queryClient.invalidateQueries(['projects'])} initialData={selectedProject} />

      {/* 🛡️ Delete Confirmation Modal */}
      <Modal isOpen={!!projectToDelete} onClose={() => setProjectToDelete(null)} title="Confirm Deletion">
        <div className="space-y-4">
          <div className="bg-red-50 text-red-800 p-4 rounded-md border border-red-100 flex gap-3">
            <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
            <p className="text-sm">Are you sure you want to permanently delete <span className="font-bold">{projectToDelete?.name}</span>? All associated events, staff, and attendance data will be lost.</p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setProjectToDelete(null)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button className="!bg-red-600 !border-red-600 hover:!bg-red-700" onClick={() => deleteMutation.mutate(projectToDelete.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : "Yes, Delete Project"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}