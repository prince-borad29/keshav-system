// ============================================================
// ReportToolbar.jsx — Top bar (view mode)
// Fixed: Edit button shows whenever report is selected
// ============================================================
import React from 'react';
import {
  RefreshCw, Edit, Trash2, FileDown,
  FileSpreadsheet, FileText, ChevronDown, Database, Loader2, Play,
} from 'lucide-react';

function Btn({ onClick, disabled, variant = 'default', icon: Icon, children, className = '' }) {
  const base = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
  const v = {
    default:   'bg-[#5C3030] hover:bg-[#7a3c3c] text-white border-[#5C3030] shadow-sm',
    secondary: 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300',
    danger:    'bg-white hover:bg-red-50 text-red-600 border-red-200 hover:border-red-300',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${v[variant]} ${className}`}>
      {Icon && <Icon size={15} strokeWidth={2.5} />}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold bg-[#5C3030] hover:bg-[#7a3c3c] text-white border border-[#5C3030] shadow-sm transition-all disabled:opacity-50"
      >
        <FileDown size={15} />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden p-1">
          {[
            { fmt: 'excel', label: 'Excel (.xlsx)', Icon: FileSpreadsheet, cls: 'hover:bg-emerald-50 hover:text-emerald-700' },
            { fmt: 'csv',   label: 'CSV (.csv)',    Icon: FileDown,        cls: 'hover:bg-amber-50 hover:text-amber-700' },
            { fmt: 'pdf',   label: 'PDF (.pdf)',    Icon: FileText,        cls: 'hover:bg-red-50 hover:text-red-600' },
          ].map(({ fmt, label, Icon, cls }) => (
            <button
              key={fmt}
              onClick={() => { onExport(fmt); setOpen(false); }}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold text-gray-700 rounded-lg transition-colors ${cls}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportToolbar({
  reportTitle, baseTable, isRunning, hasData,
  rowCount, selectedReportId, isAdmin,
  onRun, onEdit, onDelete, onExport,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-extrabold text-gray-900 truncate leading-tight">
          {reportTitle || 'Select a Report'}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {baseTable && (
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-lg">
              <Database size={11} className="text-[#5C3030]" /> {baseTable}
            </span>
          )}
          {hasData && (
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-lg">
              {rowCount.toLocaleString('en-IN')} rows
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Run / Refresh — always available */}
        <Btn
          variant={hasData ? 'secondary' : 'default'}
          icon={isRunning ? Loader2 : hasData ? RefreshCw : Play}
          onClick={onRun}
          disabled={isRunning}
          className={isRunning ? '[&_svg]:animate-spin' : ''}
        >
          {isRunning ? 'Running…' : hasData ? 'Refresh' : 'Run Query'}
        </Btn>

        {/* Edit / Configure — shows when report selected OR has data */}
        {isAdmin && (selectedReportId || hasData) && (
          <Btn variant="secondary" icon={Edit} onClick={onEdit}>
            Edit
          </Btn>
        )}

        {/* Delete — only for saved reports */}
        {isAdmin && selectedReportId && (
          <Btn variant="danger" icon={Trash2} onClick={onDelete}>
            Delete
          </Btn>
        )}

        {/* Export — only when data available */}
        {hasData && (
          <>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            <ExportMenu onExport={onExport} disabled={!hasData} />
          </>
        )}
      </div>
    </div>
  );
}