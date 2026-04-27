import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase, withTimeout } from '../../lib/supabase';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import Button from '../../components/ui/Button';

export default function AbsenceReasonModal({ isOpen, onClose, member, onSave, isSaving }) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Fetch absence categories
  const { data: categories, isLoading: isCategoriesLoading } = useQuery({
    queryKey: ['absence-categories'],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from('absence_categories').select('id, label').eq('is_active', true).order('label')
      );
      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
    staleTime: 1000 * 60 * 30
  });

  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory('');
      setNotes('');
      setError('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!selectedCategory) {
      setError('Please select an absence reason');
      return;
    }

    try {
      setError('');
      await onSave(selectedCategory, notes);
      setSelectedCategory('');
      setNotes('');
    } catch (err) {
      setError(err.message || 'Failed to save absence');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark Absent">
      <div className="space-y-4">
        {/* Member Display */}
        {member && (
          <div className="bg-[#5C3030]/5 border border-[#5C3030]/20 rounded-md p-3">
            <p className="text-sm font-semibold text-gray-900">
              {member.name} {member.surname}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{member.designation} • {member.mandals?.name}</p>
          </div>
        )}

        {/* Absence Reason Category */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
            Absence Reason *
          </label>
          <div className="relative">
            <select
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none cursor-pointer"
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setError('');
              }}
              disabled={isCategoriesLoading}
            >
              <option value="">Select a reason...</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
              {isCategoriesLoading ? <Loader2 size={16} className="animate-spin" /> : '▼'}
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-1.5 text-red-600 text-xs">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Additional Notes */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
            Additional Notes (Optional)
          </label>
          <textarea
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors placeholder:text-gray-400 resize-none"
            placeholder="Add any context for this absence..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSaving}
          />
          <p className="text-[10px] text-gray-400 mt-1">Max 200 characters</p>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-gray-100 flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !selectedCategory || isCategoriesLoading}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Mark Absent'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
