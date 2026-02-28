import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Edit3, Loader2, Tag, X } from 'lucide-react';
import Button from '../../components/ui/Button';

// Color Options for UI
const COLORS = [
  { name: 'Blue', value: 'blue', class: 'bg-blue-100 text-blue-700 border-blue-200' },
  { name: 'Red', value: 'red', class: 'bg-red-100 text-red-700 border-red-200' },
  { name: 'Green', value: 'green', class: 'bg-green-100 text-green-700 border-green-200' },
  { name: 'Amber', value: 'amber', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-100 text-purple-700 border-purple-200' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-100 text-pink-700 border-pink-200' },
  { name: 'Slate', value: 'slate', class: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const CATEGORIES = ['Member', 'Event', 'Project'];

export default function TagManager() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [activeCategory, setActiveCategory] = useState('All');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // category is now an ARRAY to support multi-selection
  const [formData, setFormData] = useState({ name: '', category: ['Member'], color: 'blue' });

  useEffect(() => { fetchTags(); }, []);

  const fetchTags = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true });
      
    if (error) console.error(error);
    setTags(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert("Tag name is required");
    if (formData.category.length === 0) return alert("Please select at least one category");

    try {
      if (editingId) {
        // UPDATE
        const { error } = await supabase.from('tags').update({
          name: formData.name,
          category: formData.category, // Passing the array
          color: formData.color
        }).eq('id', editingId);
        if (error) throw error;
      } else {
        // CREATE
        const { error } = await supabase.from('tags').insert([formData]);
        if (error) throw error;
      }
      resetForm();
      fetchTags();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this tag? It will be removed from all assigned items.")) return;
    try {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
      setTags(tags.filter(t => t.id !== id));
    } catch (err) {
      alert("Error deleting tag: " + err.message);
    }
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    
    // Normalize data: If older DB entries are strings, convert them to arrays to prevent UI crashes
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
    setFormData({ name: '', category: ['Member'], color: 'blue' });
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

  // Filter Logic: Check if the active category is inside the tag's category array
  const filteredTags = activeCategory === 'All' 
    ? tags 
    : tags.filter(t => {
        const cats = Array.isArray(t.category) ? t.category : [t.category];
        return cats.includes(activeCategory);
      });

  return (
    <div className="space-y-6">
      
      {/* 1. CONTROLS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        
        {/* Category Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                activeCategory === cat ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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

      {/* 2. FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
              <h3 className="font-bold text-indigo-900">{editingId ? 'Edit Tag' : 'Create New Tag'}</h3>
              <button onClick={resetForm} className="p-1 hover:bg-white rounded-full text-indigo-400"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tag Name</label>
                <input 
                  autoFocus
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 font-medium"
                  placeholder="e.g. Core Committee"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>

              {/* Category (Multi-Select) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categories (Select multiple)</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(cat => {
                    const isSelected = formData.category.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryToggle(cat)}
                        className={`py-2 text-sm font-bold rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color Badge</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData({...formData, color: c.value})}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform active:scale-95 ${
                        formData.color === c.value ? 'border-slate-800 scale-110' : 'border-transparent'
                      } ${c.class.split(' ')[0]}`}
                    >
                      {formData.color === c.value && <div className="w-2 h-2 bg-slate-800 rounded-full"/>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={resetForm} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-transform active:scale-95">
                  {editingId ? 'Update Tag' : 'Create Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. TAG GRID */}
      {loading ? (
        <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Loading tags...</div>
      ) : filteredTags.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">
          <Tag className="mx-auto h-12 w-12 text-slate-300 mb-2"/>
          <p>No tags found.</p>
          <button onClick={() => { resetForm(); setIsFormOpen(true); }} className="text-indigo-600 font-bold hover:underline mt-2">Create your first tag</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTags.map(tag => {
            const colorTheme = COLORS.find(c => c.value === tag.color) || COLORS[0];
            
            // Normalize for display
            const tagCats = Array.isArray(tag.category) ? tag.category : [tag.category].filter(Boolean);

            return (
              <div key={tag.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-300 transition-all">
                <div className="flex flex-col gap-1.5 items-start">
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${colorTheme.class}`}>
                    {tag.name}
                  </div>
                  <div className="flex gap-1">
                    {tagCats.map(c => (
                       <span key={c} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-bold tracking-wider">
                         {c}
                       </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-1 opacity-100 sm:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(tag)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit3 size={16}/></button>
                  <button onClick={() => handleDelete(tag.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}