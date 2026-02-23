import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Users,
  UserPlus,
  Search,
  CheckCircle,
  X,
  Copy,
  Share2,
  Globe,
  Edit3,
  Trash2,
  Loader2,
  Layers,
  AlertTriangle,
  Shield,
  RefreshCw,
  Eye,
  EyeOff,
  User,
  Clock,
  Trash,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { ghostClient } from "../../lib/supabase";

// --- INITIAL STATES ---
const initialSystemForm = {
  role: "sanchalak",
  email: "",
  password: "",
  full_name: "",
  member_id: null,
  gender: "Yuvak",
  assigned_mandal_id: "",
  assigned_mandals: [],
};

const initialProjectForm = {
  user_id: null,
  member_id: null,
  member_data: null,
  project_id: "",
  role: "volunteer",
  scope_type: "Mandal",
  selected_kshetra: "",
  scope_mandal_ids: [],
  gender_scope: "Both",
  permissions: {
    create_event: false,
    mark_attendance: true,
    view_data: false,
    register_members: true,
  },
};

export default function UserManagement() {
  // -- STATE --
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // UI
  const [activeTab, setActiveTab] = useState("system");
  const [viewMode, setViewMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

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

  // Updated Taker Form with Validity
  const [takerForm, setTakerForm] = useState({
    count: 1,
    gender: "Yuvak",
    validity: "",
  });

  // -- FILTERED LISTS (Memoized) --
  const systemUsersList = useMemo(
    () =>
      users.filter((u) =>
        ["admin", "nirdeshak", "nirikshak", "sanchalak"].includes(u.role),
      ),
    [users],
  );

  const takersList = useMemo(
    () => users.filter((u) => u.role === "taker"),
    [users],
  );

  // -- DATA LOADING --
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, mandalsRes, projectsRes, kshetrasRes, assignmentsRes] =
        await Promise.all([
          supabase
            .from("user_profiles")
            .select(
              `
            id, full_name, email, role, gender, member_id, assigned_mandal_id, expires_at,
            members!user_profiles_member_id_fkey(name, surname), 
            mandals!user_profiles_assigned_mandal_id_fkey(name)
          `,
            )
            .order("created_at", { ascending: false }),
          supabase.from("mandals").select("id, name, kshetra_id").order("name"),
          supabase.from("projects").select("id, name").eq("is_active", true),
          supabase.from("kshetras").select("id, name").order("name"),
          supabase
            .from("project_assignments")
            .select(
              `
            id, role, data_scope, gender_scope, permissions, scope_mandal_ids,
            project_id, user_id,
            projects(id, name), 
            user_profiles(id, full_name, email, role)
          `,
            )
            .order("created_at", { ascending: false }),
        ]);

      setUsers(usersRes.data || []);
      setMandals(mandalsRes.data || []);
      setProjects(projectsRes.data || []);
      setKshetras(kshetrasRes.data || []);
      setProjectAssignments(assignmentsRes.data || []);
    } catch (e) {
      console.error("Refresh error:", e);
      setErrorMessage("Failed to load data. Please check connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // -- SEARCH LOGIC --
  useEffect(() => {
    if (searchTerm.length < 2) {
      setMemberResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("members")
        .select(
          "id, name, surname, gender, designation, mobile, mandal_id, mandals(name)",
        )
        .or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%`)
        .limit(5);
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
    setCreatedCredentials([]);
    setShowPassword(false);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setViewMode("list");
    resetForms();
  };

  // -- SELECT MEMBER LOGIC --
  const selectMember = useCallback(
    (m) => {
      const fullName = `${m.name} ${m.surname}`;
      if (activeTab === "system") {
        setSearchTerm(fullName);
        let role = "sanchalak";
        if (m.designation === "Nirikshak") role = "nirikshak";
        if (m.designation === "Nirdeshak") role = "nirdeshak";

        setSystemForm((prev) => ({
          ...prev,
          member_id: m.id,
          full_name: fullName,
          email: m.mobile ? `${m.mobile}@keshav.app` : "",
          role,
          gender: m.gender || "Yuvak",
          assigned_mandal_id: m.mandal_id || "",
          assigned_mandals: m.mandal_id ? [m.mandal_id] : [],
        }));
      } else if (activeTab === "project") {
        const existingUser = users.find((u) => u.member_id === m.id);
        if (existingUser) {
          setProjectForm((prev) => ({
            ...prev,
            user_id: existingUser.id,
            member_id: null,
            member_data: null,
          }));
          setSearchTerm(`${existingUser.full_name} (Has Account)`);
        } else {
          setProjectForm((prev) => ({
            ...prev,
            user_id: null,
            member_id: m.id,
            member_data: m,
            gender_scope: m.gender === "Yuvak" ? "Yuvak" : "Yuvati",
          }));
          setSearchTerm(`${fullName} (New Volunteer)`);
        }
      }
      setMemberResults([]);
    },
    [activeTab, users],
  );

  // ==========================================
  // HANDLERS
  // ==========================================

  // 1. SYSTEM USER
  const handleSystemUser = async (action) => {
    setProcessing(true);
    setErrorMessage("");
    try {
      if (action === "create") {
        if (!systemForm.email?.trim() || !systemForm.full_name?.trim())
          throw new Error("Email and Name are required");

        const password =
          systemForm.password || Math.random().toString(36).slice(-8) + "Aa1@";
        const { data: auth, error: authError } = await ghostClient.auth.signUp({
          email: systemForm.email.trim(),
          password,
          options: {
            data: { full_name: systemForm.full_name, role: systemForm.role },
          },
        });

        if (authError && !authError.message.includes("already registered"))
          throw authError;
        const userId = auth?.user?.id || crypto.randomUUID();

        await supabase.from("user_profiles").insert({
          id: userId,
          full_name: systemForm.full_name.trim(),
          role: systemForm.role,
          email: systemForm.email.trim(),
          gender: systemForm.gender,
          member_id: systemForm.member_id || null,
          assigned_mandal_id:
            systemForm.role === "sanchalak"
              ? systemForm.assigned_mandal_id || null
              : null,
        });

        if (
          systemForm.role === "nirikshak" &&
          systemForm.assigned_mandals.length > 0
        ) {
          const assignments = systemForm.assigned_mandals.map((mId) => ({
            nirikshak_id: userId,
            mandal_id: mId,
          }));
          await supabase.from("nirikshak_assignments").insert(assignments);
        }

        setCreatedCredentials([
          { name: systemForm.full_name, email: systemForm.email, password },
        ]);
        setViewMode("success");
      } else if (action === "update") {
        if (!editingId) throw new Error("No user selected");

        const updateData = {
          role: systemForm.role,
          full_name: systemForm.full_name?.trim(),
          assigned_mandal_id:
            systemForm.role === "sanchalak" && systemForm.assigned_mandal_id
              ? systemForm.assigned_mandal_id
              : null,
        };

        const { error } = await supabase
          .from("user_profiles")
          .update(updateData)
          .eq("id", editingId);
        if (error) throw error;

        await supabase
          .from("nirikshak_assignments")
          .delete()
          .eq("nirikshak_id", editingId);
        if (
          systemForm.role === "nirikshak" &&
          systemForm.assigned_mandals.length > 0
        ) {
          const assignments = systemForm.assigned_mandals.map((mId) => ({
            nirikshak_id: editingId,
            mandal_id: mId,
          }));
          await supabase.from("nirikshak_assignments").insert(assignments);
        }

        setViewMode("list");
        refreshData();
      }
    } catch (err) {
      setErrorMessage(err.message);
    }
    setProcessing(false);
  };

  // 2. PROJECT STAFF
  const handleProjectStaff = async (action) => {
    setProcessing(true);
    setErrorMessage("");
    try {
      if (!projectForm.project_id) throw new Error("Please select a project");

      let finalMandals = [];
      let finalGenderScope = projectForm.gender_scope;
      if (projectForm.scope_type === "Kshetra") {
        finalMandals = mandals
          .filter((m) => m.kshetra_id === projectForm.selected_kshetra)
          .map((m) => m.id);
        finalGenderScope = "Both";
      } else if (projectForm.scope_type === "Mandal") {
        finalMandals = projectForm.scope_mandal_ids;
        finalGenderScope = "Both";
      }

      let targetUserId = projectForm.user_id;
      if (action === "create" && !targetUserId && projectForm.member_id) {
        const m = projectForm.member_data;
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("member_id", m.id)
          .single();

        if (existing) {
          targetUserId = existing.id;
        } else {
          const email = m.mobile
            ? `${m.mobile}@keshav.app`
            : `vol.${m.id.split("-")[0]}@keshav.app`;
          const password = Math.random().toString(36).slice(-8) + "Aa1@";

          const { data: auth, error: authError } =
            await ghostClient.auth.signUp({
              email,
              password,
              options: {
                data: {
                  full_name: `${m.name} ${m.surname}`,
                  role: "volunteer",
                },
              },
            });

          if (authError && !authError.message.includes("already registered"))
            throw authError;
          targetUserId = auth?.user?.id || crypto.randomUUID();

          await supabase.from("user_profiles").insert({
            id: targetUserId,
            full_name: `${m.name} ${m.surname}`,
            email,
            role: "volunteer",
            gender: m.gender,
            member_id: m.id,
          });
          setCreatedCredentials([
            { name: `${m.name} ${m.surname}`, email, password },
          ]);
        }
      }

      if (action === "create" && !targetUserId)
        throw new Error("Please select a user or member");

      const payload = {
        project_id: projectForm.project_id,
        user_id: targetUserId,
        role: projectForm.role,
        scope_mandal_ids: finalMandals,
        data_scope: projectForm.scope_type,
        gender_scope: finalGenderScope,
        permissions: projectForm.permissions,
      };

      if (action === "create") {
        await supabase.from("project_assignments").insert(payload);
        createdCredentials.length > 0
          ? setViewMode("success")
          : (setViewMode("list"), refreshData());
      } else if (action === "update") {
        await supabase
          .from("project_assignments")
          .update(payload)
          .eq("id", editingId);
        setViewMode("list");
        refreshData();
      }
    } catch (err) {
      setErrorMessage(err.message);
    }
    setProcessing(false);
  };

  // 3. BULK TAKERS (With Expiration)
  const createBulkTakers = async () => {
    setProcessing(true);
    setErrorMessage("");
    const newCreds = [];
    try {
      const count = Math.min(Math.max(parseInt(takerForm.count) || 1, 1), 20);

      // Calculate Expiration
      let expiresAt = null;
      if (takerForm.validity) {
        const hours = parseInt(takerForm.validity);
        const date = new Date();
        date.setHours(date.getHours() + hours);
        expiresAt = date.toISOString();
      }

      for (let i = 0; i < count; i++) {
        const suffix = Math.floor(1000 + Math.random() * 9000);
        const email = `taker.${suffix}@keshav.app`;
        const password = `Keshav@${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: auth } = await ghostClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: `Taker ${suffix}`, role: "taker" } },
        });
        const userId = auth?.user?.id || crypto.randomUUID();

        await supabase.from("user_profiles").insert({
          id: userId,
          full_name: `Taker ${suffix}`,
          role: "taker",
          email,
          gender: takerForm.gender,
          expires_at: expiresAt, // Requires DB column
        });
        newCreds.push({ name: `Taker ${suffix}`, email, password });
      }
      setCreatedCredentials(newCreds);
      setViewMode("success");
    } catch (err) {
      setErrorMessage(err.message);
    }
    setProcessing(false);
  };

  // 4. DELETE & DELETE ALL
  const handleDelete = async (id, type) => {
    setDeletingId(id);
    try {
      if (type === "system_user") {
        if (
          !confirm(
            "Delete this System User? All their assignments will also be removed.",
          )
        ) {
          setDeletingId(null);
          return;
        }
        await Promise.all([
          supabase.from("project_assignments").delete().eq("user_id", id),
          supabase
            .from("nirikshak_assignments")
            .delete()
            .eq("nirikshak_id", id),
        ]);
        await supabase.from("user_profiles").delete().eq("id", id);
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } else if (type === "project_staff") {
        const assignment = projectAssignments.find((p) => p.id === id);
        const userRole = assignment?.user_profiles?.role;
        const userId = assignment?.user_profiles?.id;

        if (userRole === "volunteer") {
          if (
            !confirm("This volunteer will be completely removed. Continue?")
          ) {
            setDeletingId(null);
            return;
          }
          await supabase
            .from("project_assignments")
            .delete()
            .eq("user_id", userId);
          await supabase.from("user_profiles").delete().eq("id", userId);
          setUsers((prev) => prev.filter((u) => u.id !== userId));
          setProjectAssignments((prev) =>
            prev.filter((pa) => pa.user_id !== userId),
          );
        } else {
          if (!confirm("Remove from this project? (Account stays active)")) {
            setDeletingId(null);
            return;
          }
          await supabase.from("project_assignments").delete().eq("id", id);
          setProjectAssignments((prev) => prev.filter((pa) => pa.id !== id));
        }
      } else if (type === "taker") {
        if (!confirm("Delete this Taker account?")) {
          setDeletingId(null);
          return;
        }
        await supabase.from("user_profiles").delete().eq("id", id);
        setUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } catch (e) {
      setErrorMessage(e.message);
    }
    setDeletingId(null);
  };

  const handleDeleteAllTakers = async () => {
    if (
      !confirm(
        "🔥 WARNING: This will delete ALL 'Taker' accounts immediately.\n\nThis cannot be undone. Are you sure?",
      )
    )
      return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .delete()
        .eq("role", "taker");
      if (error) throw error;
      setUsers((prev) => prev.filter((u) => u.role !== "taker"));
      alert("All takers deleted successfully.");
    } catch (err) {
      setErrorMessage("Failed to delete all takers: " + err.message);
    }
    setProcessing(false);
  };

  // --- EDIT HELPERS ---
  const openProjectEdit = (assignment) => {
    setEditingId(assignment.id);
    setProjectForm({
      user_id: assignment.user_id,
      member_id: null,
      member_data: null,
      project_id: assignment.project_id,
      role: assignment.role || "volunteer",
      scope_type: assignment.data_scope || "Mandal",
      scope_mandal_ids: assignment.scope_mandal_ids || [],
      gender_scope: assignment.gender_scope || "Both",
      permissions: assignment.permissions || initialProjectForm.permissions,
      selected_kshetra: "",
    });
    setSearchTerm(assignment.user_profiles?.full_name || "");
    setViewMode("edit");
  };

  const openSystemEdit = async (user) => {
    setEditingId(user.id);
    let assignedMandals = [];
    if (user.role === "nirikshak") {
      const { data } = await supabase
        .from("nirikshak_assignments")
        .select("mandal_id")
        .eq("nirikshak_id", user.id);
      if (data) assignedMandals = data.map((d) => d.mandal_id);
    }
    setSystemForm({
      role: user.role,
      assigned_mandal_id: user.assigned_mandal_id || "",
      email: user.email,
      full_name: user.full_name,
      assigned_mandals: assignedMandals,
      member_id: user.member_id,
      gender: user.gender || "Yuvak",
      password: "",
    });
    setSearchTerm(user.full_name);
    setViewMode("edit");
  };

  const shareCredentials = async () => {
    const text = createdCredentials
      .map(
        (c) =>
          `🔐 Login Credentials\nName: ${c.name}\nEmail: ${c.email}\nPassword: ${c.password}`,
      )
      .join("\n\n---\n\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Login Credentials", text });
        return;
      } catch (e) {}
    }
    await navigator.clipboard.writeText(text);
    alert("Copied!");
  };

  // --- UI COMPONENTS ---
  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case "admin":
        return "danger";
      case "nirdeshak":
        return "primary";
      case "nirikshak":
        return "warning";
      case "sanchalak":
        return "success";
      default:
        return "default";
    }
  };

  const EmptyState = ({ icon: Icon, title, description, action }) => (
    <div className="p-12 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Icon className="text-slate-400" size={32} />
      </div>
      <h3 className="font-bold text-slate-600 mb-2">{title}</h3>
      <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
        {description}
      </p>
      {action}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 px-4">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            User & Access Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage system logins, project staff, and field force
          </p>
        </div>
        <div className="flex gap-2">
          {viewMode === "list" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshData}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
              </Button>
              <Button
                onClick={() => {
                  setViewMode("create");
                  resetForms();
                }}
                icon={UserPlus}
              >
                Add New
              </Button>
            </>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="bg-slate-100/80 p-1.5 rounded-2xl">
        <div className="flex gap-1 overflow-x-auto">
          {[
            {
              id: "system",
              label: "System Users",
              icon: Shield,
              count: systemUsersList.length,
            },
            {
              id: "project",
              label: "Project Staff",
              icon: Layers,
              count: projectAssignments.length,
            },
            {
              id: "field",
              label: "Field Takers",
              icon: Globe,
              count: takersList.length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"}`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.id ? "bg-teal-100 text-teal-700" : "bg-slate-200 text-slate-600"}`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ERROR & SUCCESS */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {viewMode === "success" && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-2xl animate-in zoom-in-95">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="text-white" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-green-800 text-lg mb-1">
                Success!
              </h3>
              <p className="text-green-600 text-sm mb-4">
                Credentials created.
              </p>
              <div className="bg-white rounded-xl border border-green-100 shadow-sm divide-y divide-green-50 mb-4">
                {createdCredentials.map((c, i) => (
                  <div key={i} className="p-4">
                    <div className="font-bold text-slate-800">{c.name}</div>
                    <div className="flex gap-4 text-sm text-slate-500">
                      <span>Email: {c.email}</span>
                      <span className="font-bold font-mono">
                        Pass: {c.password}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button onClick={shareCredentials} icon={Share2}>
                  Share
                </Button>
                <Button
                  variant="secondary"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard.writeText(
                      createdCredentials
                        .map((c) => `${c.email}\t${c.password}`)
                        .join("\n"),
                    );
                    alert("Copied!");
                  }}
                >
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setViewMode("list");
                    refreshData();
                    resetForms();
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 1: SYSTEM USERS --- */}
      {activeTab === "system" &&
        (viewMode === "create" || viewMode === "edit" ? (
          <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="flex justify-between border-b pb-4">
              <h3 className="font-bold text-lg text-slate-800">
                {viewMode === "edit" ? "Edit User" : "Create User"}
              </h3>
              <button
                onClick={() => {
                  setViewMode("list");
                  resetForms();
                }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            {viewMode === "create" && (
              <div className="relative">
                <label className="label-xs">Link Member</label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-3 text-slate-400"
                    size={18}
                  />
                  <input
                    className="input-std pl-10"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {isSearching && (
                    <Loader2
                      className="absolute right-3 top-3 animate-spin text-slate-400"
                      size={18}
                    />
                  )}
                </div>
                {memberResults.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border shadow-xl rounded-xl mt-2 overflow-hidden">
                    {memberResults.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => selectMember(m)}
                        className="w-full p-3 hover:bg-slate-50 text-left border-b flex justify-between"
                      >
                        <span className="font-medium">
                          {m.name} {m.surname}
                        </span>
                        <Badge variant="secondary">{m.designation}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="label-xs">Name</label>
                <input
                  className="input-std"
                  value={systemForm.full_name}
                  onChange={(e) =>
                    setSystemForm({ ...systemForm, full_name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label-xs">Email</label>
                <input
                  className="input-std"
                  value={systemForm.email}
                  onChange={(e) =>
                    setSystemForm({ ...systemForm, email: e.target.value })
                  }
                  readOnly={viewMode === "edit"}
                />
              </div>
              <div>
                <label className="label-xs">Role</label>
                <select
                  className="input-std"
                  value={systemForm.role}
                  onChange={(e) =>
                    setSystemForm({ ...systemForm, role: e.target.value })
                  }
                >
                  <option value="sanchalak">Sanchalak</option>
                  <option value="nirikshak">Nirikshak</option>
                  <option value="nirdeshak">Nirdeshak</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {systemForm.role === "sanchalak" && (
                <div className="md:col-span-2">
                  <label className="label-xs">Mandal</label>
                  <select
                    className="input-std"
                    value={systemForm.assigned_mandal_id}
                    onChange={(e) =>
                      setSystemForm({
                        ...systemForm,
                        assigned_mandal_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Select...</option>
                    {mandals.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {systemForm.role === "nirikshak" && (
                <div className="md:col-span-2">
                  <label className="label-xs">Mandals</label>
                  <div className="border bg-slate-50 rounded-xl p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
                    {mandals.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={systemForm.assigned_mandals.includes(m.id)}
                          onChange={() => {
                            const list = systemForm.assigned_mandals.includes(
                              m.id,
                            )
                              ? systemForm.assigned_mandals.filter(
                                  (id) => id !== m.id,
                                )
                              : [...systemForm.assigned_mandals, m.id];
                            setSystemForm({
                              ...systemForm,
                              assigned_mandals: list,
                            });
                          }}
                          className="rounded text-teal-600"
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="ghost" onClick={() => setViewMode("list")}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleSystemUser(viewMode === "edit" ? "update" : "create")
                }
                disabled={processing}
              >
                {processing ? <Loader2 className="animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
            {systemUsersList.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No Users"
                description="Create a system user."
                action={
                  <Button onClick={() => setViewMode("create")}>
                    Add User
                  </Button>
                }
              />
            ) : (
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b text-xs uppercase">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Scope</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {systemUsersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">
                          {u.full_name}
                        </div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </td>
                      <td className="p-4">
                        <Badge variant={getRoleBadgeVariant(u.role)}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="p-4 text-slate-500">
                        {u.mandals?.name ||
                          (u.role === "nirikshak" ? "Multi" : "Global")}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2">
                        <button
                          onClick={() => openSystemEdit(u)}
                          className="p-2 text-slate-400 hover:text-teal-600 bg-slate-50 rounded"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, "system_user")}
                          className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

      {/* --- TAB 2: PROJECT STAFF --- */}
      {activeTab === "project" &&
        (viewMode === "create" || viewMode === "edit" ? (
          <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6">
            <div className="flex justify-between border-b pb-4">
              <h3 className="font-bold text-lg text-slate-800">Assign Staff</h3>
              <button
                onClick={() => {
                  setViewMode("list");
                  resetForms();
                }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="label-xs">User / Member</label>
                {viewMode === "create" ? (
                  <>
                    <input
                      className="input-std"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {memberResults.length > 0 && (
                      <div className="absolute z-50 w-full bg-white border shadow-xl rounded-xl mt-2 overflow-hidden">
                        {memberResults.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => selectMember(m)}
                            className="w-full p-3 hover:bg-slate-50 text-left border-b"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <input className="input-std" value={searchTerm} readOnly />
                )}
              </div>
              <div>
                <label className="label-xs">Project</label>
                <select
                  className="input-std"
                  value={projectForm.project_id}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      project_id: e.target.value,
                    })
                  }
                  disabled={viewMode === "edit"}
                >
                  <option value="">Select...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 grid md:grid-cols-2 gap-5 p-4 bg-slate-50 rounded-xl">
                <div>
                  <label className="label-xs">Scope</label>
                  <select
                    className="input-std mb-2"
                    value={projectForm.scope_type}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        scope_type: e.target.value,
                      })
                    }
                  >
                    <option value="Mandal">Mandal</option>
                    <option value="Kshetra">Kshetra</option>
                    <option value="Global">Global</option>
                  </select>
                  {projectForm.scope_type === "Kshetra" && (
                    <select
                      className="input-std"
                      value={projectForm.selected_kshetra}
                      onChange={(e) =>
                        setProjectForm({
                          ...projectForm,
                          selected_kshetra: e.target.value,
                        })
                      }
                    >
                      <option>Select Kshetra...</option>
                      {kshetras.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {projectForm.scope_type === "Mandal" && (
                    <div className="border bg-white rounded-lg p-2 max-h-32 overflow-y-auto grid grid-cols-2 gap-2">
                      {mandals.map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 p-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={projectForm.scope_mandal_ids.includes(
                              m.id,
                            )}
                            onChange={() => {
                              const list =
                                projectForm.scope_mandal_ids.includes(m.id)
                                  ? projectForm.scope_mandal_ids.filter(
                                      (id) => id !== m.id,
                                    )
                                  : [...projectForm.scope_mandal_ids, m.id];
                              setProjectForm({
                                ...projectForm,
                                scope_mandal_ids: list,
                              });
                            }}
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label-xs">Permissions</label>
                  <div className="space-y-2">
                    {[
                      "create_event",
                      "mark_attendance",
                      "view_data",
                      "register_members",
                    ].map((p) => (
                      <label
                        key={p}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={projectForm.permissions[p]}
                          onChange={() =>
                            setProjectForm((prev) => ({
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                [p]: !prev.permissions[p],
                              },
                            }))
                          }
                        />{" "}
                        {p.replace("_", " ")}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="ghost" onClick={() => setViewMode("list")}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleProjectStaff(viewMode === "edit" ? "update" : "create")
                }
                disabled={processing}
              >
                {processing ? <Loader2 className="animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
            {projectAssignments.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No Staff"
                description="Assign staff to projects."
                action={
                  <Button onClick={() => setViewMode("create")}>Assign</Button>
                }
              />
            ) : (
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b text-xs uppercase">
                  <tr>
                    <th className="p-4">Project</th>
                    <th className="p-4">Staff</th>
                    <th className="p-4">Scope</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projectAssignments.map((pa) => (
                    <tr key={pa.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold">{pa.projects?.name}</td>
                      <td className="p-4">
                        {pa.user_profiles?.full_name}
                        <br />
                        <span className="text-xs text-slate-400">
                          {pa.user_profiles?.role}
                        </span>
                      </td>
                      <td className="p-4 text-xs">{pa.data_scope}</td>
                      <td className="p-4 text-right flex justify-end gap-2">
                        <button
                          onClick={() => openProjectEdit(pa)}
                          className="p-2 text-slate-400 hover:text-teal-600 bg-slate-50 rounded"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(pa.id, "project_staff")}
                          className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

      {/* --- TAB 3: FIELD FORCE --- */}
      {activeTab === "field" &&
        (viewMode === "create" ? (
          <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-6 max-w-lg mx-auto">
            <h3 className="font-bold text-lg border-b pb-3">Generate Takers</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="label-xs">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="input-std"
                  value={takerForm.count}
                  onChange={(e) =>
                    setTakerForm({ ...takerForm, count: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label-xs">Gender</label>
                <select
                  className="input-std"
                  value={takerForm.gender}
                  onChange={(e) =>
                    setTakerForm({ ...takerForm, gender: e.target.value })
                  }
                >
                  <option>Yuvak</option>
                  <option>Yuvati</option>
                </select>
              </div>
              <div>
                <label className="label-xs">Auto-Delete After</label>
                <select
                  className="input-std"
                  value={takerForm.validity}
                  onChange={(e) =>
                    setTakerForm({ ...takerForm, validity: e.target.value })
                  }
                >
                  <option value="">Never (Manual Delete)</option>
                  <option value="12">12 Hours</option>
                  <option value="24">1 Day</option>
                  <option value="48">2 Day</option>
                  <option value="72"> 3 Days</option>
                  <option value="96"> 4 Days</option>
                  <option value="120"> 5 Days</option>
                  <option value="144"> 6 Days</option>
                  <option value="168">7 Days</option>
                  <option value="720">30 Days</option>
                </select>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Clock size={12} /> Accounts will expire automatically.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setViewMode("list")}>
                Cancel
              </Button>
              <Button onClick={createBulkTakers} disabled={processing}>
                {processing ? <Loader2 className="animate-spin" /> : "Generate"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-end mb-4">
              {takersList.length > 0 && (
                <Button
                  variant="secondary"
                  className="text-red-600 bg-red-50 hover:bg-red-100 border-red-200"
                  onClick={handleDeleteAllTakers}
                  icon={Trash}
                >
                  Delete All Takers
                </Button>
              )}
            </div>
            <div className="bg-white border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
              {takersList.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No Takers"
                  description="Create field takers."
                  action={
                    <Button onClick={() => setViewMode("create")}>
                      Generate
                    </Button>
                  }
                />
              ) : (
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b text-xs uppercase">
                    <tr>
                      <th className="p-4">Name</th>
                      <th className="p-4">Gender</th>
                      <th className="p-4">Expires</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {takersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-4 font-bold">{u.full_name}</td>
                        <td className="p-4">{u.gender} Only</td>
                        <td className="p-4 text-xs text-slate-500">
                          {u.expires_at
                            ? new Date(u.expires_at).toLocaleDateString()
                            : "Never"}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDelete(u.id, "taker")}
                            className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}

      <style>{` .label-xs { @apply block text-xs font-bold text-slate-400 uppercase mb-1.5; } .input-std { @apply w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-100 outline-none text-sm; } `}</style>
    </div>
  );
}
