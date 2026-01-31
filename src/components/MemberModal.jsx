import React, { useEffect, useState } from "react";
import { X, Save, Tag } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export default function MemberModal({ isOpen, onClose, memberToEdit, onSave }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [mandals, setMandals] = useState([]);
  const [kshetras, setKshetras] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    surname: "",
    father_name: "",
    mobile_number: "",
    designation: "Yuvak",
    gender: "Yuvak",
    mandal_id: "",
    kshetra_id: "",
  });

  const [selectedTags, setSelectedTags] = useState(new Set());

  const userRole = (profile?.role || "").toLowerCase();
  
  // Logic to determine what to show/hide
  const isSanchalakOrNirikshak = ["sanchalak", "nirikshak"].includes(userRole);
  const isNirdeshak = userRole === "nirdeshak";
  const isAdmin = userRole === "admin";

  useEffect(() => {
    const fetchData = async () => {
      const { data: mData } = await supabase.from("mandals").select("id, name");
      const { data: kData } = await supabase.from("kshetras").select("id, name");
      const { data: tData } = await supabase.from("tags").select("id, name, color");

      setMandals(mData || []);
      setKshetras(kData || []);
      setAvailableTags(tData || []);
    };
    if (isOpen) fetchData();
  }, [isOpen]);

  useEffect(() => {
    if (memberToEdit) {
      setFormData({
        id: memberToEdit.id || "",
        name: memberToEdit.name || "",
        surname: memberToEdit.surname || "",
        father_name: memberToEdit.father_name || "",
        mobile_number: memberToEdit.mobile_number || "",
        designation: memberToEdit.designation || "Yuvak",
        gender: memberToEdit.gender || "Yuvak",
        mandal_id: memberToEdit.mandal_id || "",
        kshetra_id: memberToEdit.kshetra_id || "",
      });

      const fetchMemberTags = async () => {
        const { data } = await supabase
          .from("entity_tags")
          .select("tag_id")
          .eq("entity_id", memberToEdit.id)
          .eq("entity_type", "Member");
        if (data) setSelectedTags(new Set(data.map((t) => t.tag_id)));
      };
      fetchMemberTags();
    } else {
      // ✅ AUTOFILL LOGIC & GENDER LOCK
      setFormData({
        id: "",
        name: "",
        surname: "",
        father_name: "",
        mobile_number: "",
        designation: "Yuvak",
        gender: profile?.gender || "Yuvak", // Auto-filled from leader's gender
        mandal_id: isSanchalakOrNirikshak ? profile?.mandal_id : "",
        kshetra_id: (isNirdeshak || isSanchalakOrNirikshak) ? profile?.kshetra_id : "",
      });
      setSelectedTags(new Set());
    }
  }, [memberToEdit, isOpen, profile, userRole, isSanchalakOrNirikshak, isNirdeshak]);

  const generateId = (name, surname) => {
    const prefix = (name.charAt(0) + surname.charAt(0)).toUpperCase();
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `${prefix}${randomNum}`;
  };

  const toggleTag = (tagId) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tagId)) newTags.delete(tagId);
    else newTags.add(tagId);
    setSelectedTags(newTags);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.surname) return alert("Name and Surname required");
    setLoading(true);

    const selectedMandal = mandals.find((m) => m.id === formData.mandal_id)?.name || null;
    const selectedKshetra = kshetras.find((k) => k.id === formData.kshetra_id)?.name || null;
    const finalId = memberToEdit ? formData.id : generateId(formData.name, formData.surname);

    const payload = {
      id: finalId,
      name: formData.name,
      surname: formData.surname,
      father_name: formData.father_name || null,
      mobile_number: formData.mobile_number || null,
      designation: formData.designation,
      gender: formData.gender,
      mandal_id: formData.mandal_id || null,
      kshetra_id: formData.kshetra_id || null,
      mandal: selectedMandal,
      kshetra: selectedKshetra,
    };

    let error;
    if (memberToEdit) {
      const { error: err } = await supabase.from("members").update(payload).eq("id", memberToEdit.id);
      error = err;
    } else {
      const { error: err } = await supabase.from("members").insert([payload]);
      error = err;
    }

    if (error) {
      alert("Error saving member: " + error.message);
      setLoading(false);
      return;
    }

    await supabase.from("entity_tags").delete().eq("entity_id", finalId).eq("entity_type", "Member");
    if (selectedTags.size > 0) {
      const tagInserts = Array.from(selectedTags).map((tagId) => ({
        entity_id: finalId,
        entity_type: "Member",
        tag_id: tagId,
      }));
      await supabase.from("entity_tags").insert(tagInserts);
    }

    setLoading(false);
    onSave(finalId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#002B3D] p-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg">{memberToEdit ? "Edit Profile" : "New Member"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Personal Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">First Name</label>
                <input className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="First Name" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Surname</label>
                <input className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-[#002B3D]" value={formData.surname} onChange={(e) => setFormData({ ...formData, surname: e.target.value })} placeholder="Surname" />
              </div>
            </div>
            <input className="w-full p-3 border border-slate-200 rounded-xl outline-none" value={formData.father_name} onChange={(e) => setFormData({ ...formData, father_name: e.target.value })} placeholder="Father's Name" />
            <input className="w-full p-3 border border-slate-200 rounded-xl outline-none" value={formData.mobile_number} onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })} placeholder="Mobile Number" />
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Organization</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Designation</label>
                <select className="w-full p-3 border border-slate-200 rounded-xl bg-white" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })}>
                  {["Nirdeshak", "Nirikshak", "Sanchalak", "Sah Sanchalak", "Sampark Karyakar", "Yuvak"].map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
              
              {/* ✅ GENDER DROPDOWN: Hidden for leaders, shown only for Admin */}
              {isAdmin && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Gender</label>
                  <select className="w-full p-3 border border-slate-200 rounded-xl bg-white" value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}>
                    <option value="Yuvak">Yuvak</option>
                    <option value="Yuvati">Yuvati</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* ✅ KSHETRA DROPDOWN: Hidden for Nirdeshak/Sanchalak/Nirikshak */}
              {isAdmin && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Kshetra</label>
                  <select 
                    className="w-full p-3 border rounded-xl bg-white"
                    value={formData.kshetra_id} 
                    onChange={(e) => setFormData({ ...formData, kshetra_id: e.target.value })}
                  >
                    <option value="">Select Kshetra...</option>
                    {kshetras.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
                  </select>
                </div>
              )}

              {/* ✅ MANDAL DROPDOWN: Hidden for Sanchalak/Nirikshak */}
              {(isAdmin || isNirdeshak) && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Mandal</label>
                  <select 
                    className="w-full p-3 border rounded-xl bg-white"
                    value={formData.mandal_id} 
                    onChange={(e) => setFormData({ ...formData, mandal_id: e.target.value })}
                  >
                    <option value="">Select Mandal...</option>
                    {mandals.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-1 flex items-center gap-2"><Tag size={14} /> Assign Tags</h4>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selectedTags.has(tag.id) ? "bg-[#002B3D] text-white border-[#002B3D]" : "bg-white text-slate-600 border-slate-200"}`}>{tag.name}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="px-6 py-3 bg-[#002B3D] text-white font-bold rounded-xl hover:bg-[#0b3d52] flex items-center gap-2 shadow-lg">
            <Save size={18} /> {loading ? "Saving..." : "Save Member"}
          </button>
        </div>
      </div>
    </div>
  );
}