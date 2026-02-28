import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, Calendar, Star, Tag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

const INITIAL_FORM = {
  name: '',
  date: '',
  is_primary: false
};

export default function EventForm({ isOpen, onClose, onSuccess, projectId, initialData = null }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      if (initialData) {
        setFormData({
          name: initialData.name,
          date: initialData.date,
          is_primary: initialData.is_primary
        });
        fetchEventTags(initialData.id);
      } else {
        setFormData(INITIAL_FORM);
        setSelectedTags([]);
      }
    }
  }, [isOpen, initialData]);

  // NEW: Fetch Tags containing 'Event' in their category array
  const fetchTags = async () => {
    const { data } = await supabase
      .from('tags')
      .select('id, name')
      .contains('category', ['Event'])
      .order('name');
    if (data) setAvailableTags(data);
  };

  // NEW: Fetch previously assigned tags for this event
  const fetchEventTags = async (eventId) => {
    const { data } = await supabase.from('event_tags').select('tag_id').eq('event_id', eventId);
    if (data) setSelectedTags(data.map(t => t.tag_id));
  };

  const toggleTag = (tagId) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

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

      let currentEventId = initialData?.id;

      if (currentEventId) {
        const { error } = await supabase.from('events').update(payload).eq('id', currentEventId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('events').insert(payload).select().single();
        if (error) throw error;
        currentEventId = data.id;
      }

      // NEW: Save Tags
      if (currentEventId) {
        await supabase.from('event_tags').delete().eq('event_id', currentEventId);
        if (selectedTags.length > 0) {
          const tagInserts = selectedTags.map(tagId => ({ event_id: currentEventId, tag_id: tagId }));
          await supabase.from('event_tags').insert(tagInserts);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-center p-6 border-b shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Event' : 'Add Event'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
        </div>

        <div className="overflow-y-auto p-6">
          <form id="event-form" onSubmit={handleSubmit} className="space-y-6">
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

            {/* NEW: Event Tags Section */}
            <div>
              <label className="label-std flex items-center gap-2"><Tag size={14}/> Event Tags</label>
              <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50 rounded-xl border border-slate-200">
                {availableTags.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No event tags available.</span>
                ) : (
                  availableTags.map((tag) => (
                    <button 
                      key={tag.id} 
                      type="button" 
                      onClick={() => toggleTag(tag.id)} 
                      className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold border transition-all active:scale-95 ${
                         selectedTags.includes(tag.id) ? "bg-slate-800 text-white border-slate-800 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {selectedTags.includes(tag.id) && <span className="mr-1 opacity-80">✓</span>}
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </div>

          </form>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t shrink-0">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" form="event-form" disabled={loading}>
             {loading ? <Loader2 className="animate-spin"/> : 'Save Event'}
          </Button>
        </div>
      </div>
      <style>{`.label-std { @apply block text-xs font-semibold text-slate-500 mb-1.5; } .input-std { @apply w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm transition-all; }`}</style>
    </div>
  );
}