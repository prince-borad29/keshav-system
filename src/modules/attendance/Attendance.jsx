import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
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
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import QrScanner from "./QrScanner";
import { useAuth } from "../../contexts/AuthContext";
import AttendanceSummary from "./AttendanceSummary";

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

  const projectId = propPid || params.projectId;
  const eventId = propEid || params.eventId;

  // Permissions
  const canMark = useMemo(() => {
    if (propReadOnly) return false;
    return ["admin", "taker", "project_admin"].includes(
      (profile?.role || "").toLowerCase(),
    );
  }, [profile?.role, propReadOnly]); // Optimized dependency array

  // --- STATE ---
  const [initLoading, setInitLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const [event, setEvent] = useState(null);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [presentMap, setPresentMap] = useState(new Map());

  // REVERSE LOOKUP DICTIONARY
  const attendanceIdMap = useRef(new Map());

  // Scope State
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

  // Use a ref to prevent double-fetching on tab refocus
  const hasLoadedInitial = useRef(false);

  // --- 1. LOAD METADATA ---
  useEffect(() => {
    if (projectId && eventId && profile?.id && !hasLoadedInitial.current) {
      loadMetadata();
    }
  }, [projectId, eventId, profile?.id]); // Deeply specific dependencies to prevent refocus bugs

  const loadMetadata = async () => {
    hasLoadedInitial.current = true; // Lock it down
    try {
      setInitLoading(true);
      const [evtRes, projRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase.from("projects").select("*").eq("id", projectId).single(),
      ]);

      if (evtRes.error || projRes.error) throw new Error("Event not found");
      setEvent(evtRes.data);
      setProject(projRes.data);

      await loadRosterData(); // Wait for roster to load
    } catch (err) {
      console.error("Meta Load Error:", err);
      setError("Failed to load event details.");
    } finally {
      setInitLoading(false);
    }
  };

  // --- 2. LOAD ROSTER ---
  // Wrapped in useCallback so it doesn't get recreated constantly
  const loadRosterData = useCallback(async () => {
    if (!projectId) return;

    try {
      setDataLoading(true);
      setError(null);

      const cleanRole = (profile?.role || "").toLowerCase().trim();
      let allowedMandalIds = [];
      let allowedKshetraId = null;

      if (cleanRole === "sanchalak") {
        const mId = profile.assigned_mandal_id || profile.mandal_id;
        if (mId) allowedMandalIds = [mId];
      } else if (cleanRole === "nirikshak") {
        const { data: assigns } = await supabase
          .from("nirikshak_assignments")
          .select("mandal_id")
          .eq("nirikshak_id", profile.id);
        if (assigns) allowedMandalIds = assigns.map((a) => a.mandal_id);
        const profileMandal = profile.assigned_mandal_id || profile.mandal_id;
        if (profileMandal) allowedMandalIds.push(profileMandal);
        allowedMandalIds = [...new Set(allowedMandalIds)];
      } else if (cleanRole === "nirdeshak" || cleanRole === "project_admin") {
        allowedKshetraId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (
          !allowedKshetraId &&
          (profile.assigned_mandal_id || profile.mandal_id)
        ) {
          const mId = profile.assigned_mandal_id || profile.mandal_id;
          const { data: mData } = await supabase
            .from("mandals")
            .select("kshetra_id")
            .eq("id", mId)
            .single();
          if (mData) allowedKshetraId = mData.kshetra_id;
        }
      }

      setScopePermissions({
        mandalIds: allowedMandalIds,
        kshetraId: allowedKshetraId,
      });

      const { data: regData, error: regError } = await supabase
        .from("project_registrations")
        .select(
          `
        member_id, seat_number, exam_level, external_qr,
        members (id, name, surname, internal_code, mobile, designation, gender, mandal_id, mandals ( id, name, kshetra_id ))
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
            exam_level: r.exam_level,
            external_qr: r.external_qr, // ADD THIS LINE
          };
        })
        .filter(Boolean);

      const userGender = profile?.gender;

      const filteredRoster = rawRoster.filter((m) => {
        if (cleanRole === "admin") return true;
        if (userGender && m.gender !== userGender) return false;
        if (cleanRole === "sanchalak" || cleanRole === "nirikshak")
          return allowedMandalIds.includes(m.mandal_id);
        if (cleanRole === "nirdeshak" || cleanRole === "project_admin")
          return allowedKshetraId && m.kshetra_id === allowedKshetraId;
        if (cleanRole === "taker") return true;
        return false;
      });

      filteredRoster.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(filteredRoster);

      // --- FETCH ATTENDANCE WITH ROW IDs ---
      const { data: attData } = await supabase
        .from("attendance")
        .select("id, member_id, scanned_at")
        .eq("event_id", eventId);

      const newMap = new Map();
      attendanceIdMap.current.clear();

      (attData || []).forEach((a) => {
        newMap.set(a.member_id, a.scanned_at);
        attendanceIdMap.current.set(a.id, a.member_id);
      });
      setPresentMap(newMap);
    } catch (err) {
      console.error("Data Load Error:", err);
      setError("Failed to load data.");
    } finally {
      setDataLoading(false);
    }
  }, [projectId, eventId, profile]);

  // --- 3. REALTIME SYNC (WITH DICTIONARY LOOKUP) ---
  useEffect(() => {
    if (!eventId) return;

    const attendanceChannel = supabase
      .channel(`attendance-sync-${eventId}`, {
        config: {
          presence: { key: profile?.id },
        },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
        (payload) => {
          if (
            payload.eventType === "INSERT" &&
            payload.new.event_id === eventId
          ) {
            attendanceIdMap.current.set(payload.new.id, payload.new.member_id);
            setPresentMap((prevMap) => {
              const nextMap = new Map(prevMap);
              nextMap.set(
                payload.new.member_id,
                payload.new.scanned_at || new Date().toISOString(),
              );
              return nextMap;
            });
          } else if (payload.eventType === "DELETE") {
            const deletedRowId = payload.old?.id;
            const memberIdToUnmark = attendanceIdMap.current.get(deletedRowId);

            if (memberIdToUnmark) {
              attendanceIdMap.current.delete(deletedRowId);
              setPresentMap((prevMap) => {
                const nextMap = new Map(prevMap);
                nextMap.delete(memberIdToUnmark);
                return nextMap;
              });
            }
          }
        },
      )
      .subscribe((status) => {
        // Silently handle reconnections on tab switch without crashing
        if (status === "SUBSCRIBED") {
          console.log("Realtime Connected");
        }
      });

    return () => {
      supabase.removeChannel(attendanceChannel);
    };
  }, [eventId, profile?.id]);

  // --- 4. HELPERS ---
  const handleMandalClick = (mandalId, mandalName) => {
    setMandalFilter(mandalId);
    setMandalFilterName(mandalName);
    setFilter("all");
    setShowSummary(false);
  };

  const userScope = useMemo(
    () => ({
      role: (profile?.role || "").toLowerCase(),
      gender: profile?.gender,
      mandalIds: scopePermissions.mandalIds,
      kshetraId: scopePermissions.kshetraId,
      isGlobal: profile?.role === "admin",
    }),
    [profile?.role, profile?.gender, scopePermissions],
  );

  const presentCount = useMemo(() => {
    return members.filter((m) => presentMap.has(m.id)).length;
  }, [members, presentMap]);

  // --- 5. ACTIONS ---
  const markAttendance = async (memberId) => {
    if (!canMark) return;

    const now = new Date().toISOString();
    const isPresent = presentMap.has(memberId);

    setPresentMap((prev) => {
      const next = new Map(prev);
      if (isPresent) next.delete(memberId);
      else next.set(memberId, now);
      return next;
    });

    setSyncing(true);
    try {
      if (isPresent)
        await supabase
          .from("attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("member_id", memberId);
      else
        await supabase
          .from("attendance")
          .insert({ event_id: eventId, member_id: memberId });
    } catch (err) {
      setPresentMap((prev) => {
        const next = new Map(prev);
        if (isPresent) next.set(memberId, now);
        else next.delete(memberId);
        return next;
      });
      alert("Sync failed. Check connection.");
    } finally {
      setSyncing(false);
    }
  };

  const handleScan = async (code) => {
    if (!canMark) return { success: false, message: "Read Only" };

    const member = members.find(
      (m) => m.internal_code === code || m.id === code,
    );
    if (!member)
      return { success: false, message: "Not in Roster", type: "error" };
    if (presentMap.has(member.id))
      return { success: false, message: "Already In", type: "warning" };

    markAttendance(member.id);
    return { success: true, message: `${member.name} In!` };
  };

  // --- 6. RENDER ---
  if (initLoading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" />
      </div>
    );
  if (!event)
    return <div className="p-8 text-center text-red-500">Event not found.</div>;

  const filteredList = members.filter((m) => {
    if (mandalFilter && m.mandal_id !== mandalFilter) return false;
    if (
      search &&
      !`${m.name} ${m.surname} ${m.internal_code}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;

    const isPresent = presentMap.has(m.id);
    if (filter === "present" && !isPresent) return false;
    if (filter === "absent" && isPresent) return false;
    return true;
  });

  return (
    <div
      className={`flex flex-col bg-slate-50 ${embedded ? "h-full rounded-xl border border-slate-200 shadow-sm overflow-hidden" : "h-[100dvh]"}`}
    >
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          {!embedded && (
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100"
            >
              <ArrowLeft size={22} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-slate-800 leading-tight truncate">
              {event.name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${syncing ? "bg-yellow-400 animate-pulse" : "bg-green-500"}`}
              ></span>
              <span className="font-semibold text-slate-700">
                {presentCount}
              </span>{" "}
              / {members.length} Present
              {!canMark && (
                <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] uppercase font-bold flex items-center gap-1">
                  <Lock size={8} /> View
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {!hideSummary && (
              <button
                onClick={() => setShowSummary(true)}
                className="bg-white text-indigo-600 border border-indigo-100 p-3 rounded-xl shadow-sm active:scale-95 transition-transform"
              >
                <BarChart2 size={20} />
              </button>
            )}
            {canMark && (
              <button
                onClick={() => setIsScannerOpen(true)}
                className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
              >
                <QrCode size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 border rounded-xl outline-none text-sm"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            {["all", "present", "absent"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${filter === f ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {mandalFilter && (
          <div className="mt-2 flex items-center justify-between bg-indigo-50 px-3 py-2 rounded-lg text-xs text-indigo-700 font-bold border border-indigo-100 animate-in slide-in-from-top-2">
            <span className="flex items-center gap-1">
              <Filter size={12} /> Filtering: {mandalFilterName}
            </span>
            <button
              onClick={() => {
                setMandalFilter(null);
                setMandalFilterName(null);
              }}
              className="p-1 hover:bg-indigo-100 rounded-full"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-20 relative">
        {dataLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-2 text-indigo-600" size={32} />
            <p className="text-xs font-bold uppercase tracking-wider">
              Loading Roster...
            </p>
          </div>
        )}

        {error && (
          <div className="p-6 text-center bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="mx-auto text-red-400 mb-2" size={24} />
            <p className="text-red-600 font-medium text-sm">{error}</p>
            <button
              onClick={loadRosterData}
              className="mt-3 text-xs bg-white border border-red-200 px-3 py-1.5 rounded-lg text-red-700 font-bold flex items-center gap-1 mx-auto"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {!dataLoading && !error && filteredList.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No members found.
          </div>
        )}

        {filteredList.map((m) => {
          const isPresent = presentMap.has(m.id);
          return (
            <div
              key={m.id}
              onClick={() => canMark && markAttendance(m.id)}
              className={`
                    p-3 rounded-xl border flex items-center justify-between transition-all 
                    ${canMark ? "cursor-pointer active:scale-[0.98]" : ""} 
                    ${isPresent ? "bg-green-50/50 border-green-200" : "bg-white border-slate-200"}
                  `}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isPresent ? "bg-green-500 text-white shadow-md shadow-green-200" : "bg-slate-100 text-slate-500"}`}
                >
                  {isPresent ? <Check size={20} /> : m.name[0]}
                </div>
                <div className="min-w-0">
                  <div
                    className={`font-bold text-sm truncate ${isPresent ? "text-green-800" : "text-slate-800"}`}
                  >
                    {m.name} {m.surname}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {m.mandal} • {m.designation}
                  </div>
                </div>
              </div>
              {isPresent && (
                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  IN
                </span>
              )}
            </div>
          );
        })}
      </div>

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
