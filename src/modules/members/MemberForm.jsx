import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, AlertTriangle, Tag, User, MapPin, Calendar, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';

const INITIAL_FORM = {
  name: '', father_name: '', surname: '', gender: 'Yuvak',
  dob: '', mobile: '', address: '', designation: 'Member',
  kshetra_id: '', mandal_id: '', internal_code: '', is_guest: false
};

export default function MemberForm({ isOpen, onClose, onSuccess, initialData = null }) {
  const { profile } = useAuth();
  
  // -- ROLES --
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isNirdeshak = role === 'nirdeshak';
  const isNirikshak = role === 'nirikshak';
  const isSanchalak = role === 'sanchalak';

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedTags, setSelectedTags] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Dropdowns
  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]); 
  const [availableTags, setAvailableTags] = useState([]);

  // -- 1. INITIALIZATION --
  useEffect(() => {
    if (isOpen) {
      initializeForm();
    }
  }, [isOpen, initialData, profile]);

  const initializeForm = async () => {
    // 1. Fetch Options
    await fetchDropdowns();

    // 2. Set Defaults based on Role & Edit Mode
    if (initialData) {
      setFormData({
        ...initialData,
        // Ensure legacy data maps correctly
        kshetra_id: initialData.mandals?.kshetra_id || '', 
        dob: initialData.dob || ''
      });
      fetchMemberTags(initialData.id);
    } else {
      // NEW ENTRY: Set smart defaults based on Role
      const defaults = { ...INITIAL_FORM, internal_code: `MEM-${Date.now().toString().slice(-6)}` };
      
      // -- GENDER LOCK (Auto-select for everyone except Admin) --
      if (!isAdmin && profile?.gender) {
        defaults.gender = profile.gender;
      }

      // -- LOCATION LOCKS --
      if (isSanchalak) {
         defaults.mandal_id = profile.assigned_mandal_id; 
      }
      else if (isNirdeshak) {
         // Auto-select Kshetra
         defaults.kshetra_id = profile.assigned_kshetra_id || profile.kshetra_id;
      }

      setFormData(defaults);
      setSelectedTags([]);
    }
  };

  const fetchDropdowns = async () => {
    try {
      // Tags
      const { data: tData } = await supabase.from('tags').select('id, name').eq('category', 'Member').order('name');
      if (tData) setAvailableTags(tData);

      // Kshetras (Only needed for Admin to filter)
      if (isAdmin) {
        const { data: kData } = await supabase.from('kshetras').select('id, name').order('name');
        if (kData) setKshetras(kData);
      }

      // Mandals (Context Aware Fetching)
      let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');

      if (isNirdeshak) {
         // Filter mandals by Nirdeshak's Kshetra
         const kId = profile.assigned_kshetra_id || profile.kshetra_id;
         if (kId) {
            mQuery = mQuery.eq('kshetra_id', kId);
         }
      } 
      else if (isNirikshak) {
         const { data: assignments } = await supabase.from('nirikshak_assignments').select('mandal_id').eq('nirikshak_id', profile.id);
         const ids = assignments?.map(a => a.mandal_id) || [];
         if (profile.assigned_mandal_id) ids.push(profile.assigned_mandal_id);
         
         if (ids.length > 0) mQuery = mQuery.in('id', ids);
         else mQuery = mQuery.eq('id', '00000000-0000-0000-0000-000000000000'); 
      }
      else if (isSanchalak) {
         mQuery = mQuery.eq('id', profile.assigned_mandal_id);
      }

      const { data: mData } = await mQuery;
      if (mData) setMandals(mData);
    } catch (err) {
      console.error("Dropdown Error:", err);
    }
  };

  const fetchMemberTags = async (memberId) => {
    const { data } = await supabase.from('member_tags').select('tag_id').eq('member_id', memberId);
    if (data) setSelectedTags(data.map(t => t.tag_id));
  };

  // -- 2. HANDLERS --

  const toggleTag = (tagId) => {
    setSelectedTags(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name || !formData.surname || !formData.mandal_id) {
        throw new Error("Name, Surname, and Mandal are required.");
      }

      const payload = {
        name: formData.name, father_name: formData.father_name, surname: formData.surname,
        gender: formData.gender, dob: formData.dob || null, mobile: formData.mobile,
        address: formData.address, designation: formData.designation, 
        mandal_id: formData.mandal_id, 
        internal_code: formData.internal_code, is_guest: formData.is_guest, updated_at: new Date()
      };

      let memberId = initialData?.id;

      if (memberId) {
        const { error } = await supabase.from('members').update(payload).eq('id', memberId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('members').insert(payload).select().single();
        if (error) throw error;
        memberId = data.id;
      }

      // Handle Tags
      if (memberId) {
        await supabase.from('member_tags').delete().eq('member_id', memberId);
        if (selectedTags.length > 0) {
          const tagInserts = selectedTags.map(tagId => ({ member_id: memberId, tag_id: tagId }));
          await supabase.from('member_tags').insert(tagInserts);
        }
      }

      onSuccess();
      onClose();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  // Helper to filter mandals based on selected Kshetra (For Admin UI only)
  const getDisplayMandals = () => {
    if (isAdmin && formData.kshetra_id) {
      return mandals.filter(m => m.kshetra_id === formData.kshetra_id);
    }
    return mandals;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Profile' : 'New Registration'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Please fill in the details carefully.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} className="text-slate-500"/></button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="overflow-y-auto p-6 flex-1">
          <form id="member-form" onSubmit={handleSubmit} className="space-y-8">
            
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 text-sm border border-red-100">
                <AlertTriangle size={18} className="shrink-0 mt-0.5"/> 
                <span>{error}</span>
              </div>
            )}

            {/* SECTION 1: PERSONAL */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={14}/> Personal Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="label-std">First Name <span className="text-red-500">*</span></label>
                  <input required className="input-std" placeholder="First Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="label-std">Father's Name</label>
                  <input className="input-std" placeholder="Middle Name" value={formData.father_name} onChange={e => setFormData({...formData, father_name: e.target.value})} />
                </div>
                <div>
                  <label className="label-std">Surname <span className="text-red-500">*</span></label>
                  <input required className="input-std" placeholder="Last Name" value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label-std">Mobile Number</label>
                  <input type="tel" className="input-std" placeholder="10-digit number" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                </div>
                <div>
                  <label className="label-std">Date of Birth</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none"/>
                    <input type="date" className="input-std pl-10" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full" />

            {/* SECTION 2: ORGANIZATION */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MapPin size={14}/> Organization Scope
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Kshetra: Only Visible to Admin (Hidden for Nirdeshak/Others) */}
                {isAdmin && (
                  <div>
                    <label className="label-std">Kshetra (Region)</label>
                    <select className="input-std" value={formData.kshetra_id} onChange={e => setFormData({...formData, kshetra_id: e.target.value, mandal_id: ''})}>
                      <option value="">Select Kshetra...</option>
                      {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Mandal: Visible to everyone except Sanchalak (who is auto-locked) */}
                {!isSanchalak && (
                  <div>
                    <label className="label-std">Mandal (Local) <span className="text-red-500">*</span></label>
                    <select required className="input-std" value={formData.mandal_id} onChange={e => setFormData({...formData, mandal_id: e.target.value})}>
                      <option value="">Select Mandal...</option>
                      {getDisplayMandals().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label-std">Designation</label>
                  <div className="relative">
                    <Briefcase size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none"/>
                    <select className="input-std pl-10" value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})}>
                      {['Member', 'Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Utsahi Yuvak'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {/* Gender: Only Admin can change. Others see Hidden Field */}
                {isAdmin ? (
                  <div>
                    <label className="label-std">Gender <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      {['Yuvak', 'Yuvati'].map(g => (
                        <label key={g} className={`flex-1 text-center py-2.5 rounded-xl border cursor-pointer text-sm font-medium transition-all ${formData.gender === g ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                          <input type="radio" className="hidden" name="gender" checked={formData.gender === g} onChange={() => setFormData({...formData, gender: g})}/>
                          {g}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                   <div className="hidden">
                      {/* Stores auto-selected gender for Nirdeshak/Sanchalak/etc */}
                      <input type="hidden" value={formData.gender} />
                   </div>
                )}

                {/* Address spans full width */}
                <div className="md:col-span-2">
                   <label className="label-std">Address</label>
                   <textarea className="input-std" rows="2" placeholder="Street, Area, City..." value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 w-full" />

            {/* SECTION 3: TAGS */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Tag size={14}/> Skills & Tags</h3>
              <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
                {availableTags.length === 0 ? (
                  <span className="text-sm text-slate-400 italic">No tags available. Admins can add them in Settings.</span>
                ) : (
                  availableTags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                        selectedTags.includes(tag.id)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {selectedTags.includes(tag.id) && <span className="mr-1">✓</span>}
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </div>

          </form>
        </div>

        {/* FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" form="member-form" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <><Save size={18} className="mr-2"/> Save Details</>}
          </Button>
        </div>

      </div>
      <style>{`
        .label-std { @apply block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide; }
        .input-std { @apply w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm text-slate-800 transition-all placeholder:text-slate-400; }
      `}</style>
    </div>
  );
}