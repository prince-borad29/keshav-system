import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Calendar, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

const INITIAL_FORM = {
  name: '',
  date: '',
  is_primary: false
};

export default function EventForm({ isOpen, onClose, onSuccess, projectId, initialData = null }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name,
          date: initialData.date,
          is_primary: initialData.is_primary
        });
      } else {
        setFormData(INITIAL_FORM);
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name || !formData.date) throw new Error("Name and Date are required.");

      const payload = {
        project_id: projectId,
        name: formData.name,
        date: formData.date,
        is_primary: formData.is_primary
      };

      if (initialData?.id) {
        const { error } = await supabase.from('events').update(payload).eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('events').insert(payload);
        if (error) throw error;
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Event' : 'Add Event'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm">{error}</div>}

          <div>
            <label className="label-std">Event Name *</label>
            <input required className="input-std" placeholder="e.g. Day 1 Registration" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>

          <div>
            <label className="label-std">Date *</label>
            <input required type="date" className="input-std" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>

          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <input 
              type="checkbox" 
              id="is_primary"
              className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500 border-gray-300"
              checked={formData.is_primary}
              onChange={e => setFormData({...formData, is_primary: e.target.checked})}
            />
            <label htmlFor="is_primary" className="text-sm font-medium text-amber-900 cursor-pointer flex items-center gap-2">
              <Star size={16} className={formData.is_primary ? "fill-amber-500 text-amber-500" : "text-amber-400"} />
              Primary Event (Main Day)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="animate-spin"/> : 'Save Event'}</Button>
          </div>
        </form>
      </div>
      <style>{`.label-std { @apply block text-xs font-semibold text-slate-500 mb-1.5; } .input-std { @apply w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm transition-all; }`}</style>
    </div>
  );
}