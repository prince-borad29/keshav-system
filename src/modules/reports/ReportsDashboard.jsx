// ReportsDashboard.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  X, Save, Play, Loader2, LayoutTemplate, Plus, Trash2,
  SlidersHorizontal, ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

import { executeDynamicQuery, applyFilters, applyMultiSort, applyGrouping, applyFormula } from './reportQueryEngine';
import { handleExport } from './reportExportEngine';
import { AGG_TYPES, FILTER_OPS, DB_SCHEMA } from './reportConfig';

import ReportLibrarySidebar from './ReportLibrarySidebar';
import ReportToolbar        from './ReportToolbar';
import QueryStudio          from './QueryStudio';
import ReportDataGrid       from './ReportDataGrid';

// ── Small reusable select ─────────────────────────────────────
function Sel({ value, onChange, options, className = '', placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800 focus:outline-none focus:border-[#5C3030] cursor-pointer ${className}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Sort panel ────────────────────────────────────────────────
function SortPanel({ sorts, setSorts, columns }) {
  const colOpts = columns.map(c => ({ value: c.key, label: c.label || c.key }));
  const add = () => columns[0] && setSorts(p => [...p, { id: Date.now(), col: columns[0].key, dir: 'asc' }]);
  const upd = (id, patch) => setSorts(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  const del = (id) => setSorts(p => p.filter(s => s.id !== id));
  return (
    <div className="space-y-2 p-4">
      <p className="text-xs text-gray-500 mb-3">Multiple sort rules applied in priority order (top = highest).</p>
      {sorts.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
          <span className="w-5 h-5 rounded-full bg-[#5C3030] text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <Sel value={s.col} onChange={v => upd(s.id, { col: v })} options={colOpts} className="flex-1" />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
            {['asc', 'desc'].map(d => (
              <button key={d} onClick={() => upd(s.id, { dir: d })}
                className={`px-2.5 py-1.5 text-xs font-bold ${s.dir === d ? 'bg-[#5C3030] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {d === 'asc' ? '↑' : '↓'}
              </button>
            ))}
          </div>
          <button onClick={() => del(s.id)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-sm font-bold text-gray-500 transition-all">
        <Plus size={13} /> Add Sort Rule
      </button>
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────
function FilterPanel({ filters, setFilters, columns }) {
  const colOpts = columns.map(c => ({ value: c.key, label: c.label || c.key }));
  const add = () => columns[0] && setFilters(p => [...p, { id: Date.now(), col: columns[0].key, op: 'contains', val: '' }]);
  const upd = (id, patch) => setFilters(p => p.map(f => f.id === id ? { ...f, ...patch } : f));
  const del = (id) => setFilters(p => p.filter(f => f.id !== id));
  return (
    <div className="space-y-2 p-4">
      <p className="text-xs text-gray-500 mb-3">All rules use AND logic — a row must pass every rule to show.</p>
      {filters.map((f, i) => (
        <div key={f.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{i === 0 ? 'WHERE' : 'AND'}</span>
            <button onClick={() => del(f.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Sel value={f.col} onChange={v => upd(f.id, { col: v })} options={colOpts} />
            <Sel value={f.op}  onChange={v => upd(f.id, { op: v })}  options={FILTER_OPS} />
          </div>
          {!['empty', 'filled'].includes(f.op) && (
            <input type="text" value={f.val} onChange={e => upd(f.id, { val: e.target.value })}
              placeholder="Value..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5C3030]" />
          )}
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-sm font-bold text-gray-500 transition-all">
        <Plus size={13} /> Add Filter
      </button>
    </div>
  );
}

// ── Group + Aggregation panel ─────────────────────────────────
function GroupPanel({ groupBy, setGroupBy, aggCfg, setAggCfg, columns }) {
  const colOpts = [{ value: '', label: 'None (raw rows)' }, ...columns.map(c => ({ value: c.key, label: c.label || c.key }))];
  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Group Rows By</label>
        <Sel value={groupBy || ''} onChange={v => setGroupBy(v || null)} options={colOpts} className="w-full" />
      </div>
      {groupBy && (
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Aggregation per Column</label>
          <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
            {columns.filter(c => c.key !== groupBy).map(col => (
              <div key={col.key} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{col.label || col.key}</span>
                <Sel
                  value={aggCfg?.[col.key] || ''}
                  onChange={v => setAggCfg(p => ({ ...p, [col.key]: v }))}
                  options={AGG_TYPES}
                  className="w-28 shrink-0 !py-1 !text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formula panel ─────────────────────────────────────────────
function FormulaPanel({ formulaCols, setFormulaCols }) {
  const add = () => setFormulaCols(p => [...p, { id: Date.now(), name: 'new_col', formula: '=CONCAT(name, surname)' }]);
  const upd = (id, patch) => setFormulaCols(p => p.map(f => f.id === id ? { ...f, ...patch } : f));
  const del = (id) => setFormulaCols(p => p.filter(f => f.id !== id));
  return (
    <div className="p-4 space-y-3">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
        <p className="font-bold">Supported Formulas</p>
        {[
          '=CONCAT(name, " ", surname)',
          '=IF(gender = Yuvak, 1, 0)',
          '=UPPER(name)',
          '=LEN(mobile)',
          '=col1 + col2',
          '=col1 * 2',
        ].map(ex => <p key={ex}><code className="bg-blue-100 px-1 rounded font-mono">{ex}</code></p>)}
      </div>
      {formulaCols.map(f => (
        <div key={f.id} className="flex gap-2 items-center bg-gray-50 border border-gray-200 rounded-xl p-3">
          <input type="text" value={f.name} onChange={e => upd(f.id, { name: e.target.value })}
            placeholder="Column name" className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#5C3030]" />
          <input type="text" value={f.formula} onChange={e => upd(f.id, { formula: e.target.value })}
            placeholder="=CONCAT(a, b)" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-[#5C3030]" />
          <button onClick={() => del(f.id)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-sm font-bold text-gray-500 transition-all">
        <Plus size={13} /> Add Formula Column
      </button>
    </div>
  );
}

// ── Aggregation row for export ────────────────────────────────
function buildAggRow(data, columns, aggCfg) {
  if (!aggCfg || !Object.values(aggCfg).some(Boolean)) return null;
  const { calcAgg } = require('./reportQueryEngine');
  const row = {};
  columns.forEach(col => {
    const agg = aggCfg[col.key];
    if (agg) row[col.key] = `${agg.toUpperCase()}: ${calcAgg(data.map(r => r[col.key]), agg)}`;
    else row[col.key] = '';
  });
  return row;
}

// ── Default state ─────────────────────────────────────────────
const fresh = () => ({
  reportTitle:  'New Report', baseTable: 'members',
  selectString: 'id, internal_code, name, surname, gender, mandals(name, kshetras(name))',
  visualConfig: { columns: ['id', 'internal_code', 'name', 'surname', 'gender'], relations: [] },
  columnConfigs: {}, filters: [], sorts: [], groupBy: null, aggCfg: {}, formulaCols: [],
});

// ── Tabs for builder side panel ───────────────────────────────
const BUILDER_TABS = [
  { id: 'query',    label: 'Query' },
  { id: 'filter',   label: 'Filter' },
  { id: 'sort',     label: 'Sort' },
  { id: 'group',    label: 'Group' },
  { id: 'formula',  label: 'Formula' },
];

export default function ReportsDashboard() {
  const { profile } = useAuth();
  const isAdmin     = profile?.role === 'admin';
  const qc          = useQueryClient();

  const [selectedId,    setSelectedId]    = useState(null);
  const [isBuilding,    setIsBuilding]    = useState(false);
  const [builderTab,    setBuilderTab]    = useState('query');
  const [showFilters,   setShowFilters]   = useState(false);

  // Builder state
  const [reportTitle,   setReportTitle]   = useState('');
  const [baseTable,     setBaseTable]     = useState('members');
  const [selectString,  setSelectString]  = useState('id, internal_code, name, surname, gender, mandals(name, kshetras(name))');
  const [visualConfig,  setVisualConfig]  = useState({ columns: [], relations: [] });
  const [columnConfigs, setColumnConfigs] = useState({});

  // Data controls
  const [filters,     setFilters]     = useState([]);
  const [sorts,       setSorts]       = useState([]);
  const [groupBy,     setGroupBy]     = useState(null);
  const [aggCfg,      setAggCfg]      = useState({});
  const [formulaCols, setFormulaCols] = useState([]);

  // Data
  const [isRunning,  setIsRunning]  = useState(false);
  const [rawData,    setRawData]    = useState([]);
  const [allColumns, setAllColumns] = useState([]);

  // Saved reports
  const { data: savedReports, isLoading: loadingReports } = useQuery({
    queryKey: ['saved_reports'],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_reports').select('*').order('created_at', { ascending: false });
      if (error && error.code !== '42P01') throw error;
      return data || [];
    },
  });

  // ── Derived: data with formulas applied ──────────────────
  const dataWithFormulas = useMemo(() => {
    if (!rawData.length) return rawData;
    let d = rawData.map(r => ({ ...r }));
    formulaCols.forEach(fc => {
      if (!fc.name || !fc.formula) return;
      const results = applyFormula(d, fc.formula, fc.name);
      d = d.map((row, i) => ({ ...row, [fc.name]: results[i] }));
    });
    return d;
  }, [rawData, formulaCols]);

  // ── Derived: columns including formula cols ───────────────
  const allColumnsWithFormulas = useMemo(() => {
    const base = allColumns;
    const fCols = formulaCols.filter(f => f.name).map(f => ({ key: f.name, label: f.name, type: 'text', _isFormula: true }));
    const keys  = new Set(base.map(c => c.key));
    return [...base, ...fCols.filter(f => !keys.has(f.key))];
  }, [allColumns, formulaCols]);

  // ── Derived: processed data ───────────────────────────────
  const processedData = useMemo(() => {
    let d = applyFilters(dataWithFormulas, filters);
    d = applyMultiSort(d, sorts);
    const { grouped, data: gd } = applyGrouping(d, groupBy, allColumnsWithFormulas, aggCfg);
    return { data: gd, grouped };
  }, [dataWithFormulas, filters, sorts, groupBy, allColumnsWithFormulas, aggCfg]);

  // ── Run query ─────────────────────────────────────────────
  const runQuery = useCallback(async (tbl, sel) => {
    const table  = tbl || baseTable;
    const select = sel || selectString;
    if (!table) return toast.error('Select a base table first');
    setIsRunning(true);
    try {
      const result = await executeDynamicQuery({ baseTable: table, selectString: select });
      setRawData(result.data);
      setAllColumns(result.columns);
      // Auto-init column configs
      setColumnConfigs(prev => {
        const next = { ...prev };
        result.columns.forEach(c => {
          if (!next[c.key]) next[c.key] = { label: c.label, format: c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text', align: 'left' };
        });
        return next;
      });
      toast.success(`${result.data.length.toLocaleString('en-IN')} rows loaded.`);
    } catch (err) {
      toast.error('Query failed: ' + (err.message || err));
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  }, [baseTable, selectString]);

  // ── Load saved report ─────────────────────────────────────
  const loadReport = useCallback((report) => {
    const cfg = report.filters || {};
    setSelectedId(report.id);
    setReportTitle(report.title);
    setBaseTable(report.base_module);
    setSelectString(cfg.selectString || '*');
    setVisualConfig(cfg.visualConfig || { columns: [], relations: [] });
    setColumnConfigs(cfg.columnConfigs || {});
    setFilters(cfg.filters || []);
    setSorts(cfg.sorts || []);
    setGroupBy(cfg.groupBy || null);
    setAggCfg(cfg.aggCfg || {});
    setFormulaCols(cfg.formulaCols || []);
    setIsBuilding(false);
    setTimeout(() => runQuery(report.base_module, cfg.selectString || '*'), 50);
  }, [runQuery]);

  // ── Save ──────────────────────────────────────────────────
  const saveReport = async () => {
    if (!reportTitle?.trim()) return toast.error('Enter a title');
    const id = toast.loading(selectedId ? 'Updating…' : 'Saving…');
    const payload = {
      title: reportTitle.trim(), base_module: baseTable,
      columns: allColumns.map(c => c.key), allowed_roles: ['admin'],
      filters: { selectString, visualConfig, columnConfigs, filters, sorts, groupBy, aggCfg, formulaCols },
    };
    try {
      const { error } = selectedId
        ? await supabase.from('saved_reports').update(payload).eq('id', selectedId)
        : await supabase.from('saved_reports').insert(payload);
      if (error) throw error;
      toast.success(selectedId ? 'Updated!' : 'Saved!', { id });
      qc.invalidateQueries(['saved_reports']);
      setIsBuilding(false);
    } catch (err) {
      toast.error('Save failed: ' + err.message, { id });
    }
  };

  // ── Delete ────────────────────────────────────────────────
  const deleteReport = async () => {
    if (!selectedId || !window.confirm('Delete this report?')) return;
    const id = toast.loading('Deleting…');
    const { error } = await supabase.from('saved_reports').delete().eq('id', selectedId);
    if (error) return toast.error('Failed', { id });
    toast.success('Deleted', { id });
    setSelectedId(null); setRawData([]); setAllColumns([]);
    qc.invalidateQueries(['saved_reports']);
  };

  // ── Export ────────────────────────────────────────────────
  const onExport = async (format) => {
    const exportCols = allColumnsWithFormulas.filter(c => !columnConfigs?.[c.key]?.hidden).map(c => ({
      ...c, label: columnConfigs?.[c.key]?.label || c.label || c.key,
    }));
    let exportData = [...processedData.data];
    // Append aggregation summary row for export
    if (!processedData.grouped && Object.values(aggCfg).some(Boolean)) {
      const aggRow = {};
      const { calcAgg } = await import('./reportQueryEngine');
      exportCols.forEach(col => {
        const agg = aggCfg[col.key];
        aggRow[col.key] = agg ? `${agg.toUpperCase()}: ${calcAgg(processedData.data.map(r => r[col.key]), agg)}` : '';
      });
      exportData = [...exportData, aggRow];
    }
    const id = toast.loading(`Generating ${format.toUpperCase()}…`);
    try {
      await handleExport(format, exportData, exportCols, reportTitle || 'Report');
      toast.success('Exported!', { id });
    } catch (err) {
      toast.error('Export failed: ' + err.message, { id });
    }
  };

  const hasData       = processedData.data.length > 0;
  const activeFilters = filters.length + sorts.length + (groupBy ? 1 : 0) + formulaCols.length;

  // ─────────────────────────────────────────────────────────
  return (
    <>
      {/* ── View mode ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)] gap-4 -mt-2">
        <ReportLibrarySidebar
          savedReports={savedReports} isLoading={loadingReports}
          selectedReportId={selectedId} isBuilding={isBuilding} isAdmin={isAdmin}
          onSelect={loadReport}
          onCreateNew={() => {
            const s = fresh();
            setSelectedId(null); setReportTitle(s.reportTitle); setBaseTable(s.baseTable);
            setSelectString(s.selectString); setVisualConfig(s.visualConfig);
            setColumnConfigs({}); setFilters([]); setSorts([]); setGroupBy(null);
            setAggCfg({}); setFormulaCols([]); setRawData([]); setAllColumns([]);
            setIsBuilding(true); setBuilderTab('query');
          }}
        />

        <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
          <ReportToolbar
            reportTitle={reportTitle} baseTable={baseTable} isAdmin={isAdmin}
            isRunning={isRunning} hasData={hasData} rowCount={processedData.data.length}
            selectedReportId={selectedId} onRun={() => runQuery()} onEdit={() => setIsBuilding(true)}
            onDelete={deleteReport} onExport={onExport}
          />

          {/* Quick controls (view mode) */}
          {!isBuilding && rawData.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilters(s => !s)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  showFilters || activeFilters > 0 ? 'bg-[#5C3030]/10 text-[#5C3030] border-[#5C3030]/30' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <SlidersHorizontal size={13} />
                Controls
                {activeFilters > 0 && <span className="bg-[#5C3030] text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{activeFilters}</span>}
                {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          )}

          {/* Quick controls expanded (view mode) */}
          {!isBuilding && showFilters && allColumnsWithFormulas.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50">
                {[
                  { id: 'filter',  label: `Filter${filters.length ? ` (${filters.length})` : ''}` },
                  { id: 'sort',    label: `Sort${sorts.length ? ` (${sorts.length})` : ''}` },
                  { id: 'group',   label: `Group${groupBy ? ' ✓' : ''}` },
                  { id: 'formula', label: `Formula${formulaCols.length ? ` (${formulaCols.length})` : ''}` },
                ].map(t => (
                  <button key={t.id} onClick={() => setBuilderTab(t.id)}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${builderTab === t.id ? 'text-[#5C3030] border-[#5C3030] bg-white' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto custom-scrollbar">
                {builderTab === 'filter'  && <FilterPanel  filters={filters}         setFilters={setFilters}   columns={allColumnsWithFormulas} />}
                {builderTab === 'sort'    && <SortPanel    sorts={sorts}             setSorts={setSorts}       columns={allColumnsWithFormulas} />}
                {builderTab === 'group'   && <GroupPanel   groupBy={groupBy}         setGroupBy={setGroupBy}   aggCfg={aggCfg} setAggCfg={setAggCfg} columns={allColumnsWithFormulas} />}
                {builderTab === 'formula' && <FormulaPanel formulaCols={formulaCols} setFormulaCols={setFormulaCols} />}
              </div>
            </div>
          )}

          {/* Data grid */}
          <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden relative min-h-[300px]">
            {!selectedId && !isBuilding ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50/60 gap-4">
                <LayoutTemplate size={56} strokeWidth={1} className="text-gray-200" />
                <div className="text-center">
                  <h2 className="text-lg font-bold text-gray-600">Reports Portal</h2>
                  <p className="text-sm text-gray-400 mt-1">Select a saved report or create a new one.</p>
                </div>
                {isAdmin && (
                  <button onClick={() => setIsBuilding(true)} className="px-5 py-2.5 bg-[#5C3030] text-white text-sm font-bold rounded-xl hover:bg-[#7a3c3c] transition-colors shadow-sm">
                    + Create New Report
                  </button>
                )}
              </div>
            ) : isRunning ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-50 gap-3">
                <div className="w-12 h-12 rounded-full border-4 border-[#5C3030]/20 border-t-[#5C3030] animate-spin" />
                <p className="text-sm font-semibold text-gray-600 animate-pulse">Executing query…</p>
              </div>
            ) : (
              <ReportDataGrid
                columns={allColumnsWithFormulas}
                data={processedData.data}
                isGrouped={processedData.grouped}
                columnConfigs={columnConfigs}
                setColumnConfigs={setColumnConfigs}
                sorts={sorts}
                onSortChange={setSorts}
                aggCfg={aggCfg}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Builder fullscreen ───────────────────────── */}
      {isBuilding && (
        <div className="fixed inset-0 z-[100] bg-gray-100 flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setIsBuilding(false)} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 shrink-0"><X size={18} /></button>
              <input
                value={reportTitle} onChange={e => setReportTitle(e.target.value)}
                placeholder="Report title…"
                className="text-xl font-extrabold text-gray-900 bg-transparent outline-none border-b-2 border-dashed border-gray-300 focus:border-[#5C3030] pb-0.5 min-w-0 max-w-sm"
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-xs text-gray-400 font-medium hidden md:block">
                {allColumns.length > 0 && `${processedData.data.length.toLocaleString('en-IN')} rows`}
                {processedData.grouped ? ' · grouped' : ''}
              </div>
              <button onClick={() => runQuery()} disabled={isRunning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-xl border border-gray-200 disabled:opacity-50">
                {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                {isRunning ? 'Running…' : 'Run Query'}
              </button>
              <button onClick={saveReport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#5C3030] hover:bg-[#7a3c3c] text-white text-sm font-bold rounded-xl shadow-sm">
                <Save size={15} />
                {selectedId ? 'Update' : 'Save'}
              </button>
            </div>
          </header>

          {/* 3-panel body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Query Studio */}
            <div className="w-[380px] shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
              <div className="px-4 pt-3 pb-1 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">1. Query Builder</p>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-2">
                <QueryStudio
                  baseTable={baseTable} setBaseTable={setBaseTable}
                  selectString={selectString} setSelectString={setSelectString}
                  visualConfig={visualConfig} setVisualConfig={setVisualConfig}
                />
              </div>
            </div>

            {/* Middle: Controls */}
            <div className="w-64 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
              <div className="flex border-b border-gray-200 shrink-0">
                {BUILDER_TABS.filter(t => t.id !== 'query').map(t => (
                  <button key={t.id} onClick={() => setBuilderTab(t.id)}
                    className={`flex-1 py-2.5 text-[10px] font-bold border-b-2 transition-all ${builderTab === t.id ? 'text-[#5C3030] border-[#5C3030] bg-white' : 'text-gray-400 border-transparent hover:text-gray-600 bg-gray-50'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {builderTab === 'filter'  && <FilterPanel  filters={filters}         setFilters={setFilters}   columns={allColumnsWithFormulas} />}
                {builderTab === 'sort'    && <SortPanel    sorts={sorts}             setSorts={setSorts}       columns={allColumnsWithFormulas} />}
                {builderTab === 'group'   && <GroupPanel   groupBy={groupBy}         setGroupBy={setGroupBy}   aggCfg={aggCfg} setAggCfg={setAggCfg} columns={allColumnsWithFormulas} />}
                {builderTab === 'formula' && <FormulaPanel formulaCols={formulaCols} setFormulaCols={setFormulaCols} />}
              </div>
            </div>

            {/* Right: Preview grid */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="px-4 pt-3 pb-1 shrink-0 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">3. Preview & Column Config</p>
                {hasData && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                    {processedData.data.length.toLocaleString('en-IN')} rows{processedData.grouped ? ' · grouped' : ''}
                  </span>
                )}
              </div>
              <div className="flex-1 bg-white mx-4 mb-4 mt-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
                {isRunning ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="w-10 h-10 rounded-full border-4 border-[#5C3030]/20 border-t-[#5C3030] animate-spin" />
                  </div>
                ) : (
                  <ReportDataGrid
                    columns={allColumnsWithFormulas}
                    data={processedData.data}
                    isGrouped={processedData.grouped}
                    columnConfigs={columnConfigs}
                    setColumnConfigs={setColumnConfigs}
                    sorts={sorts}
                    onSortChange={setSorts}
                    aggCfg={aggCfg}
                  />
                )}
              </div>
              <p className="text-[10px] text-gray-400 px-4 pb-3 shrink-0">
                💡 Click the ⚙ gear on any column header to rename, format, align, color or hide it. Double-click a group row to expand sub-rows.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}