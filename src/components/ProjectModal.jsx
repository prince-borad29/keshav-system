import React, { useState, useEffect } from 'react';
import { X, Folder, Save, Tag, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ProjectModal({ isOpen, onClose, projectToEdit, onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  
  // Tag State
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      if (projectToEdit) {
        setName(projectToEdit.name);
        setDescription(projectToEdit.description || '');
        // Extract existing tag IDs from the project object
        const existingIds = projectToEdit.entity_tags?.map(et => et.tag_id) || [];
        setSelectedTagIds(existingIds);
      } else {
        setName('');
        setDescription('');
        setSelectedTagIds([]);
      }
    }
  }, [isOpen, projectToEdit]);

  const fetchTags = async () => {
    const { data } = await supabase.from('tags').select('*').order('name');
    setAvailableTags(data || []);
  };

  const toggleTag = (id) => {
    if (selectedTagIds.includes(id)) {
      setSelectedTagIds(selectedTagIds.filter(t => t !== id));
    } else {
      setSelectedTagIds([...selectedTagIds, id]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let projectId = projectToEdit?.id;

    // 1. Save Project Info
    if (projectToEdit) {
      await supabase.from('projects').update({ name, description }).eq('id', projectId);
    } else {
      const { data, error } = await supabase.from('projects').insert([{ name, description }]).select().single();
      if (error) return alert(error.message);
      projectId = data.id;
    }

    // 2. Save Tags (Delete old -> Insert new)
    if (projectId) {
      await supabase.from('entity_tags').delete().eq('entity_id', projectId).eq('entity_type', 'Project');
      
      if (selectedTagIds.length > 0) {
        const tagInserts = selectedTagIds.map(tagId => ({
          entity_id: projectId,
          entity_type: 'Project',
          tag_id: tagId
        }));
        await supabase.from('entity_tags').insert(tagInserts);
      }
    }

    onSave();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="bg-[#002B3D] p-4 text-white flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2"><Folder size={20}/> {projectToEdit ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose}><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Project Name</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-xl mt-1 outline-none focus:border-[#002B3D]" placeholder="e.g. Seva 2024" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 border rounded-xl mt-1 outline-none focus:border-[#002B3D] h-24 resize-none" placeholder="Details about this project..." />
          </div>

          {/* TAG SELECTOR */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-2"><Tag size={12}/> Select Tags</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
              {availableTags.length === 0 && <span className="text-xs text-slate-400 italic">No tags found. Add them in the Tags menu.</span>}
              {availableTags.map(tag => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button 
                    key={tag.id} 
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 transition-all ${
                      isSelected 
                        ? 'bg-[#002B3D] text-white border-[#002B3D]' 
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && <Check size={12}/>}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="w-full py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] flex items-center justify-center gap-2 mt-4">
            <Save size={18} /> Save Project
          </button>
        </form>

      </div>
    </div>
  );
}