import React, { useState, useEffect } from 'react';
import { 
  Network, Shield, Plus, Trash2, ChevronRight, X, Edit2, Check, MapPin, Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import UserManagement from './UserManagement'; 

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('hierarchy');

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative">
      
      {/* --- HEADER --- */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#002B3D]">Admin Console</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium">System Configuration</p>
        </div>
        
        {/* DESKTOP TABS */}
        <div className="hidden md:flex bg-slate-100 p-1 rounded-xl">
          <TabButtonDesktop 
            label="Structure" 
            icon={Network} 
            isActive={activeTab === 'hierarchy'} 
            onClick={() => setActiveTab('hierarchy')} 
          />
          <TabButtonDesktop 
            label="Team Access" 
            icon={Shield} 
            isActive={activeTab === 'users'} 
            onClick={() => setActiveTab('users')} 
          />
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 scroll-smooth">
        <div className="max-w-5xl mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === 'hierarchy' ? <HierarchyManager /> : <UserManagement />}
          </div>
        </div>
      </div>

      {/* --- MOBILE BOTTOM NAV --- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-2 pb-safe flex justify-around items-center z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        <TabButtonMobile label="Structure" icon={Network} isActive={activeTab === 'hierarchy'} onClick={() => setActiveTab('hierarchy')} />
        <TabButtonMobile label="Team Access" icon={Shield} isActive={activeTab === 'users'} onClick={() => setActiveTab('users')} />
      </div>
    </div>
  );
}

// --- TAB HELPERS ---
function TabButtonDesktop({ label, icon: Icon, isActive, onClick }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-200 ${isActive ? 'bg-white shadow-sm text-[#002B3D] ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
      <Icon size={16} strokeWidth={2.5} /> {label}
    </button>
  );
}

function TabButtonMobile({ label, icon: Icon, isActive, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center w-full gap-1 p-1 active:scale-95 transition-transform">
      <div className={`p-1.5 rounded-full transition-colors duration-300 ${isActive ? 'bg-[#002B3D]/10' : 'bg-transparent'}`}>
        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={`transition-colors duration-300 ${isActive ? 'text-[#002B3D]' : 'text-slate-400'}`} />
      </div>
      <span className={`text-[10px] font-bold tracking-wide transition-colors duration-300 ${isActive ? 'text-[#002B3D]' : 'text-slate-400'}`}>{label}</span>
    </button>
  );
}

// --- SUB-COMPONENT: HIERARCHY MANAGER ---
function HierarchyManager() {
  const [kshetras, setKshetras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKshetra, setNewKshetra] = useState('');
  const [newMandal, setNewMandal] = useState('');
  const [expandedKshetra, setExpandedKshetra] = useState(null);
  const [editingItem, setEditingItem] = useState(null); 

  useEffect(() => { fetchHierarchy(); }, []);

  const fetchHierarchy = async () => {
    setLoading(true);
    const { data } = await supabase.from('kshetras').select('*, mandals(*)').order('name');
    if (data) setKshetras(data);
    setLoading(false);
  };

  // CRUD Actions
  const addKshetra = async () => {
    if (!newKshetra.trim()) return;
    const { error } = await supabase.from('kshetras').insert([{ name: newKshetra }]);
    if (!error) { setNewKshetra(''); fetchHierarchy(); }
  };

  const updateItem = async (table) => {
    if (!editingItem.name.trim()) return;
    const { error } = await supabase.from(table).update({ name: editingItem.name }).eq('id', editingItem.id);
    if (!error) { setEditingItem(null); fetchHierarchy(); }
  };

  const deleteItem = async (table, id) => {
    if(!window.confirm(`Delete this item? This will remove ALL related data (Mandals, Members, Users).`)) return;
    await supabase.from(table).delete().eq('id', id);
    fetchHierarchy();
  };

  const addMandal = async (kshetraId) => {
    if (!newMandal.trim()) return;
    const { error } = await supabase.from('mandals').insert([{ name: newMandal, kshetra_id: kshetraId }]);
    if (!error) { setNewMandal(''); fetchHierarchy(); }
  };

  return (
    <div className="space-y-5">
      {/* Add Box */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 ring-1 ring-slate-50">
        <h3 className="text-xs font-bold text-[#002B3D] uppercase tracking-wider mb-3 flex items-center gap-2">
          <MapPin size={14} /> Add New Region (Kshetra)
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
             <input 
               type="text" placeholder="Region Name (e.g. Rajkot West)" value={newKshetra}
               onChange={(e) => setNewKshetra(e.target.value)}
               className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#002B3D] focus:ring-1 focus:ring-[#002B3D] bg-slate-50 pr-8"
             />
             {newKshetra && <button onClick={() => setNewKshetra('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"><X size={16}/></button>}
          </div>
          <button onClick={addKshetra} className="bg-[#002B3D] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#0b3d52] shadow-lg shadow-sky-900/10 active:scale-95 transition-all flex items-center justify-center gap-2">
            <Plus size={16} /> Add Region
          </button>
        </div>
      </div>

      {/* Structure List */}
      <div className="space-y-3">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#002B3D]" /></div> : kshetras.map(k => (
          <div key={k.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-200 hover:shadow-md">
            
            {/* Header */}
            <div className="p-3 md:p-4 flex items-center justify-between group cursor-pointer active:bg-slate-50" onClick={() => { if(editingItem?.id !== k.id) setExpandedKshetra(expandedKshetra === k.id ? null : k.id) }}>
              <div className="flex items-center gap-3 flex-1 overflow-hidden">
                <div className={`p-2 rounded-full transition-transform duration-300 ${expandedKshetra === k.id ? 'rotate-90 bg-sky-50 text-[#002B3D]' : 'text-slate-300'}`}>
                   <ChevronRight size={20} strokeWidth={2.5} />
                </div>
                {editingItem?.id === k.id && editingItem?.type === 'kshetra' ? (
                  <div className="flex items-center gap-2 flex-1 animate-in fade-in" onClick={e => e.stopPropagation()}>
                    <input autoFocus type="text" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="flex-1 min-w-0 px-2 py-1 border-b-2 border-[#002B3D] outline-none font-bold text-base bg-transparent" />
                    <button onClick={() => updateItem('kshetras')} className="p-2 bg-green-50 text-green-600 rounded-lg"><Check size={16}/></button>
                    <button onClick={() => setEditingItem(null)} className="p-2 bg-red-50 text-red-500 rounded-lg"><X size={16}/></button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-slate-800 truncate">{k.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#002B3D]"></span> {k.mandals?.length || 0} Mandals</p>
                  </div>
                )}
              </div>
              {!(editingItem?.id === k.id) && (
                <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditingItem({ id: k.id, type: 'kshetra', name: k.name })} className="p-2 text-slate-400 hover:text-[#002B3D] hover:bg-sky-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => deleteItem('kshetras', k.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              )}
            </div>

            {/* Accordion Body */}
            {expandedKshetra === k.id && (
              <div className="bg-slate-50/50 p-3 md:p-4 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <div className="flex gap-2 mb-4">
                   <div className="relative flex-1">
                      <input type="text" placeholder="Add Mandal Name..." value={newMandal} onChange={(e) => setNewMandal(e.target.value)} className="w-full p-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#002B3D] focus:bg-white bg-white shadow-sm transition-all pr-8"/>
                      {newMandal && <button onClick={() => setNewMandal('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"><X size={14}/></button>}
                   </div>
                   <button onClick={() => addMandal(k.id)} className="bg-[#002B3D] text-white w-10 h-10 flex items-center justify-center rounded-xl shadow-lg active:scale-95 transition-all shrink-0"><Plus size={20} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {k.mandals?.map(m => (
                    <div key={m.id} className="bg-white px-3 py-2.5 rounded-xl border border-slate-200 flex justify-between items-center group shadow-sm hover:border-[#002B3D]/30 transition-colors">
                      {editingItem?.id === m.id && editingItem?.type === 'mandal' ? (
                         <div className="flex items-center gap-1 w-full animate-in fade-in">
                            <input autoFocus type="text" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className="flex-1 min-w-0 px-2 py-1 text-sm border-b border-[#002B3D] outline-none font-medium bg-transparent" />
                            <button onClick={() => updateItem('mandals')} className="text-green-600 p-1 bg-green-50 rounded"><Check size={14}/></button>
                            <button onClick={() => setEditingItem(null)} className="text-red-500 p-1 bg-red-50 rounded"><X size={14}/></button>
                         </div>
                      ) : (
                         <>
                           <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"></div>
                              <span className="font-medium text-slate-700 text-sm truncate">{m.name}</span>
                           </div>
                           <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingItem({ id: m.id, type: 'mandal', name: m.name })} className="text-slate-300 hover:text-[#002B3D] transition-colors"><Edit2 size={14} /></button>
                              <button onClick={() => deleteItem('mandals', m.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                           </div>
                         </>
                      )}
                    </div>
                  ))}
                  {(!k.mandals || k.mandals.length === 0) && <div className="col-span-full text-center py-3 text-[10px] text-slate-400 uppercase font-bold tracking-widest opacity-60 border border-dashed border-slate-200 rounded-xl">No Mandals Added</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}