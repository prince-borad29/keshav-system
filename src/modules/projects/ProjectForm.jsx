import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import Button from "../../components/ui/Button";
import Modal from "../../components/Modal";
import { AlertTriangle, Loader2, Tag } from "lucide-react";

const INITIAL_FORM = { name: '', description: '', type: 'Standard', allowed_gender: 'Both', is_active: true, registration_open: true };

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

  // Fetch all tags that have 'Project' in their category array
  const fetchTags = async () => {
    const { data } = await supabase
       .from("tags")
       .select("id, name")
       .contains("category", ["Project"]) 
       .order("name");
       
    if (data) setAvailableTags(data);
  };

  // Fetch currently assigned tags for this specific project
  const fetchProjectTags = async (projectId) => {
    const { data } = await supabase.from("project_tags").select("tag_id").eq("project_id", projectId);
    if (data) setSelectedTags(data.map((t) => t.tag_id));
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

      // Handle Tag Syncing
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
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Project" : "New Project"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start gap-2 text-xs font-semibold border border-red-100">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Project Name *</label>
          <input required className={inputClass} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Annual Shibir 2026" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
              <option value="Standard">Standard</option>
              <option value="Restricted">Restricted</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Gender Scope</label>
            <select className={inputClass} value={formData.allowed_gender} onChange={(e) => setFormData({ ...formData, allowed_gender: e.target.value })}>
              <option value="Both">Both</option>
              <option value="Yuvak">Yuvak Only</option>
              <option value="Yuvati">Yuvati Only</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea className={inputClass} rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Brief details..." />
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* RESTORED: Project Tags UI */}
        <div>
          <label className={labelClass}>Project Tags</label>
          <div className="flex flex-wrap gap-2">
            {availableTags.length === 0 ? (
              <span className="text-xs text-gray-400 italic">No tags available. Admins can create them in Settings.</span>
            ) : (
              availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.id);
                return (
                  <button 
                    key={tag.id} 
                    type="button" 
                    onClick={() => setSelectedTags((prev) => isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])} 
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-colors ${
                      isSelected 
                        ? "bg-gray-800 text-white border-gray-800" 
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
            <span className="text-sm font-semibold text-gray-900">Project is Active (Visible on Dashboard)</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" checked={formData.registration_open} onChange={(e) => setFormData({ ...formData, registration_open: e.target.checked })} />
            <span className="text-sm font-semibold text-gray-900">Registration is Open</span>
          </label>
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16}/> : 'Save Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}