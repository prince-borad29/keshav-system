import React, { useState, useEffect } from "react";
import { X, Save, Loader2, AlertTriangle, Tag, Layout, Settings2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import Button from "../../components/ui/Button";

const INITIAL_FORM = {
  name: '',
  description: '',
  type: 'Standard',
  allowed_gender: 'Both',
  is_active: true,
  registration_open: true 
};

const labelClasses = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";
const inputClasses = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none text-sm text-slate-800 transition-all placeholder:text-slate-400";

export default function ProjectForm({ isOpen, onClose, onSuccess, initialData = null }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      if (initialData) {
        setFormData({
          name: initialData.name,
          description: initialData.description || "",
          type: initialData.type || "Standard",
          allowed_gender: initialData.allowed_gender || "Both",
          is_active: initialData.is_active ?? true,
          registration_open: initialData.registration_open ?? true
        });
        fetchProjectTags(initialData.id);
      } else {
        setFormData(INITIAL_FORM);
        setSelectedTags([]);
      }
    }
  }, [isOpen, initialData]);

  const fetchTags = async () => {
    const { data } = await supabase
       .from("tags")
       .select("id, name")
       .contains("category", ["Project"]) // Check if the array contains 'Project'
       .order("name");
       
    if (data) setAvailableTags(data);
  };

  const fetchProjectTags = async (projectId) => {
    const { data } = await supabase.from("project_tags").select("tag_id").eq("project_id", projectId);
    if (data) setSelectedTags(data.map((t) => t.tag_id));
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!formData.name) throw new Error("Project Name is required.");

      const payload = { ...formData };
      let projectId = initialData?.id;

      if (projectId) {
        const { error: updateError } = await supabase.from("projects").update(payload).eq("id", projectId);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { data, error: insertError } = await supabase.from("projects").insert(payload).select().single();
        if (insertError) throw new Error(insertError.message);
        projectId = data.id;
      }

      // Handle Tags
      if (projectId) {
        await supabase.from("project_tags").delete().eq("project_id", projectId);
        if (selectedTags.length > 0) {
          const tagInserts = selectedTags.map((tagId) => ({ project_id: projectId, tag_id: tagId }));
          await supabase.from("project_tags").insert(tagInserts);
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Submit Error:", err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl h-[95vh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-white shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{initialData ? "Edit Project" : "New Project"}</h2>
            <p className="text-xs text-slate-500 mt-1">Configure event and tracking details.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 sm:px-8 py-6 flex-1 scroll-smooth">
          <form id="project-form" onSubmit={handleSubmit} className="space-y-8 max-w-none">
            
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 text-sm border border-red-100 animate-in fade-in">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" /> 
                <span>{error}</span>
              </div>
            )}

            <section>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-5 flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Layout size={14}/></div>
                Core Details
              </h3>
              
              <div className="space-y-5">
                <div>
                  <label className={labelClasses}>Project Name <span className="text-red-500">*</span></label>
                  <input required className={inputClasses} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Annual Shibir 2026" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClasses}>Visibility / Type</label>
                    <select className={inputClasses} value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                      <option value="Standard">Standard (Public/Regional)</option>
                      <option value="Restricted">Restricted (Invite Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClasses}>Gender Scope</label>
                    <select className={inputClasses} value={formData.allowed_gender} onChange={(e) => setFormData({ ...formData, allowed_gender: e.target.value })}>
                      <option value="Both">Both</option>
                      <option value="Yuvak">Yuvak Only</option>
                      <option value="Yuvati">Yuvati Only</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClasses}>Description</label>
                  <textarea className={inputClasses} rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief details about this project..." />
                </div>
              </div>
            </section>

            <div className="h-px bg-slate-100 w-full" />

            <section>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><Tag size={14}/></div>
                Project Tags
              </h3>
              <div className="flex flex-wrap gap-2.5 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                {availableTags.length === 0 ? (
                  <span className="text-sm text-slate-500 italic w-full text-center py-2">No tags available. Admins can add them in Settings.</span>
                ) : (
                  availableTags.map((tag) => (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className={`px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 ${selectedTags.includes(tag.id) ? "bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-300" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50"}`}>
                      {selectedTags.includes(tag.id) && <span className="mr-1.5 opacity-80">✓</span>}
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </section>

            <div className="h-px bg-slate-100 w-full" />

            <section>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><Settings2 size={14}/></div>
                Status & Access
              </h3>
              
              <div className="flex flex-col gap-3">
                <label className="flex items-start sm:items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition-colors bg-white">
                  <div className="pt-0.5 sm:pt-0">
                    <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">Project is Active</span>
                    <span className="text-xs text-slate-500 block mt-0.5">Controls if this project is visible on the main dashboard for staff.</span>
                  </div>
                </label>

                <label className="flex items-start sm:items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50/30 cursor-pointer transition-colors bg-white">
                  <div className="pt-0.5 sm:pt-0">
                    <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer" checked={formData.registration_open ?? true} onChange={(e) => setFormData({ ...formData, registration_open: e.target.checked })} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">Registration Open</span>
                    <span className="text-xs text-slate-500 block mt-0.5">Allow authorized staff to add or remove members from this project.</span>
                  </div>
                </label>
              </div>
            </section>
          </form>
        </div>

        <div className="p-4 sm:px-6 sm:py-5 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <Button variant="secondary" onClick={onClose} type="button" className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" form="project-form" disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="animate-spin" /> : <><Save size={18} className="mr-2" /> Save Project</>}
          </Button>
        </div>
      </div>
    </div>
  );
}