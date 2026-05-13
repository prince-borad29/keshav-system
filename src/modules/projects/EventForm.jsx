import React, { useState, useEffect } from 'react';
import { supabase, withTimeout } from '../../lib/supabase';
import { validators, validateForm, sanitizeInput } from '../../lib/validators';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';
import { AlertTriangle, Loader2 } from 'lucide-react';

const INITIAL_FORM = { name: '', date: '', is_primary: false };

export default function EventForm({ isOpen, onClose, onSuccess, projectId, initialData = null }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData ? { name: initialData.name, date: initialData.date, is_primary: initialData.is_primary } : INITIAL_FORM);
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // 🔐 SECURITY: Validate inputs
      const validationSchema = {
        name: (val) => {
          const error = validators.text(val, 2, 100);
          return error || (!val.trim() ? 'Event Name is required' : null);
        },
        date: (val) => {
          if (!val) return 'Date is required';
          const selected = new Date(val);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          // Allow today and future dates for events
          return null;
        },
      };

      const { isValid, errors } = validateForm(formData, validationSchema);
      if (!isValid) {
        throw new Error(Object.values(errors)[0]);
      }

      // 🔐 SECURITY: Sanitize input
      const payload = { 
        project_id: projectId, 
        name: sanitizeInput(formData.name),
        date: formData.date,
        is_primary: formData.is_primary 
      };
      
      // 🛡️ Wrapped in withTimeout
      let query;
      if (initialData?.id) {
        query = supabase.from('events').update(payload).eq('id', initialData.id);
      } else {
        query = supabase.from('events').insert(payload);
      }
      
      const { error: queryError } = await withTimeout(query);
      if (queryError) throw queryError;
      
      toast.success(initialData?.id ? "Event updated!" : "Event created!");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred');
      toast.error(err.message); // 🛡️ Replaced alert()
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Edit Event' : 'Add Event'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start gap-2 text-xs font-semibold border border-red-100">
            <AlertTriangle size={14} className="shrink-0 mt-0.5"/> {error}
          </div>
        )}
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
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Save Event'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}