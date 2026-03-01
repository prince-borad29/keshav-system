import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3, Map, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';
import Button from '../../components/ui/Button';

export default function StructureManager() {
  const queryClient = useQueryClient();
  const [modalMode, setModalMode] = useState(null); 
  const [selectedItem, setSelectedItem] = useState(null); 
  const [formData, setFormData] = useState({ name: '' });
  const [error, setError] = useState('');

  const { data: kshetras, isLoading } = useQuery({
    queryKey: ['structure'],
    queryFn: async () => {
      const { data } = await supabase.from('kshetras').select('*, mandals(*)').order('name');
      return data;
    }
  });

  const handleMutation = async (e) => {
    e.preventDefault();
    try {
      let query;
      const payload = { name: formData.name };

      if (modalMode === 'ADD_KSHETRA') query = supabase.from('kshetras').insert(payload);
      if (modalMode === 'ADD_MANDAL') query = supabase.from('mandals').insert({ ...payload, kshetra_id: selectedItem.id });
      if (modalMode === 'EDIT_KSHETRA') query = supabase.from('kshetras').update(payload).eq('id', selectedItem.id);
      if (modalMode === 'EDIT_MANDAL') query = supabase.from('mandals').update(payload).eq('id', selectedItem.id);

      const { error } = await query;
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['structure'] });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['structure'] }),
    onError: (err) => alert("Cannot delete: " + err.message)
  });

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    setFormData({ name: mode.includes('EDIT') ? item.name : '' });
    setError('');
  };
  const closeModal = () => { setModalMode(null); setSelectedItem(null); };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => openModal('ADD_KSHETRA')}>Add Kshetra</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {kshetras?.map(kshetra => (
          <div key={kshetra.id} className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] h-full flex flex-col group">
            
            {/* Kshetra Header */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                <Map size={16} className="text-[#5C3030]" strokeWidth={2}/> {kshetra.name}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openModal('EDIT_KSHETRA', kshetra)} className="p-1.5 text-gray-400 hover:text-[#5C3030] rounded-md transition-colors"><Edit3 size={14}/></button>
                <button onClick={() => { if(confirm('Delete Kshetra?')) deleteItem.mutate({ table: 'kshetras', id: kshetra.id }) }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors"><Trash2 size={14}/></button>
              </div>
            </div>

            {/* Mandals List */}
            <div className="p-2 flex-1 space-y-1">
              {kshetra.mandals?.map(mandal => (
                <div key={mandal.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-md transition-colors group/mandal">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <MapPin size={14} className="text-gray-400" strokeWidth={1.5} /> {mandal.name}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover/mandal:opacity-100 transition-opacity">
                    <button onClick={() => openModal('EDIT_MANDAL', mandal)} className="p-1 text-gray-400 hover:text-[#5C3030] rounded-md"><Edit3 size={14}/></button>
                    <button onClick={() => { if(confirm('Delete Mandal?')) deleteItem.mutate({ table: 'mandals', id: mandal.id }) }} className="p-1 text-gray-400 hover:text-red-600 rounded-md"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
              {kshetra.mandals?.length === 0 && <div className="text-center py-4 text-xs text-gray-400 font-medium">No Mandals</div>}
            </div>

            <button onClick={() => openModal('ADD_MANDAL', kshetra)} className="w-full py-2.5 border-t border-gray-100 text-xs font-bold text-[#5C3030] hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors">
              <Plus size={14} strokeWidth={2}/> Add Mandal
            </button>
          </div>
        ))}
      </div>

      <Modal isOpen={!!modalMode} onClose={closeModal} title={modalMode?.replace('_', ' ')}>
        <form onSubmit={handleMutation} className="space-y-4">
          {error && <div className="text-red-700 text-xs font-semibold bg-red-50 border border-red-100 p-3 rounded-md">{error}</div>}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Name</label>
            <input 
              autoFocus 
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors" 
              value={formData.name} 
              onChange={e => setFormData({ name: e.target.value })} 
              placeholder="Enter name..." 
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} type="button">Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}