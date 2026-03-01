import React from "react";
import { X, MapPin, Calendar, Phone, Hash, User, Shield, Tag } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";

export default function MemberProfile({ member, isOpen, onClose }) {
  if (!isOpen || !member) return null;

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
    <Modal isOpen={isOpen} onClose={onClose} title="Member Profile">
      <div className="space-y-6">
        
        {/* Header Block */}
        <div className="flex gap-4 items-center">
          <div className="w-16 h-16 rounded-md bg-gray-100 flex items-center justify-center text-2xl font-bold font-inter text-gray-600 border border-gray-200 shrink-0">
            {member.name[0]}{member.surname[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {member.name} {member.surname}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="primary">{member.designation}</Badge>
              {member.is_guest && <Badge variant="warning">Guest</Badge>}
              <span className="text-xs font-inter text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                <Hash size={10} strokeWidth={2}/> {member.internal_code}
              </span>
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Full Name</label>
            <p className="text-sm font-semibold text-gray-900">{member.name} {member.father_name} {member.surname}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Phone size={12}/> Mobile</label>
            <p className="text-sm font-inter font-semibold text-gray-900">{member.mobile || "N/A"}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Calendar size={12}/> Date of Birth</label>
            <p className="text-sm font-semibold text-gray-900">{formatDate(member.dob)} <span className="text-gray-500 font-normal">{getAge(member.dob)}</span></p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><User size={12}/> Gender</label>
            <p className="text-sm font-semibold text-gray-900">{member.gender}</p>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><MapPin size={12}/> Address</label>
            <p className="text-sm font-medium text-gray-700">{member.address || "No address provided"}</p>
          </div>
        </div>

        <div className="h-px bg-gray-100 w-full" />

        {/* Organization */}
        <div className="space-y-3">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Shield size={12}/> Organization Scope</label>
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200 flex flex-col sm:flex-row gap-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
            <div className="flex-1 pt-0 sm:pt-0">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">Local Mandal</span>
              <span className="text-sm font-bold text-gray-900">{member.mandals?.name || "Unassigned"}</span>
            </div>
            <div className="flex-1 pt-3 sm:pt-0 sm:pl-4">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">Regional Kshetra</span>
              <span className="text-sm font-bold text-gray-900">{member.mandals?.kshetras?.name || "Unassigned"}</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Tag size={12}/> Assigned Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {member.member_tags && member.member_tags.length > 0 ? (
              member.member_tags.map((mt) => (
                <span key={mt.tag_id} className="px-2 py-1 bg-white text-gray-700 text-xs font-semibold rounded border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"/> {mt.tags?.name}
                </span>
              ))
            ) : (
              <span className="text-gray-400 text-xs italic font-medium">No tags assigned.</span>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}