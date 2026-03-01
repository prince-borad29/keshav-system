import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit3, Loader2, Tag as TagIcon } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';

// Color Options for UI
const COLORS = [
  { name: 'Blue', value: 'blue', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  { name: 'Red', value: 'red', class: 'bg-red-50 text-red-700 border-red-200' },
  { name: 'Green', value: 'green', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { name: 'Amber', value: 'amber', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-50 text-purple-700 border-purple-200' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-50 text-pink-700 border-pink-200' },
  { name: 'Gray', value: 'slate', class: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const CATEGORIES = ['Member', 'Event', 'Project'];

const INITIAL_FORM = { name: '', category: ['Member'], color: 'blue' };

export default function TagManager() {
  const queryClient = useQueryClient();
  
  // Filter State
  const [activeCategory, setActiveCategory] = useState('All');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);

  // 1. Fetch Tags
  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        const { error } = await supabase.from('tags').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tags').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      resetForm();
    },
    onError: (err) => alert("Error: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }),
    onError: (err) => alert("Error deleting tag: " + err.message)
  });

  // Handlers
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert("Tag name is required");
    if (formData.category.length === 0) return alert("Please select at least one category");
    saveMutation.mutate(formData);
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    const normalizedCategories = Array.isArray(tag.category) ? tag.category : [tag.category].filter(Boolean);
    setFormData({ 
      name: tag.name, 
      category: normalizedCategories.length > 0 ? normalizedCategories : ['Member'], 
      color: tag.color || 'blue' 
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setIsFormOpen(false);
  };

  const handleCategoryToggle = (cat) => {
    setFormData(prev => {
      const isSelected = prev.category.includes(cat);
      if (isSelected) {
        return { ...prev, category: prev.category.filter(c => c !== cat) };
      } else {
        return { ...prev, category: [...prev.category, cat] };
      }
    });
  };

  // Filter Logic
  const filteredTags = activeCategory === 'All' 
    ? tags 
    : tags?.filter(t => {
        const cats = Array.isArray(t.category) ? t.category : [t.category];
        return cats.includes(activeCategory);
      });

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <div className="space-y-4">
      
      {/* 1. CONTROLS BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        
        {/* Category Tabs (Flat Design) */}
        <div className="flex bg-gray-100 p-1 rounded-md border border-gray-200 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeCategory === cat ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Add Button */}
        <Button size="sm" icon={Plus} onClick={() => { resetForm(); setIsFormOpen(true); }}>
          Create Tag
        </Button>
      </div>

      {/* 2. TAG GRID */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={20}/> Loading tags...</div>
      ) : filteredTags?.length === 0 ? (
        <div className="bg-white border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-md p-12 text-center text-gray-500">
          <TagIcon className="mx-auto h-10 w-10 text-gray-300 mb-2" strokeWidth={1}/>
          <p className="text-sm font-medium">No tags found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTags?.map(tag => {
            const colorTheme = COLORS.find(c => c.value === tag.color) || COLORS[0];
            const tagCats = Array.isArray(tag.category) ? tag.category : [tag.category].filter(Boolean);

            return (
              <div key={tag.id} className="bg-white p-3 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between group hover:border-gray-300 transition-colors">
                
                <div className="flex justify-between items-start mb-2">
                  <div className={`px-2 py-1 rounded-md text-xs font-bold border ${colorTheme.class} truncate`}>
                    {tag.name}
                  </div>
                  <div className="flex gap-1 transition-opacity shrink-0">
                    <button onClick={() => startEdit(tag)} className="p-1 text-gray-400 hover:text-[#5C3030] rounded-md transition-colors"><Edit3 size={14}/></button>
                    <button onClick={() => { if(confirm("Delete tag?")) deleteMutation.mutate(tag.id); }} className="p-1 text-gray-400 hover:text-red-600 rounded-md transition-colors">
                      {deleteMutation.isPending && deleteMutation.variables === tag.id ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-1 flex-wrap">
                  {tagCats.map(c => (
                     <span key={c} className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded uppercase font-semibold tracking-widest">
                       {c}
                     </span>
                  ))}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* 3. FORM MODAL */}
      <Modal isOpen={isFormOpen} onClose={resetForm} title={editingId ? 'Edit Tag' : 'Create New Tag'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className={labelClass}>Tag Name</label>
            <input 
              autoFocus
              required
              className={inputClass}
              placeholder="e.g. Core Committee"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div>
            <label className={labelClass}>Applicable Categories</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => {
                const isSelected = formData.category.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryToggle(cat)}
                    className={`py-2 text-xs font-semibold rounded-md border transition-all ${
                      isSelected
                        ? 'bg-[#5C3030]/10 text-[#5C3030] border-[#5C3030]/20' 
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>Visual Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFormData({...formData, color: c.value})}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform ${
                    formData.color === c.value ? 'border-[#5C3030] scale-110' : 'border-transparent'
                  } ${c.class.split(' ')[0]}`}
                >
                  {formData.color === c.value && <div className={`w-2 h-2 rounded-full ${c.class.split(' ')[1].replace('text-', 'bg-')}`} />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForm} type="button">Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="animate-spin" size={16}/> : (editingId ? 'Update Tag' : 'Create Tag')}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}