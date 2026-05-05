import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Search,
  ArrowLeft,
  Check,
  QrCode,
  Loader2,
  BarChart2,
  Filter,
  X,
  Lock,
  AlertTriangle,
  Phone,
  Trash2,
  SortAsc,
  Plus,
  RefreshCw
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";
import QrScanner from "./QrScanner";
import { useAuth } from "../../contexts/AuthContext";
import AttendanceSummary from "./AttendanceSummary";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const fetchWithTimeout = async (promise, ms = 5000) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Network Timeout")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutId),
  );
};

const MemberRow = React.memo(
  ({ member, isPresent, isSyncing, canMark, onMark }) => {
    return (
      <div
        onClick={() => canMark && !isSyncing && onMark(member.id)}
        className={`p-3 rounded-md border flex items-center justify-between transition-colors duration-75 ${
          canMark && !isSyncing ? "cursor-pointer active:scale-[0.98]" : ""
        } ${
          isSyncing
            ? "bg-amber-50 border-amber-200 opacity-90"
            : isPresent
              ? "bg-emerald-50/50 border-emerald-200"
              : "bg-white border-gray-200 hover:border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
        }`}
      >
        <div className="flex items-center gap-3 overflow-hidden pr-3 pointer-events-none">
          <div
            className={`w-9 h-9 rounded-md flex items-center justify-center font-inter font-bold text-xs shrink-0 border transition-colors ${
              isSyncing
                ? "bg-amber-400 text-white border-amber-500"
                : isPresent
                  ? "bg-emerald-500 text-white border-emerald-600"
                  : "bg-gray-50 text-gray-500 border-gray-200"
            }`}
          >
            {isSyncing ? (
              <Loader2 size={16} className="animate-spin" strokeWidth={2.5} />
            ) : isPresent ? (
              <Check size={16} strokeWidth={2.5} />
            ) : (
              member.name[0]
            )}
          </div>
          <div className="min-w-0">
            <div
              className={`font-semibold text-sm truncate ${isPresent || isSyncing ? "text-emerald-900" : "text-gray-900"}`}
            >
              {member.name} {member.surname}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold truncate flex items-center gap-1.5 mt-0.5">
              <span>{member.mandal}</span>{" "}
              <span className="font-inter lowercase tracking-normal text-gray-300">
                •
              </span>
              <span>{member.designation}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {member.mobile_number && (
            <a
              href={`tel:${member.mobile_number}`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors border border-transparent hover:border-gray-200"
            >
              <Phone size={14} strokeWidth={2} />
            </a>
          )}
          {isSyncing && <Badge variant="warning">SAVING</Badge>}
          {isPresent && !isSyncing && <Badge variant="success">IN</Badge>}
        </div>
      </div>
    );
  },
);

export default function Attendance({
  projectId: propPid,
  eventId: propEid,
  embedded = false,
  readOnly: propReadOnly = false,
  hideSummary = false,
}) {
  const params = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const projectId = propPid || params.projectId;
  const eventId = propEid || params.eventId;
  const QUERY_KEY = useMemo(() => ["attendance", eventId], [eventId]);

  const isAdmin = (profile?.role || "").toLowerCase() === "admin";
  
  const [initLoading, setInitLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  const [event, setEvent] = useState(null);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [projectAssignment, setProjectAssignment] = useState(null); // 🛡️ NEW: Track Project Role
  const [scopePermissions, setScopePermissions] = useState({
    mandalIds: [],
    kshetraId: null,
  });

  const [search, setSearch] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [filter, setFilter] = useState("all");
  const [mandalFilter, setMandalFilter] = useState(null);
  const [mandalFilterName, setMandalFilterName] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("filter");

  const defaultAdvFilters = {
    kshetra_id: "",
    mandal_id: "",
    designation: "",
    gender: "",
  };
  const [advFilters, setAdvFilters] = useState(defaultAdvFilters);
  const [draftAdvFilters, setDraftAdvFilters] = useState(defaultAdvFilters);
  const defaultSortConfig = [{ column: "name", ascending: true }];
  const [sortConfig, setSortConfig] = useState(defaultSortConfig);
  const [draftSortConfig, setDraftSortConfig] = useState(defaultSortConfig);

  // 🛡️ DYNAMIC PERMISSION CHECK
  const canMark = useMemo(() => {
    if (propReadOnly) return false;
    const sysRole = (profile?.role || "").toLowerCase().trim();
    if (["admin", "taker", "sanchalak", "nirikshak", "nirdeshak"].includes(sysRole)) return true;
    if (["coordinator", "editor", "project_admin"].includes(projectAssignment)) return true;
    return false;
  }, [profile?.role, propReadOnly, projectAssignment]);

  const { data: attendanceData = [], isLoading: attendanceLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, member_id, scanned_at")
        .eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });

  const presentMap = useMemo(() => {
    const map = new Map();
    attendanceData.forEach((a) => map.set(a.member_id, a.scanned_at));
    return map;
  }, [attendanceData]);

  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`attendance-sync-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          queryClient.setQueryData(QUERY_KEY, (oldData) => {
            if (!oldData) return [];
            if (payload.eventType === "INSERT") {
              if (oldData.some((a) => a.member_id === payload.new.member_id))
                return oldData.map((a) =>
                  a.member_id === payload.new.member_id ? payload.new : a,
                );
              return [...oldData, payload.new];
            }
            if (payload.eventType === "DELETE") {
              const targetMemberId = payload.old.member_id;
              if (targetMemberId)
                return oldData.filter((a) => a.member_id !== targetMemberId);
              return oldData.filter((a) => a.id !== payload.old.id);
            }
            return oldData;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient, QUERY_KEY]);

  const [activelySyncing, setActivelySyncing] = useState(new Set());

  const markAttendance = useCallback(async (memberId) => {
    if (!canMark || !eventId || activelySyncing.has(memberId)) return false;

    const isPresent = presentMap.has(memberId);
    const now = new Date().toISOString();

    setActivelySyncing(prev => new Set(prev).add(memberId));

    try {
      let result;
      if (isPresent) {
        result = await supabase.from("attendance").delete().eq("event_id", eventId).eq("member_id", memberId);
      } else {
        result = await supabase.from("attendance").upsert(
          { event_id: eventId, member_id: memberId, scanned_at: now, marked_by: profile.id },
          { onConflict: 'event_id,member_id', ignoreDuplicates: true }
        );
      }

      if (result.error) throw result.error;

      queryClient.setQueryData(QUERY_KEY, (oldData) => {
        if (!oldData) return [];
        if (isPresent) return oldData.filter(a => a.member_id !== memberId);
        return [...oldData, { id: result.data?.[0]?.id || `real-${memberId}`, member_id: memberId, scanned_at: now }];
      });

      return true;

    } catch (err) {
      console.error('[Marking Error]:', err);
      toast.error(`Database error. Please try again.`);
      return false; 
    } finally {
      setActivelySyncing(prev => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  }, [canMark, eventId, presentMap, queryClient, QUERY_KEY, activelySyncing, profile?.id]);

  const handleScan = useCallback(
    async (code) => {
      if (!canMark) return { success: false, message: "Read Only" };

      const cleanCode = code.trim();
      const member = members.find(
        (m) =>
          m.internal_code === cleanCode ||
          m.id === cleanCode ||
          m.external_qr === cleanCode,
      );

      if (!member)
        return { success: false, message: "Not in Roster", type: "error" };
      if (presentMap.has(member.id))
        return {
          success: false,
          message: "Already Checked In",
          type: "warning",
        };
      if (activelySyncing.has(member.id))
        return {
          success: false,
          message: "Currently Saving...",
          type: "warning",
        };

      const success = await markAttendance(member.id);

      if (success) {
        return { success: true, message: `${member.name} Checked In!` };
      } else {
        return {
          success: false,
          message: "Network Error - Scan Again",
          type: "error",
        };
      }
    },
    [canMark, members, presentMap, activelySyncing, markAttendance],
  );

  const loadRosterData = useCallback(
    async (isMounted) => {
      if (!projectId || !profile?.id) return;

      try {
        if (isMounted) {
          setDataLoading(true);
          setError(null);
        }

        const cleanRole = (profile?.role || "").toLowerCase().trim();
        let allowedMandalIds = [];
        let allowedKshetraId = null;
        let isGlobalScope = cleanRole === "admin" || cleanRole === "taker";
        let fetchedProjectRole = null;

        // 🛡️ 1. Fetch Explicit Project Assignments first
        const { data: assignment } = await supabase
          .from("project_assignments")
          .select("role, data_scope, scope_mandal_ids")
          .eq("project_id", projectId)
          .eq("user_id", profile.id)
          .maybeSingle();

        if (assignment) {
          fetchedProjectRole = (assignment.role || "").toLowerCase().trim();
          const dScope = (assignment.data_scope || "").toLowerCase().trim();

          if (dScope === "global") isGlobalScope = true;
          if (dScope === "kshetra") allowedKshetraId = profile.assigned_kshetra_id || profile.kshetra_id;
          if (dScope === "mandal") {
            if (assignment.scope_mandal_ids?.length > 0) {
              allowedMandalIds.push(...assignment.scope_mandal_ids);
            } else {
              allowedMandalIds.push(profile.assigned_mandal_id || profile.mandal_id);
            }
          }
        }
        
        if (isMounted) setProjectAssignment(fetchedProjectRole); // Unlock UI

        // 🛡️ 2. Fallback to System Role Scope if not already global
        if (!isGlobalScope) {
          if (cleanRole === "sanchalak") {
            allowedMandalIds.push(profile.assigned_mandal_id || profile.mandal_id);
          } else if (cleanRole === "nirikshak") {
            const { data: assigns } = await supabase.from("nirikshak_assignments").select("mandal_id").eq("nirikshak_id", profile.id);
            if (assigns) allowedMandalIds.push(...assigns.map((a) => a.mandal_id));
            allowedMandalIds.push(profile.assigned_mandal_id || profile.mandal_id);
          } else if (cleanRole === "nirdeshak" || cleanRole === "project_admin") {
            if (!allowedKshetraId) allowedKshetraId = profile.assigned_kshetra_id || profile.kshetra_id;
            if (!allowedKshetraId) {
              const mId = profile.assigned_mandal_id || profile.mandal_id;
              const { data: mData } = await supabase.from("mandals").select("kshetra_id").eq("id", mId).single();
              if (mData) allowedKshetraId = mData.kshetra_id;
            }
          }
        }

        allowedMandalIds = [...new Set(allowedMandalIds.filter(Boolean))];

        if (isMounted)
          setScopePermissions({
            mandalIds: allowedMandalIds,
            kshetraId: allowedKshetraId,
            isGlobal: isGlobalScope
          });

        const { data: regData, error: regError } = await supabase
          .from("project_registrations")
          .select(
            `
            member_id, seat_number, exam_level, external_qr, 
            members (id, name, surname, internal_code, mobile, designation, gender, mandal_id, mandals (id, name, kshetra_id))
          `,
          )
          .eq("project_id", projectId);

        if (regError) throw regError;

        let rawRoster = (regData || [])
          .map((r) => {
            const m = r.members;
            if (!m) return null;
            return {
              ...m,
              mobile_number: m.mobile,
              kshetra_id: m.mandals?.kshetra_id,
              mandal: m.mandals?.name || "Unknown",
              seat_number: r.seat_number,
              external_qr: r.external_qr,
            };
          })
          .filter(Boolean);

        const userGender = profile?.gender;
        const initialRoster = rawRoster.filter((m) => {
          if (isGlobalScope) return true;
          if (userGender && m.gender !== userGender) return false;
          if (allowedKshetraId && m.kshetra_id === allowedKshetraId) return true;
          if (allowedMandalIds.includes(m.mandal_id)) return true;
          return false;
        });

        if (isMounted) setMembers(initialRoster);
      } catch (err) {
        if (isMounted) setError("Failed to load data. Please refresh.");
      } finally {
        if (isMounted) setDataLoading(false);
      }
    },
    [projectId, profile],
  );

  useEffect(() => {
    let isMounted = true;
    const loadMetadata = async () => {
      try {
        setInitLoading(true);
        const [evtRes, projRes] = await Promise.all([
          supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
          supabase
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .maybeSingle(),
        ]);
        if (!evtRes.data || !projRes.data) {
          if (isMounted) {
            setError("This event or project no longer exists.");
            setInitLoading(false);
          }
          return;
        }
        if (isMounted) {
          setEvent(evtRes.data);
          setProject(projRes.data);
        }
        await loadRosterData(isMounted);
      } catch (err) {
        if (isMounted) setError("Failed to load event details.");
      } finally {
        if (isMounted) setInitLoading(false);
      }
    };
    if (projectId && eventId && profile?.id) loadMetadata();
    return () => {
      isMounted = false;
    };
  }, [projectId, eventId, profile?.id, loadRosterData]);

  const { data: dropdowns } = useQuery({
    queryKey: ["admin-dropdowns-attendance"],
    queryFn: async () => {
      const [kRes, mRes] = await Promise.all([
        supabase.from("kshetras").select("id, name").order("name"),
        supabase.from("mandals").select("id, name, kshetra_id").order("name"),
      ]);
      return { kshetras: kRes.data || [], mandals: mRes.data || [] };
    },
    enabled: isAdmin && isFilterOpen,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    if (isFilterOpen) {
      setDraftAdvFilters({ ...advFilters });
      setDraftSortConfig([...sortConfig]);
      setDrawerTab("filter");
    }
  }, [isFilterOpen, advFilters, sortConfig]);

  const handleMandalClick = useCallback((mandalId, mandalName) => {
    setMandalFilter(mandalId);
    setMandalFilterName(mandalName);
    setFilter("all");
    setShowSummary(false);
  }, []);

  const filteredList = useMemo(() => {
    let result = members.filter((m) => {
      if (mandalFilter && m.mandal_id !== mandalFilter) return false;
      if (
        search &&
        !`${m.name} ${m.surname}`.toLowerCase().includes(search.toLowerCase())
      )
        return false;

      const isPresent = presentMap.has(m.id);
      if (filter === "present" && !isPresent) return false;
      if (filter === "absent" && isPresent) return false;

      if (advFilters.kshetra_id && m.kshetra_id !== advFilters.kshetra_id)
        return false;
      if (advFilters.mandal_id && m.mandal_id !== advFilters.mandal_id)
        return false;
      if (advFilters.designation && m.designation !== advFilters.designation)
        return false;
      if (advFilters.gender && m.gender !== advFilters.gender) return false;

      return true;
    });

    result.sort((a, b) => {
      for (let sort of sortConfig) {
        let valA = a[sort.column] || "";
        let valB = b[sort.column] || "";
        if (sort.column === "time") {
          valA = presentMap.has(a.id) ? presentMap.get(a.id) : "0";
          valB = presentMap.has(b.id) ? presentMap.get(b.id) : "0";
        }
        if (valA < valB) return sort.ascending ? -1 : 1;
        if (valA > valB) return sort.ascending ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [
    members,
    mandalFilter,
    search,
    filter,
    presentMap,
    advFilters,
    sortConfig,
  ]);

  const presentCount = useMemo(() => {
    return members.filter((m) => presentMap.has(m.id)).length;
  }, [members, presentMap]);

  const userScope = {
    role: (profile?.role || "").toLowerCase(),
    gender: profile?.gender,
    mandalIds: scopePermissions.mandalIds,
    kshetraId: scopePermissions.kshetraId,
    isGlobal: scopePermissions.isGlobal,
  };
  const activeFilterCount = Object.values(advFilters).filter(
    (v) => v !== "",
  ).length;

  const FilterRow = ({ label, value, options, fieldKey }) => (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 min-w-[120px] border border-gray-200 rounded-md p-2 bg-white text-sm font-medium flex justify-between items-center text-gray-700">
        {label}
      </div>
      <div className="flex-[1.5] relative">
        <select
          className="w-full border border-gray-200 rounded-md p-2 bg-white text-sm outline-none appearance-none cursor-pointer focus:border-[#5C3030]"
          value={value}
          onChange={(e) =>
            setDraftAdvFilters((prev) => ({
              ...prev,
              [fieldKey]: e.target.value,
            }))
          }
        >
          <option value="">Select Criteria...</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const sortableColumns = [
    { value: "name", label: "First Name" },
    { value: "surname", label: "Last Name" },
    { value: "internal_code", label: "Internal ID" },
    { value: "mandal", label: "Mandal" },
    { value: "designation", label: "Designation" },
    { value: "time", label: "Check-in Time" },
  ];

  if (initLoading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2
          className="animate-spin text-gray-400"
          size={32}
          strokeWidth={1.5}
        />
      </div>
    );
  if (!event)
    return (
      <div className="p-8 text-center text-red-500 font-semibold border border-red-200 bg-red-50 rounded-md">
        Event not found.
      </div>
    );

  return (
    <div
      className={`flex flex-col bg-white ${embedded ? "h-full rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden" : "h-[100dvh]"}`}
    >
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          {!embedded && (
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 text-base truncate">
              {event.name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${activelySyncing.size > 0 ? "bg-amber-400 animate-pulse" : attendanceLoading ? "bg-blue-400 animate-pulse" : "bg-emerald-500"}`}
              />
              <span className="font-inter font-semibold text-gray-700">
                {presentCount}
              </span>{" "}
              / {members.length} Present
              {!canMark && (
                <Badge className="ml-1">
                  <Lock size={10} className="inline mr-1" strokeWidth={2} />{" "}
                  View Only
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            {!hideSummary && (
              <Button
                variant="secondary"
                onClick={() => setShowSummary(true)}
                className="!px-3"
              >
                <BarChart2 size={16} strokeWidth={2} />
              </Button>
            )}
            {canMark && (
              <Button icon={QrCode} onClick={() => setIsScannerOpen(true)}>
                Scan
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3 top-2.5 text-gray-400"
                size={16}
                strokeWidth={1.5}
              />
              <input
                className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 focus:border-[#5C3030] rounded-md outline-none text-sm transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                placeholder="Search roster..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              )}
            </div>
            {isAdmin && (
              <Button
                variant="secondary"
                onClick={() => setIsFilterOpen(true)}
                className="relative shrink-0 !bg-white px-3 sm:px-4"
              >
                <Filter size={16} strokeWidth={1.5} className="sm:mr-2" />
                <span className="hidden sm:inline font-semibold">View</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#5C3030] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm border border-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            )}
          </div>
          <div className="flex bg-gray-100 p-1 rounded-md shrink-0 border border-gray-200 overflow-x-auto hide-scrollbar w-full md:w-auto">
            {["all", "present", "absent"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 md:flex-none px-3 py-1.5 text-xs font-semibold capitalize rounded-md transition-all whitespace-nowrap ${filter === f ? "bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" : "text-gray-500 hover:text-gray-700"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 relative pb-24">
        {dataLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-gray-400">
            <Loader2
              className="animate-spin mb-2"
              size={24}
              strokeWidth={1.5}
            />
            <p className="text-[10px] font-semibold uppercase tracking-widest">
              Loading Roster...
            </p>
          </div>
        )}

        {error && !dataLoading && (
          <div className="p-6 text-center bg-red-50 rounded-md border border-red-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <AlertTriangle
              className="mx-auto text-red-500 mb-2"
              size={24}
              strokeWidth={1.5}
            />
            <p className="text-red-700 font-semibold text-sm">{error}</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => loadRosterData(true)}
              className="mt-4"
            >
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        )}

        {!dataLoading && !error && filteredList.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            No members found.
          </div>
        )}

        {filteredList.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isPresent={presentMap.has(m.id)}
            isSyncing={activelySyncing.has(m.id)}
            canMark={canMark}
            onMark={markAttendance}
          />
        ))}
      </div>

      {isAdmin && isFilterOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-gray-900">
                Configure View
              </h2>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="text-gray-400 hover:text-gray-900 bg-gray-50 p-1.5 rounded-md transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex p-1 bg-gray-100 rounded-lg mb-6 border border-gray-200">
                <button
                  onClick={() => setDrawerTab("filter")}
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all ${drawerTab === "filter" ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Filter
                </button>
                <button
                  onClick={() => setDrawerTab("sort")}
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${drawerTab === "sort" ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <SortAsc size={14} /> Sort
                </button>
              </div>

              {drawerTab === "filter" ? (
                <div className="space-y-1 animate-in fade-in duration-200">
                  <FilterRow
                    label="Kshetra"
                    fieldKey="kshetra_id"
                    value={draftAdvFilters.kshetra_id}
                    options={
                      dropdowns?.kshetras.map((k) => ({
                        value: k.id,
                        label: k.name,
                      })) || []
                    }
                  />
                  <FilterRow
                    label="Mandal"
                    fieldKey="mandal_id"
                    value={draftAdvFilters.mandal_id}
                    options={
                      dropdowns?.mandals
                        .filter(
                          (m) =>
                            !draftAdvFilters.kshetra_id ||
                            m.kshetra_id === draftAdvFilters.kshetra_id,
                        )
                        .map((m) => ({ value: m.id, label: m.name })) || []
                    }
                  />
                  <FilterRow
                    label="Designation"
                    fieldKey="designation"
                    value={draftAdvFilters.designation}
                    options={[
                      "Nirdeshak",
                      "Nirikshak",
                      "Sanchalak",
                      "Member",
                      "Sah Sanchalak",
                      "Sampark Karyakar",
                    ].map((d) => ({ value: d, label: d }))}
                  />
                  <FilterRow
                    label="Gender"
                    fieldKey="gender"
                    value={draftAdvFilters.gender}
                    options={[
                      { value: "Yuvak", label: "Yuvak" },
                      { value: "Yuvati", label: "Yuvati" },
                    ]}
                  />
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                    Multi-Level Sorting
                  </p>
                  {draftSortConfig.map((sort, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-gray-50 p-2 rounded-md border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                    >
                      <div className="w-6 h-6 bg-white border border-gray-200 rounded flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                        {index + 1}
                      </div>
                      <select
                        className="flex-1 border border-gray-200 rounded-md p-1.5 bg-white text-sm outline-none cursor-pointer focus:border-[#5C3030]"
                        value={sort.column}
                        onChange={(e) => {
                          const newSort = [...draftSortConfig];
                          newSort[index].column = e.target.value;
                          setDraftSortConfig(newSort);
                        }}
                      >
                        {sortableColumns.map((col) => (
                          <option key={col.value} value={col.value}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-24 border border-gray-200 rounded-md p-1.5 bg-white text-sm outline-none cursor-pointer focus:border-[#5C3030]"
                        value={sort.ascending.toString()}
                        onChange={(e) => {
                          const newSort = [...draftSortConfig];
                          newSort[index].ascending = e.target.value === "true";
                          setDraftSortConfig(newSort);
                        }}
                      >
                        <option value="true">A-Z / Asc</option>
                        <option value="false">Z-A / Desc</option>
                      </select>
                      {draftSortConfig.length > 1 && (
                        <button
                          onClick={() => {
                            const newSort = [...draftSortConfig];
                            newSort.splice(index, 1);
                            setDraftSortConfig(newSort);
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors bg-white rounded border border-gray-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {draftSortConfig.length < 3 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full border-dashed border-gray-300 text-gray-500 bg-transparent hover:bg-gray-50 mt-2"
                      onClick={() =>
                        setDraftSortConfig([
                          ...draftSortConfig,
                          { column: "designation", ascending: true },
                        ])
                      }
                    >
                      <Plus size={14} className="mr-1.5" /> Add Sort Level
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-3 bg-white">
              <Button
                variant="secondary"
                className="flex-1 bg-gray-50 !border-gray-200 !text-gray-700 hover:!bg-gray-100"
                onClick={() => {
                  setDraftAdvFilters(defaultAdvFilters);
                  setAdvFilters(defaultAdvFilters);
                  setDraftSortConfig(defaultSortConfig);
                  setSortConfig(defaultSortConfig);
                  setIsFilterOpen(false);
                }}
              >
                Reset All
              </Button>
              <Button
                className="flex-1 !bg-[#1E4B59] !border-[#1E4B59] hover:!bg-[#153641]"
                onClick={() => {
                  setAdvFilters(draftAdvFilters);
                  setSortConfig(draftSortConfig);
                  setIsFilterOpen(false);
                }}
              >
                Apply View
              </Button>
            </div>
          </div>
        </>
      )}

      {!hideSummary && (
        <AttendanceSummary
          isVisible={showSummary}
          onClose={() => setShowSummary(false)}
          event={event}
          project={project}
          userScope={userScope}
          onMandalClick={handleMandalClick}
        />
      )}

      {canMark && (
        <QrScanner
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScan={handleScan}
          eventName={event.name}
        />
      )}
    </div>
  );
}