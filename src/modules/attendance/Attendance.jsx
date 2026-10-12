import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
  lazy,
  Suspense,
} from "react";
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
  RefreshCw,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";
import AbsenceReasonModal from "./AbsenceReasonModal";
import { useAuth } from "../../contexts/AuthContext";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// heavy / rarely-used pieces load on demand
const QrScanner = lazy(() => import("./QrScanner"));
const AttendanceSummary = lazy(() => import("./AttendanceSummary"));

// ───────────────────────── tuning knobs ─────────────────────────
const PAGE = 1000;                 // Supabase max rows per request
const FETCH_CONCURRENCY = 4;       // parallel page downloads
const REQUEST_TIMEOUT_MS = 5000;   // per write attempt
const MARK_ATTEMPTS = 2;           // tries per mark (writes are idempotent)
const USE_REALTIME = true;         // set false to use polling only
const FLUSH_MS = 250;              // batch realtime events into one render
const POLL_MS = 15000;             // refetch interval while realtime is down
const RECONCILE_MS = 120000;       // safety refetch while realtime is up
const ROSTER_STALE_MS = 5 * 60 * 1000;
const RENDER_STEP = 80;            // rows rendered per chunk

// members columns needed by this page.
// If your members table has no father_name column, remove it here.
const MEMBER_COLUMNS =
  "id, name, surname, father_name, internal_code, mobile, designation, gender, mandal_id, mandals (id, name, kshetra_id)";

const EMPTY = [];
const DEFAULT_SCOPE = { mandalIds: [], kshetraId: null, isGlobal: false };
const DEFAULT_ADV_FILTERS = { kshetra_id: "", mandal_id: "", designation: "", gender: "" };
const DEFAULT_SORT = [{ column: "name", ascending: true }];
const ROW_STYLE = { contentVisibility: "auto", containIntrinsicSize: "auto 64px" };
const DESIGNATIONS = ["Nirdeshak", "Nirikshak", "Sanchalak", "Member", "Sah Sanchalak", "Sampark Karyakar"];
const SORTABLE_COLUMNS = [
  { value: "name", label: "First Name" },
  { value: "surname", label: "Last Name" },
  { value: "internal_code", label: "Internal ID" },
  { value: "mandal", label: "Mandal" },
  { value: "designation", label: "Designation" },
  { value: "time", label: "Check-in Time" },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// ───────────────────────── helpers ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const timeoutSignal = (ms) => {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

// network blips, timeouts, 5xx, overloaded DB => worth retrying
const TRANSIENT_CODES = new Set(["57014", "53300", "08006", "08001", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]);
const isTransient = (e) => !e?.code || TRANSIENT_CODES.has(e.code) || e?.status >= 500;

const withRetry = async (fn, attempts = MARK_ATTEMPTS) => {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isTransient(e)) throw e;
      await sleep(250 * 2 ** i + Math.random() * 150); // jitter avoids retry stampedes
    }
  }
};

const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
};

// stable data (roster): first page returns the count, the rest download in parallel
const fetchAllParallel = async (build, signal) => {
  const first = await build({ count: "exact" }).range(0, PAGE - 1).abortSignal(signal);
  if (first.error) throw first.error;
  const rows = first.data || [];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE || total <= PAGE) return rows;

  const pageIdx = Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, k) => k + 1);
  const pages = await mapLimit(pageIdx, FETCH_CONCURRENCY, async (p) => {
    const { data, error } = await build().range(p * PAGE, (p + 1) * PAGE - 1).abortSignal(signal);
    if (error) throw error;
    return data || [];
  });
  return rows.concat(...pages);
};

// live data (attendance): keyset pagination, so rows being added/removed during the
// download can never cause skipped or duplicated rows
const fetchAllKeyset = async (build, signal) => {
  const all = [];
  let lastId = null;
  for (;;) {
    const { data, error } = await build(lastId).abortSignal(signal);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) all.push(row);
    if (data.length < PAGE) break;
    lastId = data[data.length - 1].id;
  }
  return all;
};

// "Patel  Jay" -> ["patel","jay"]; "+91 98765 43210" -> ["9876543210"]
const getTokens = (raw) => {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return [];
  if (/^[\d\s+\-()]+$/.test(s)) {
    let d = s.replace(/\D/g, "");
    if (d.length > 10) d = d.slice(-10);
    return d ? [d] : [];
  }
  return s.split(/\s+/).slice(0, 8);
};

// ───────────────────────── data loaders ─────────────────────────
async function loadMeta({ projectId, eventId, signal }) {
  const [evt, proj] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).abortSignal(signal).maybeSingle(),
    supabase.from("projects").select("*").eq("id", projectId).abortSignal(signal).maybeSingle(),
  ]);
  if (evt.error) throw evt.error;
  if (proj.error) throw proj.error;
  if (!evt.data || !proj.data) throw Object.assign(new Error("NOT_FOUND"), { notFound: true });
  return { event: evt.data, project: proj.data };
}

async function loadRoster({ projectId, profile, signal }) {
  const role = (profile.role || "").toLowerCase().trim();
  const homeMandal = profile.assigned_mandal_id || profile.mandal_id;
  const homeKshetra = profile.assigned_kshetra_id || profile.kshetra_id;

  let isGlobal = role === "admin" || role === "taker";
  let kshetraId = null;
  let mandalIds = [];

  const { data: assignment, error: aErr } = await supabase
    .from("project_assignments")
    .select("role, data_scope, scope_mandal_ids")
    .eq("project_id", projectId)
    .eq("user_id", profile.id)
    .abortSignal(signal)
    .maybeSingle();
  if (aErr) throw aErr;

  const projectRole = assignment ? (assignment.role || "").toLowerCase().trim() : null;
  if (assignment) {
    const dScope = (assignment.data_scope || "").toLowerCase().trim();
    if (dScope === "global") isGlobal = true;
    if (dScope === "kshetra") kshetraId = homeKshetra;
    if (dScope === "mandal") {
      if (assignment.scope_mandal_ids?.length > 0) mandalIds.push(...assignment.scope_mandal_ids);
      else mandalIds.push(homeMandal);
    }
  }

  if (!isGlobal) {
    if (role === "sanchalak") {
      mandalIds.push(homeMandal);
    } else if (role === "nirikshak") {
      const { data: assigns, error } = await supabase
        .from("nirikshak_assignments")
        .select("mandal_id")
        .eq("nirikshak_id", profile.id)
        .abortSignal(signal);
      if (error) throw error;
      mandalIds.push(...(assigns || []).map((a) => a.mandal_id), homeMandal);
    } else if (role === "nirdeshak" || role === "project_admin") {
      if (!kshetraId) kshetraId = homeKshetra;
      if (!kshetraId && homeMandal) {
        const { data: mData } = await supabase
          .from("mandals")
          .select("kshetra_id")
          .eq("id", homeMandal)
          .abortSignal(signal)
          .maybeSingle();
        if (mData) kshetraId = mData.kshetra_id;
      }
    }
  }

  mandalIds = [...new Set(mandalIds.filter(Boolean))];
  const scope = { mandalIds, kshetraId, isGlobal };

  // scope is applied in the database: kshetra scope = all mandals of that kshetra
  let queryMandalIds = mandalIds;
  if (!isGlobal && kshetraId) {
    const { data, error } = await supabase
      .from("mandals")
      .select("id")
      .eq("kshetra_id", kshetraId)
      .abortSignal(signal);
    if (error) throw error;
    queryMandalIds = [...new Set([...mandalIds, ...(data || []).map((m) => m.id)])];
  }
  if (!isGlobal && queryMandalIds.length === 0) return { members: [], projectRole, scope };

  const rows = await fetchAllParallel((opts) => {
    let q = supabase
      .from("project_registrations")
      .select(`member_id, external_qr, members!inner (${MEMBER_COLUMNS})`, opts)
      .eq("project_id", projectId)
      .order("member_id", { ascending: true });
    if (!isGlobal) {
      q = q.in("members.mandal_id", queryMandalIds);
      if (profile.gender) q = q.eq("members.gender", profile.gender);
    }
    return q;
  }, signal);

  const members = [];
  for (const r of rows) {
    const m = r.members;
    if (!m) continue;
    const mobileDigits = String(m.mobile || "").replace(/\D/g, "");
    members.push({
      ...m,
      mobile_number: m.mobile,
      kshetra_id: m.mandals?.kshetra_id,
      mandal: m.mandals?.name || "Unknown",
      external_qr: r.external_qr,
      // one pre-lowercased string per member => search is a plain includes()
      _hay: [m.name, m.surname, m.father_name, m.internal_code, m.mobile, mobileDigits, m.mandals?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    });
  }
  return { members, projectRole, scope };
}

async function loadAttendance({ eventId, signal }) {
  const rows = await fetchAllKeyset((lastId) => {
    let q = supabase
      .from("attendance")
      .select("id, member_id, scanned_at, status")
      .eq("event_id", eventId)
      .or("status.is.null,status.neq.absent"); // legacy NULL status still counts as present
    if (lastId != null) q = q.gt("id", lastId);
    return q.order("id", { ascending: true }).limit(PAGE);
  }, signal);

  const byMember = new Map();
  for (const a of rows) byMember.set(a.member_id, a);
  return Array.from(byMember.values());
}

async function loadAbsences({ eventId, signal }) {
  return fetchAllParallel(
    (opts) =>
      supabase
        .from("absence_records")
        .select("member_id, category_id, notes", opts)
        .eq("event_id", eventId)
        .order("member_id", { ascending: true }),
    signal,
  );
}

// ───────────────────────── UI pieces ─────────────────────────
const MemberRow = React.memo(function MemberRow({
  member,
  isPresent,
  isSyncing,
  canMark,
  onMark,
  onMarkAbsence,
}) {
  const clickable = canMark && !isSyncing;
  return (
    <div
      style={ROW_STYLE}
      className={`p-3 rounded-md border flex items-center justify-between transition-colors duration-75 ${
        isSyncing
          ? "bg-amber-50 border-amber-200 opacity-90"
          : isPresent
            ? "bg-emerald-50/50 border-emerald-200"
            : "bg-white border-gray-200 hover:border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
      }`}
    >
      <div
        onClick={clickable ? () => onMark(member.id) : undefined}
        className={`flex items-center gap-3 overflow-hidden pr-3 flex-1 ${clickable ? "cursor-pointer" : ""}`}
      >
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
            member.name?.[0]
          )}
        </div>
        <div className="min-w-0">
          <div className={`font-semibold text-sm truncate ${isPresent || isSyncing ? "text-emerald-900" : "text-gray-900"}`}>
            {member.name} {member.surname}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold truncate flex items-center gap-1.5 mt-0.5">
            <span>{member.mandal}</span>
            <span className="font-inter lowercase tracking-normal text-gray-300">•</span>
            <span>{member.designation}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isPresent && canMark && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkAbsence(member.id);
            }}
            className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors border border-transparent hover:border-red-200"
            title="Mark absence with reason"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
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
});

// defined outside the page so it is not re-created (and re-mounted) on every render
function FilterRow({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 min-w-[120px] border border-gray-200 rounded-md p-2 bg-white text-sm font-medium flex justify-between items-center text-gray-700">
        {label}
      </div>
      <div className="flex-[1.5] relative">
        <select
          className="w-full border border-gray-200 rounded-md p-2 bg-white text-sm outline-none appearance-none cursor-pointer focus:border-[#5C3030]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
}

const RowSkeleton = () => (
  <div className="p-3 rounded-md border border-gray-200 bg-white flex items-center gap-3 animate-pulse">
    <div className="w-9 h-9 rounded-md bg-gray-100" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-gray-100 rounded w-1/2" />
      <div className="h-2 bg-gray-100 rounded w-1/3" />
    </div>
  </div>
);

// ───────────────────────── page ─────────────────────────
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
  const ABSENCE_KEY = useMemo(() => ["absence-records", eventId], [eventId]);

  const profileId = profile?.id;
  const sysRole = (profile?.role || "").toLowerCase().trim();
  const isAdmin = sysRole === "admin";
  const profileReady = !!profileId && profile?.role !== undefined;

  // ── UI state ──
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search); // typing never blocks on filtering
  const [filter, setFilter] = useState("all");
  const [mandalFilter, setMandalFilter] = useState(null);
  const [advFilters, setAdvFilters] = useState(DEFAULT_ADV_FILTERS);
  const [draftAdvFilters, setDraftAdvFilters] = useState(DEFAULT_ADV_FILTERS);
  const [sortConfig, setSortConfig] = useState(DEFAULT_SORT);
  const [draftSortConfig, setDraftSortConfig] = useState(DEFAULT_SORT);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState("filter");

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMounted, setScannerMounted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryMounted, setSummaryMounted] = useState(false);

  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [memberMarkingAbsent, setMemberMarkingAbsent] = useState(null);
  const [isAbsenceSaving, setIsAbsenceSaving] = useState(false);

  const [rtConnected, setRtConnected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(RENDER_STEP);

  // ── queries ──
  const metaQ = useQuery({
    queryKey: ["attendance-meta", projectId, eventId],
    queryFn: ({ signal }) => loadMeta({ projectId, eventId, signal }),
    enabled: !!projectId && !!eventId && profileReady,
    staleTime: ROSTER_STALE_MS,
    retry: (n, err) => !err?.notFound && n < 2,
  });

  const rosterQ = useQuery({
    queryKey: [
      "attendance-roster",
      projectId,
      profileId,
      sysRole,
      profile?.gender,
      profile?.assigned_mandal_id,
      profile?.mandal_id,
      profile?.assigned_kshetra_id,
      profile?.kshetra_id,
    ],
    queryFn: ({ signal }) => loadRoster({ projectId, profile, signal }),
    enabled: !!projectId && profileReady,
    staleTime: ROSTER_STALE_MS,
    structuralSharing: false, // large arrays: skip the deep-compare on refetch
  });

  const syncingRef = useRef(new Set());
  const [syncing, setSyncing] = useState(() => new Set());
  const beginSync = useCallback((id) => {
    syncingRef.current.add(id);
    setSyncing(new Set(syncingRef.current));
  }, []);
  const endSync = useCallback((id) => {
    syncingRef.current.delete(id);
    setSyncing(new Set(syncingRef.current));
  }, []);

  const attendanceQ = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async ({ signal }) => {
      const rows = await loadAttendance({ eventId, signal });
      // a refetch that started before an in-flight local mark must not undo it
      if (syncingRef.current.size) {
        const current = queryClient.getQueryData(QUERY_KEY) || EMPTY;
        const kept = current.filter((a) => syncingRef.current.has(a.member_id));
        return rows.filter((a) => !syncingRef.current.has(a.member_id)).concat(kept);
      }
      return rows;
    },
    enabled: !!eventId && profileReady,
    staleTime: 60000,
    structuralSharing: false,
    refetchOnWindowFocus: !rtConnected,
    refetchInterval: rtConnected ? RECONCILE_MS : POLL_MS,
  });

  const absenceQ = useQuery({
    queryKey: ABSENCE_KEY,
    queryFn: ({ signal }) => loadAbsences({ eventId, signal }),
    enabled: !!eventId && profileReady,
    staleTime: 60000,
    structuralSharing: false,
  });

  const members = rosterQ.data?.members ?? EMPTY;
  const scope = rosterQ.data?.scope ?? DEFAULT_SCOPE;
  const projectAssignment = rosterQ.data?.projectRole ?? null;
  const event = metaQ.data?.event;
  const project = metaQ.data?.project;
  const attendanceData = attendanceQ.data ?? EMPTY;

  const canMark = useMemo(() => {
    if (propReadOnly) return false;
    if (["admin", "taker", "sanchalak", "nirikshak", "nirdeshak"].includes(sysRole)) return true;
    if (["coordinator", "editor", "project_admin"].includes(projectAssignment)) return true;
    return false;
  }, [sysRole, propReadOnly, projectAssignment]);

  // ── derived lookups (rebuilt only when their source changes) ──
  const presentMap = useMemo(() => {
    const map = new Map();
    for (const a of attendanceData) map.set(a.member_id, a.scanned_at);
    return map;
  }, [attendanceData]);

  const absenceMap = useMemo(
    () => new Map((absenceQ.data ?? EMPTY).map((a) => [a.member_id, a])),
    [absenceQ.data],
  );

  // O(1) scan lookup by internal code, external badge or id
  const lookup = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      map.set(m.id, m);
      if (m.internal_code) map.set(m.internal_code, m);
      if (m.external_qr) map.set(m.external_qr, m);
    }
    return map;
  }, [members]);

  // refs let callbacks stay stable while always reading the latest data
  const presentRef = useRef(presentMap);
  const lookupRef = useRef(lookup);
  const absenceRef = useRef(absenceMap);
  presentRef.current = presentMap;
  lookupRef.current = lookup;
  absenceRef.current = absenceMap;

  // ── realtime: events are buffered and applied as ONE cache update ──
  useEffect(() => {
    if (!USE_REALTIME || !eventId) return;
    setRtConnected(false);

    let ops = new Map();     // member_id -> record | null (null = removed); last write wins
    let delIds = new Set();  // DELETE events that only carry the row id
    let timer = null;
    let everSubscribed = false;

    const flush = () => {
      timer = null;
      if (!ops.size && !delIds.size) return;
      const o = ops;
      const d = delIds;
      ops = new Map();
      delIds = new Set();
      queryClient.setQueryData(QUERY_KEY, (old = EMPTY) => {
        const map = new Map();
        for (const a of old) if (!d.has(a.id)) map.set(a.member_id, a);
        o.forEach((rec, memberId) => (rec ? map.set(memberId, rec) : map.delete(memberId)));
        return Array.from(map.values());
      });
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    };

    const channel = supabase
      .channel(`attendance-sync-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${eventId}` },
        (payload) => {
          const { eventType, new: n, old: o } = payload;
          if (eventType === "DELETE") {
            if (o?.member_id) ops.set(o.member_id, null);
            else if (o?.id != null) {
              delIds.add(o.id);
              for (const [k, v] of ops) if (v?.id === o.id) ops.delete(k);
            }
          } else if (n) {
            if (n.status === "absent") ops.set(n.member_id, null);
            else ops.set(n.member_id, { id: n.id, member_id: n.member_id, scanned_at: n.scanned_at, status: n.status });
          }
          schedule();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRtConnected(true);
          // after a drop, events may have been missed => resync once
          if (everSubscribed) queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          everSubscribed = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRtConnected(false);
        }
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient, QUERY_KEY]);

  // warm the scanner chunk shortly after load so the first tap on Scan is instant
  useEffect(() => {
    if (!canMark) return;
    const t = setTimeout(() => import("./QrScanner"), 1500);
    return () => clearTimeout(t);
  }, [canMark]);

  // ── marking (optimistic, with timeout + retry + rollback) ──
  const patchAttendance = useCallback(
    (memberId, record) => {
      queryClient.setQueryData(QUERY_KEY, (old = EMPTY) => {
        const rest = old.filter((a) => a.member_id !== memberId);
        return record ? [...rest, record] : rest;
      });
    },
    [queryClient, QUERY_KEY],
  );

  const markAttendance = useCallback(
    async (memberId) => {
      if (!canMark || !eventId || syncingRef.current.has(memberId)) return false;

      const prevScannedAt = presentRef.current.get(memberId);
      const wasPresent = prevScannedAt !== undefined;
      const now = new Date().toISOString();

      beginSync(memberId);
      patchAttendance(
        memberId,
        wasPresent ? null : { id: `local-${memberId}`, member_id: memberId, scanned_at: now, status: "present" },
      );

      try {
        await withRetry(async () => {
          const signal = timeoutSignal(REQUEST_TIMEOUT_MS);
          const { error } = wasPresent
            ? await supabase.from("attendance").delete().eq("event_id", eventId).eq("member_id", memberId).abortSignal(signal)
            : await supabase
                .from("attendance")
                .upsert(
                  { event_id: eventId, member_id: memberId, scanned_at: now, marked_by: profileId, status: "present" },
                  { onConflict: "event_id,member_id", ignoreDuplicates: true },
                )
                .abortSignal(signal);
          if (error) throw error;
        });
        return true;
      } catch (err) {
        console.error("[Marking Error]:", err);
        // roll the optimistic change back
        patchAttendance(
          memberId,
          wasPresent
            ? { id: `local-${memberId}`, member_id: memberId, scanned_at: prevScannedAt, status: "present" }
            : null,
        );
        toast.error("Could not save. Please try again.");
        return false;
      } finally {
        endSync(memberId);
      }
    },
    [canMark, eventId, profileId, patchAttendance, beginSync, endSync],
  );

  const handleMarkAbsence = useCallback((memberId) => {
    const member = lookupRef.current.get(memberId);
    if (!member) return;
    const existing = absenceRef.current.get(memberId);
    setMemberMarkingAbsent({
      ...member,
      absence_category_id: existing?.category_id || "",
      absence_notes: existing?.notes || "",
    });
    setAbsenceModalOpen(true);
  }, []);

  const handleAbsenceReasonSave = useCallback(
    async (categoryId, notes) => {
      const target = memberMarkingAbsent;
      if (!target || !eventId) return;
      const memberId = target.id;

      setIsAbsenceSaving(true);
      beginSync(memberId);
      try {
        await withRetry(async () => {
          const del = await supabase
            .from("attendance")
            .delete()
            .eq("event_id", eventId)
            .eq("member_id", memberId)
            .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS));
          if (del.error) throw del.error;

          const up = await supabase
            .from("absence_records")
            .upsert(
              {
                event_id: eventId,
                member_id: memberId,
                category_id: categoryId,
                notes: notes || null,
                recorded_by: profileId,
              },
              { onConflict: "event_id,member_id" },
            )
            .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS));
          if (up.error) throw up.error;
        });

        patchAttendance(memberId, null);
        queryClient.setQueryData(ABSENCE_KEY, (old = EMPTY) => [
          ...old.filter((a) => a.member_id !== memberId),
          { member_id: memberId, category_id: categoryId, notes: notes || null },
        ]);
        toast.success(`${target.name} marked absent with reason`);
        setAbsenceModalOpen(false);
        setMemberMarkingAbsent(null);
      } catch (err) {
        console.error("[Absence Save Error]:", err);
        toast.error("Failed to save absence reason");
      } finally {
        setIsAbsenceSaving(false);
        endSync(memberId);
      }
    },
    [memberMarkingAbsent, eventId, profileId, queryClient, ABSENCE_KEY, patchAttendance, beginSync, endSync],
  );

  const handleScan = useCallback(
    async (code) => {
      if (!canMark) return { success: false, message: "Read Only" };

      const member = lookupRef.current.get(String(code || "").trim());
      if (!member) return { success: false, message: "❌ Not in Roster" };
      if (presentRef.current.has(member.id))
        return { success: false, message: `⚠️ ${member.name} Already Marked Present` };
      if (syncingRef.current.has(member.id)) return { success: false, message: "⏳ Saving..." };

      const ok = await markAttendance(member.id);
      return ok
        ? { success: true, message: `✓ ${member.name} Marked Present` }
        : { success: false, message: "🔄 Network Error - Try Again" };
    },
    [canMark, markAttendance],
  );

  // ── filtering & sorting ──
  const hasTimeSort = sortConfig.some((s) => s.column === "time");
  const timeDep = hasTimeSort ? presentMap : null; // presence only matters for "time" sort

  // heavy step: search + filters + sort. Does NOT re-run when someone is marked present.
  const baseList = useMemo(() => {
    const tokens = getTokens(deferredSearch);
    const out = [];
    for (const m of members) {
      if (mandalFilter && m.mandal_id !== mandalFilter) continue;
      if (advFilters.kshetra_id && m.kshetra_id !== advFilters.kshetra_id) continue;
      if (advFilters.mandal_id && m.mandal_id !== advFilters.mandal_id) continue;
      if (advFilters.designation && m.designation !== advFilters.designation) continue;
      if (advFilters.gender && m.gender !== advFilters.gender) continue;
      if (tokens.length && !tokens.every((t) => m._hay.includes(t))) continue;
      out.push(m);
    }
    out.sort((a, b) => {
      for (const s of sortConfig) {
        let r;
        if (s.column === "time") {
          const ta = timeDep?.get(a.id) ?? "0";
          const tb = timeDep?.get(b.id) ?? "0";
          r = ta < tb ? -1 : ta > tb ? 1 : 0;
        } else {
          r = collator.compare(String(a[s.column] ?? ""), String(b[s.column] ?? ""));
        }
        if (r) return s.ascending ? r : -r;
      }
      return 0;
    });
    return out;
  }, [members, mandalFilter, advFilters, deferredSearch, sortConfig, timeDep]);

  // cheap step: present / absent tab
  const filteredList = useMemo(() => {
    if (filter === "all") return baseList;
    const wantPresent = filter === "present";
    return baseList.filter((m) => presentMap.has(m.id) === wantPresent);
  }, [baseList, filter, presentMap]);

  // only the first chunk is rendered; more is added while scrolling
  useEffect(() => {
    setVisibleCount(RENDER_STEP);
  }, [deferredSearch, filter, mandalFilter, advFilters, sortConfig]);

  const visibleList = useMemo(() => filteredList.slice(0, visibleCount), [filteredList, visibleCount]);

  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= filteredList.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + RENDER_STEP);
      },
      { root: scrollRef.current, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, filteredList.length]);

  const presentCount = useMemo(() => {
    let n = 0;
    for (const m of members) if (presentMap.has(m.id)) n++;
    return n;
  }, [members, presentMap]);

  const userScope = useMemo(
    () => ({
      role: sysRole,
      gender: profile?.gender,
      mandalIds: scope.mandalIds,
      kshetraId: scope.kshetraId,
      isGlobal: scope.isGlobal,
    }),
    [sysRole, profile?.gender, scope],
  );

  // ── admin dropdowns ──
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

  // ── handlers ──
  const handleMandalClick = useCallback((mandalId) => {
    setMandalFilter(mandalId);
    setFilter("all");
    setShowSummary(false);
  }, []);

  const openFilter = () => {
    setDraftAdvFilters({ ...advFilters });
    setDraftSortConfig(sortConfig.map((s) => ({ ...s }))); // clone: never mutate applied state
    setDrawerTab("filter");
    setIsFilterOpen(true);
  };
  const openScanner = () => {
    setScannerMounted(true);
    setIsScannerOpen(true);
  };
  const openSummary = () => {
    setSummaryMounted(true);
    setShowSummary(true);
  };
  const refreshAll = () => {
    rosterQ.refetch();
    attendanceQ.refetch();
    absenceQ.refetch();
  };
  const updateDraftSort = (index, patch) =>
    setDraftSortConfig((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const activeFilterCount = Object.values(advFilters).filter((v) => v !== "").length;
  const isRefreshing = rosterQ.isFetching || attendanceQ.isFetching;
  const rosterLoading = rosterQ.isLoading;
  const rosterError = rosterQ.isError && !rosterQ.data;

  // ── early returns (all hooks are above) ──
  if (metaQ.isError && metaQ.error?.notFound)
    return (
      <div className="p-8 text-center text-red-500 font-semibold border border-red-200 bg-red-50 rounded-md">
        This event or project no longer exists.
      </div>
    );
  if (metaQ.isError)
    return (
      <div className="p-8 text-center bg-red-50 border border-red-200 rounded-md">
        <AlertTriangle className="mx-auto text-red-500 mb-2" size={24} strokeWidth={1.5} />
        <p className="text-red-700 font-semibold text-sm">Failed to load event details.</p>
        <Button variant="danger" size="sm" onClick={() => metaQ.refetch()} className="mt-4">
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  if (!event || !project)
    return (
      <div className="h-full flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-gray-400" size={32} strokeWidth={1.5} />
      </div>
    );

  return (
    <div
      className={`flex flex-col bg-white ${
        embedded ? "h-full rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden" : "h-[100dvh]"
      }`}
    >
      {/* header */}
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
            <h1 className="font-semibold text-gray-900 text-base truncate">{event.name}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span
                title={rtConnected ? "Live" : "Reconnecting… auto-refreshing"}
                className={`w-2 h-2 rounded-full ${
                  syncing.size > 0
                    ? "bg-amber-400 animate-pulse"
                    : attendanceQ.isLoading
                      ? "bg-blue-400 animate-pulse"
                      : rtConnected || !USE_REALTIME
                        ? "bg-emerald-500"
                        : "bg-gray-400"
                }`}
              />
              <span className="font-inter font-semibold text-gray-700">{presentCount}</span> / {members.length} Present
              {!canMark && (
                <Badge className="ml-1">
                  <Lock size={10} className="inline mr-1" strokeWidth={2} /> View Only
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            <Button variant="secondary" onClick={refreshAll} className="!px-3" title="Refresh">
              <RefreshCw size={16} strokeWidth={2} className={isRefreshing ? "animate-spin" : ""} />
            </Button>
            {!hideSummary && (
              <Button variant="secondary" onClick={openSummary} className="!px-3">
                <BarChart2 size={16} strokeWidth={2} />
              </Button>
            )}
            {canMark && (
              <Button icon={QrCode} onClick={openScanner}>
                Scan
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
              <input
                className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 focus:border-[#5C3030] rounded-md outline-none text-sm transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                placeholder="Search name, surname, mobile or ID..."
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
              <Button variant="secondary" onClick={openFilter} className="relative shrink-0 !bg-white px-3 sm:px-4">
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
                className={`flex-1 md:flex-none px-3 py-1.5 text-xs font-semibold capitalize rounded-md transition-all whitespace-nowrap ${
                  filter === f ? "bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 relative pb-24">
        {rosterLoading && Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} />)}

        {rosterError && (
          <div className="p-6 text-center bg-red-50 rounded-md border border-red-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <AlertTriangle className="mx-auto text-red-500 mb-2" size={24} strokeWidth={1.5} />
            <p className="text-red-700 font-semibold text-sm">Failed to load data. Please retry.</p>
            <Button variant="danger" size="sm" onClick={() => rosterQ.refetch()} className="mt-4">
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        )}

        {!rosterLoading && !rosterError && filteredList.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            No members found.
          </div>
        )}

        {visibleList.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isPresent={presentMap.has(m.id)}
            isSyncing={syncing.has(m.id)}
            canMark={canMark}
            onMark={markAttendance}
            onMarkAbsence={handleMarkAbsence}
          />
        ))}

        {visibleCount < filteredList.length && (
          <div ref={sentinelRef} className="py-4 text-center text-[10px] uppercase font-semibold tracking-widest text-gray-400">
            <Loader2 className="animate-spin inline" size={14} />
          </div>
        )}
      </div>

      {/* filter / sort drawer */}
      {isAdmin && isFilterOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-gray-900">Configure View</h2>
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
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all ${
                    drawerTab === "filter" ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Filter
                </button>
                <button
                  onClick={() => setDrawerTab("sort")}
                  className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                    drawerTab === "sort" ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <SortAsc size={14} /> Sort
                </button>
              </div>

              {drawerTab === "filter" ? (
                <div className="space-y-1 animate-in fade-in duration-200">
                  <FilterRow
                    label="Kshetra"
                    value={draftAdvFilters.kshetra_id}
                    onChange={(v) => setDraftAdvFilters((p) => ({ ...p, kshetra_id: v }))}
                    options={dropdowns?.kshetras.map((k) => ({ value: k.id, label: k.name })) || []}
                  />
                  <FilterRow
                    label="Mandal"
                    value={draftAdvFilters.mandal_id}
                    onChange={(v) => setDraftAdvFilters((p) => ({ ...p, mandal_id: v }))}
                    options={
                      dropdowns?.mandals
                        .filter((m) => !draftAdvFilters.kshetra_id || m.kshetra_id === draftAdvFilters.kshetra_id)
                        .map((m) => ({ value: m.id, label: m.name })) || []
                    }
                  />
                  <FilterRow
                    label="Designation"
                    value={draftAdvFilters.designation}
                    onChange={(v) => setDraftAdvFilters((p) => ({ ...p, designation: v }))}
                    options={DESIGNATIONS.map((d) => ({ value: d, label: d }))}
                  />
                  <FilterRow
                    label="Gender"
                    value={draftAdvFilters.gender}
                    onChange={(v) => setDraftAdvFilters((p) => ({ ...p, gender: v }))}
                    options={[
                      { value: "Yuvak", label: "Yuvak" },
                      { value: "Yuvati", label: "Yuvati" },
                    ]}
                  />
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Multi-Level Sorting</p>
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
                        onChange={(e) => updateDraftSort(index, { column: e.target.value })}
                      >
                        {SORTABLE_COLUMNS.map((col) => (
                          <option key={col.value} value={col.value}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-24 border border-gray-200 rounded-md p-1.5 bg-white text-sm outline-none cursor-pointer focus:border-[#5C3030]"
                        value={sort.ascending.toString()}
                        onChange={(e) => updateDraftSort(index, { ascending: e.target.value === "true" })}
                      >
                        <option value="true">A-Z / Asc</option>
                        <option value="false">Z-A / Desc</option>
                      </select>
                      {draftSortConfig.length > 1 && (
                        <button
                          onClick={() => setDraftSortConfig((prev) => prev.filter((_, i) => i !== index))}
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
                      onClick={() => setDraftSortConfig((prev) => [...prev, { column: "designation", ascending: true }])}
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
                  setAdvFilters(DEFAULT_ADV_FILTERS);
                  setSortConfig(DEFAULT_SORT);
                  setMandalFilter(null);
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

      {!hideSummary && summaryMounted && (
        <Suspense fallback={null}>
          <AttendanceSummary
            isVisible={showSummary}
            onClose={() => setShowSummary(false)}
            event={event}
            project={project}
            userScope={userScope}
            onMandalClick={handleMandalClick}
          />
        </Suspense>
      )}

      {canMark && scannerMounted && (
        <Suspense fallback={null}>
          <QrScanner
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScan={handleScan}
            eventName={event.name}
          />
        </Suspense>
      )}

      <AbsenceReasonModal
        isOpen={absenceModalOpen}
        onClose={() => {
          setAbsenceModalOpen(false);
          setMemberMarkingAbsent(null);
        }}
        member={memberMarkingAbsent}
        onSave={handleAbsenceReasonSave}
        isSaving={isAbsenceSaving}
      />
    </div>
  );
}