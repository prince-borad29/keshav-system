import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import {
  Loader2,
  Shield,
  Search,
  UserPlus,
  Trash2,
  Edit,
  Mail,
  CheckCircle,
  Copy,
  Key,
  UserCheck,
  MapPin,
  X,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";

// --- GHOST CLIENT FOR BACKGROUND AUTH CREATION ---
const GHOST_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const GHOST_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ghostClient = createClient(GHOST_SUPABASE_URL, GHOST_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default function ProjectStaff({ project, isAdmin, isCoordinator }) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);

  // Member Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Assignment Modal State (For ADDING)
  const [selectedMember, setSelectedMember] = useState(null);
  const [assigning, setAssigning] = useState(false);

  // Editing Modal State (For EDITING)
  const [editingAssignment, setEditingAssignment] = useState(null);

  // Shared Form State
  const [projectRole, setProjectRole] = useState("volunteer");
  const [dataScope, setDataScope] = useState("Mandal");

  // Credentials State
  const [newCredentials, setNewCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  // Helper variable for authorized managers
const canManageStaff = isAdmin || isCoordinator;
  useEffect(() => {
    fetchAssignments();
  }, [project.id]);

  useEffect(() => {
    let isMounted = true;
    
    const searchMembers = async () => {
      if (!searchTerm) {
         setSearchResults([]);
         return;
      }
      setSearching(true); // Your loading state
      
      try {
         // CRITICAL: Ensure you are using the standard `supabase` client for searching, NOT ghostClient!
         const { data, error } = await supabase
            .from('members')
            .select('id, name, surname, internal_code')
            .or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%`)
            .limit(10);
            
         if (error) throw error;
         
         if (isMounted) setSearchResults(data);
      } catch (err) {
         console.error(err);
      } finally {
         if (isMounted) setSearching(false); // Prevents infinite spinner on error
      }
    };

    const timer = setTimeout(() => { searchMembers(); }, 400); // Debounce
    
    return () => { 
      clearTimeout(timer); 
      isMounted = false; // Cancels state update if user keeps typing
    };
  }, [searchTerm]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("project_assignments")
        .select(
          `
          id, role, data_scope,
          user_profiles ( id, full_name, email, member_id, role )
        `,
        )
        .eq("project_id", project.id);

      setAssignments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars =
      "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$&";
    return Array.from(
      { length: 8 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    if (!canManageStaff) return;
    setAssigning(true);

    try {
      let targetAuthId = null;
      let generatedPassword = null;
      let generatedEmail = null;

      // 1. Check if this physical member ALREADY has an App Profile
      const { data: existingProfile } = await supabase
        .from("user_profiles")
        .select("id, email")
        .eq("member_id", selectedMember.id)
        .maybeSingle();

      if (existingProfile) {
        targetAuthId = existingProfile.id;
        const { data: existingAssignment } = await supabase
          .from("project_assignments")
          .select("id")
          .eq("project_id", project.id)
          .eq("user_id", targetAuthId)
          .maybeSingle();

        if (existingAssignment) {
          throw new Error(
            `${selectedMember.name} is already assigned to this project!`,
          );
        }
      } else {
        generatedPassword = generatePassword();
        generatedEmail = `${selectedMember.internal_code.toLowerCase()}@keshav.app`;

        const { data: authData, error: authError } =
          await ghostClient.auth.signUp({
            email: generatedEmail,
            password: generatedPassword,
          });

        if (authError)
          throw new Error("Auth creation failed: " + authError.message);
        targetAuthId = authData.user.id;

        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({
            id: targetAuthId,
            member_id: selectedMember.id,
            email: generatedEmail,
            full_name: `${selectedMember.name} ${selectedMember.surname}`,
            role: "project_admin",
            gender: selectedMember.gender || "Yuvak",
            assigned_mandal_id: selectedMember.mandal_id,
            assigned_kshetra_id: selectedMember.mandals?.kshetra_id,
          });

        if (profileError) throw new Error("Profile creation failed.");
      }

      let scopeMandalIds = null;
      if (dataScope === "Mandal") {
        scopeMandalIds = [selectedMember.mandal_id];
      }

      const { error: assignError } = await supabase
        .from("project_assignments")
        .insert({
          project_id: project.id,
          user_id: targetAuthId,
          role: projectRole,
          data_scope: dataScope,
          scope_mandal_ids: scopeMandalIds,
        });

      if (assignError)
        throw new Error("Assignment failed: " + assignError.message);

      if (generatedPassword) {
        setNewCredentials({
          name: `${selectedMember.name} ${selectedMember.surname}`,
          email: generatedEmail,
          password: generatedPassword,
        });
      } else {
        alert(
          `Successfully linked! ${selectedMember.name} already had an app account and has been granted ${projectRole} access to this project.`,
        );
      }

      setSelectedMember(null);
      fetchAssignments();
      setSearchTerm("");
    } catch (err) {
      alert(err.message);
    } finally {
      setAssigning(false);
    }
  };

  // --- NEW: HANDLE UPDATING EXISTING STAFF ROLE ---
  const openEditModal = (assignment) => {
    setProjectRole(assignment.role);
    setDataScope(assignment.data_scope || "Mandal");
    setEditingAssignment(assignment);
  };

  const handleUpdateAccess = async (e) => {
    e.preventDefault();
    if (!canManageStaff) return;
    setAssigning(true);

    try {
      const { error } = await supabase
        .from("project_assignments")
        .update({
          role: projectRole,
          data_scope: dataScope,
        })
        .eq("id", editingAssignment.id);

      if (error) throw new Error("Update failed: " + error.message);

      setEditingAssignment(null);
      fetchAssignments();
    } catch (err) {
      alert(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (assignmentId) => {
    if (!canManageStaff) return;
    if (
      !confirm(
        "Revoke project access for this person? Note: This does not delete their app account, only their access to this project.",
      )
    )
      return;
    await supabase.from("project_assignments").delete().eq("id", assignmentId);
    fetchAssignments();
  };

  const copyToClipboard = () => {
    const text = `App Login Details\nName: ${newCredentials.name}\nLogin ID: ${newCredentials.email}\nPassword: ${newCredentials.password}\nUrl: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading)
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="animate-spin inline mr-2" /> Loading staff...
      </div>
    );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 1. DIRECTORY SEARCH PANEL */}
      {canManageStaff && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative z-20">
          <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
            <UserPlus size={16} className="text-indigo-600" /> Add Project Staff
            from Directory
          </label>
          <p className="text-xs text-slate-500 mb-4">
            Search for a Member, Utsahi Yuvak, or Karyakar. If they don't have
            an app login, we will generate one instantly.
          </p>

          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium"
              placeholder="Search by name, internal ID code, or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searching && (
              <Loader2
                className="absolute right-3 top-3 text-slate-400 animate-spin"
                size={18}
              />
            )}
          </div>

          {memberResults.length > 0 && (
            <div className="absolute left-6 right-6 mt-2 border border-slate-200 rounded-xl shadow-2xl bg-white overflow-hidden max-h-72 overflow-y-auto z-50">
              {memberResults.map((m) => (
                <div
                  key={m.id}
                  className="p-4 border-b last:border-0 hover:bg-indigo-50 flex items-center justify-between cursor-pointer transition-colors"
                  onClick={() => {
                    setProjectRole("volunteer"); // Reset default for new additions
                    setDataScope("Mandal");
                    setSelectedMember(m);
                    setMemberResults([]);
                    setSearchTerm("");
                  }}
                >
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      {m.name} {m.surname}
                      <Badge variant="outline">{m.designation}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {m.mandals?.name}
                      </span>
                      <span className="font-mono text-slate-400">
                        ID: {m.internal_code}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary">
                    Configure Access
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. CURRENT STAFF LIST */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative z-10">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Shield size={18} className="text-indigo-600" />
          <h3 className="font-bold text-slate-800">
            Authorized Project Staff ({assignments.length})
          </h3>
        </div>

        {assignments.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-white">
            <UserCheck size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No custom staff assigned.</p>
            <p className="text-xs mt-1">
              Global Admins automatically have full access.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50 transition-colors gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                    {(a.user_profiles?.full_name?.[0] || "U").toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      {a.user_profiles?.full_name || "Unknown User"}
                      <Badge
                        variant={
                          a.role === "Coordinator" ? "primary" : "secondary"
                        }
                      >
                        {a.role}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {a.user_profiles?.email}
                      </span>
                      <span className="bg-slate-200 w-1 h-1 rounded-full"></span>
                      <span className="font-medium text-slate-600 bg-white px-2 py-0.5 rounded border">
                        Scope: {a.data_scope}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex opacity-100 items-center gap-2 justify-end border-t md:border-0 pt-3 md:pt-0">
                  {canManageStaff && (
                    <>
                      <button
                        onClick={() => openEditModal(a)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit Role"
                      >
                        <Edit size={18} /> {/* <-- CHANGED THIS HERE */}
                      </button>
                      <button
                        onClick={() => handleRemove(a.id)}
                        className="p-2 text-black hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Revoke Access"
                      >
                        <Trash2 size={18} /> 
                        delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1A: CONFIGURE ACCESS (ADD NEW) */}
      {/* ------------------------------------------------------------- */}
      {selectedMember && !newCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-1">
                Configure Project Role
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">
                  {selectedMember.name[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    {selectedMember.name} {selectedMember.surname}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    {selectedMember.mandals?.name} •{" "}
                    {selectedMember.designation}
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleGrantAccess}
              className="p-6 space-y-6 overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                    Project Role
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700"
                    value={projectRole}
                    onChange={(e) => setProjectRole(e.target.value)}
                  >
                    <option value="Coordinator">
                      Coordinator (manage event + Editor )
                    </option>
                    <option value="Editor">Editor (mark attendance and register member)</option>
                    {/* <option value="volunteer">Volunteer (QR Only)</option>
                    <option value="Viewer">Viewer (Read Only)</option> */}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                    Data Scope
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700"
                    value={dataScope}
                    onChange={(e) => setDataScope(e.target.value)}
                  >
                    <option value="Mandal">Their Mandal Only</option>
                    <option value="Kshetra">Their Kshetra Only</option>
                    <option value="Global">Global (All Data)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => setSelectedMember(null)}
                  className="flex-1"
                  type="button"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={assigning} className="flex-1">
                  {assigning ? (
                    <Loader2 className="animate-spin mx-auto" />
                  ) : (
                    "Grant Access"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1B: MODIFY ACCESS (EDIT EXISTING) */}
      {/* ------------------------------------------------------------- */}
      {editingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  Edit Staff Role
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-bold text-xs">
                    {editingAssignment.user_profiles?.full_name?.[0] || "U"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {editingAssignment.user_profiles?.full_name}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      {editingAssignment.user_profiles?.email}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditingAssignment(null)}
                className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleUpdateAccess}
              className="p-6 space-y-6 overflow-y-auto"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                    Project Role
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 text-sm font-bold text-slate-700"
                    value={projectRole}
                    onChange={(e) => setProjectRole(e.target.value)}
                  >
                    <option value="Coordinator">
                      Coordinator (manage event + Editor )
                    </option>
                    <option value="Editor">Editor (mark attendance and register member)</option>
                    {/* <option value="volunteer">Volunteer (QR Only)</option>
                    <option value="Viewer">Viewer (Read Only)</option> */}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                    Data Scope
                  </label>
                  <select
                    required
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 text-sm font-bold text-slate-700"
                    value={dataScope}
                    onChange={(e) => setDataScope(e.target.value)}
                  >
                    <option value="Mandal">Their Mandal Only</option>
                    <option value="Kshetra">Their Kshetra Only</option>
                    <option value="Global">Global (All Data)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => setEditingAssignment(null)}
                  className="flex-1"
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={assigning}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200 border-transparent"
                >
                  {assigning ? (
                    <Loader2 className="animate-spin mx-auto" />
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: NEW CREDENTIALS POPUP */}
      {/* ------------------------------------------------------------- */}
      {newCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in zoom-in-95 duration-300">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-slate-100 text-center relative">
            <div className="bg-green-500 p-8 text-white flex flex-col items-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3">
                <CheckCircle size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold">App Login Created!</h2>
              <p className="text-green-100 text-sm mt-1 text-balance">
                This member did not have an app account. We generated one
                automatically.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Login Email / ID
                  </span>
                  <div className="font-mono text-slate-800 font-bold text-sm bg-white border p-2 rounded-lg">
                    {newCredentials.email}
                  </div>
                </div>
                <div className="w-full h-px bg-slate-200"></div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5 flex items-center gap-1">
                    <Key size={12} /> Temporary Password
                  </span>
                  <div className="font-mono text-xl text-indigo-600 font-bold bg-indigo-50 p-2 rounded-lg inline-block border border-indigo-100">
                    {newCredentials.password}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  className={`flex-1 transition-all ${copied ? "bg-green-600 hover:bg-green-700" : ""}`}
                  onClick={copyToClipboard}
                  icon={copied ? CheckCircle : Copy}
                >
                  {copied ? "Copied!" : "Copy Info"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setNewCredentials(null)}
                  className="flex-1"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
