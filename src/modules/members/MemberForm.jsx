import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';
import Radio from '../../components/ui/Radio';
import Select from '../../components/ui/Select';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Designation hierarchy (higher number = lower rank, can only assign lower)
const DESIGNATION_HIERARCHY = {
  'Nirdeshak': 1,
  'Nirikshak': 2,
  'Sanchalak': 3,
  'Sah Sanchalak': 4,
  'Sampark Karyakar': 5,
  'Yuvak': 6,
  'Yuvati': 6
};

const INITIAL_FORM = {
  name: '', father_name: '', surname: '', gender: 'Yuvak',
  dob: '', mobile: '', designation: 'Yuvak',
  kshetra_id: '', mandal_id: '', internal_code: '', is_guest: false
};

export default function MemberForm({ isOpen, onClose, onSuccess, initialData = null, projectId = null, userId = null }) {
  const { profile } = useAuth();
  
  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isNirdeshak = role === 'nirdeshak';
  const isNirikshak = role === 'nirikshak';
  const isSanchalak = role === 'sanchalak';
  
  // Get user's designation level for hierarchy filtering
  const getUserDesignationLevel = () => {
    if (isAdmin) return 0; // Admin can assign any designation
    if (isNirdeshak) return 1;
    if (isNirikshak) return 2;
    if (isSanchalak) return 3;
    return 7; // Regular user/member - can't assign designations
  };
  
  const userLevel = getUserDesignationLevel();

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
          father_name: initialData.father_name || '',   
          mobile: initialData.mobile || '',             
        });
        fetchMemberTags(initialData.id);
      } else {
        const initializeDefaults = async () => {
          const defaults = { ...INITIAL_FORM, internal_code: `MEM-${Date.now().toString().slice(-6)}` };
          if (!isAdmin && profile?.gender) defaults.gender = profile.gender;
          if (isSanchalak) defaults.mandal_id = profile.assigned_mandal_id; 
          else if (isNirdeshak) {
            let kId = profile.assigned_kshetra_id;
            // Fallback: If assigned_kshetra_id is null, try to infer from assigned_mandal_id
            if (!kId && profile.assigned_mandal_id) {
              const { data: mandalData } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
              if (mandalData) kId = mandalData.kshetra_id;
            }
            if (kId) defaults.kshetra_id = kId;
          }
          
          setFormData(defaults);
          setSelectedTags([]);
        };
        
        initializeDefaults();
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
         let kId = profile.assigned_kshetra_id;
         // Fallback: If assigned_kshetra_id is null, try to infer from assigned_mandal_id
         if (!kId && profile.assigned_mandal_id) {
           const { data: mandalData } = await supabase.from('mandals').select('kshetra_id').eq('id', profile.assigned_mandal_id).single();
           if (mandalData) kId = mandalData.kshetra_id;
         }
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
      // Validation: all required fields (except tags)
      if (!formData.name?.trim()) {
        throw new Error("First Name is required.");
      }
      if (!formData.father_name?.trim()) {
        throw new Error("Father's Name is required.");
      }
      if (!formData.surname?.trim()) {
        throw new Error("Surname is required.");
      }
      if (!formData.mobile?.trim()) {
        throw new Error("Mobile Number is required.");
      }
      // Validate mobile format: 10 digits
      if (!/^\d{10}$/.test(formData.mobile.trim())) {
        throw new Error("Mobile Number must be 10 digits.");
      }
      // if (!formData.dob) {
      //   throw new Error("Date of Birth is required.");
      // }
      if (!formData.mandal_id) {
        throw new Error("Mandal (Local) is required.");
      }
      if (!formData.designation) {
        throw new Error("Designation is required.");
      }
      if (!formData.gender) {
        throw new Error("Gender is required.");
      }

      const payload = {
        name: formData.name, father_name: formData.father_name, surname: formData.surname,
        gender: formData.gender, dob: formData.dob || null, mobile: formData.mobile,
        designation: formData.designation, 
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
        // Auto-register for project if projectId is provided (new members only)
        if (projectId && !initialData) {
          const { error: regError } = await supabase.from('project_registrations').insert({
            project_id: projectId,
            member_id: memberId,
            registered_by: userId
          });
          if (regError) throw regError;
        }

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
              <label className={labelClass}>Surname <span className="text-red-500">*</span></label>
              <input  className={inputClass} placeholder="Surname" value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Name <span className="text-red-500">*</span></label>
              <input  className={inputClass} placeholder="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Father's Name <span className="text-red-500">*</span></label>
              <input  className={inputClass} placeholder="Father's Name" value={formData.father_name} onChange={e => setFormData({...formData, father_name: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Mobile Number <span className="text-red-500">*</span></label>
              <input  type="tel" className={inputClass} placeholder="10-digit number" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Date of Birth 
                {/* <span className="text-red-500">*</span> */}
                </label>
              <input  type="date" className={inputClass} value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
            </div>
          </div>
          
          <div className="h-px bg-gray-100 w-full" />

          <div className="grid grid-cols-2 gap-4">
            {isAdmin && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Kshetra (Region)</label>
                <Select
                  options={kshetras.map(k => ({ value: k.id, label: k.name }))}
                  value={formData.kshetra_id}
                  onChange={(val) => setFormData({...formData, kshetra_id: val, mandal_id: ''})}
                  placeholder="Select Kshetra..."
                />
              </div>
            )}
            {!isSanchalak && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Mandal (Local) <span className="text-red-500">*</span></label>
                <Select
                  options={(isAdmin && formData.kshetra_id ? mandals.filter(m => m.kshetra_id === formData.kshetra_id) : mandals).map(m => ({ value: m.id, label: m.name }))}
                  value={formData.mandal_id}
                  onChange={(val) => setFormData({...formData, mandal_id: val})}
                  placeholder="Select Mandal..."
                />
              </div>
            )}
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Designation <span className="text-red-500">*</span></label>
              <Select
                options={[
                  { label: 'Nirdeshak', value: 'Nirdeshak', level: 1 },
                  { label: 'Nirikshak', value: 'Nirikshak', level: 2 },
                  { label: 'Sanchalak', value: 'Sanchalak', level: 3 },
                  { label: 'Sah Sanchalak', value: 'Sah Sanchalak', level: 4 },
                  { label: 'Sampark Karyakar', value: 'Sampark Karyakar', level: 5 },
                  { label: formData.gender === 'Yuvati' ? 'Yuvati' : 'Yuvak', value: formData.gender === 'Yuvati' ? 'Yuvati' : 'Yuvak', level: 6 }
                ].filter(d => userLevel === 0 || d.level > userLevel)}
                value={formData.designation}
                onChange={(val) => setFormData({...formData, designation: val})}
                placeholder="Select Designation..."
              />
            </div>

            {isAdmin && (
              <div className="col-span-2 sm:col-span-1">
                <label className={labelClass}>Gender <span className="text-red-500">*</span></label>
                <Radio
                  options={[
                    { value: 'Yuvak', label: 'Yuvak' },
                    { value: 'Yuvati', label: 'Yuvati' }
                  ]}
                  value={formData.gender}
                  onChange={(val) => setFormData({...formData, gender: val})}
                  direction="horizontal"
                  required
                />
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