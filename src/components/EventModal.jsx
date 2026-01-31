import React, { useState, useEffect } from 'react';
import { X, Calendar, Save, Tag, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function EventModal({ isOpen, onClose, eventToEdit, projectId, onSave }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Tag State
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
      if (eventToEdit) {
        setName(eventToEdit.name);
        setStartDate(eventToEdit.start_date ? eventToEdit.start_date.slice(0, 16) : '');
        setEndDate(eventToEdit.end_date ? eventToEdit.end_date.slice(0, 16) : '');
        // Extract existing tag IDs from the event object
        const existingIds = eventToEdit.entity_tags?.map(et => et.tag_id) || [];
        setSelectedTagIds(existingIds);
      } else {
        setName('');
        setStartDate('');
        setEndDate('');
        setSelectedTagIds([]);
      }
    }
  }, [isOpen, eventToEdit]);

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
    if (!projectId) return alert("Project ID missing");

    const payload = { 
      name, 
      start_date: startDate || null, 
      end_date: endDate || null,
      project_id: projectId 
    };

    let eventId = eventToEdit?.id;

    // 1. Save Event Details
    if (eventToEdit) {
      const { error } = await supabase.from('events').update(payload).eq('id', eventId);
      if (error) return alert(error.message);
    } else {
      const { data, error } = await supabase.from('events').insert([payload]).select().single();
      if (error) return alert(error.message);
      eventId = data.id;
    }

    // 2. Save Tags (Delete old -> Insert new)
    if (eventId) {
      await supabase.from('entity_tags').delete().eq('entity_id', eventId).eq('entity_type', 'Event');
      
      if (selectedTagIds.length > 0) {
        const tagInserts = selectedTagIds.map(tagId => ({
          entity_id: eventId,
          entity_type: 'Event',
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
          <h2 className="font-bold flex items-center gap-2"><Calendar size={20}/> {eventToEdit ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose}><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Event Name</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-xl mt-1 outline-none focus:border-[#002B3D]" placeholder="e.g. Sabha" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Start Time</label>
              <input required type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-3 border rounded-xl mt-1 outline-none focus:border-[#002B3D]" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">End Time</label>
              <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-3 border rounded-xl mt-1 outline-none focus:border-[#002B3D]" />
            </div>
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
            <Save size={18} /> Save Event
          </button>
        </form>
      </div>
    </div>
  );
}