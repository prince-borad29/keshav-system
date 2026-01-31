import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Theme Colors
const PRESET_COLORS = [
  { name: 'Navy', hex: '#002B3D' },
  { name: 'Blue', hex: '#0EA5E9' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Grey', hex: '#64748B' },
  { name: 'Teal', hex: '#14B8A6' },
];

const SCOPE_OPTIONS = [
  { id: 'Member', label: 'Members' },
  { id: 'Project', label: 'Projects' },
  { id: 'Event', label: 'Events' },
];

export default function TagModal({ isOpen, onClose, tagToEdit, onSave }) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].hex);
  
  // Default to ['Member']
  const [selectedContexts, setSelectedContexts] = useState(['Member']); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tagToEdit) {
      setName(tagToEdit.name);
      setSelectedColor(tagToEdit.color);
      // ✅ READ from 'contexts' column
      setSelectedContexts(tagToEdit.contexts || []);
    } else {
      setName('');
      setSelectedColor(PRESET_COLORS[0].hex);
      setSelectedContexts(['Member']);
    }
  }, [tagToEdit, isOpen]);

  const toggleContext = (id) => {
    setSelectedContexts(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (selectedContexts.length === 0) {
      alert("Please select at least one scope.");
      return;
    }

    setLoading(true);
    try {
      // ✅ WRITE to 'contexts' column
      const payload = { 
        name, 
        color: selectedColor, 
        contexts: selectedContexts 
      };

      if (tagToEdit) {
        const { error } = await supabase.from('tags').update(payload).eq('id', tagToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tags').insert([payload]);
        if (error) throw error;
      }
      onSave();
      onClose();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">{tagToEdit ? 'Edit Tag' : 'New Tag'}</h2>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          
          {/* Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Tag Name</label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Volunteer"
                className="w-full p-3 pr-10 border border-slate-200 rounded-lg outline-none focus:border-[#002B3D] focus:ring-1 focus:ring-[#002B3D]"
                autoFocus
              />
              {name.length > 0 && (
                <button
                  type="button"
                  onClick={() => setName('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} className="opacity-80" />
                </button>
              )}
            </div>
          </div>

          {/* Scope Selection (Multi-Select) */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Used In</label>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((opt) => {
                const isSelected = selectedContexts.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleContext(opt.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                      isSelected 
                        ? 'bg-[#002B3D] text-white border-[#002B3D]' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && <Check size={14} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Selection */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-700 mb-3">Color</label>
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setSelectedColor(color.hex)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${
                    selectedColor === color.hex ? 'scale-110 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.hex }}
                >
                  {selectedColor === color.hex && <Check size={18} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 p-3 font-semibold text-slate-600 bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 p-3 font-semibold text-white bg-[#002B3D] rounded-lg disabled:opacity-70">
              {loading ? 'Saving...' : 'Save Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}