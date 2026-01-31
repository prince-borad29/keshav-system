import React, { useState, useEffect } from 'react';
import { X, Check, User, Phone, Tag, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DESIGNATION_OPTIONS = ['Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Yuvak'];
const MANDAL_OPTIONS = ['University Road', 'Pramukh Nagar', 'Gandhigram', 'Gunatit Nagar', 'Kalawad Road', 'Gurudev Park', 'Narayan Nagar', 'Marketing Yard', 'Vaniyavadi', 'Tirupati Park', 'Shri Hari Park', 'Gokul Park', 'Shraddha Park', 'Subhash Nagar'];
const KSHETRA_OPTIONS = ['Rajkot - 1 Yuva', 'Rajkot - 2 Yuva'];
const GENDER_OPTIONS = ['Yuvak', 'Yuvati'];

// --- REUSABLE COMPONENTS ---

const CustomSelect = ({ label, value, onChange, options, placeholder }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">{label}</label>
    <div className="relative group">
      <select 
        value={value} 
        onChange={onChange} 
        required
        className={`w-full p-3.5 pr-10 border rounded-xl outline-none appearance-none bg-slate-50 transition-all font-medium cursor-pointer ${
          value ? 'text-[#002B3D] border-slate-200 bg-white shadow-sm' : 'text-slate-400 border-slate-100'
        } focus:border-[#002B3D] focus:ring-1 focus:ring-[#002B3D] focus:bg-white`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => <option key={o} value={o} className="text-slate-800">{o}</option>)}
      </select>
      <ChevronDown 
        className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${value ? 'text-[#002B3D]' : 'text-slate-400'}`} 
        size={18} 
      />
    </div>
  </div>
);

// Added 'required' prop so we can control it individually
const CustomInput = ({ label, value, onChange, placeholder, type = "text", icon: Icon, required = true, isOptionalLabel = false }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
      {label} {isOptionalLabel && <span className="text-slate-400 font-normal lowercase"></span>}
    </label>
    <div className="relative group">
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#002B3D] transition-colors" size={18} />}
      
      <input 
        required={required} 
        type={type} 
        value={value || ''} // Handle null values safely
        onChange={onChange} 
        className={`w-full p-3.5 border rounded-xl outline-none transition-all font-medium text-[#002B3D] placeholder:text-slate-400
          ${Icon ? 'pl-11' : 'pl-4'} pr-10
          ${value ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50'}
          focus:border-[#002B3D] focus:ring-1 focus:ring-[#002B3D] focus:bg-white`} 
        placeholder={placeholder} 
      />
      
      {value && value.toString().length > 0 && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-slate-100 transition-all"
        >
          <X size={16} />
        </button>
      )}
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export default function MemberModal({ isOpen, onClose, memberToEdit, onSave }) {
  const [formData, setFormData] = useState({
    name: '', surname: '', father_name: '', mobile_number: '',
    mandal: '', kshetra: '', designation: '', gender: ''
  });
  
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedContexts, setSelectedContexts] = useState([]); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchTags = async () => {
        const { data } = await supabase.from('tags').select('*');
        if (data) {
          const memberTags = data.filter(t => t.contexts?.includes('Member'));
          setAvailableTags(memberTags);
        }
      };
      fetchTags();
    }
  }, [isOpen]);

  useEffect(() => {
    if (memberToEdit) {
      setFormData({
        name: memberToEdit.name || '',
        surname: memberToEdit.surname || '',
        father_name: memberToEdit.father_name || '', // Can be null now
        mobile_number: memberToEdit.mobile_number || '',
        mandal: memberToEdit.mandal || '',
        kshetra: memberToEdit.kshetra || '',
        designation: memberToEdit.designation || '',
        gender: memberToEdit.gender || ''
      });
      const currentTags = memberToEdit.entity_tags?.map(et => et.tag_id) || [];
      setSelectedContexts(currentTags);
    } else {
      setFormData({ name: '', surname: '', father_name: '', mobile_number: '', mandal: '', kshetra: '', designation: '', gender: '' });
      setSelectedContexts([]);
    }
  }, [memberToEdit, isOpen]);

  const toggleTag = (id) => setSelectedContexts(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const generateId = () => {
    // ID generation only relies on Name, Surname, and Mobile. Father Name is irrelevant here.
    const { name, surname, mobile_number } = formData;
    if (!name || !surname || !mobile_number || mobile_number.length < 5) return null;
    return `${name[0].toUpperCase()}${surname[0].toUpperCase()}${mobile_number.slice(-5)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let finalId = memberToEdit ? memberToEdit.id : generateId();
      
      // Strict Check: Ensure core fields exist
      if (!finalId) throw new Error("Name, Surname, and valid Mobile (5+ digits) required.");

      // Prepare payload (convert empty strings to null for father_name if preferred, or keep as '')
      const payload = { 
        id: finalId, 
        ...formData,
        // Optional: Ensure father_name is saved as NULL if empty string
        father_name: formData.father_name ? formData.father_name : null 
      };
      
      if (memberToEdit) {
        await supabase.from('members').update(payload).eq('id', finalId);
      } else {
        await supabase.from('members').insert([payload]);
      }

      // Handle Tags
      await supabase.from('entity_tags').delete().eq('entity_id', finalId);
      
      if (selectedContexts.length > 0) {
        const tagInserts = selectedContexts.map(tagId => ({ 
          entity_id: finalId, 
          tag_id: tagId, 
          entity_type: 'Member' 
        }));
        await supabase.from('entity_tags').insert(tagInserts);
      }

      onSave(); 
      onClose();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#002B3D] p-5 flex justify-between items-center text-white shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <User size={24} className="text-sky-300"/> 
            {memberToEdit ? 'Edit Profile' : 'New Member'}
          </h2>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto p-6 flex-1">
          <form id="memberForm" onSubmit={handleSubmit} className="space-y-8">
            
            {/* Section 1: Personal Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#002B3D] uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                <User size={16} /> Personal Info
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* ✅ SWAPPED: Surname First, then Name */}
                <CustomInput label="Surname" value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} placeholder="Enter Surname" />
                <CustomInput label="First Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Enter Name" />
                
                {/* ✅ FATHER NAME: Not Required + Label Update */}
                <CustomInput 
                  label="Father Name" 
                  value={formData.father_name} 
                  onChange={e => setFormData({...formData, father_name: e.target.value})} 
                  placeholder="Enter Father Name" 
                  required={false} 
                  isOptionalLabel={true}
                />
                
                <CustomInput label="Mobile Number" type="number" icon={Phone} value={formData.mobile_number} onChange={e => setFormData({...formData, mobile_number: e.target.value})} placeholder="Enter Mobile" />
              </div>
            </div>

            {/* Section 2: Organization */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#002B3D] uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                <Tag size={16} /> Organization Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <CustomSelect label="Designation" value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} options={DESIGNATION_OPTIONS} placeholder="Select Designation" />
                <CustomSelect label="Gender" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} options={GENDER_OPTIONS} placeholder="Select Gender" />
                <CustomSelect label="Mandal" value={formData.mandal} onChange={e => setFormData({...formData, mandal: e.target.value})} options={MANDAL_OPTIONS} placeholder="Select Mandal" />
                <CustomSelect label="Kshetra" value={formData.kshetra} onChange={e => setFormData({...formData, kshetra: e.target.value})} options={KSHETRA_OPTIONS} placeholder="Select Kshetra" />
              </div>
            </div>

            {/* Section 3: Tags */}
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-[#002B3D] uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                <Check size={16} /> Assign Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {availableTags.length === 0 && <span className="text-sm text-slate-400 italic">No tags available.</span>}
                {availableTags.map(tag => {
                  const isSelected = selectedContexts.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border shadow-sm flex items-center gap-2 ${
                        isSelected 
                          ? 'text-white border-transparent scale-105 shadow-md ring-2 ring-offset-1 ring-slate-200' 
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      style={{ backgroundColor: isSelected ? tag.color : undefined }}
                    >
                      {tag.name} {isSelected && <Check size={14} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <button form="memberForm" disabled={loading} className="px-8 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#155e7a] disabled:opacity-70 shadow-lg shadow-sky-900/20">
            {loading ? 'Saving...' : 'Save Member'}
          </button>
        </div>
      </div>
    </div>
  );
}