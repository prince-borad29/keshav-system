import React, { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Tag as TagIcon, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import TagModal from '../../components/TagModal';
import ConfirmModal from '../../components/ConfirmModal'; // ✅ IMPORT

export default function Tags() {
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null);

  // ✅ DELETE STATE
  const [deleteId, setDeleteId] = useState(null);

  const fetchTags = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tags').select('*').order('name');
    if (!error) setTags(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  // ✅ 1. TRIGGER MODAL
  const handleDelete = (id) => {
    setDeleteId(id);
  };

  // ✅ 2. CONFIRM ACTION
  const confirmDelete = async () => {
    if (deleteId) {
      await supabase.from('tags').delete().eq('id', deleteId);
      setDeleteId(null);
      fetchTags();
    }
  };

  const openCreate = () => { setEditingTag(null); setIsModalOpen(true); };
  const openEdit = (tag) => { setEditingTag(tag); setIsModalOpen(true); };

  const filteredTags = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {/* HEADER */}
      <div className="bg-white p-4 pb-2 shadow-sm z-10 sticky top-0 pt-safe-top">
        <div className="flex items-center gap-2 mb-4">
          <TagIcon size={24} className="text-[#002B3D]" />
          <h1 className="text-2xl font-bold text-[#002B3D]">Tags</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="Search tags..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400"><X size={18} /></button>}
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 pb-safe-bottom">
        {loading ? <div className="text-center text-slate-400 mt-10">Loading...</div> : (
          filteredTags.map((tag) => (
            <div key={tag.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: tag.color }}></div>
                  <span className="font-semibold text-slate-700">{tag.name}</span>
                </div>
                <div className="flex gap-1 ml-7 flex-wrap">
                  {tag.contexts?.map(ctx => (
                    <span key={ctx} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-bold tracking-wide border border-slate-200">{ctx}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(tag)} className="p-2 text-slate-400 hover:text-[#002B3D] hover:bg-slate-50 rounded-lg"><Pencil size={18} /></button>
                <button onClick={() => handleDelete(tag.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      <button onClick={openCreate} className="fixed bottom-6 right-6 w-14 h-14 bg-[#002B3D] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#155e7a] hover:scale-105 transition-all z-20"><Plus size={28} /></button>

      <TagModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} tagToEdit={editingTag} onSave={fetchTags} />
      
      {/* ✅ CONFIRM MODAL */}
      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Tag?"
        message="This tag will be removed from all members who currently have it."
        confirmText="Delete"
        isDanger={true}
      />
    </div>
  );
}