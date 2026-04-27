// ReportDataGrid.jsx — Resizable columns, sticky header, color-coded pct
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export function formatValue(val, colType, fmtOverride) {
  if (val === null || val === undefined || val === '') return '—';
  const fmt = fmtOverride || 'auto';
  if (fmt === 'currency')   return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (fmt === 'percentage') return `${Number(val).toFixed(1)}%`;
  if (fmt === 'number')     return Number(val).toLocaleString('en-IN');
  if (fmt === 'date' || (fmt === 'auto' && colType === 'date')) {
    const d = new Date(val);
    return isNaN(d) ? String(val) : d.toLocaleDateString('en-IN');
  }
  if (fmt === 'auto' && colType === 'number') {
    const n = parseFloat(val);
    return isNaN(n) ? String(val) : n.toLocaleString('en-IN');
  }
  return String(val);
}

function PctBadge({ val }) {
  const n = parseFloat(val);
  if (isNaN(n)) return <span>—</span>;
  const cls = n >= 75 ? 'bg-emerald-100 text-emerald-700' : n >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{n.toFixed(1)}%</span>;
}

export default function ReportDataGrid({ columns, rows, columnConfigs, sorts, onSortChange, isGrouped }) {
  const [colWidths, setColWidths] = useState({});
  const resizeRef  = useRef(null);

  // Column resize
  const startResize = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colKey] || 160;
    const onMove = (ev) => {
      const newW = Math.max(60, startW + (ev.clientX - startX));
      setColWidths(p => ({ ...p, [colKey]: newW }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const sortMap = useMemo(() => {
    const m = {};
    (sorts || []).forEach((s, i) => { if (s.column) m[s.column] = { idx: i + 1, dir: s.dir }; });
    return m;
  }, [sorts]);

  const handleSort = (colKey) => {
    if (!onSortChange) return;
    const ex = (sorts || []).find(s => s.column === colKey);
    if (ex) {
      onSortChange((sorts || []).map(s => s.column === colKey ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s));
    } else {
      onSortChange([...(sorts || []), { id: Date.now(), column: colKey, dir: 'asc' }]);
    }
  };

  const numTotals = useMemo(() => {
    if (isGrouped || !rows?.length) return {};
    const t = {};
    (columns || []).forEach(c => {
      if (c.type !== 'number') return;
      const nums = rows.filter(r => !r._type || r._type === 'data').map(r => parseFloat(r[c.key])).filter(n => !isNaN(n));
      if (nums.length) t[c.key] = nums.reduce((a, b) => a + b, 0);
    });
    return t;
  }, [rows, columns, isGrouped]);

  if (!columns?.length || !rows) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 select-none">
        <div className="text-5xl">📊</div>
        <p className="text-sm font-semibold text-gray-500">Select a report type and click Run Report</p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <div className="text-4xl">🔍</div>
        <p className="text-sm font-semibold text-gray-500">No rows match your filters</p>
      </div>
    );
  }

  let dataRowNum = 0;
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 48 }} />
            {(columns || []).map(col => (
              <col key={col.key} style={{ width: colWidths[col.key] || 160 }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="bg-[#5C3030] text-white/50 text-[10px] font-bold px-3 py-3 text-right border-r border-white/10 w-12 select-none">#</th>
              {(columns || []).map(col => {
                const cfg   = columnConfigs?.[col.key] || {};
                const label = cfg.label || col.label;
                const s     = sortMap[col.key];
                const isNum = col.type === 'number';
                return (
                  <th
                    key={col.key}
                    className="relative bg-[#5C3030] text-white px-3 py-3 text-xs font-bold border-r border-white/10 select-none group"
                    style={{ textAlign: isNum ? 'right' : 'left' }}
                  >
                    <div
                      className="flex items-center gap-1.5 cursor-pointer hover:text-white/80 transition-colors"
                      style={{ justifyContent: isNum ? 'flex-end' : 'flex-start' }}
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="truncate">{label}</span>
                      {s
                        ? (s.dir === 'asc' ? <ArrowUp size={10} className="shrink-0" /> : <ArrowDown size={10} className="shrink-0" />)
                        : <ArrowUpDown size={10} className="text-white/25 group-hover:text-white/60 shrink-0" />}
                      {s && (sorts || []).length > 1 && (
                        <span className="text-[8px] bg-white/20 rounded px-1 leading-tight">{s.idx}</span>
                      )}
                    </div>
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/40 transition-colors"
                      onMouseDown={e => startResize(e, col.key)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              if (row._type === 'group_header') {
                return (
                  <tr key={`gh_${idx}`} className="bg-[#5C3030]/10 border-b-2 border-[#5C3030]/20">
                    <td className="px-3 py-2 text-[10px] text-[#5C3030] font-bold text-right">{row._count}</td>
                    {(columns || []).map((col, ci) => {
                      const val = row[col.key];
                      return (
                        <td key={col.key} className="px-3 py-2 text-xs font-bold text-[#5C3030] border-r border-[#5C3030]/10 truncate"
                          style={{ textAlign: col.type === 'number' ? 'right' : 'left' }}>
                          {ci === 0 ? String(val || '—') : val !== '' && val != null ? formatValue(val, col.type) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              dataRowNum++;
              const isEven = dataRowNum % 2 === 0;
              return (
                <tr key={idx} className={`border-b border-gray-100 hover:bg-blue-50/20 transition-colors ${isEven ? 'bg-gray-50/40' : 'bg-white'}`}>
                  <td className="px-3 py-2 text-[10px] text-gray-300 text-right font-mono border-r border-gray-100">{dataRowNum}</td>
                  {(columns || []).map(col => {
                    const cfg  = columnConfigs?.[col.key] || {};
                    const val  = row[col.key];
                    const isNum = col.type === 'number';
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2 border-r border-gray-100 truncate"
                        style={{
                          textAlign:       isNum ? 'right' : 'left',
                          backgroundColor: cfg.bgColor ? cfg.bgColor + '22' : undefined,
                          maxWidth:        colWidths[col.key] || 160,
                        }}
                        title={String(val ?? '')}
                      >
                        {col.key === 'attendance_pct'
                          ? <PctBadge val={val} />
                          : formatValue(val, col.type, cfg.format)
                        }
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {Object.keys(numTotals).length > 0 && (
            <tfoot>
              <tr className="bg-[#5C3030]/8 border-t-2 border-[#5C3030]/25 sticky bottom-0">
                <td className="px-3 py-2 text-[10px] font-bold text-[#5C3030]">Σ</td>
                {(columns || []).map(col => (
                  <td key={col.key} className="px-3 py-2 text-xs font-bold text-[#5C3030] border-r border-gray-200"
                    style={{ textAlign: 'right' }}>
                    {numTotals[col.key] != null
                      ? Number(numTotals[col.key]).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                      : ''}
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