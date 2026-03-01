import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ArrowLeft, Check, QrCode, Loader2, BarChart2, Filter, X, Lock, RefreshCw, AlertTriangle, Phone } from "lucide-react";
import { supabase } from "../../lib/supabase";
import QrScanner from "./QrScanner";
import { useAuth } from "../../contexts/AuthContext";
import AttendanceSummary from "./AttendanceSummary";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";

export default function Attendance({ projectId: propPid, eventId: propEid, embedded = false, readOnly: propReadOnly = false, hideSummary = false }) {
  const params = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const projectId = propPid || params.projectId;
  const eventId = propEid || params.eventId;

  const canMark = useMemo(() => {
    if (propReadOnly) return false;
    return ["admin", "taker", "project_admin"].includes((profile?.role || "").toLowerCase());
  }, [profile?.role, propReadOnly]);

  // --- STATE ---
  const [initLoading, setInitLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const [event, setEvent] = useState(null);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [presentMap, setPresentMap] = useState(new Map());
  const attendanceIdMap = useRef(new Map());

  const [scopePermissions, setScopePermissions] = useState({ mandalIds: [], kshetraId: null });
  const [search, setSearch] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [filter, setFilter] = useState("all");
  const [mandalFilter, setMandalFilter] = useState(null);
  const [mandalFilterName, setMandalFilterName] = useState(null);

  // --- 1. LOAD ROSTER (No Abort Signals) ---
  const loadRosterData = useCallback(async (isMounted) => {
    if (!projectId) return;
    try {
      if (isMounted) { setDataLoading(true); setError(null); }

      const cleanRole = (profile?.role || "").toLowerCase().trim();
      let allowedMandalIds = [];
      let allowedKshetraId = null;

      // Scope Check
      if (cleanRole === "sanchalak") {
        const mId = profile.assigned_mandal_id || profile.mandal_id;
        if (mId) allowedMandalIds = [mId];
      } else if (cleanRole === "nirikshak") {
        const { data: assigns } = await supabase.from("nirikshak_assignments").select("mandal_id").eq("nirikshak_id", profile.id);
        if (assigns) allowedMandalIds = assigns.map((a) => a.mandal_id);
        const profileMandal = profile.assigned_mandal_id || profile.mandal_id;
        if (profileMandal) allowedMandalIds.push(profileMandal);
        allowedMandalIds = [...new Set(allowedMandalIds)];
      } else if (cleanRole === "nirdeshak" || cleanRole === "project_admin") {
        allowedKshetraId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!allowedKshetraId && (profile.assigned_mandal_id || profile.mandal_id)) {
          const mId = profile.assigned_mandal_id || profile.mandal_id;
          const { data: mData } = await supabase.from("mandals").select("kshetra_id").eq("id", mId).single();
          if (mData) allowedKshetraId = mData.kshetra_id;
        }
      }

      if (isMounted) setScopePermissions({ mandalIds: allowedMandalIds, kshetraId: allowedKshetraId });

      // Fetch Roster
      const { data: regData, error: regError } = await supabase
        .from("project_registrations")
        .select(`member_id, seat_number, exam_level, external_qr, members (id, name, surname, internal_code, mobile, designation, gender, mandal_id, mandals ( id, name, kshetra_id ))`)
        .eq("project_id", projectId);

      if (regError) throw regError;

      let rawRoster = (regData || []).map((r) => {
        const m = r.members;
        if (!m) return null;
        return { ...m, mobile_number: m.mobile, kshetra_id: m.mandals?.kshetra_id, mandal: m.mandals?.name || "Unknown", seat_number: r.seat_number, external_qr: r.external_qr };
      }).filter(Boolean);

      const userGender = profile?.gender;
      const filteredRoster = rawRoster.filter((m) => {
        if (cleanRole === "admin" || cleanRole === "taker") return true;
        if (userGender && m.gender !== userGender) return false;
        if (cleanRole === "sanchalak" || cleanRole === "nirikshak") return allowedMandalIds.includes(m.mandal_id);
        if (cleanRole === "nirdeshak" || cleanRole === "project_admin") return allowedKshetraId && m.kshetra_id === allowedKshetraId;
        return false;
      }).sort((a, b) => a.name.localeCompare(b.name));

      if (isMounted) setMembers(filteredRoster);

      // Fetch Attendance
      const { data: attData } = await supabase.from("attendance").select("id, member_id, scanned_at").eq("event_id", eventId);
      const newMap = new Map();
      attendanceIdMap.current.clear();
      
      (attData || []).forEach((a) => {
        newMap.set(a.member_id, a.scanned_at);
        attendanceIdMap.current.set(a.id, a.member_id);
      });
      
      if (isMounted) setPresentMap(newMap);

    } catch (err) {
      if (isMounted) setError("Failed to load data.");
    } finally {
      if (isMounted) setDataLoading(false);
    }
  }, [projectId, eventId, profile]);

  // --- 2. LOAD METADATA ---
  useEffect(() => {
    let isMounted = true;

    const loadMetadata = async () => {
      try {
        setInitLoading(true);
        const [evtRes, projRes] = await Promise.all([
          supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
          supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
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

    if (projectId && eventId && profile?.id) {
      loadMetadata();
    }

    return () => { isMounted = false; }; 
  }, [projectId, eventId, profile?.id, loadRosterData]);

  // --- 3. REALTIME SYNC ---
  useEffect(() => {
    if (!eventId) return;
    const attendanceChannel = supabase.channel(`attendance-sync-${eventId}`, { config: { presence: { key: profile?.id } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
        if (payload.eventType === "INSERT" && payload.new.event_id === eventId) {
          attendanceIdMap.current.set(payload.new.id, payload.new.member_id);
          setPresentMap((prevMap) => {
            const nextMap = new Map(prevMap);
            nextMap.set(payload.new.member_id, payload.new.scanned_at || new Date().toISOString());
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
      }).subscribe();

    return () => { supabase.removeChannel(attendanceChannel); };
  }, [eventId, profile?.id]);

  // --- 4. ACTIONS & FILTERING ---
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
      if (isPresent) await supabase.from("attendance").delete().eq("event_id", eventId).eq("member_id", memberId);
      else await supabase.from("attendance").insert({ event_id: eventId, member_id: memberId });
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
    const cleanCode = code.trim();
    const member = members.find((m) => m.internal_code === cleanCode || m.id === cleanCode || m.external_qr === cleanCode);
    if (!member) return { success: false, message: "Not in Roster", type: "error" };
    if (presentMap.has(member.id)) return { success: false, message: "Already In", type: "warning" };
    markAttendance(member.id);
    return { success: true, message: `${member.name} In!` };
  };

  const handleMandalClick = (mandalId, mandalName) => {
    setMandalFilter(mandalId);
    setMandalFilterName(mandalName);
    setFilter("all");
    setShowSummary(false);
  };

  const filteredList = members.filter((m) => {
    if (mandalFilter && m.mandal_id !== mandalFilter) return false;
    if (search && !`${m.name} ${m.surname} ${m.internal_code}`.toLowerCase().includes(search.toLowerCase())) return false;
    const isPresent = presentMap.has(m.id);
    if (filter === "present" && !isPresent) return false;
    if (filter === "absent" && isPresent) return false;
    return true;
  });

  const presentCount = members.filter((m) => presentMap.has(m.id)).length;
  const userScope = { role: (profile?.role || "").toLowerCase(), gender: profile?.gender, mandalIds: scopePermissions.mandalIds, kshetraId: scopePermissions.kshetraId, isGlobal: profile?.role === "admin" };

  if (initLoading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" size={32} strokeWidth={1.5} /></div>;
  if (!event) return <div className="p-8 text-center text-red-500 font-semibold border border-red-200 bg-red-50 rounded-md">Event not found.</div>;

  return (
    <div className={`flex flex-col bg-white ${embedded ? "h-full rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden" : "h-[100dvh]"}`}>
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          {!embedded && (
            <button onClick={() => navigate(-1)} className="p-1.5 -ml-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 text-base truncate">{event.name}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${syncing ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}></span>
              <span className="font-inter font-semibold text-gray-700">{presentCount}</span> / {members.length} Present
              {!canMark && <Badge className="ml-1"><Lock size={10} className="inline mr-1" strokeWidth={2}/> View Only</Badge>}
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {!hideSummary && (
              <Button variant="secondary" onClick={() => setShowSummary(true)} className="!px-3"><BarChart2 size={16} strokeWidth={2}/></Button>
            )}
            {canMark && (
              <Button icon={QrCode} onClick={() => setIsScannerOpen(true)}>Scan</Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
            <input
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-[#5C3030] rounded-md outline-none text-sm transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
              placeholder="Search roster..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex bg-gray-100 p-1 rounded-md shrink-0 border border-gray-200">
            {["all", "present", "absent"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-md transition-all ${filter === f ? "bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" : "text-gray-500 hover:text-gray-700"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {mandalFilter && (
          <div className="mt-3 flex items-center justify-between bg-[#5C3030]/10 px-3 py-2 rounded-md text-xs text-[#5C3030] font-semibold border border-[#5C3030]/20">
            <span className="flex items-center gap-1.5"><Filter size={12} strokeWidth={2}/> Filtering: {mandalFilterName}</span>
            <button onClick={() => { setMandalFilter(null); setMandalFilterName(null); }} className="p-1 hover:bg-[#5C3030]/20 rounded-md transition-colors"><X size={14} strokeWidth={2}/></button>
          </div>
        )}
      </div>

      {/* Roster List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 relative pb-24">
        {dataLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="animate-spin mb-2" size={24} strokeWidth={1.5} />
            <p className="text-[10px] font-semibold uppercase tracking-widest">Loading Roster...</p>
          </div>
        )}

        {error && !dataLoading && (
          <div className="p-6 text-center bg-red-50 rounded-md border border-red-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <AlertTriangle className="mx-auto text-red-500 mb-2" size={24} strokeWidth={1.5} />
            <p className="text-red-700 font-semibold text-sm">{error}</p>
            <Button variant="danger" size="sm" onClick={() => loadRosterData(true)} className="mt-4"><RefreshCw size={14}/> Retry</Button>
          </div>
        )}

        {!dataLoading && !error && filteredList.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            No members found.
          </div>
        )}

        {filteredList.map((m) => {
          const isPresent = presentMap.has(m.id);
          return (
            <div
              key={m.id}
              onClick={() => canMark && markAttendance(m.id)}
              className={`p-3 rounded-md border flex items-center justify-between transition-colors ${canMark ? "cursor-pointer" : ""} ${isPresent ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-gray-200 hover:border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"}`}
            >
              <div className="flex items-center gap-3 overflow-hidden pr-3">
                <div className={`w-9 h-9 rounded-md flex items-center justify-center font-inter font-bold text-xs shrink-0 border ${isPresent ? "bg-emerald-500 text-white border-emerald-600" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {isPresent ? <Check size={16} strokeWidth={2.5}/> : m.name[0]}
                </div>
                <div className="min-w-0">
                  <div className={`font-semibold text-sm truncate ${isPresent ? "text-emerald-900" : "text-gray-900"}`}>
                    {m.name} {m.surname}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold truncate flex items-center gap-1.5 mt-0.5">
                    <span>{m.mandal}</span> <span className="font-inter lowercase tracking-normal text-gray-300">•</span> <span>{m.designation}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {m.mobile_number && (
                  <a
                    href={`tel:${m.mobile_number}`}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors border border-transparent hover:border-gray-200"
                  >
                    <Phone size={14} strokeWidth={2}/>
                  </a>
                )}
                {isPresent && <Badge variant="success">IN</Badge>}
              </div>
            </div>
          );
        })}
      </div>

      {!hideSummary && (
        <AttendanceSummary isVisible={showSummary} onClose={() => setShowSummary(false)} event={event} project={project} userScope={userScope} onMandalClick={handleMandalClick} />
      )}
      {canMark && (
        <QrScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleScan} eventName={event.name} />
      )}
    </div>
  );
} 