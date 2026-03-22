import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, Eye, Edit3, Trash2, Loader2, ShieldAlert, X,
  AlertTriangle, Filter, RefreshCw, ArrowDownAZ, Download,
  FileSpreadsheet, FileText, ChevronDown, Columns,
} from "lucide-react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { supabase, withTimeout } from "../../lib/supabase";
import toast from "react-hot-toast";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";
import Select from "../../components/ui/Select";
import MemberForm from "./MemberForm";
import MemberProfile from "./MemberProfile";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 20;

// ⚡ Memoized Row for High Performance
const MemberRow = React.memo(({ m, role, isAdmin, visibleColumns, onView, onEdit, onDelete }) => (
  <tr className="hover:bg-gray-50 transition-colors">
    {visibleColumns.includes("internal_code") && (
      <td className="px-4 py-3 font-inter text-xs text-gray-500">{m.internal_code}</td>
    )}
    {visibleColumns.includes("name") && (
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900">{m.name} {m.surname}</div>
        <div className="text-xs text-gray-500 font-inter mt-0.5">{m.mobile || "No Mobile"}</div>
        {m.member_tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {m.member_tags.map((mt) => (
              <span key={mt.tag_id} className="px-1.5 py-[1px] bg-gray-100 text-gray-600 text-[9px] uppercase tracking-wider rounded border border-gray-200 font-semibold">
                {mt.tags?.name}
              </span>
            ))}
          </div>
        )}
      </td>
    )}
    {visibleColumns.includes("location") && (
      <td className="px-4 py-3">
        <div className="font-medium text-gray-700">{m.mandals?.name}</div>
        {["admin", "nirdeshak", "project_admin"].includes(role) && (
          <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{m.mandals?.kshetras?.name}</div>
        )}
      </td>
    )}
    {visibleColumns.includes("role") && (
      <td className="px-4 py-3"><Badge variant="default">{m.designation}</Badge></td>
    )}
    <td className="px-4 py-3 text-right">
      <div className="flex justify-end gap-1">
        <button onClick={() => onView(m)} className="p-1.5 text-gray-400 hover:text-[#5C3030] hover:bg-gray-100 rounded-md transition-colors"><Eye size={16} strokeWidth={1.5} /></button>
        {["admin", "sanchalak", "nirikshak"].includes(role) && (
          <>
            <button onClick={() => onEdit(m)} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"><Edit3 size={16} strokeWidth={1.5} /></button>
            {isAdmin && (
              <button onClick={() => onDelete(m)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={16} strokeWidth={1.5} /></button>
            )}
          </>
        )}
      </div>
    </td>
  </tr>
));

export default function MemberDirectory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ref: loadMoreRef, inView } = useInView();

  const role = (profile?.role || "").toLowerCase();
  const isAdmin = role === "admin";
  const isAuthorized = ["admin", "nirdeshak", "nirikshak", "sanchalak", "project_admin"].includes(role);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const defaultFilters = { kshetra_id: [], mandal_id: [], gender: [], designation: [], tag_id: [] };
  const [filters, setFilters] = useState(defaultFilters);
  const [activeFilterKeys, setActiveFilterKeys] = useState([]); 

  const [sortConfig, setSortConfig] = useState([{ column: "name", ascending: true }]);

  const [useCustomHeader, setUseCustomHeader] = useState(false);
  const [exportTitle, setExportTitle] = useState("");

  const allColumns = [
    { id: "internal_code", label: "Internal ID" },
    { id: "name", label: "Full Name & Details" },
    { id: "location", label: "Location (Mandal/Kshetra)" },
    { id: "role", label: "Designation" },
  ];
  const [visibleColumns, setVisibleColumns] = useState(["internal_code", "name", "location", "role"]);

  const [activePopover, setActivePopover] = useState(null);
  const popoverRef = useRef(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setActivePopover(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: scopeData } = useQuery({
    queryKey: ["directory-scope", profile?.id],
    queryFn: async () => {
      let allowedMandalIds = [];
      let assignedProjectIds = [];

      if (role === "sanchalak") allowedMandalIds = [profile.assigned_mandal_id];
      else if (role === "nirikshak") {
        const { data } = await withTimeout(supabase.from("nirikshak_assignments").select("mandal_id").eq("nirikshak_id", profile.id));
        allowedMandalIds = data?.map((d) => d.mandal_id) || [];
        if (profile.assigned_mandal_id) allowedMandalIds.push(profile.assigned_mandal_id);
      } else if (["nirdeshak", "project_admin"].includes(role)) {
        let kId = profile.assigned_kshetra_id || profile.kshetra_id;
        if (!kId && profile.assigned_mandal_id) {
          const { data } = await withTimeout(supabase.from("mandals").select("kshetra_id").eq("id", profile.assigned_mandal_id).single());
          if (data) kId = data.kshetra_id;
        }
        if (kId) {
          const { data } = await withTimeout(supabase.from("mandals").select("id").eq("kshetra_id", kId));
          allowedMandalIds = data?.map((m) => m.id) || [];
        }
        if (role === "project_admin") {
          const { data } = await withTimeout(supabase.from("project_assignments").select("project_id").eq("user_id", profile.id));
          assignedProjectIds = data?.map((p) => p.project_id) || [];
        }
      }
      return { allowedMandalIds, assignedProjectIds };
    },
    enabled: !!profile && isAuthorized,
    staleTime: 1000 * 60 * 30,
  });

  const { data: dropdowns } = useQuery({
    queryKey: ["directory-dropdowns", scopeData?.allowedMandalIds],
    queryFn: async () => {
      const [tRes, kRes] = await Promise.all([
        withTimeout(supabase.from("tags").select("id, name").contains("category", ["Member"]).order("name")),
        isAdmin ? withTimeout(supabase.from("kshetras").select("id, name").order("name")) : Promise.resolve({ data: [] }),
      ]);

      if (!isAdmin && (!scopeData?.allowedMandalIds || scopeData.allowedMandalIds.length === 0))
        return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: [] };

      let mQuery = supabase.from("mandals").select("id, name, kshetra_id").order("name");
      if (!isAdmin) mQuery = mQuery.in("id", scopeData.allowedMandalIds);

      const { data: mData } = await withTimeout(mQuery);
      return { tags: tRes.data || [], kshetras: kRes.data || [], mandals: mData || [] };
    },
    enabled: !!scopeData,
    staleTime: 1000 * 60 * 30,
  });

  const buildQuery = (forExport = false) => {
    let selectString = `*, mandals!inner(id, name, kshetra_id, kshetras(id, name)), ${filters.tag_id.length ? "member_tags!inner" : "member_tags"}(tag_id, tags(name, color))`;
    if (role === "project_admin") selectString += `, project_registrations!inner(project_id)`;

    let query = supabase.from("members").select(selectString, forExport ? {} : { count: "exact" });

    if (!isAdmin && profile?.gender) query = query.eq("gender", profile.gender);
    if (!isAdmin) {
      if (scopeData.allowedMandalIds?.length > 0) query = query.in("mandal_id", scopeData.allowedMandalIds);
      else query = query.eq("mandal_id", "00000000-0000-0000-0000-000000000000");
    }
    if (role === "project_admin") {
      if (scopeData.assignedProjectIds?.length > 0) query = query.in("project_registrations.project_id", scopeData.assignedProjectIds);
      else query = query.eq("project_registrations.project_id", "00000000-0000-0000-0000-000000000000");
    }

    if (debouncedSearch) query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%`);
    
    if (isAdmin && filters.kshetra_id.length > 0) query = query.in("mandals.kshetra_id", filters.kshetra_id);
    if (filters.mandal_id.length > 0) query = query.in("mandal_id", filters.mandal_id);
    if (filters.designation.length > 0) query = query.in("designation", filters.designation);
    if (isAdmin && filters.gender.length > 0) query = query.in("gender", filters.gender);
    if (filters.tag_id.length > 0) query = query.in("member_tags.tag_id", filters.tag_id);

    sortConfig.forEach((sort) => {
      query = query.order(sort.column, { ascending: sort.ascending });
    });

    return query;
  };

  const fetchAllForExport = async () => {
    const EXPORT_PAGE = 1000;
    let allData = [];
    let page = 0;

    while (true) {
      const from = page * EXPORT_PAGE;
      const { data, error } = await withTimeout(buildQuery(true).range(from, from + EXPORT_PAGE - 1), 30000);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < EXPORT_PAGE) break; 
      page++;
    }
    return allData;
  };

  const { data: membersPages, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching, isError, refetch } = useInfiniteQuery({
    queryKey: ["members", scopeData, debouncedSearch, filters, sortConfig],
    queryFn: async ({ pageParam = 0, signal }) => {
      if (!scopeData || (!isAdmin && scopeData.allowedMandalIds.length === 0)) return { data: [], count: 0 };
      const from = pageParam * PAGE_SIZE;
      const { data, count, error } = await withTimeout(buildQuery().range(from, from + PAGE_SIZE - 1).order("id", { ascending: true }).abortSignal(signal), 10000);
      if (error) throw error;
      return { data, count, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!scopeData,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetching && !isError) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage]);

  const members = useMemo(() => membersPages?.pages.flatMap((page) => page.data) || [], [membersPages]);
  const totalCount = membersPages?.pages[0]?.count || 0;
  
  const activeFilterCount = Object.values(filters).reduce((acc, arr) => acc + arr.length, 0);

  const handleExport = async (format) => {
    setActivePopover(null);

    if (visibleColumns.length === 0) return toast.error("Please select at least one column to export.");
    const loadingId = toast.loading(`Fetching all records — this may take a moment...`);

    try {
      const sourceData = await fetchAllForExport();
      if (!sourceData || sourceData.length === 0) {
        toast.error("No records found to export.", { id: loadingId });
        return;
      }
      toast.loading(`Generating ${format.toUpperCase()} — ${sourceData.length} records...`, { id: loadingId });

      const finalTitle = useCustomHeader && exportTitle.trim() !== "" ? exportTitle.trim() : "Member Directory Report";
      const generatedOn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      const headers = [];
      if (visibleColumns.includes("internal_code")) headers.push("Internal ID");
      if (visibleColumns.includes("name")) headers.push("Full Name", "Mobile");
      if (visibleColumns.includes("location")) headers.push("Mandal", "Kshetra");
      if (visibleColumns.includes("role")) headers.push("Designation", "Gender");

      const exportData = sourceData.map((m) => {
        const row = [];
        if (visibleColumns.includes("internal_code")) row.push(m.internal_code || "-");
        if (visibleColumns.includes("name")) {
          row.push(`${m.name} ${m.surname}`);
          row.push(m.mobile || "-");
        }
        if (visibleColumns.includes("location")) {
          row.push(m.mandals?.name || "-");
          row.push(m.mandals?.kshetras?.name || "-");
        }
        if (visibleColumns.includes("role")) {
          row.push(m.designation || "-");
          row.push(m.gender || "-");
        }
        return row;
      });

      if (format === "excel") {
        const headerBg = useCustomHeader ? "#5C3030" : "#f9fafb";
        const headerColor = useCustomHeader ? "#ffffff" : "#374151";

        const tableHtml = `
          <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head><meta charset="UTF-8"></head>
          <body>
            <table>
              ${useCustomHeader ? `
              <tr>
                <td colspan="${headers.length}" style="background-color:#5C3030; color:#ffffff; font-size:16pt; font-weight:bold; padding:14px 12px; height:48px; vertical-align:middle;">${finalTitle}</td>
              </tr>
              <tr>
                <td colspan="${headers.length}" style="background-color:#7a3f3f; color:#f5c6c6; font-size:9pt; padding:6px 12px; vertical-align:middle;">${generatedOn} &nbsp;•&nbsp; ${exportData.length} records &nbsp;•&nbsp;</td>
              </tr>` : `
              <tr>
                <td colspan="${headers.length}" style="font-size:14pt; font-weight:bold; color:#5C3030; padding:10px 12px; vertical-align:middle;">${finalTitle}</td>
              </tr>
              <tr>
                <td colspan="${headers.length}" style="font-size:9pt; color:#6b7280; padding:4px 12px 10px;">${generatedOn} • ${exportData.length} records • </td>
              </tr>`}
              <tr>${headers.map((h) => `<th style="background-color:${headerBg}; color:${headerColor}; border:1px solid #e5e7eb; font-weight:bold; padding:10px 12px; font-size:10pt;">${h}</th>`).join("")}</tr>
              ${exportData.map((row, i) => `<tr>${row.map((cell) => `<td style="border:1px solid #e5e7eb; padding:8px 12px; background-color:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">${cell}</td>`).join("")}</tr>`).join("")}
            </table>
          </body>
          </html>`;

        const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `${finalTitle.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape" });
        const pageW = doc.internal.pageSize.getWidth();

        if (useCustomHeader) {
          doc.setFillColor(92, 48, 48); 
          doc.rect(0, 0, pageW, 28, "F");
          doc.setFontSize(16);
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.text(finalTitle, 14, 13);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(245, 198, 198);
          doc.text(`${generatedOn}  •  ${exportData.length} records`, 14, 21);

          autoTable(doc, {
            startY: 32, head: [headers], body: exportData, theme: "grid",
            headStyles: { fillColor: [92, 48, 48], textColor: 255, fontStyle: "bold", fontSize: 8 },
            bodyStyles: { fontSize: 8, cellPadding: 3 }, alternateRowStyles: { fillColor: [249, 250, 251] },
            tableLineColor: [229, 231, 235], tableLineWidth: 0.1,
          });
        } else {
          doc.setFontSize(16);
          doc.setTextColor(92, 48, 48);
          doc.setFont("helvetica", "bold");
          doc.text(finalTitle, 14, 15);
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`${generatedOn}  •  ${exportData.length} records  `, 14, 22);

          autoTable(doc, {
            startY: 28, head: [headers], body: exportData, theme: "grid",
            headStyles: { fillColor: [249, 250, 251], textColor: [55, 65, 81], fontStyle: "bold", fontSize: 8 },
            bodyStyles: { fontSize: 8, cellPadding: 3 }, alternateRowStyles: { fillColor: [249, 250, 251] },
            tableLineColor: [229, 231, 235], tableLineWidth: 0.1,
          });
        }
        doc.save(`${finalTitle.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
      }
      toast.success(`${format.toUpperCase()} exported — ${exportData.length} records`, { id: loadingId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate export.", { id: loadingId });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await withTimeout(supabase.from("members").delete().eq("id", id));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["members"]);
      toast.success("Member deleted successfully");
      setMemberToDelete(null);
    },
  });

  const sortableColumns = [
    { value: "name", label: "First Name" },
    { value: "surname", label: "Last Name" },
    { value: "internal_code", label: "Internal ID" },
    { value: "designation", label: "Designation" },
    { value: "gender", label: "Gender" },
  ];

  const filterFields = [
    { key: "kshetra_id", label: "Kshetra", options: dropdowns?.kshetras?.map((k) => ({ value: k.id, label: k.name })) || [], restricted: !isAdmin },
    { key: "mandal_id", label: "Mandal", options: dropdowns?.mandals?.map((m) => ({ value: m.id, label: m.name })) || [] },
    { key: "designation", label: "Designation", options: ["Nirdeshak", "Nirikshak", "Sanchalak", "Member", "Sah Sanchalak", "Sampark Karyakar"].map((d) => ({ value: d, label: d })) },
    { key: "gender", label: "Gender", options: [{ value: "Yuvak", label: "Yuvak" }, { value: "Yuvati", label: "Yuvati" }], restricted: !isAdmin },
    { key: "tag_id", label: "Tag", options: dropdowns?.tags?.map((t) => ({ value: t.id, label: t.name })) || [] },
  ].filter((f) => !f.restricted);

  if (profile && !isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-gray-200 rounded-md shadow-sm">
        <ShieldAlert size={48} strokeWidth={1.5} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <Button onClick={() => navigate("/")}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {role === "project_admin" ? "Registered Database" : "Member Directory"}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Total Records: <span className="font-inter font-semibold">{totalCount}</span>
            {members.length < totalCount && <span className="ml-2 text-[#5C3030] font-semibold">· {members.length} loaded</span>}
          </p>
        </div>
        {["admin", "sanchalak", "nirikshak"].includes(role) && (
          <Button icon={Plus} onClick={() => { setSelectedMember(null); setIsFormOpen(true); }}>Add Member</Button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-t-xl p-3 sm:p-4 flex flex-col gap-4 relative z-[60] shadow-sm">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} strokeWidth={2} />
          <input
            className="w-full pl-10 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-gray-300 focus:bg-white focus:border-[#5C3030] focus:ring-4 focus:ring-[#5C3030]/10 rounded-lg outline-none text-sm text-gray-900 transition-all placeholder:text-gray-400"
            placeholder="Search by name, ID, or mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full transition-colors">
              <X size={12} strokeWidth={3} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1 hidden sm:block">View Rules:</span>

            {/* FILTER */}
            <div className="relative" ref={activePopover === "filter" ? popoverRef : null}>
              <button
                onClick={() => setActivePopover(activePopover === "filter" ? null : "filter")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                  activeFilterCount > 0 || activePopover === "filter" ? "bg-[#5C3030] border-[#5C3030] text-white shadow-md shadow-[#5C3030]/20" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Filter size={14} strokeWidth={activeFilterCount > 0 ? 2.5 : 2} />
                Filter {activeFilterCount > 0 && <span className="bg-white/25 px-1.5 rounded-full text-xs ml-0.5">{activeFilterCount}</span>}
              </button>

              {activePopover === "filter" && (
                <>
                  <div className="fixed inset-0 bg-black/20 z-[90] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                  <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-[320px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                      <p className="text-sm font-bold text-gray-900">Filter Records</p>
                      <div className="flex items-center gap-2">
                        {activeFilterCount > 0 && (
                          <button onClick={() => { setFilters(defaultFilters); setActiveFilterKeys([]); }} className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors">Clear All</button>
                        )}
                        <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                      </div>
                    </div>

                    {/* 🛡️ Z-INDEX FIX: overflow-visible instead of overflow-y-auto so the Select dropdown is not clipped */}
                    <div className="space-y-3 overflow-visible pr-1">
                      {activeFilterKeys.map((key) => {
                        const field = filterFields.find((f) => f.key === key);
                        if (!field) return null;
                        return (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{field.label}</label>
                              <button
                                onClick={() => {
                                  setActiveFilterKeys((prev) => prev.filter((k) => k !== key));
                                  setFilters((prev) => ({ ...prev, [key]: [] }));
                                }}
                                className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <Select
                              multiple={true}
                              options={field.options}
                              value={filters[key]}
                              onChange={(valArr) => setFilters((prev) => ({ ...prev, [key]: valArr }))}
                              placeholder={`Select ${field.label}(s)...`}
                            />
                          </div>
                        );
                      })}

                      {activeFilterKeys.length < filterFields.length && (
                        <div className="pt-1">
                          <Select
                            placeholder="+ Add condition"
                            value=""
                            options={filterFields.filter((f) => !activeFilterKeys.includes(f.key)).map((f) => ({ value: f.key, label: f.label }))}
                            onChange={(selectedKey) => setActiveFilterKeys((prev) => [...prev, selectedKey])}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* SORT */}
            <div className="relative" ref={activePopover === "sort" ? popoverRef : null}>
              <button
                onClick={() => setActivePopover(activePopover === "sort" ? null : "sort")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                  activePopover === "sort" ? "bg-[#1E4B59] border-[#1E4B59] text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <ArrowDownAZ size={14} strokeWidth={2} /> Sort
                {sortConfig.length > 0 && <span className="text-xs ml-0.5 opacity-70">({sortConfig.length})</span>}
              </button>

              {activePopover === "sort" && (
                <>
                  <div className="fixed inset-0 bg-black/20 z-[90] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                  <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-[340px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                      <p className="text-sm font-bold text-gray-900">Sort Records</p>
                      <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                    </div>
                    {/* 🛡️ Z-INDEX FIX: overflow-visible */}
                    <div className="space-y-2 overflow-visible">
                      {sortConfig.map((sort, index) => (
                        <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                          <span className="text-xs font-bold text-gray-400 w-10 text-center shrink-0">{index === 0 ? "1st" : "Then"}</span>
                          <div className="flex-1 flex gap-2">
                            <Select
                              className="flex-1"
                              options={sortableColumns}
                              value={sort.column}
                              onChange={(val) => {
                                const newSort = [...sortConfig];
                                newSort[index] = { ...newSort[index], column: val };
                                setSortConfig(newSort);
                              }}
                            />
                            <Select
                              className="w-[80px] shrink-0"
                              options={[{ value: "true", label: "A→Z" }, { value: "false", label: "Z→A" }]}
                              value={sort.ascending.toString()}
                              onChange={(val) => {
                                const newSort = [...sortConfig];
                                newSort[index] = { ...newSort[index], ascending: val === "true" };
                                setSortConfig(newSort);
                              }}
                            />
                          </div>
                          {sortConfig.length > 1 && (
                            <button
                              onClick={() => setSortConfig(sortConfig.filter((_, i) => i !== index))}
                              className="text-gray-400 hover:text-red-500 shrink-0 p-1.5 hover:bg-white rounded-md transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      {sortConfig.length < 3 && (
                        <button onClick={() => setSortConfig([...sortConfig, { column: "designation", ascending: true }])} className="w-full mt-1 py-2 text-sm text-gray-500 font-semibold border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors">
                          + Add sort rule
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* COLUMNS */}
            <div className="relative" ref={activePopover === "columns" ? popoverRef : null}>
              <button
                onClick={() => setActivePopover(activePopover === "columns" ? null : "columns")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                  activePopover === "columns" ? "bg-gray-100 border-gray-300 text-gray-900" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <Columns size={14} strokeWidth={2} /> Columns
              </button>

              {activePopover === "columns" && (
                <>
                  <div className="fixed inset-0 bg-black/20 z-[90] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                  <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-52 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] p-3 animate-in fade-in zoom-in-95 duration-150">
                    <p className="text-xs font-bold text-gray-900 mb-2 pb-2 border-b border-gray-100">Visible Columns</p>
                    <div className="space-y-0.5">
                      {allColumns.map((col) => (
                        <label key={col.id} className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]"
                            checked={visibleColumns.includes(col.id)}
                            onChange={(e) => {
                              if (e.target.checked) setVisibleColumns([...visibleColumns, col.id]);
                              else setVisibleColumns(visibleColumns.filter((id) => id !== col.id));
                            }}
                          />
                          <span className="text-sm font-medium text-gray-700">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 ml-1 mt-1 sm:mt-0">
                {activeFilterKeys.map((key) => {
                  const field = filterFields.find((f) => f.key === key);
                  if (!field || !filters[key] || filters[key].length === 0) return null;
                  
                  return filters[key].map(val => {
                    const option = field.options.find((o) => o.value === val);
                    return (
                      <span key={`${key}-${val}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#5C3030]/10 text-[#5C3030] text-xs font-semibold rounded-full border border-[#5C3030]/20">
                        {field.label}: {option?.label || val}
                        <button
                          onClick={() => setFilters((prev) => ({ ...prev, [key]: prev[key].filter(v => v !== val) }))}
                          className="hover:bg-[#5C3030]/20 rounded-full p-0.5 transition-colors"
                        >
                          <X size={10} strokeWidth={3} />
                        </button>
                      </span>
                    )
                  });
                })}
              </div>
            )}
          </div>

          {/* EXPORT */}
          <div className="relative w-full sm:w-auto" ref={activePopover === "export" ? popoverRef : null}>
            <Button variant="secondary" onClick={() => setActivePopover(activePopover === "export" ? null : "export")} className="w-full sm:w-auto !bg-white border-gray-200 shadow-sm hover:border-gray-300 whitespace-nowrap">
              <Download size={14} className="mr-1.5" /> Export <ChevronDown size={12} className="ml-1.5 text-gray-400" />
            </Button>

            {activePopover === "export" && (
              <>
                <div className="fixed inset-0 bg-black/20 z-[90] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:right-0 sm:left-auto sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Export Data</p>
                    <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                  </div>

                  <div className="mb-4">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div className="relative shrink-0">
                        <input type="checkbox" checked={useCustomHeader} onChange={(e) => setUseCustomHeader(e.target.checked)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#5C3030] rounded-full transition-colors" />
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-gray-900">Custom Header</span>
                        <p className="text-[11px] text-gray-400">Branded title band on export</p>
                      </div>
                    </label>
                    {useCustomHeader && (
                      <div className="mt-2.5 space-y-2">
                        <input
                          type="text"
                          value={exportTitle}
                          onChange={(e) => setExportTitle(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#5C3030] focus:ring-2 focus:ring-[#5C3030]/10 bg-gray-50 focus:bg-white transition-all"
                          placeholder="E.g. Yuvak Directory 2026"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <div className="border border-[#5C3030]/20 bg-[#5C3030]/[0.03] rounded-lg p-3 mb-3">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-[11px] text-gray-500 mt-0.5">Fetches all <span className="font-semibold text-[#5C3030]">{totalCount} records</span> with current filters</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleExport("excel")} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                        <FileSpreadsheet size={14} className="shrink-0" /> Excel
                      </button>
                      <button onClick={() => handleExport("pdf")} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
                        <FileText size={14} className="shrink-0" /> PDF
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 🛡️ Z-INDEX FIX: Table is z-10 so the z-[60] Toolbar popovers float perfectly over it */}
      <div className="bg-white border border-gray-200 rounded-b-md shadow-sm overflow-x-auto relative z-10 min-h-[400px] border-t-0">
        {isFetching && !isFetchingNextPage && !isError && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
            <Loader2 className="animate-spin text-[#5C3030]" size={24} />
          </div>
        )}

        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            <tr>
              {visibleColumns.includes("internal_code") && <th className="px-4 py-3">ID</th>}
              {visibleColumns.includes("name") && <th className="px-4 py-3">Name</th>}
              {visibleColumns.includes("location") && <th className="px-4 py-3">Location</th>}
              {visibleColumns.includes("role") && <th className="px-4 py-3">Role</th>}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isError && (
              <tr>
                <td colSpan={6} className="p-12 text-center">
                  <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} strokeWidth={1.5} />
                  <h3 className="text-gray-900 font-bold mb-1">Failed to load records</h3>
                  <Button variant="secondary" size="sm" onClick={() => refetch()} className="mt-2"><RefreshCw size={14} className="mr-2" /> Try Again</Button>
                </td>
              </tr>
            )}
            {!isError && members.length === 0 && !isFetching && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-400 text-sm">No members found matching your filters.</td>
              </tr>
            )}
            {!isError && members.map((m) => (
              <MemberRow key={m.id} m={m} role={role} isAdmin={isAdmin} visibleColumns={visibleColumns} onView={setViewMember} onEdit={(member) => { setSelectedMember(member); setIsFormOpen(true); }} onDelete={setMemberToDelete} />
            ))}
          </tbody>
        </table>

        {!isError && members.length > 0 && (
          <div ref={loadMoreRef} className="p-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {isFetchingNextPage ? <Loader2 size={14} className="animate-spin mx-auto text-[#5C3030]" /> : hasNextPage ? "Scroll for more" : `All ${members.length} records loaded`}
          </div>
        )}
      </div>

      <MemberForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSuccess={() => { queryClient.invalidateQueries(["members"]); toast.success(selectedMember ? "Profile Updated!" : "Member Registered!"); }} initialData={selectedMember} />
      <MemberProfile isOpen={!!viewMember} member={viewMember} onClose={() => setViewMember(null)} />

      <Modal isOpen={!!memberToDelete} onClose={() => setMemberToDelete(null)} title="Confirm Deletion">
        <div className="space-y-4">
          <div className="bg-red-50 text-red-800 p-4 rounded-md border border-red-100 flex gap-3">
            <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
            <p className="text-sm">Are you sure you want to permanently delete <span className="font-bold">{memberToDelete?.name} {memberToDelete?.surname}</span>? This action cannot be undone.</p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMemberToDelete(null)} disabled={deleteMutation.isPending}>Cancel</Button>
            <Button className="!bg-red-600 !border-red-600 hover:!bg-red-700" onClick={() => deleteMutation.mutate(memberToDelete.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : "Yes, Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}