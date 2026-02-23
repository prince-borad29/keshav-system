import React from "react";
import { X, MapPin, Calendar, Phone, Hash, User, Briefcase, Flag, Edit3, Printer, Shield, Globe, Tag } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";

export default function MemberProfile({ member, isOpen, onClose, onEdit }) {
  if (!isOpen || !member) return null;

  // Formatting Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "Not Provided";
    return new Date(dateString).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const getAge = (dateString) => {
    if (!dateString) return "";
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return `(${age} yrs)`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* HEADER */}
        <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex justify-between items-start">
          <div className="flex gap-5 items-center">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold shadow-sm border-4 border-white ${member.gender === "Yuvati" ? "bg-pink-100 text-pink-600" : "bg-indigo-100 text-indigo-600"}`}>
              {member.name[0]}{member.surname[0]}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                {member.name} {member.surname}
                {member.is_guest && <Badge variant="warning">Guest</Badge>}
              </h2>
              <div className="flex items-center gap-3 text-slate-500 mt-2">
                <Badge variant="primary">{member.designation}</Badge>
                <span className="text-sm font-mono flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200">
                  <Hash size={12} /> {member.internal_code}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-400 hover:text-slate-700">
            <X size={24} />
          </button>
        </div>

        {/* BODY - SCROLLABLE */}
        <div className="p-8 overflow-y-auto space-y-8 flex-1 bg-white">
          
          {/* 1. PERSONAL DETAILS */}
          <section>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><User size={14} /> Personal Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="info-group">
                <label>Full Name</label>
                <p className="text-lg">{member.name} {member.father_name} {member.surname}</p>
              </div>
              <div className="info-group">
                <label>Gender</label>
                <p>{member.gender}</p>
              </div>
              <div className="info-group">
                <label>Date of Birth</label>
                <p className="flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" />
                  {formatDate(member.dob)} <span className="text-slate-400 text-sm font-normal">{getAge(member.dob)}</span>
                </p>
              </div>
              <div className="info-group">
                <label>Mobile Number</label>
                <p className="flex items-center gap-2 font-mono text-lg text-indigo-700">
                  <Phone size={16} className="text-indigo-400" /> {member.mobile || "N/A"}
                </p>
              </div>
              <div className="info-group md:col-span-2">
                <label>Address</label>
                <p className="flex items-start gap-2">
                  <MapPin size={16} className="text-slate-400 mt-1 flex-shrink-0" />
                  {member.address || "No address provided"}
                </p>
              </div>
            </div>
          </section>

          {/* 2. ORGANIZATION */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Shield size={14} /> Organization Scope</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-colors">
                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Local Mandal</label>
                <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Flag size={20} className="text-indigo-500" /> {member.mandals?.name || "Unassigned"}
                </div>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-colors">
                <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Regional Kshetra</label>
                <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Globe size={20} className="text-teal-500" /> {member.mandals?.kshetras?.name || "Unassigned"}
                </div>
              </div>
            </div>
          </section>

          {/* 3. TAGS */}
          <section>
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Tag size={14} /> Assigned Tags</h3>
             <div className="flex flex-wrap gap-2">
                {member.member_tags && member.member_tags.length > 0 ? (
                  member.member_tags.map((mt) => (
                    <span key={mt.tag_id} className="px-3 py-1.5 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"/> {mt.tags?.name}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-sm italic">No tags assigned.</span>
                )}
             </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => { onEdit(member); onClose(); }} icon={Edit3}>Edit Profile</Button>
          </div>
        </div>
      </div>

      <style>{`
        .info-group label { @apply block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wide; }
        .info-group p { @apply text-slate-800 font-bold; }
      `}</style>
    </div>
  );
}