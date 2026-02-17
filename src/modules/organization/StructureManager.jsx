import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Map, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';

export default function StructureManager() {
  const queryClient = useQueryClient();
  const [modalMode, setModalMode] = useState(null); 
  const [selectedItem, setSelectedItem] = useState(null); 
  const [formData, setFormData] = useState({ name: '' });
  const [error, setError] = useState('');

  // 1. READ
  const { data: kshetras, isLoading } = useQuery({
    queryKey: ['structure'],
    queryFn: async () => {
      const { data } = await supabase.from('kshetras').select('*, mandals(*)').order('name');
      return data;
    }
  });

  // 2. MUTATIONS
  const handleMutation = async (action) => {
    try {
      let query;
      const payload = { name: formData.name };

      if (action === 'CREATE_KSHETRA') query = supabase.from('kshetras').insert(payload);
      if (action === 'CREATE_MANDAL') query = supabase.from('mandals').insert({ ...payload, kshetra_id: selectedItem.id });
      if (action === 'UPDATE_KSHETRA') query = supabase.from('kshetras').update(payload).eq('id', selectedItem.id);
      if (action === 'UPDATE_MANDAL') query = supabase.from('mandals').update(payload).eq('id', selectedItem.id);

      const { error } = await query;
      if (error) throw error;
      
      queryClient.invalidateQueries(['structure']);
      closeModal();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteItem = useMutation({
    mutationFn: async ({ table, id }) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(['structure']),
    onError: (err) => alert("Cannot delete: " + err.message)
  });

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    setFormData({ name: mode.includes('EDIT') ? item.name : '' });
    setError('');
  };
  const closeModal = () => { setModalMode(null); setSelectedItem(null); };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Hierarchy Structure</h2>
          <p className="text-slate-500 text-sm">Manage Kshetras (Regions) and Mandals (Centers)</p>
        </div>
        <button onClick={() => openModal('ADD_KSHETRA')} className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2">
          <Plus size={16} /> Add Kshetra
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {kshetras?.map(kshetra => (
          <div key={kshetra.id} className="card h-full flex flex-col">
            {/* Kshetra Header - Icons Always Visible */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center group">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Map size={18} className="text-primary" /> {kshetra.name}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openModal('EDIT_KSHETRA', kshetra)} className="action-btn text-blue-500 bg-blue-50"><Edit2 size={14}/></button>
                <button onClick={() => { if(confirm('Delete Kshetra?')) deleteItem.mutate({ table: 'kshetras', id: kshetra.id }) }} className="action-btn text-red-500 bg-red-50"><Trash2 size={14}/></button>
              </div>
            </div>

            {/* Mandals List - Icons Always Visible */}
            <div className="p-2 flex-1 space-y-1">
              {kshetra.mandals?.map(mandal => (
                <div key={mandal.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                    <MapPin size={14} className="text-slate-400" /> {mandal.name}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openModal('EDIT_MANDAL', mandal)} className="p-1 text-slate-400 hover:text-blue-500"><Edit2 size={14}/></button>
                    <button onClick={() => { if(confirm('Delete Mandal?')) deleteItem.mutate({ table: 'mandals', id: mandal.id }) }} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
              {kshetra.mandals?.length === 0 && <div className="text-center py-4 text-xs text-slate-300 italic">No Mandals</div>}
            </div>

            <button onClick={() => openModal('ADD_MANDAL', kshetra)} className="w-full py-3 border-t border-dashed border-slate-200 text-xs font-bold text-primary hover:bg-primary/5 flex items-center justify-center gap-2">
              <Plus size={14} /> Add Mandal
            </button>
          </div>
        ))}
      </div>

      <Modal isOpen={!!modalMode} onClose={closeModal} title={modalMode?.replace('_', ' ')}>
        <form onSubmit={(e) => { e.preventDefault(); handleMutation(modalMode.includes('ADD_KSHETRA') ? 'CREATE_KSHETRA' : modalMode.includes('ADD_MANDAL') ? 'CREATE_MANDAL' : modalMode.includes('EDIT_KSHETRA') ? 'UPDATE_KSHETRA' : 'UPDATE_MANDAL'); }} className="space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
          <div>
            <label className="label-xs">Name</label>
            <input autoFocus className="input-field" value={formData.name} onChange={e => setFormData({ name: e.target.value })} placeholder="Enter name..." />
          </div>
          <button type="submit" className="btn-primary w-full py-3">Save Changes</button>
        </form>
      </Modal>

      <style>{`
        .btn-primary { @apply bg-primary text-white hover:bg-primary-dark px-4 py-2 rounded-lg font-bold text-sm transition-all; }
        .card { @apply bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm; }
        .action-btn { @apply p-1.5 rounded transition-colors; }
        .label-xs { @apply block text-xs font-bold text-slate-500 uppercase mb-1.5; }
        .input-field { @apply w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-medium text-slate-800; }
      `}</style>
    </div>
  );
}