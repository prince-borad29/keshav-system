import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle, Loader2 } from 'lucide-react';

const INITIAL_FORM = {
  name: '', father_name: '', surname: '', gender: 'Yuvak',
  dob: '', mobile: '', address: '', designation: 'Member',
  kshetra_id: '', mandal_id: '', internal_code: '', is_guest: false
};

export default function MemberForm({ isOpen, onClose, onSuccess, initialData = null }) {
  const { profile } = useAuth();
  
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isNirdeshak = role === 'nirdeshak';
  const isNirikshak = role === 'nirikshak';
  const isSanchalak = role === 'sanchalak';

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [selectedTags, setSelectedTags] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]); 
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          ...initialData,
          kshetra_id: initialData.mandals?.kshetra_id || '', 
          dob: initialData.dob || '',
          address: initialData.address || '',            
          father_name: initialData.father_name || '',   
          mobile: initialData.mobile || '',             
        });
        fetchMemberTags(initialData.id);
      } else {
        const defaults = { ...INITIAL_FORM, internal_code: `MEM-${Date.now().toString().slice(-6)}` };
        if (!isAdmin && profile?.gender) defaults.gender = profile.gender;
        if (isSanchalak) defaults.mandal_id = profile.assigned_mandal_id; 
        else if (isNirdeshak) defaults.kshetra_id = profile.assigned_kshetra_id || profile.kshetra_id;
        
        setFormData(defaults);
        setSelectedTags([]);
      }
      fetchDropdowns();
    }
  }, [isOpen, initialData, profile]);

  const fetchDropdowns = async () => {
    try {
      const { data: tData } = await supabase.from('tags').select('id, name').contains('category', ['Member']).order('name');
      if (tData) setAvailableTags(tData);

      if (isAdmin) {
        const { data: kData } = await supabase.from('kshetras').select('id, name').order('name');
        if (kData) setKshetras(kData);
      }

      let mQuery = supabase.from('mandals').select('id, name, kshetra_id').order('name');
      if (isNirdeshak) {
         const kId = profile.assigned_kshetra_id || profile.kshetra_id;
         if (kId) mQuery = mQuery.eq('kshetra_id', kId);
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
      console.error(err);
    }
  };

  const fetchMemberTags = async (memberId) => {
    const { data } = await supabase.from('member_tags').select('tag_id').eq('member_id', memberId);
    if (data) setSelectedTags(data.map(t => t.tag_id));
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

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors placeholder:text-gray-400";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Edit Profile' : 'New Registration'}>
      <form id="member-form" onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start gap-2 text-xs font-semibold border border-red-100">
            <AlertTriangle size={14} className="shrink-0 mt-0.5"/> {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>First Name <span className="text-red-500">*</span></label>
              <input required className={inputClass} placeholder="First Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Surname <span className="text-red-500">*</span></label>
              <input required className={inputClass} placeholder="Last Name" value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Mobile Number</label>
              <input type="tel" className={inputClass} placeholder="10-digit number" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Date of Birth</label>
              <input type="date" className={inputClass} value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
            </div>
          </div>
          
          <div className="h-px bg-gray-100 w-full" />

          <div className="grid grid-cols-2 gap-4">
            {isAdmin && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Kshetra (Region)</label>
                <select className={`${inputClass} appearance-none`} value={formData.kshetra_id} onChange={e => setFormData({...formData, kshetra_id: e.target.value, mandal_id: ''})}>
                  <option value="">Select Kshetra...</option>
                  {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
            )}
            {!isSanchalak && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Mandal (Local) <span className="text-red-500">*</span></label>
                <select required className={`${inputClass} appearance-none`} value={formData.mandal_id} onChange={e => setFormData({...formData, mandal_id: e.target.value})}>
                  <option value="">Select Mandal...</option>
                  {(isAdmin && formData.kshetra_id ? mandals.filter(m => m.kshetra_id === formData.kshetra_id) : mandals).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Designation</label>
              <select className={`${inputClass} appearance-none`} value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})}>
                {['Member', 'Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Utsahi Yuvak'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {isAdmin && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Gender <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {['Yuvak', 'Yuvati'].map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData({...formData, gender: g})}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-colors ${formData.gender === g ? 'bg-[#5C3030] text-white border-[#5C3030]' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100 w-full" />

          <div>
            <label className={labelClass}>Tags</label>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTags(p => p.includes(tag.id) ? p.filter(id => id !== tag.id) : [...p, tag.id])}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-colors ${
                    selectedTags.includes(tag.id)
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16}/> : 'Save Member'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}