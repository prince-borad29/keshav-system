import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';

const INITIAL_FORM = { name: '', date: '', is_primary: false };

export default function EventForm({ isOpen, onClose, onSuccess, projectId, initialData = null }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData ? { name: initialData.name, date: initialData.date, is_primary: initialData.is_primary } : INITIAL_FORM);
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { project_id: projectId, ...formData };
      if (initialData?.id) {
        await supabase.from('events').update(payload).eq('id', initialData.id);
      } else {
        await supabase.from('events').insert(payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Edit Event' : 'Add Event'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Event Name *</label>
          <input required className={inputClass} placeholder="e.g. Day 1 Registration" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input required type="date" className={inputClass} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
        </div>
        <label className="flex items-center gap-3 pt-2">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" checked={formData.is_primary} onChange={e => setFormData({...formData, is_primary: e.target.checked})} />
          <span className="text-sm font-semibold text-gray-900">Mark as Primary Event (Main Day)</span>
        </label>
        <div className="pt-5 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" disabled={loading}>Save Event</Button>
        </div>
      </form>
    </Modal>
  );
}