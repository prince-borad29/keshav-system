import React, { useState, useRef, useEffect } from "react";
import { Search, Filter, ArrowDownAZ, Download, Columns, FileSpreadsheet, FileText, ChevronDown, X } from "lucide-react";
import Button from "./Button";
import Select from "./Select";

export default function DataTableToolbar({
  searchTerm, setSearchTerm, filterFields, filters, setFilters,
  sortableColumns, sortConfig, setSortConfig, allColumns,
  visibleColumns, setVisibleColumns, totalCount, onExport
}) {
  const [activePopover, setActivePopover] = useState(null);
  const popoverRef = useRef(null);

  const [activeFilterKeys, setActiveFilterKeys] = useState([]);
  const [useCustomHeader, setUseCustomHeader] = useState(false);
  const [exportTitle, setExportTitle] = useState("");

  const activeFilterCount = Object.values(filters).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setActivePopover(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClearAllFilters = () => {
    const clearedFilters = { ...filters };
    Object.keys(clearedFilters).forEach(key => clearedFilters[key] = []);
    setFilters(clearedFilters);
    setActiveFilterKeys([]);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-t-xl p-3 sm:p-4 flex flex-col gap-4 relative shadow-sm">
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
            <button onClick={() => setActivePopover(activePopover === "filter" ? null : "filter")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${activeFilterCount > 0 || activePopover === "filter" ? "bg-[#5C3030] border-[#5C3030] text-white shadow-md shadow-[#5C3030]/20" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>
              <Filter size={14} strokeWidth={activeFilterCount > 0 ? 2.5 : 2} /> Filter {activeFilterCount > 0 && <span className="bg-white/25 px-1.5 rounded-full text-xs ml-0.5">{activeFilterCount}</span>}
            </button>
            {activePopover === "filter" && (
              <>
                <div className="fixed inset-0 bg-black/40 z-[9998] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-[320px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Filter Records</p>
                    <div className="flex items-center gap-2">
                      {activeFilterCount > 0 && <button onClick={handleClearAllFilters} className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors">Clear All</button>}
                      <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="space-y-3 overflow-visible pr-1">
                    {/* 🌟 REVERSE Z-INDEX FIX */}
                    {activeFilterKeys.map((key, index) => {
                      const field = filterFields.find((f) => f.key === key);
                      if (!field) return null;
                      return (
                        <div key={key} className="relative" style={{ zIndex: 100 - index }}>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{field.label}</label>
                            <button onClick={() => { setActiveFilterKeys((prev) => prev.filter((k) => k !== key)); setFilters((prev) => ({ ...prev, [key]: [] })); }} className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"><X size={14} /></button>
                          </div>
                          <Select multiple={true} options={field.options} value={filters[key]} onChange={(valArr) => setFilters((prev) => ({ ...prev, [key]: valArr }))} placeholder={`Select ${field.label}(s)...`} />
                        </div>
                      );
                    })}
                    {activeFilterKeys.length < filterFields.length && (
                      <div className="pt-1 relative" style={{ zIndex: 10 }}>
                        <Select placeholder="+ Add condition" value="" options={filterFields.filter((f) => !activeFilterKeys.includes(f.key)).map((f) => ({ value: f.key, label: f.label }))} onChange={(selectedKey) => setActiveFilterKeys((prev) => [...prev, selectedKey])} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* SORT */}
          <div className="relative" ref={activePopover === "sort" ? popoverRef : null}>
            <button onClick={() => setActivePopover(activePopover === "sort" ? null : "sort")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${activePopover === "sort" ? "bg-[#5C3030] border-[#5C3030] text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>
              <ArrowDownAZ size={14} strokeWidth={2} /> Sort {sortConfig.length > 0 && <span className="text-xs ml-0.5 opacity-70">({sortConfig.length})</span>}
            </button>
            {activePopover === "sort" && (
              <>
                <div className="fixed inset-0 bg-black/40 z-[9998] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-[340px] bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] p-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Sort Records</p>
                    <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                  </div>
                  <div className="space-y-2 overflow-visible">
                    {/* 🌟 REVERSE Z-INDEX FIX */}
                    {sortConfig.map((sort, index) => (
                      <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100 relative" style={{ zIndex: 100 - index }}>
                        <span className="text-xs font-bold text-gray-400 w-10 text-center shrink-0">{index === 0 ? "1st" : "Then"}</span>
                        <div className="flex-1 flex gap-2">
                          <Select className="flex-1" options={sortableColumns} value={sort.column} onChange={(val) => { const newSort = [...sortConfig]; newSort[index] = { ...newSort[index], column: val }; setSortConfig(newSort); }} />
                          <Select className="w-[80px] shrink-0" options={[{ value: "true", label: "A→Z" }, { value: "false", label: "Z→A" }]} value={sort.ascending.toString()} onChange={(val) => { const newSort = [...sortConfig]; newSort[index] = { ...newSort[index], ascending: val === "true" }; setSortConfig(newSort); }} />
                        </div>
                        {sortConfig.length > 1 && <button onClick={() => setSortConfig(sortConfig.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500 shrink-0 p-1.5 hover:bg-white rounded-md transition-colors"><X size={14} /></button>}
                      </div>
                    ))}
                    {sortConfig.length < 3 && <button onClick={() => setSortConfig([...sortConfig, { column: "designation", ascending: true }])} className="w-full mt-1 py-2 text-sm text-gray-500 font-semibold border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors">+ Add sort rule</button>}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* COLUMNS */}
          <div className="relative" ref={activePopover === "columns" ? popoverRef : null}>
            <button onClick={() => setActivePopover(activePopover === "columns" ? null : "columns")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all border ${activePopover === "columns" ? "bg-gray-100 border-gray-300 text-gray-900" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>
              <Columns size={14} strokeWidth={2} /> Columns
            </button>
            {activePopover === "columns" && (
              <>
                <div className="fixed inset-0 bg-black/40 z-[9998] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
                <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:left-0 sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-56 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] p-3 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                     <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Visible Columns</p>
                     <button onClick={() => setActivePopover(null)} className="sm:hidden text-gray-400 p-1"><X size={16} /></button>
                  </div>
                  <div className="space-y-0.5">
                    {allColumns.map((col) => (
                      <label key={col.id} className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" checked={visibleColumns.includes(col.id)} onChange={(e) => { if (e.target.checked) setVisibleColumns([...visibleColumns, col.id]); else setVisibleColumns(visibleColumns.filter((id) => id !== col.id)); }} />
                        <span className="text-sm font-medium text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

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
                      <button onClick={() => setFilters((prev) => ({ ...prev, [key]: prev[key].filter(v => v !== val) }))} className="hover:bg-[#5C3030]/20 rounded-full p-0.5 transition-colors"><X size={10} strokeWidth={3} /></button>
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
              <div className="fixed inset-0 bg-black/40 z-[9998] sm:hidden backdrop-blur-sm" onClick={() => setActivePopover(null)} />
              <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-full sm:right-0 sm:left-auto sm:transform-none sm:translate-x-0 sm:translate-y-0 mt-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] p-4 animate-in fade-in zoom-in-95 duration-150">
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
                      <input type="text" value={exportTitle} onChange={(e) => setExportTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#5C3030] focus:ring-2 focus:ring-[#5C3030]/10 bg-gray-50 focus:bg-white transition-all" placeholder="E.g. Yuvak Directory 2026" autoFocus />
                    </div>
                  )}
                </div>
                <div className="border border-[#5C3030]/20 bg-[#5C3030]/[0.03] rounded-lg p-3 mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[11px] text-gray-500 mt-0.5">Fetches all <span className="font-semibold text-[#5C3030]">{totalCount} records</span> with current filters</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { onExport("excel", exportTitle, useCustomHeader); setActivePopover(null); }} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                      <FileSpreadsheet size={14} className="shrink-0" /> Excel
                    </button>
                    <button onClick={() => { onExport("pdf", exportTitle, useCustomHeader); setActivePopover(null); }} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
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
  );
}