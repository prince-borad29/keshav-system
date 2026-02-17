import React, { useState, useEffect } from "react";
import { X, Save, Loader2, AlertTriangle, Tag, Calendar } from "lucide-react";
import { supabase } from "../../lib/supabase";
import Button from "../../components/ui/Button";

const INITIAL_FORM = {
  name: '',
  description: '',
  type: 'Standard',
  allowed_gender: 'Both',
  is_active: true,
  registration_open: false 
};
export default function ProjectForm({
  isOpen,
  onClose,
  onSuccess,
  initialData = null,
}) {
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
          is_active: initialData.is_active,
          registration_open: initialData.registration_open
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
      .eq("category", "Project")
      .order("name");
    if (data) setAvailableTags(data);
  };

  const fetchProjectTags = async (projectId) => {
    const { data } = await supabase
      .from("project_tags")
      .select("tag_id")
      .eq("project_id", projectId);
    if (data) setSelectedTags(data.map((t) => t.tag_id));
  };

  const toggleTag = (tagId) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
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
        const { error } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", projectId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("projects")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        projectId = data.id;
      }

      // Handle Tags
      if (projectId) {
        await supabase
          .from("project_tags")
          .delete()
          .eq("project_id", projectId);
        if (selectedTags.length > 0) {
          const tagInserts = selectedTags.map((tagId) => ({
            project_id: projectId,
            tag_id: tagId,
          }));
          await supabase.from("project_tags").insert(tagInserts);
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl flex items-center gap-2 text-sm">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
          <div>
            <label className="label-std">Project Name *</label>
            <input
              required
              className="input-std"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Annual Shibir 2026"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-std">Type</label>
              <select
                className="input-std"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value })
                }
              >
                <option>Standard</option>
                <option>Shibir</option>
                <option>Gosthi</option>
                <option>Karyakar Meeting</option>
              </select>
            </div>
            <div>
              <label className="label-std">Gender Scope</label>
              <select
                className="input-std"
                value={formData.allowed_gender}
                onChange={(e) =>
                  setFormData({ ...formData, allowed_gender: e.target.value })
                }
              >
                <option>Both</option>
                <option>Yuvak Only</option>
                <option>Yuvati Only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-std">Description</label>
            <textarea
              className="input-std"
              rows="3"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Brief details about this project..."
            />
          </div>
          {/* TAGS */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Tag size={14} /> Project Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedTags.includes(tag.id) ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200"}`}
                >
                  {selectedTags.includes(tag.id) && "✓ "} {tag.name}
                </button>
              ))}
              {availableTags.length === 0 && (
                <span className="text-sm text-slate-400 italic">
                  No project tags available.
                </span>
              )}
            </div>
          </div>

          {/* STATUS TOGGLES */}
          <div className="flex flex-col gap-3 pt-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <label className="label-std mb-0 cursor-pointer flex items-center gap-3">
              <input
                type="checkbox"
                className="rounded text-indigo-600 w-5 h-5 focus:ring-indigo-500"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <div>
                <span className="text-slate-800 font-medium block">
                  Project is Active
                </span>
                <span className="text-xs text-slate-500">
                  Visible in dashboard
                </span>
              </div>
            </label>

            <label className="label-std mb-0 cursor-pointer flex items-center gap-3">
              <input
                type="checkbox"
                className="rounded text-green-600 w-5 h-5 focus:ring-green-500"
                checked={formData.registration_open ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    registration_open: e.target.checked,
                  })
                }
              />
              <div>
                <span className="text-slate-800 font-medium block">
                  Registration Open
                </span>
                <span className="text-xs text-slate-500">
                  Allow staff to add/remove members
                </span>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save size={18} className="mr-2" /> Save Project
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      <style>{`.label-std { @apply block text-xs font-semibold text-slate-500 mb-1.5; } .input-std { @apply w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm transition-all; }`}</style>
    </div>
  );
}
