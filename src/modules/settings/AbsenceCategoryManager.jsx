import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { supabase, withTimeout } from '../../lib/supabase';
import { Plus, Trash2, Edit3, Loader2, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';

const INITIAL_FORM = { label: '', is_active: true };

export default function AbsenceCategoryManager() {
  const queryClient = useQueryClient();

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);

  // 1. Fetch Absence Categories
  const { data: categories, isLoading } = useQuery({
    queryKey: ['absence-categories'],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from('absence_categories').select('id, label, is_active, created_at').order('label', { ascending: true })
      );
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Save Mutation (Create/Update)
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        const { error } = await withTimeout(
          supabase.from('absence_categories').update(payload).eq('id', editingId)
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          supabase.from('absence_categories').insert([payload])
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Category updated successfully!' : 'Category created successfully!');
      queryClient.invalidateQueries({ queryKey: ['absence-categories'] });
      resetForm();
    },
    onError: (err) => toast.error('Error: ' + err.message)
  });

  // 3. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await withTimeout(
        supabase.from('absence_categories').delete().eq('id', id)
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['absence-categories'] });
    },
    onError: (err) => toast.error('Error deleting category: ' + err.message)
  });

  // Handlers
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Category label is required');
      return;
    }
    saveMutation.mutate(formData);
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setFormData({
      label: category.label,
      is_active: category.is_active || true
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setIsFormOpen(false);
  };

  const handleDelete = (id) => {
    toast((t) => (
      <div className="flex gap-2 items-center">
        <span>Delete this category?</span>
        <button
          onClick={() => {
            toast.dismiss(t.id);
            deleteMutation.mutate(id);
          }}
          className="px-3 py-1 bg-red-600 text-white text-xs rounded font-semibold hover:bg-red-700"
        >
          Confirm
        </button>
      </div>
    ));
  };

  return (
    <>
      {/* Section Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            Absence Reasons
          </h3>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Reason
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Manage absence categories for standardized BI reporting and attendance tracking.
        </p>
      </div>

      {/* Categories Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading...
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="bg-white border border-gray-200 rounded-md p-3 hover:border-[#5C3030]/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-gray-900 truncate">
                      {category.label}
                    </h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${category.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => startEdit(category)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold text-[#5C3030] bg-[#5C3030]/5 hover:bg-[#5C3030]/10 transition-colors border border-[#5C3030]/10"
                  title="Edit"
                >
                  <Edit3 size={12} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-md border border-gray-200 text-gray-500 text-sm">
          No absence reasons created yet. Add one to get started.
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={resetForm}
        title={editingId ? 'Edit Absence Reason' : 'Create Absence Reason'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
              Reason Label *
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors placeholder:text-gray-400"
              placeholder="e.g., Health / Medical, Work / Education, Travel / Out of Town"
              value={formData.label}
              onChange={(e) =>
                setFormData({ ...formData, label: e.target.value })
              }
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Keep labels concise and descriptive
            </p>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030] accent-[#5C3030]"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <span className="text-sm font-semibold text-gray-900">Active</span>
            </label>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              Only active reasons appear in the dropdown when marking absences
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={resetForm}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending || !formData.label.trim()}
              className="flex items-center gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                'Update Reason'
              ) : (
                'Create Reason'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
