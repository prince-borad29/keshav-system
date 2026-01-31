import React, { useState, useEffect } from 'react';
import { 
  Users, MapPin, Shield, Plus, Trash2, ChevronRight, X, Edit2, Check, Save 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import UserManagement from './UserManagement'; 

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('hierarchy');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#002B3D]">Admin Console</h1>
          <p className="text-slate-500 text-sm">System Configuration & Access Control</p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('hierarchy')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'hierarchy' ? 'bg-white shadow-sm text-[#002B3D]' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <MapPin size={16} /> Structure
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-[#002B3D]' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Shield size={16} /> Team Access
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'hierarchy' ? <HierarchyManager /> : <UserManagement />}
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: HIERARCHY MANAGER (Enhanced with Edit) ---
function HierarchyManager() {
  const [kshetras, setKshetras] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create State
  const [newKshetra, setNewKshetra] = useState('');
  const [newMandal, setNewMandal] = useState('');
  
  // View State
  const [expandedKshetra, setExpandedKshetra] = useState(null);
  
  // Edit State
  const [editingItem, setEditingItem] = useState(null); // { id: '...', type: 'kshetra'|'mandal', name: '...' }

  useEffect(() => {
    fetchHierarchy();
  }, []);

  const fetchHierarchy = async () => {
    setLoading(true);
    const { data } = await supabase.from('kshetras').select('*, mandals(*)').order('name');
    if (data) setKshetras(data);
    setLoading(false);
  };

  // --- CRUD: Kshetra ---
  const addKshetra = async () => {
    if (!newKshetra.trim()) return;
    const { error } = await supabase.from('kshetras').insert([{ name: newKshetra }]);
    if (!error) { setNewKshetra(''); fetchHierarchy(); }
  };

  const updateKshetra = async () => {
    if (!editingItem.name.trim()) return;
    const { error } = await supabase.from('kshetras').update({ name: editingItem.name }).eq('id', editingItem.id);
    if (!error) { setEditingItem(null); fetchHierarchy(); }
  };

  const deleteKshetra = async (id) => {
    if(!window.confirm("WARNING: Deleting a Kshetra will PERMANENTLY DELETE all its Mandals and associated user permissions. Continue?")) return;
    await supabase.from('kshetras').delete().eq('id', id);
    fetchHierarchy();
  };

  // --- CRUD: Mandal ---
  const addMandal = async (kshetraId) => {
    if (!newMandal.trim()) return;
    const { error } = await supabase.from('mandals').insert([{ name: newMandal, kshetra_id: kshetraId }]);
    if (!error) { setNewMandal(''); fetchHierarchy(); }
  };

  const updateMandal = async () => {
    if (!editingItem.name.trim()) return;
    const { error } = await supabase.from('mandals').update({ name: editingItem.name }).eq('id', editingItem.id);
    if (!error) { setEditingItem(null); fetchHierarchy(); }
  };

  const deleteMandal = async (id) => {
    if(!window.confirm("Delete this Mandal?")) return;
    await supabase.from('mandals').delete().eq('id', id);
    fetchHierarchy();
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* 1. Add Kshetra Box */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-[#002B3D] mb-4">Add New Kshetra (Region)</h3>
        <div className="flex gap-3">
          <input 
            type="text" placeholder="e.g. Rajkot West" value={newKshetra}
            onChange={(e) => setNewKshetra(e.target.value)}
            className="flex-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-sky-500 bg-slate-50"
          />
          <button onClick={addKshetra} className="bg-[#002B3D] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#0b3d52] shadow-sm">
            Add Region
          </button>
        </div>
      </div>

      {/* 2. List Structure */}
      <div className="space-y-4">
        {loading ? <div className="text-center text-slate-400 py-10">Loading Structure...</div> : kshetras.map(k => (
          <div key={k.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200">
            
            {/* Kshetra Header Row */}
            <div className="p-4 flex items-center justify-between group">
              
              {/* Left Side: Expand Icon + Name/Edit Input */}
              <div className="flex items-center gap-3 flex-1">
                <button 
                   onClick={() => setExpandedKshetra(expandedKshetra === k.id ? null : k.id)}
                   className={`p-2 rounded-lg transition-transform hover:bg-slate-100 ${expandedKshetra === k.id ? 'rotate-90 bg-sky-50 text-sky-600' : 'text-slate-400'}`}
                >
                   <ChevronRight size={20} />
                </button>

                {/* EDIT MODE: Kshetra */}
                {editingItem?.id === k.id && editingItem?.type === 'kshetra' ? (
                  <div className="flex items-center gap-2 flex-1 max-w-sm animate-in fade-in">
                    <input 
                      autoFocus
                      type="text" 
                      value={editingItem.name}
                      onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                      className="flex-1 px-3 py-1.5 border border-sky-400 rounded-lg outline-none font-bold text-lg"
                    />
                    <button onClick={updateKshetra} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"><Check size={18}/></button>
                    <button onClick={() => setEditingItem(null)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"><X size={18}/></button>
                  </div>
                ) : (
                  // VIEW MODE: Kshetra
                  <div className="flex-1 cursor-pointer" onClick={() => setExpandedKshetra(expandedKshetra === k.id ? null : k.id)}>
                    <h3 className="font-bold text-lg text-slate-800">{k.name}</h3>
                    <p className="text-xs text-slate-500 font-medium">{k.mandals?.length || 0} Mandals</p>
                  </div>
                )}
              </div>

              {/* Right Side: Action Buttons */}
              {!(editingItem?.id === k.id) && (
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingItem({ id: k.id, type: 'kshetra', name: k.name })} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg" title="Rename Region">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => deleteKshetra(k.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete Region">
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Accordion Body: Mandals List */}
            {expandedKshetra === k.id && (
              <div className="bg-slate-50 p-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                
                {/* Add Mandal Input */}
                <div className="flex gap-2 mb-4">
                   <input type="text" placeholder={`Add Mandal to ${k.name}...`} value={newMandal} onChange={(e) => setNewMandal(e.target.value)} className="flex-1 p-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-sky-500 focus:bg-white bg-white/50"/>
                   <button onClick={() => addMandal(k.id)} className="bg-white border border-slate-200 text-sky-600 p-2.5 rounded-lg hover:bg-sky-50 hover:border-sky-200 transition-all shadow-sm"><Plus size={20} /></button>
                </div>

                {/* Mandals Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {k.mandals?.map(m => (
                    <div key={m.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center group shadow-sm hover:shadow-md transition-all">
                      
                      {/* EDIT MODE: Mandal */}
                      {editingItem?.id === m.id && editingItem?.type === 'mandal' ? (
                         <div className="flex items-center gap-1 w-full animate-in zoom-in-95">
                            <input 
                              autoFocus
                              type="text" 
                              value={editingItem.name}
                              onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                              className="flex-1 px-2 py-1 text-sm border border-sky-400 rounded outline-none font-semibold"
                            />
                            <button onClick={updateMandal} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Check size={14}/></button>
                            <button onClick={() => setEditingItem(null)} className="p-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200"><X size={14}/></button>
                         </div>
                      ) : (
                         // VIEW MODE: Mandal
                         <>
                           <div className="flex items-center gap-2 truncate">
                              <div className="w-2 h-2 rounded-full bg-sky-400 shrink-0"></div>
                              <span className="font-semibold text-slate-700 text-sm truncate">{m.name}</span>
                           </div>
                           
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingItem({ id: m.id, type: 'mandal', name: m.name })} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteMandal(m.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                                <X size={14} />
                              </button>
                           </div>
                         </>
                      )}
                    </div>
                  ))}
                  {(!k.mandals || k.mandals.length === 0) && (
                    <div className="col-span-full text-center py-4 text-xs text-slate-400 italic">No Mandals added yet. Start by adding one above.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}