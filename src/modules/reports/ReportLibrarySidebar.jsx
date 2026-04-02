// ============================================================
// ReportLibrarySidebar.jsx — Saved reports list with search
// ============================================================
import React, { useState } from 'react';
import { LayoutDashboard, Search, Plus, TableProperties, Loader2, Clock } from 'lucide-react';
import { MODULES } from './reportConfig.js';

function ModuleBadge({ module }) {
  const mod = MODULES.find(m => m.value === module);
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 bg-gray-200/60 text-gray-600 font-bold uppercase tracking-widest whitespace-nowrap">
      {mod?.label?.split(' ')[0] || module}
    </span>
  );
}

export default function ReportLibrarySidebar({
  savedReports,
  isLoading,
  selectedReportId,
  isBuilding,
  isAdmin,
  onSelect,
  onCreateNew,
}) {
  const [search, setSearch] = useState('');

  const filtered = (savedReports || []).filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    // 🌟 MOBILE FIX: Fixed height on mobile (35vh) so it doesn't push the grid off-screen
    <div className="w-full lg:w-72 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col shrink-0 h-[35vh] lg:h-auto overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/80 shrink-0">
        <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
          <LayoutDashboard size={16} className="text-[#5C3030]" />
          Report Library
        </h2>
      </div>

      {/* Search */}
      <div className="p-3 pb-1 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reports..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5C3030]/20 focus:border-[#5C3030] transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 custom-scrollbar">
        <p className="px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest sticky top-0 bg-white z-10">
          Saved Reports {filtered.length > 0 && `· ${filtered.length}`}
        </p>

        {isLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="animate-spin text-[#5C3030]" size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 mx-2 mt-2">
            <p className="text-xs text-gray-500 font-medium">
              {search ? 'No reports match your search.' : 'No reports saved yet.'}
            </p>
          </div>
        ) : (
          filtered.map(report => {
            const isActive = selectedReportId === report.id && !isBuilding;
            return (
              <button
                key={report.id}
                onClick={() => onSelect(report)}
                className={`w-full text-left p-3 text-sm rounded-xl transition-all flex flex-col gap-1.5 border ${
                  isActive
                    ? 'bg-[#5C3030] border-[#5C3030] shadow-md shadow-[#5C3030]/20'
                    : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5 w-full">
                  <TableProperties
                    size={16}
                    className={isActive ? 'text-white/80 shrink-0' : 'text-[#5C3030] shrink-0'}
                  />
                  <span className={`truncate font-bold flex-1 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                    {report.title}
                  </span>
                </div>
                <div className="flex items-center justify-between w-full pl-6">
                  <ModuleBadge module={report.base_module} />
                  <span className={`text-[10px] flex items-center gap-1 font-medium ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                    <Clock size={10} />
                    {new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Create button */}
      {isAdmin && (
        <div className="p-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-[#5C3030] border border-[#5C3030]/30 text-sm font-bold py-3 px-4 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} strokeWidth={3} /> New Custom Report
          </button>
        </div>
      )}
    </div>
  );
}