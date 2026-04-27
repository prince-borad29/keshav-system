import React, { useState, useEffect, useMemo } from "react";
import { Plus, Eye, Edit3, Trash2, Loader2, ShieldAlert, AlertTriangle, RefreshCw } from "lucide-react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { supabase, withTimeout } from "../../lib/supabase";
import toast from "react-hot-toast";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/Modal";
import MemberForm from "./MemberForm";
import MemberProfile from "./MemberProfile";
import DataTableToolbar from "../../components/ui/DataTableToolbar"; 
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 20;

// 🌟 Added mapping for ALL requested columns
const MemberRow = React.memo(({ m, role, isAdmin, visibleColumns, onView, onEdit, onDelete }) => (
  <tr className="hover:bg-gray-50 transition-colors">
    {visibleColumns.includes("internal_code") && <td className="px-4 py-3 font-inter text-xs text-gray-500">{m.internal_code || "-"}</td>}
    {visibleColumns.includes("name") && (
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900">{m.name}</div>
        {m.member_tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {m.member_tags.map((mt) => (
              <span key={mt.tag_id} className="px-1.5 py-[1px] bg-gray-100 text-gray-600 text-[9px] uppercase tracking-wider rounded border border-gray-200 font-semibold">{mt.tags?.name}</span>
            ))}
          </div>
        )}
      </td>
    )}
    {visibleColumns.includes("surname") && <td className="px-4 py-3 font-semibold text-gray-900">{m.surname || "-"}</td>}
    {visibleColumns.includes("mobile") && <td className="px-4 py-3 font-inter text-sm">{m.mobile || "-"}</td>}
    {visibleColumns.includes("designation") && <td className="px-4 py-3"><Badge variant="default">{m.designation}</Badge></td>}
    {visibleColumns.includes("email") && <td className="px-4 py-3 text-sm">{m.email || "-"}</td>}
    {visibleColumns.includes("gender") && <td className="px-4 py-3 text-sm">{m.gender || "-"}</td>}
    {visibleColumns.includes("dob") && <td className="px-4 py-3 text-sm">{m.dob ? new Date(m.dob).toLocaleDateString() : "-"}</td>}
    {visibleColumns.includes("location") && (
      <td className="px-4 py-3">
        <div className="font-medium text-gray-700">{m.mandals?.name}</div>
        {["admin", "nirdeshak", "project_admin"].includes(role) && <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{m.mandals?.kshetras?.name}</div>}
      </td>
    )}
    
    <td className="px-4 py-3 text-right">
      <div className="flex justify-end gap-1">
        <button onClick={() => onView(m)} className="p-1.5 text-gray-400 hover:text-[#5C3030] hover:bg-gray-100 rounded-md transition-colors"><Eye size={16} strokeWidth={1.5} /></button>
        {["admin", "sanchalak","nirdeshak", "nirikshak"].includes(role) && (
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
  const [sortConfig, setSortConfig] = useState([{ column: "name", ascending: true }]);

  // 🌟 FULL LIST OF COLUMNS AVAILABLE
  const allColumns = [
    { id: "internal_code", label: "Internal ID" },
    { id: "name", label: "First Name & Tags" },
    { id: "surname", label: "Last Name" },
    { id: "mobile", label: "Mobile Number" },
    { id: "designation", label: "Designation" },
    { id: "email", label: "Email Address" },
    { id: "gender", label: "Gender" },
    { id: "dob", label: "Date of Birth" },
  ];
  
  // 🌟 YOUR REQUESTED DEFAULTS
  const [visibleColumns, setVisibleColumns] = useState(["internal_code", "name", "surname", "mobile", "designation"]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  const handleExport = async (format, customExportTitle, useCustomHeader) => {
    if (visibleColumns.length === 0) return toast.error("Please select at least one column to export.");
    const loadingId = toast.loading(`Fetching all records — this may take a moment...`);

    try {
      const sourceData = await fetchAllForExport();
      if (!sourceData || sourceData.length === 0) {
        toast.error("No records found to export.", { id: loadingId });
        return;
      }
      toast.loading(`Generating ${format.toUpperCase()} — ${sourceData.length} records...`, { id: loadingId });

      const finalTitle = useCustomHeader && customExportTitle.trim() !== "" ? customExportTitle.trim() : "Member Directory Report";
      const generatedOn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      const headers = allColumns.filter(c => visibleColumns.includes(c.id)).map(c => c.label);

      const exportData = sourceData.map((m) => {
        const row = [];
        // 🌟 Maps exactly to your new DB columns
        if (visibleColumns.includes("internal_code")) row.push(m.internal_code || "-");
        if (visibleColumns.includes("name")) row.push(m.name || "-");
        if (visibleColumns.includes("surname")) row.push(m.surname || "-");
        if (visibleColumns.includes("mobile")) row.push(m.mobile || "-");
        if (visibleColumns.includes("designation")) row.push(m.designation || "-");
        if (visibleColumns.includes("email")) row.push(m.email || "-");
        if (visibleColumns.includes("gender")) row.push(m.gender || "-");
        if (visibleColumns.includes("blood_group")) row.push(m.blood_group || "-");
        if (visibleColumns.includes("dob")) row.push(m.dob ? new Date(m.dob).toLocaleDateString() : "-");
        if (visibleColumns.includes("education")) row.push(m.education || "-");
        if (visibleColumns.includes("profession")) row.push(m.profession || "-");
        if (visibleColumns.includes("location")) row.push(`${m.mandals?.name || "-"} (${m.mandals?.kshetras?.name || "-"})`);
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
        {["admin", "sanchalak", "nirdeshak","nirikshak"].includes(role) && (
          <Button icon={Plus} onClick={() => { setSelectedMember(null); setIsFormOpen(true); }}>Add Member</Button>
        )}
      </div>

      <DataTableToolbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterFields={filterFields}
        filters={filters}
        setFilters={setFilters}
        sortableColumns={sortableColumns}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        allColumns={allColumns}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
        totalCount={totalCount}
        onExport={handleExport}
      />

      <div className="bg-white border border-gray-200 rounded-b-md shadow-sm overflow-x-auto relative z-10 min-h-[400px] border-t-0">
        {isFetching && !isFetchingNextPage && !isError && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
            <Loader2 className="animate-spin text-[#5C3030]" size={24} />
          </div>
        )}

        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            <tr>
              {allColumns.filter(c => visibleColumns.includes(c.id)).map(col => (
                <th key={col.id} className="px-4 py-3">{col.label}</th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isError && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="p-12 text-center">
                  <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} strokeWidth={1.5} />
                  <h3 className="text-gray-900 font-bold mb-1">Failed to load records</h3>
                  <Button variant="secondary" size="sm" onClick={() => refetch()} className="mt-2"><RefreshCw size={14} className="mr-2" /> Try Again</Button>
                </td>
              </tr>
            )}
            {!isError && members.length === 0 && !isFetching && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="p-12 text-center text-gray-400 text-sm">No members found matching your filters.</td>
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