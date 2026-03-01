import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Loader2, Shield, Search, UserPlus, Trash2, Edit3, Mail, MapPin, CheckCircle, Copy } from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";

// --- GHOST CLIENT FOR BACKGROUND AUTH CREATION ---
const isProduction = import.meta.env.PROD;
const GHOST_SUPABASE_URL = isProduction 
  ? `${window.location.origin}/supabase-api` 
  : import.meta.env.VITE_SUPABASE_URL;

const GHOST_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ghostClient = createClient(GHOST_SUPABASE_URL, GHOST_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }});
export default function ProjectStaff({ project, isAdmin, isCoordinator }) {
  const queryClient = useQueryClient();
  const canManageStaff = isAdmin || isCoordinator;

  const [searchTerm, setSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null); // For Add Modal
  const [editingAssignment, setEditingAssignment] = useState(null); // For Edit Modal
  const [newCredentials, setNewCredentials] = useState(null); // For Success Modal

  const [projectRole, setProjectRole] = useState("volunteer");
  const [dataScope, setDataScope] = useState("Mandal");
  const [assigning, setAssigning] = useState(false);

  // 1. Fetch Staff
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['project-staff', project.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_assignments").select(`id, role, data_scope, user_profiles(id, full_name, email, role)`).eq("project_id", project.id);
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Member Search Debounce
  useEffect(() => {
    if (!searchTerm) { setMemberResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from('members').select('id, name, surname, internal_code, mandals(name), designation, gender, mandal_id').or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%`).limit(5);
      setMemberResults(data || []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$&";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  // 3. Grant Access Logic
  const handleGrantAccess = async (e) => {
    e.preventDefault();
    setAssigning(true);
    try {
      let targetAuthId = null;
      let generatedPassword = null;
      let generatedEmail = null;

      const { data: existingProfile } = await supabase.from("user_profiles").select("id, email").eq("member_id", selectedMember.id).maybeSingle();

      if (existingProfile) {
        targetAuthId = existingProfile.id;
        const { data: existingAssign } = await supabase.from("project_assignments").select("id").eq("project_id", project.id).eq("user_id", targetAuthId).maybeSingle();
        if (existingAssign) throw new Error(`${selectedMember.name} is already assigned!`);
      } else {
        generatedPassword = generatePassword();
        generatedEmail = `${selectedMember.internal_code.toLowerCase()}@keshav.app`;

        const { data: authData, error: authError } = await ghostClient.auth.signUp({ email: generatedEmail, password: generatedPassword });
        if (authError) throw new Error("Auth creation failed");
        targetAuthId = authData.user.id;

        await supabase.from("user_profiles").insert({
          id: targetAuthId, member_id: selectedMember.id, email: generatedEmail,
          full_name: `${selectedMember.name} ${selectedMember.surname}`, role: "project_admin",
          gender: selectedMember.gender || "Yuvak", assigned_mandal_id: selectedMember.mandal_id,
        });
      }

      await supabase.from("project_assignments").insert({
        project_id: project.id, user_id: targetAuthId, role: projectRole, data_scope: dataScope, scope_mandal_ids: dataScope === "Mandal" ? [selectedMember.mandal_id] : null,
      });

      if (generatedPassword) {
        setNewCredentials({ name: `${selectedMember.name} ${selectedMember.surname}`, email: generatedEmail, password: generatedPassword });
      } else {
        alert(`Linked successfully. ${selectedMember.name} uses their existing login.`);
      }

      setSelectedMember(null);
      queryClient.invalidateQueries(['project-staff', project.id]);
      setSearchTerm("");
    } catch (err) { alert(err.message); } finally { setAssigning(false); }
  };

  // 4. Update Access Logic
  const handleUpdateAccess = async (e) => {
    e.preventDefault();
    setAssigning(true);
    try {
      await supabase.from("project_assignments").update({ role: projectRole, data_scope: dataScope }).eq("id", editingAssignment.id);
      setEditingAssignment(null);
      queryClient.invalidateQueries(['project-staff', project.id]);
    } catch (err) { alert(err.message); } finally { setAssigning(false); }
  };

  // 5. Remove Access
  const handleRemove = async (id) => {
    if (!confirm("Revoke access for this person?")) return;
    await supabase.from("project_assignments").delete().eq("id", id);
    queryClient.invalidateQueries(['project-staff', project.id]);
  };

  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";

  if (isLoading) return <div className="p-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={20}/> Loading staff...</div>;

  return (
    <div className="space-y-6">
      {/* Search Block */}
      {canManageStaff && (
        <div className="bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] relative z-20">
          <label className="block text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><UserPlus size={16} className="text-gray-400" /> Add Project Staff</label>
          <p className="text-xs text-gray-500 mb-3">Search directory. App logins will be generated automatically if needed.</p>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
            <input className={`${inputClass} pl-9`} placeholder="Search by name, ID, or mobile..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searching && <Loader2 className="absolute right-3 top-2.5 text-gray-400 animate-spin" size={16} strokeWidth={1.5} />}
          </div>

          {memberResults.length > 0 && (
            <div className="absolute left-4 right-4 mt-1 border border-gray-200 rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.08)] bg-white overflow-hidden max-h-60 overflow-y-auto z-50 divide-y divide-gray-100">
              {memberResults.map((m) => (
                <div key={m.id} className="p-3 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors" onClick={() => { setProjectRole("volunteer"); setDataScope("Mandal"); setSelectedMember(m); setMemberResults([]); setSearchTerm(""); }}>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{m.name} {m.surname} <Badge variant="default" className="ml-2">{m.designation}</Badge></div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2"><MapPin size={12}/> {m.mandals?.name} <span className="font-inter">({m.internal_code})</span></div>
                  </div>
                  <Button size="sm" variant="secondary">Configure</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff List */}
      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            <tr>
              <th className="px-4 py-3">Staff Member</th>
              <th className="px-4 py-3">Role & Scope</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assignments.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center text-gray-400 text-sm">No custom staff assigned. Admins have global access.</td></tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center font-inter font-bold text-gray-600 shrink-0">
                        {a.user_profiles?.full_name?.[0] || "U"}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{a.user_profiles?.full_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Mail size={10} strokeWidth={2}/> {a.user_profiles?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={a.role === "Coordinator" ? "primary" : "default"} className="mr-2">{a.role}</Badge>
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Scope: {a.data_scope}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManageStaff && (
                      <div className="flex justify-end gap-1 transition-opacity">
                        <button onClick={() => { setProjectRole(a.role); setDataScope(a.data_scope || "Mandal"); setEditingAssignment(a); }} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"><Edit3 size={16} strokeWidth={1.5} /></button>
                        <button onClick={() => handleRemove(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={16} strokeWidth={1.5} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal isOpen={!!selectedMember} onClose={() => setSelectedMember(null)} title={`Configure Role: ${selectedMember?.name}`}>
        <form onSubmit={handleGrantAccess} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Project Role</label>
              <select className={inputClass} value={projectRole} onChange={(e) => setProjectRole(e.target.value)}>
                <option value="Coordinator">Coordinator</option>
                <option value="Editor">Editor</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Data Scope</label>
              <select className={inputClass} value={dataScope} onChange={(e) => setDataScope(e.target.value)}>
                <option value="Mandal">Their Mandal</option>
                <option value="Kshetra">Their Kshetra</option>
                <option value="Global">Global All Data</option>
              </select>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelectedMember(null)} type="button">Cancel</Button>
            <Button type="submit" disabled={assigning}>{assigning ? <Loader2 className="animate-spin" size={16}/> : "Grant Access"}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editingAssignment} onClose={() => setEditingAssignment(null)} title={`Edit Role: ${editingAssignment?.user_profiles?.full_name}`}>
        <form onSubmit={handleUpdateAccess} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Project Role</label>
              <select className={inputClass} value={projectRole} onChange={(e) => setProjectRole(e.target.value)}>
                <option value="Coordinator">Coordinator</option>
                <option value="Editor">Editor</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Data Scope</label>
              <select className={inputClass} value={dataScope} onChange={(e) => setDataScope(e.target.value)}>
                <option value="Mandal">Their Mandal</option>
                <option value="Kshetra">Their Kshetra</option>
                <option value="Global">Global</option>
              </select>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingAssignment(null)} type="button">Cancel</Button>
            <Button type="submit" disabled={assigning}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* New Credentials Success Modal */}
      <Modal isOpen={!!newCredentials} onClose={() => setNewCredentials(null)} title="App Login Created!">
        {newCredentials && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle size={32} strokeWidth={1.5} />
            </div>
            <p className="text-gray-500 text-sm">A new app account was generated for this staff member.</p>
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 text-left space-y-3">
              <div>
                <span className={labelClass}>Login ID</span>
                <div className="font-inter font-bold text-gray-900 bg-white border border-gray-200 p-2 rounded-md">{newCredentials.email}</div>
              </div>
              <div>
                <span className={labelClass}>Temporary Password</span>
                <div className="font-inter font-bold text-[#5C3030] bg-[#5C3030]/10 border border-[#5C3030]/20 p-2 rounded-md">{newCredentials.password}</div>
              </div>
            </div>
            <Button className="w-full" icon={Copy} onClick={() => {
              navigator.clipboard.writeText(`App Login\nID: ${newCredentials.email}\nPass: ${newCredentials.password}`);
              alert("Copied to clipboard!");
            }}>Copy Credentials</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}