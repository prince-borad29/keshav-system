// ReportDataGrid.jsx
import React, { useState, useMemo, useRef } from 'react';
import { Settings2, X, EyeOff, Eye, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { calcAgg } from './reportQueryEngine';

export function formatCell(val, fmt) {
  if (val === null || val === undefined || val === '') return '—';
  switch (fmt) {
    case 'number':     return Number(val).toLocaleString('en-IN');
    case 'currency':   return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    case 'percentage': return `${Number(val).toFixed(1)}%`;
    case 'date':       return isNaN(Date.parse(val)) ? String(val) : new Date(val).toLocaleDateString('en-IN');
    case 'datetime':   return isNaN(Date.parse(val)) ? String(val) : new Date(val).toLocaleString('en-IN');
    case 'boolean':    return val === true || val === 'true' ? 'Yes' : val === false || val === 'false' ? 'No' : String(val);
    default:           return String(val);
  }
}

// ── Col config popover ────────────────────────────────────────
function ColMenu({ col, cfg, onSave, onHide, onClose }) {
  const [d, setD] = useState({ label: cfg.label || col.label || col.key, format: cfg.format || 'text', align: cfg.align || 'left', bgColor: cfg.bgColor || '' });
  const u = (k, v) => setD(p => ({ ...p, [k]: v }));

  const FORMAT_OPS = [
    { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' },
    { value: 'currency', label: 'Currency ₹' }, { value: 'percentage', label: 'Percentage %' },
    { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date & Time' }, { value: 'boolean', label: 'Yes/No' },
  ];

  return (
    <div className="absolute top-full left-0 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] p-3">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Column</span>
        <div className="flex gap-1">
          <button onClick={onHide} title="Hide" className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50"><EyeOff size={13} /></button>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><X size={13} /></button>
        </div>
      </div>
      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] text-gray-500 font-bold block mb-1">Display Name</label>
          <input type="text" value={d.label} onChange={e => u('label', e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#5C3030]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">Format</label>
            <select value={d.format} onChange={e => u('format', e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#5C3030]">
              {FORMAT_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-1">Align</label>
            <select value={d.align} onChange={e => u('align', e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#5C3030]">
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-bold block mb-1">Highlight Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={d.bgColor || '#ffffff'} onChange={e => u('bgColor', e.target.value)} className="w-9 h-8 rounded border border-gray-200 cursor-pointer" />
            <button onClick={() => u('bgColor', '')} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
          </div>
        </div>
        <button onClick={() => { onSave(col.key, d); onClose(); }} className="w-full bg-[#5C3030] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#7a3c3c]">Apply</button>
      </div>
    </div>
  );
}

// ── Group row that can expand ─────────────────────────────────
function GroupRow({ row, visibleCols, columnConfigs, aggCfg, onExpand, expanded }) {
  const groupKey = Object.keys(row).find(k => !k.startsWith('_') && !k.startsWith('_agg'));
  return (
    <tr className="bg-[#5C3030]/6 border-b border-[#5C3030]/10 cursor-pointer" onClick={onExpand}>
      <td className="px-2.5 py-2 w-8 text-center">
        {expanded ? <ChevronDown size={13} className="text-[#5C3030] mx-auto" /> : <ChevronRight size={13} className="text-[#5C3030] mx-auto" />}
      </td>
      <td className="px-2 py-2 w-10 text-center">
        <span className="text-[10px] font-bold text-[#5C3030] bg-[#5C3030]/15 px-1.5 py-0.5 rounded-full">{row._rowCount}</span>
      </td>
      {visibleCols.map((col, ci) => {
        const cfg     = columnConfigs?.[col.key] || {};
        const agg     = aggCfg?.[col.key] || row[`_agg_${col.key}`];
        const val     = row[col.key];
        const label   = cfg.label || col.label || col.key;
        return (
          <td
            key={col.key}
            className="px-3 py-2 text-sm max-w-[220px] truncate"
            style={{ textAlign: cfg.align || 'left', backgroundColor: cfg.bgColor && cfg.bgColor !== '#ffffff' ? cfg.bgColor + '22' : undefined }}
          >
            {ci === 0 ? (
              <span className="font-bold text-[#5C3030]">{String(val ?? '—')}</span>
            ) : agg ? (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                {agg.toUpperCase()}: {formatCell(val, cfg.format)}
              </span>
            ) : (
              <span className="text-gray-400 text-xs">{String(val ?? '')}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── Main Grid ─────────────────────────────────────────────────
export default function ReportDataGrid({
  columns, data, columnConfigs, setColumnConfigs,
  sorts, onSortChange, isGrouped, aggCfg,
}) {
  const [openMenu,    setOpenMenu]    = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const visibleCols = useMemo(() =>
    (columns || []).filter(c => !columnConfigs?.[c.key]?.hidden),
    [columns, columnConfigs]
  );

  const hiddenCount = (columns || []).length - visibleCols.length;

  const sortMap = useMemo(() => {
    const m = {};
    (sorts || []).forEach((s, i) => { if (s.col) m[s.col] = { i: i + 1, dir: s.dir }; });
    return m;
  }, [sorts]);

  const saveConfig = (key, cfg) => setColumnConfigs(p => ({ ...p, [key]: { ...(p?.[key] || {}), ...cfg } }));
  const hideCol    = (key) => saveConfig(key, { hidden: true });
  const showAll    = () => setColumnConfigs(p => {
    const n = { ...p };
    Object.keys(n).forEach(k => { n[k] = { ...n[k], hidden: false }; });
    return n;
  });

  const handleSort = (col) => {
    if (!onSortChange) return;
    const existing = (sorts || []).find(s => s.col === col.key);
    if (existing) {
      onSortChange((sorts || []).map(s => s.col === col.key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
    } else {
      onSortChange([...(sorts || []), { id: Date.now(), col: col.key, dir: 'asc' }]);
    }
  };

  // Numeric totals for footer
  const numericTotals = useMemo(() => {
    if (isGrouped || !data.length) return {};
    const t = {};
    visibleCols.forEach(c => {
      const vals = data.map(r => parseFloat(r[c.key])).filter(n => !isNaN(n));
      if (vals.length > 0) t[c.key] = vals.reduce((a, b) => a + b, 0);
    });
    return t;
  }, [data, visibleCols, isGrouped]);

  const hasTotals = Object.keys(numericTotals).length > 0;

  if (!columns?.length || !data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <span className="text-5xl">{!columns?.length ? '🔧' : '🔍'}</span>
        <p className="font-semibold text-gray-500">{!columns?.length ? 'Run a query to load data.' : 'No rows match your filters.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-100 shrink-0">
          <EyeOff size={12} className="text-amber-500" />
          <span className="text-xs text-amber-700">{hiddenCount} column{hiddenCount > 1 ? 's' : ''} hidden</span>
          <button onClick={showAll} className="ml-auto text-xs font-bold text-amber-700 hover:underline flex items-center gap-1">
            <Eye size={11} /> Show all
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#5C3030] text-white shadow-md">
              <th className="w-8 px-2.5 py-3" />
              <th className="w-10 px-2 py-3 text-xs font-bold text-white/50 text-center">#</th>
              {visibleCols.map(col => {
                const cfg    = columnConfigs?.[col.key] || {};
                const label  = cfg.label || col.label || col.key;
                const s      = sortMap[col.key];
                const isOpen = openMenu === col.key;
                return (
                  <th key={col.key} className="relative group px-3 py-3 text-xs font-bold whitespace-nowrap select-none cursor-pointer hover:bg-white/10 transition-colors min-w-[100px]">
                    <div className="flex items-center gap-2" onClick={() => handleSort(col)}>
                      <span className="truncate flex-1 max-w-[180px]">{label}</span>
                      {s
                        ? s.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                        : <ArrowUpDown size={11} className="text-white/30 group-hover:text-white/60" />}
                      {s && <span className="text-[9px] text-white/60 bg-white/20 rounded px-1">{s.i}</span>}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenu(isOpen ? null : col.key); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/20 transition-all"
                    >
                      <Settings2 size={11} />
                    </button>
                    {isOpen && (
                      <ColMenu
                        col={col}
                        cfg={cfg}
                        onSave={saveConfig}
                        onHide={() => { hideCol(col.key); setOpenMenu(null); }}
                        onClose={() => setOpenMenu(null)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {data.map((row, rowIdx) => {
              if (row._isGroupRow) {
                const expanded = expandedGroups.has(rowIdx);
                return (
                  <React.Fragment key={rowIdx}>
                    <GroupRow
                      row={row} visibleCols={visibleCols}
                      columnConfigs={columnConfigs} aggCfg={aggCfg}
                      expanded={expanded}
                      onExpand={() => setExpandedGroups(p => {
                        const n = new Set(p);
                        n.has(rowIdx) ? n.delete(rowIdx) : n.add(rowIdx);
                        return n;
                      })}
                    />
                    {expanded && row._rows?.map((subRow, si) => (
                      <tr key={`${rowIdx}_${si}`} className="border-b border-gray-100 bg-[#5C3030]/2 hover:bg-[#5C3030]/5 transition-colors">
                        <td className="w-8 bg-[#5C3030]/5" />
                        <td className="px-2 py-1.5 text-[11px] text-gray-300 text-center">{si + 1}</td>
                        {visibleCols.map(col => {
                          const cfg = columnConfigs?.[col.key] || {};
                          return (
                            <td key={col.key} className="px-3 py-1.5 text-sm max-w-[220px] truncate"
                              style={{ textAlign: cfg.align || 'left', backgroundColor: cfg.bgColor && cfg.bgColor !== '#ffffff' ? cfg.bgColor + '22' : undefined }}
                            >
                              {formatCell(subRow[col.key], cfg.format)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              }

              return (
                <tr key={rowIdx} className={`border-b border-gray-100 transition-colors ${rowIdx % 2 === 0 ? 'bg-white hover:bg-gray-50/60' : 'bg-gray-50/40 hover:bg-gray-100/50'}`}>
                  <td className="w-8 px-2.5 py-2" />
                  <td className="px-2 py-2 text-[11px] text-gray-300 text-center">{rowIdx + 1}</td>
                  {visibleCols.map(col => {
                    const cfg = columnConfigs?.[col.key] || {};
                    return (
                      <td key={col.key} className="px-3 py-2 text-sm max-w-[240px] truncate border-r border-gray-100/60"
                        style={{ textAlign: cfg.align || 'left', backgroundColor: cfg.bgColor && cfg.bgColor !== '#ffffff' ? cfg.bgColor + '30' : undefined }}
                        title={String(row[col.key] ?? '')}
                      >
                        {formatCell(row[col.key], cfg.format)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {hasTotals && (
            <tfoot>
              <tr className="bg-[#5C3030]/8 border-t-2 border-[#5C3030]/20 sticky bottom-0">
                <td colSpan={2} className="px-3 py-2 text-xs font-bold text-[#5C3030]">Σ {data.length} rows</td>
                {visibleCols.map(col => (
                  <td key={col.key} className="px-3 py-2 text-xs font-bold text-[#5C3030] text-right">
                    {numericTotals[col.key] != null ? Number(numericTotals[col.key]).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}