import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Users, UserPlus, Search, CheckCircle, X, Copy, Globe, Edit3, Trash2, Loader2, Layers, Shield, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";

// --- GHOST CLIENT FOR BACKGROUND AUTH CREATION ---
const GHOST_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const GHOST_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ghostClient = createClient(GHOST_SUPABASE_URL, GHOST_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }});

const initialSystemForm = { role: "sanchalak", email: "", password: "", full_name: "", member_id: null, gender: "Yuvak", assigned_mandal_id: "", assigned_mandals: [] };
const initialProjectForm = { user_id: null, member_id: null, member_data: null, project_id: "", role: "volunteer", scope_type: "Mandal", selected_kshetra: "", scope_mandal_ids: [] };

export default function UserManager() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [activeTab, setActiveTab] = useState("system");
  
  // Modal States
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Data
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [kshetras, setKshetras] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Created Creds
  const [createdCredentials, setCreatedCredentials] = useState([]);

  // Forms
  const [systemForm, setSystemForm] = useState(initialSystemForm);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [takerForm, setTakerForm] = useState({ count: 1, gender: "Yuvak", validity: "" });

  const systemUsersList = useMemo(() => users.filter((u) => ["admin", "nirdeshak", "nirikshak", "sanchalak"].includes(u.role)), [users]);
  const takersList = useMemo(() => users.filter((u) => u.role === "taker"), [users]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [usersRes, mandalsRes, projectsRes, kshetrasRes, assignmentsRes] = await Promise.all([
        supabase.from("user_profiles").select(`id, full_name, email, role, gender, member_id, assigned_mandal_id, expires_at, members!user_profiles_member_id_fkey(name, surname), mandals!user_profiles_assigned_mandal_id_fkey(name)`).order("created_at", { ascending: false }),
        supabase.from("mandals").select("id, name, kshetra_id").order("name"),
        supabase.from("projects").select("id, name").eq("is_active", true),
        supabase.from("kshetras").select("id, name").order("name"),
        // 🛑 FIXED: Removed 'gender_scope' and 'permissions' to match your exact Database Schema
        supabase.from("project_assignments").select(`id, role, data_scope, scope_mandal_ids, project_id, user_id, projects(id, name), user_profiles(id, full_name, email, role)`).order("created_at", { ascending: false }),
      ]);

      // Explicit Error Logging to prevent silent failures
      if (assignmentsRes.error) console.error("Project Staff DB Error:", assignmentsRes.error);
      if (usersRes.error) console.error("Users DB Error:", usersRes.error);

      setUsers(usersRes.data || []);
      setMandals(mandalsRes.data || []);
      setProjects(projectsRes.data || []);
      setKshetras(kshetrasRes.data || []);
      setProjectAssignments(assignmentsRes.data || []);
    } catch (e) {
      setErrorMessage("Failed to load data. " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Debounced Member Search
  useEffect(() => {
    if (searchTerm.length < 2) { setMemberResults([]); return; }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("members").select("id, name, surname, gender, designation, mobile, mandal_id, mandals(name)").or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%`).limit(5);
      setMemberResults(data || []);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const resetForms = useCallback(() => {
    setSystemForm(initialSystemForm);
    setProjectForm(initialProjectForm);
    setTakerForm({ count: 1, gender: "Yuvak", validity: "" });
    setSearchTerm("");
    setEditingId(null);
    setErrorMessage("");
    setIsSystemModalOpen(false);
    setIsProjectModalOpen(false);
    setIsFieldModalOpen(false);
  }, []);

  const selectMember = useCallback((m) => {
    const fullName = `${m.name} ${m.surname}`;
    if (isSystemModalOpen) {
      setSearchTerm(fullName);
      let role = "sanchalak";
      if (m.designation === "Nirikshak") role = "nirikshak";
      if (m.designation === "Nirdeshak") role = "nirdeshak";

      setSystemForm((prev) => ({ ...prev, member_id: m.id, full_name: fullName, email: m.mobile ? `${m.mobile}@keshav.app` : "", role, gender: m.gender || "Yuvak", assigned_mandal_id: m.mandal_id || "", assigned_mandals: m.mandal_id ? [m.mandal_id] : [] }));
    } else if (isProjectModalOpen) {
      const existingUser = users.find((u) => u.member_id === m.id);
      if (existingUser) {
        setProjectForm((prev) => ({ ...prev, user_id: existingUser.id, member_id: null, member_data: null }));
        setSearchTerm(`${existingUser.full_name} (Has Account)`);
      } else {
        setProjectForm((prev) => ({ ...prev, user_id: null, member_id: m.id, member_data: m }));
        setSearchTerm(`${fullName} (New Volunteer)`);
      }
    }
    setMemberResults([]);
  }, [isSystemModalOpen, isProjectModalOpen, users]);

  // ACTIONS
  const handleSystemUser = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setErrorMessage("");
    try {
      if (!editingId) {
        const password = systemForm.password || Math.random().toString(36).slice(-8) + "Aa1@";
        const { data: auth, error: authError } = await supabase.auth.signUp({ email: systemForm.email.trim(), password, options: { data: { full_name: systemForm.full_name, role: systemForm.role } } });
        if (authError && !authError.message.includes("already registered")) throw authError;
        const userId = auth?.user?.id || crypto.randomUUID();

        await supabase.from("user_profiles").insert({
          id: userId, full_name: systemForm.full_name.trim(), role: systemForm.role, email: systemForm.email.trim(), gender: systemForm.gender, member_id: systemForm.member_id || null, assigned_mandal_id: systemForm.role === "sanchalak" ? systemForm.assigned_mandal_id || null : null,
        });

        if (systemForm.role === "nirikshak" && systemForm.assigned_mandals.length > 0) {
          const assignments = systemForm.assigned_mandals.map((mId) => ({ nirikshak_id: userId, mandal_id: mId }));
          await supabase.from("nirikshak_assignments").insert(assignments);
        }

        setCreatedCredentials([{ name: systemForm.full_name, email: systemForm.email, password }]);
      } else {
        await supabase.from("user_profiles").update({ role: systemForm.role, full_name: systemForm.full_name?.trim(), assigned_mandal_id: systemForm.role === "sanchalak" ? systemForm.assigned_mandal_id : null }).eq("id", editingId);
        await supabase.from("nirikshak_assignments").delete().eq("nirikshak_id", editingId);
        
        if (systemForm.role === "nirikshak" && systemForm.assigned_mandals.length > 0) {
          const assignments = systemForm.assigned_mandals.map((mId) => ({ nirikshak_id: editingId, mandal_id: mId }));
          await supabase.from("nirikshak_assignments").insert(assignments);
        }
      }
      resetForms();
      refreshData();
    } catch (err) { setErrorMessage(err.message); } finally { setProcessing(false); }
  };

  const handleProjectStaff = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setErrorMessage("");
    try {
      let finalMandals = [];
      if (projectForm.scope_type === "Kshetra") {
        finalMandals = mandals.filter((m) => m.kshetra_id === projectForm.selected_kshetra).map((m) => m.id);
      } else if (projectForm.scope_type === "Mandal") {
        finalMandals = projectForm.scope_mandal_ids;
      }

      let targetUserId = projectForm.user_id;
      if (!editingId && !targetUserId && projectForm.member_id) {
        const m = projectForm.member_data;
        const { data: existing } = await supabase.from("user_profiles").select("id").eq("member_id", m.id).maybeSingle();

        if (existing) { targetUserId = existing.id; } 
        else {
          const email = m.mobile ? `${m.mobile}@keshav.app` : `vol.${m.id.split("-")[0]}@keshav.app`;
          const password = Math.random().toString(36).slice(-8) + "Aa1@";
          const { data: auth, error: authError } = await ghostClient.auth.signUp({ email, password });
          if (authError) throw authError;
          targetUserId = auth.user.id;

          await supabase.from("user_profiles").insert({ id: targetUserId, full_name: `${m.name} ${m.surname}`, email, role: "volunteer", gender: m.gender, member_id: m.id });
          setCreatedCredentials([{ name: `${m.name} ${m.surname}`, email, password }]);
        }
      }

      // 🛑 FIXED: Payload strictly aligns with database
      const payload = { project_id: projectForm.project_id, user_id: targetUserId, role: projectForm.role, scope_mandal_ids: finalMandals, data_scope: projectForm.scope_type };

      if (!editingId) await supabase.from("project_assignments").insert(payload);
      else await supabase.from("project_assignments").update(payload).eq("id", editingId);

      if(createdCredentials.length === 0) resetForms();
      refreshData();
    } catch (err) { setErrorMessage(err.message); } finally { setProcessing(false); }
  };

  const createBulkTakers = async (e) => {
    e.preventDefault();
    setProcessing(true);
    const newCreds = [];
    try {
      let expiresAt = null;
      if (takerForm.validity) {
        const date = new Date();
        date.setHours(date.getHours() + parseInt(takerForm.validity));
        expiresAt = date.toISOString();
      }

      for (let i = 0; i < takerForm.count; i++) {
        const suffix = Math.floor(1000 + Math.random() * 9000);
        const email = `taker.${suffix}@keshav.app`;
        const password = `Keshav@${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: auth } = await ghostClient.auth.signUp({ email, password });
        const userId = auth.user.id;

        await supabase.from("user_profiles").insert({ id: userId, full_name: `Taker ${suffix}`, role: "taker", email, gender: takerForm.gender, expires_at: expiresAt });
        newCreds.push({ name: `Taker ${suffix}`, email, password });
      }
      setCreatedCredentials(newCreds);
    } catch (err) { setErrorMessage(err.message); } finally { setProcessing(false); }
  };

  const handleDelete = async (id, type) => {
    try {
      if (type === "system_user") {
        if (!confirm("Delete System User? Assignments will be removed.")) return;
        await Promise.all([ supabase.from("project_assignments").delete().eq("user_id", id), supabase.from("nirikshak_assignments").delete().eq("nirikshak_id", id) ]);
        await supabase.from("user_profiles").delete().eq("id", id);
      } else if (type === "project_staff") {
        if (!confirm("Remove from project?")) return;
        await supabase.from("project_assignments").delete().eq("id", id);
      } else if (type === "taker") {
        if (!confirm("Delete Taker account?")) return;
        await supabase.from("user_profiles").delete().eq("id", id);
      }
      refreshData();
    } catch (e) { alert(e.message); }
  };

  const openSystemEdit = async (user) => {
    setEditingId(user.id);
    let assignedMandals = [];
    if (user.role === "nirikshak") {
      const { data } = await supabase.from("nirikshak_assignments").select("mandal_id").eq("nirikshak_id", user.id);
      if (data) assignedMandals = data.map((d) => d.mandal_id);
    }
    setSystemForm({ role: user.role, assigned_mandal_id: user.assigned_mandal_id || "", email: user.email, full_name: user.full_name, assigned_mandals: assignedMandals, member_id: user.member_id, gender: user.gender || "Yuvak", password: "" });
    setSearchTerm(user.full_name);
    setIsSystemModalOpen(true);
  };

  const openProjectEdit = (assignment) => {
    setEditingId(assignment.id);
    setProjectForm({ user_id: assignment.user_id, member_id: null, member_data: null, project_id: assignment.project_id, role: assignment.role || "volunteer", scope_type: assignment.data_scope || "Mandal", scope_mandal_ids: assignment.scope_mandal_ids || [], selected_kshetra: "" });
    setSearchTerm(assignment.user_profiles?.full_name || "");
    setIsProjectModalOpen(true);
  };

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";
  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";

  return (
    <div className="space-y-4">
      {/* TAB HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-3 border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex gap-1 overflow-x-auto w-full sm:w-auto bg-gray-100 p-1 rounded-md border border-gray-200">
          {[
            { id: "system", label: "System Admins", count: systemUsersList.length },
            { id: "project", label: "Project Staff", count: projectAssignments.length },
            { id: "field", label: "Temp Takers", count: takersList.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? "bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" : "text-gray-500 hover:text-gray-700"}`}
            >
              {tab.label} <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="secondary" size="sm" onClick={refreshData} disabled={loading} className="!px-3"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></Button>
          <Button size="sm" icon={UserPlus} onClick={() => {
            resetForms();
            if (activeTab === 'system') setIsSystemModalOpen(true);
            if (activeTab === 'project') setIsProjectModalOpen(true);
            if (activeTab === 'field') setIsFieldModalOpen(true);
          }}>
            {activeTab === 'field' ? 'Generate' : 'Add User'}
          </Button>
        </div>
      </div>

      {/* DATA TABLES */}
      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16}/> Loading users...</div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              <tr>
                {activeTab === 'system' && <><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Scope</th></>}
                {activeTab === 'project' && <><th className="px-4 py-3">Project</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Scope</th></>}
                {activeTab === 'field' && <><th className="px-4 py-3">Name</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Expires</th></>}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeTab === 'system' && systemUsersList.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-gray-400 text-sm">No system users found.</td></tr>
              )}
              {activeTab === 'system' && systemUsersList.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{u.full_name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant={u.role === 'admin' ? 'danger' : 'primary'}>{u.role}</Badge></td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-medium">{u.mandals?.name || (u.role === "nirikshak" ? "Multi" : "Global")}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openSystemEdit(u)} className="p-1.5 text-gray-400 hover:text-[#5C3030] rounded-md transition-colors"><Edit3 size={14}/></button>
                      <button onClick={() => handleDelete(u.id, "system_user")} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}

              {activeTab === 'project' && projectAssignments.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-gray-400 text-sm">No project staff assigned.</td></tr>
              )}
              {activeTab === 'project' && projectAssignments.map(pa => (
                <tr key={pa.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 font-semibold text-gray-900">{pa.projects?.name}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{pa.user_profiles?.full_name}</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">{pa.user_profiles?.role}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-medium">{pa.data_scope}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openProjectEdit(pa)} className="p-1.5 text-gray-400 hover:text-[#5C3030] rounded-md transition-colors"><Edit3 size={14}/></button>
                      <button onClick={() => handleDelete(pa.id, "project_staff")} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}

              {activeTab === 'field' && takersList.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-gray-400 text-sm">No temp takers found.</td></tr>
              )}
              {activeTab === 'field' && takersList.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 font-semibold text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.gender} Only</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-inter">{u.expires_at ? new Date(u.expires_at).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3 text-right">
                     <button onClick={() => handleDelete(u.id, "taker")} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* --- MODALS --- */}
      <Modal isOpen={isSystemModalOpen} onClose={resetForms} title={editingId ? "Edit System User" : "Create System User"}>
        <form onSubmit={handleSystemUser} className="space-y-4">
          {errorMessage && <div className="text-red-700 text-xs font-semibold bg-red-50 border border-red-100 p-3 rounded-md flex items-center gap-2"><AlertTriangle size={14}/> {errorMessage}</div>}
          
          {!editingId && (
            <div className="relative">
              <label className={labelClass}>Link Member Profile</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
                <input className={`${inputClass} pl-9`} placeholder="Search member database..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {memberResults.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 shadow-lg rounded-md mt-1 overflow-hidden">
                  {memberResults.map((m) => (
                    <button key={m.id} type="button" onClick={() => selectMember(m)} className="w-full p-2.5 hover:bg-gray-50 text-left border-b border-gray-100 flex justify-between text-sm transition-colors">
                      <span className="font-semibold text-gray-800">{m.name} {m.surname}</span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{m.designation}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Full Name</label>
            <input required className={inputClass} value={systemForm.full_name} onChange={(e) => setSystemForm({ ...systemForm, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email Address</label>
              <input required type="email" className={inputClass} value={systemForm.email} readOnly={!!editingId} onChange={(e) => setSystemForm({ ...systemForm, email: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>System Role</label>
              <select className={`${inputClass} appearance-none`} value={systemForm.role} onChange={(e) => setSystemForm({ ...systemForm, role: e.target.value })}>
                <option value="sanchalak">Sanchalak</option>
                <option value="nirikshak">Nirikshak</option>
                <option value="nirdeshak">Nirdeshak</option>
                <option value="admin">Global Admin</option>
              </select>
            </div>
          </div>

          {systemForm.role === "sanchalak" && (
             <div>
               <label className={labelClass}>Assigned Mandal</label>
               <select className={`${inputClass} appearance-none`} value={systemForm.assigned_mandal_id} onChange={(e) => setSystemForm({ ...systemForm, assigned_mandal_id: e.target.value })}>
                 <option value="">Select...</option>
                 {mandals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
               </select>
             </div>
          )}

          {systemForm.role === "nirikshak" && (
             <div>
               <label className={labelClass}>Assigned Mandals</label>
               <div className="border border-gray-200 bg-gray-50 rounded-md p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1">
                 {mandals.map((m) => (
                   <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer text-xs font-medium text-gray-700 transition-colors">
                     <input type="checkbox" checked={systemForm.assigned_mandals.includes(m.id)} onChange={() => {
                         const list = systemForm.assigned_mandals.includes(m.id) ? systemForm.assigned_mandals.filter(id => id !== m.id) : [...systemForm.assigned_mandals, m.id];
                         setSystemForm({ ...systemForm, assigned_mandals: list });
                     }} className="rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" />
                     {m.name}
                   </label>
                 ))}
               </div>
             </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" disabled={processing}>{processing ? <Loader2 className="animate-spin" size={16}/> : 'Save User'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isProjectModalOpen} onClose={resetForms} title={editingId ? "Edit Project Staff" : "Assign Project Staff"}>
        <form onSubmit={handleProjectStaff} className="space-y-4">
          {errorMessage && <div className="text-red-700 text-xs font-semibold bg-red-50 border border-red-100 p-3 rounded-md flex items-center gap-2"><AlertTriangle size={14}/> {errorMessage}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>User / Member</label>
              {!editingId ? (
                <div className="relative">
                  <input className={inputClass} placeholder="Search database..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  {memberResults.length > 0 && (
                    <div className="absolute z-50 w-[200%] bg-white border border-gray-200 shadow-lg rounded-md mt-1 overflow-hidden">
                      {memberResults.map((m) => (
                        <button key={m.id} type="button" onClick={() => selectMember(m)} className="w-full p-2.5 hover:bg-gray-50 text-left border-b border-gray-100 text-sm transition-colors font-semibold text-gray-800">
                          {m.name} {m.surname}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input className={`${inputClass} bg-gray-50 text-gray-500`} value={searchTerm} readOnly />
              )}
            </div>
            <div>
              <label className={labelClass}>Project</label>
              <select className={`${inputClass} appearance-none`} value={projectForm.project_id} disabled={!!editingId} onChange={(e) => setProjectForm({ ...projectForm, project_id: e.target.value })}>
                <option value="">Select Project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-md border border-gray-200 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Data Scope</label>
              <select className={`${inputClass} mb-3 appearance-none`} value={projectForm.scope_type} onChange={(e) => setProjectForm({ ...projectForm, scope_type: e.target.value })}>
                <option value="Mandal">Mandal Level</option>
                <option value="Kshetra">Kshetra Level</option>
                <option value="Global">Global</option>
              </select>
              
              {projectForm.scope_type === "Kshetra" && (
                <select className={`${inputClass} appearance-none`} value={projectForm.selected_kshetra} onChange={(e) => setProjectForm({ ...projectForm, selected_kshetra: e.target.value })}>
                  <option value="">Select Kshetra...</option>
                  {kshetras.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              )}
              {projectForm.scope_type === "Mandal" && (
                <div className="border border-gray-200 bg-white rounded-md p-2 max-h-40 overflow-y-auto">
                  {mandals.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 p-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer transition-colors">
                      <input type="checkbox" checked={projectForm.scope_mandal_ids.includes(m.id)} onChange={() => {
                        const list = projectForm.scope_mandal_ids.includes(m.id) ? projectForm.scope_mandal_ids.filter(id => id !== m.id) : [...projectForm.scope_mandal_ids, m.id];
                        setProjectForm({ ...projectForm, scope_mandal_ids: list });
                      }} className="rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" />
                      {m.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" disabled={processing}>{processing ? <Loader2 className="animate-spin" size={16}/> : 'Save Assignment'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isFieldModalOpen} onClose={resetForms} title="Generate Temp Takers">
        <form onSubmit={createBulkTakers} className="space-y-4">
          {errorMessage && <div className="text-red-700 text-xs font-semibold bg-red-50 border border-red-100 p-3 rounded-md flex items-center gap-2"><AlertTriangle size={14}/> {errorMessage}</div>}
          <div className="grid grid-cols-3 gap-4">
             <div>
               <label className={labelClass}>Quantity</label>
               <input type="number" min="1" max="20" required className={inputClass} value={takerForm.count} onChange={(e) => setTakerForm({ ...takerForm, count: e.target.value })} />
             </div>
             <div>
               <label className={labelClass}>Gender</label>
               <select className={`${inputClass} appearance-none`} value={takerForm.gender} onChange={(e) => setTakerForm({ ...takerForm, gender: e.target.value })}>
                 <option>Yuvak</option>
                 <option>Yuvati</option>
               </select>
             </div>
             <div>
               <label className={labelClass}>Auto-Delete</label>
               <select className={`${inputClass} appearance-none`} value={takerForm.validity} onChange={(e) => setTakerForm({ ...takerForm, validity: e.target.value })}>
                 <option value="">Never</option>
                 <option value="12">12 Hours</option>
                 <option value="24">1 Day</option>
                 <option value="72">3 Days</option>
               </select>
             </div>
          </div>
          <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForms} type="button">Cancel</Button>
            <Button type="submit" disabled={processing}>{processing ? <Loader2 className="animate-spin" size={16}/> : 'Generate Accounts'}</Button>
          </div>
        </form>
      </Modal>

      {/* SUCCESS MODAL FOR CREDENTIALS */}
      <Modal isOpen={createdCredentials.length > 0} onClose={() => {setCreatedCredentials([]); resetForms();}} title="Credentials Generated">
        <div className="space-y-4">
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-md border border-emerald-200">
            <h3 className="font-bold mb-1 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-600"/> Success</h3>
            <p className="text-sm">Please copy and distribute these credentials securely.</p>
          </div>
          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
            {createdCredentials.map((c, i) => (
              <div key={i} className="p-3 bg-gray-50">
                <div className="font-bold text-gray-900 text-sm mb-1">{c.name}</div>
                <div className="flex justify-between items-center text-xs font-inter">
                  <span className="text-gray-500">{c.email}</span>
                  <span className="text-[#5C3030] font-bold px-2 py-0.5 bg-[#5C3030]/10 rounded border border-[#5C3030]/20">{c.password}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 flex justify-end gap-2">
             <Button icon={Copy} onClick={() => {
                navigator.clipboard.writeText(createdCredentials.map(c => `Login: ${c.email}\nPass: ${c.password}`).join('\n\n'));
                alert("Copied to clipboard");
             }}>Copy All</Button>
             <Button variant="secondary" onClick={() => {setCreatedCredentials([]); resetForms();}}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}