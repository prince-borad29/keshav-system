// ReportsDashboard.jsx
import React, {
  useState, useMemo, useCallback, useEffect, useRef
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Play, Save, Trash2, FileDown, FileSpreadsheet, FileText,
  ChevronDown, Plus, X, Filter, ArrowUpDown, Layers,
  Loader2, Search, Clock, Database, Eye, EyeOff,
  Settings2, BarChart2, Users, ClipboardList, UserCheck,
  Calendar, MapPin, Map, UserX, Check, Code2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  REPORT_TYPES, REPORT_COLUMNS, AGG_FUNCTIONS, DB_SCHEMA,
} from './reportConfig';
import {
  runReport, applyFilters, applySort, applyGrouping, fetchProjectList,
} from './reportQueryEngine';
import { handleExport } from './reportExportEngine';
import ReportDataGrid from './ReportDataGrid';

// ══════════════════════════════════════════════════════════════
// Shared tiny primitives
// ══════════════════════════════════════════════════════════════
function Btn({ children, onClick, disabled, variant = 'primary', size = 'md', icon: Icon, className = '' }) {
  const sz = { sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg', md: 'px-4 py-2 text-sm gap-2 rounded-xl' };
  const vr = {
    primary:   'bg-[#5C3030] hover:bg-[#7a3c3c] text-white border border-[#5C3030] shadow-sm',
    secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300',
    danger:    'bg-white hover:bg-red-50 text-red-600 border border-red-200',
    ghost:     'bg-transparent hover:bg-gray-100 text-gray-600 border border-transparent',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${sz[size]} ${vr[variant]} ${className}`}>
      {Icon && <Icon size={size === 'sm' ? 13 : 15} className={disabled && variant === 'primary' ? 'animate-spin' : ''} />}
      {children}
    </button>
  );
}

function Sel({ value, onChange, options, placeholder, className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:border-[#5C3030] cursor-pointer ${className}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const TYPE_ICONS = { Users, ClipboardList, UserCheck, Calendar, BarChart2, MapPin, Map, UserX };

// ══════════════════════════════════════════════════════════════
// SQL Query Builder with advanced autocomplete & execution
// ══════════════════════════════════════════════════════════════
function SQLQueryBuilder({ selectString, setSelectString, baseTable, setBaseTable, onExecute, isExecuting }) {
  const [suggestions, setSuggestions] = useState([]);
  const [suggIdx, setSuggIdx] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const taRef = useRef(null);

  const tables = Object.keys(DB_SCHEMA);

  const getSuggestions = (text, pos) => {
    // Get word being typed
    const beforeCursor = text.substring(0, pos);
    const lastWord = beforeCursor.split(/[\s,()=]/g).pop().toLowerCase();
    if (!lastWord || lastWord.length < 1) return [];

    const all = [];

    // Table names
    tables.forEach(t => {
      if (t.toLowerCase().startsWith(lastWord) && t !== lastWord) {
        all.push({ text: t, hint: `table · ${DB_SCHEMA[t].length} cols`, type: 'table' });
      }
    });

    // Column names from all tables
    Object.entries(DB_SCHEMA).forEach(([tbl, cols]) => {
      cols.forEach(col => {
        if (col.toLowerCase().startsWith(lastWord) && col !== lastWord) {
          all.push({ text: col, hint: tbl, type: 'column' });
        }
      });
    });

    // Keywords & functions
    const keywords = ['SELECT', 'FROM', 'WHERE', 'IN', 'AND', 'OR', 'COUNT', 'SUM', 'AVG', 'ORDER', 'BY', 'LIMIT', 'OFFSET', 'DISTINCT'];
    keywords.forEach(kw => {
      if (kw.toLowerCase().startsWith(lastWord) && kw.toLowerCase() !== lastWord) {
        all.push({ text: kw, hint: 'keyword', type: 'keyword' });
      }
    });

    // PostgREST patterns
    const patterns = ['!inner', '!left', 'not.', 'is.null', 'is.not.null', 'eq.', 'neq.', 'gt.', 'gte.', 'lt.', 'lte.', 'like.'];
    patterns.forEach(p => {
      if (p.toLowerCase().startsWith(lastWord) && p !== lastWord) {
        all.push({ text: p, hint: 'operator', type: 'keyword' });
      }
    });

    return all.slice(0, 12);
  };

  const handleKeyInput = (e) => {
    const text = e.target.value;
    setCursorPos(e.target.selectionStart);
    setSelectString(text);
    const s = getSuggestions(text, e.target.selectionStart);
    setSuggestions(s);
    setSuggIdx(0);
  };

  const applySuggestion = (sugg) => {
    const beforeCursor = selectString.substring(0, cursorPos);
    const afterCursor = selectString.substring(cursorPos);
    const lastWord = beforeCursor.split(/[\s,()=]/g).pop();
    const newBefore = beforeCursor.substring(0, beforeCursor.length - lastWord.length) + sugg.text;
    const newText = newBefore + afterCursor;
    setSelectString(newText);
    setSuggestions([]);
    setTimeout(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(newBefore.length, newBefore.length);
      setCursorPos(newBefore.length);
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSuggIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onExecute?.(); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (suggestions[suggIdx]) applySuggestion(suggestions[suggIdx]); }
    if (e.key === 'Escape') setSuggestions([]);
  };

  return (
    <div className="space-y-3 flex flex-col h-full">
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Base Table</label>
        <Sel value={baseTable} onChange={setBaseTable} options={tables.map(t => ({ value: t, label: `${t} (${DB_SCHEMA[t].length} cols)` }))} className="w-full text-xs" />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Query — SQL or PostgREST</label>
          <span className="text-[9px] text-gray-400 font-mono">Ctrl+Enter to run</span>
        </div>
        <div className="relative flex-1 flex flex-col">
          <textarea
            ref={taRef}
            value={selectString}
            onChange={handleKeyInput}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            spellCheck={false}
            placeholder={`-- PostgREST style (recommended)&#10;id, internal_code, name, surname, gender&#10;&#10;-- Or full SQL (SELECT ...FROM)&#10;SELECT id, name, surname FROM members`}
            className="flex-1 bg-[#1a1a2e] text-[#a8ff78] font-mono text-xs p-3 rounded-xl outline-none resize-none leading-relaxed border border-gray-700 focus:border-[#5C3030] transition-colors"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-8 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={() => applySuggestion(s)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left cursor-pointer transition-colors ${
                    i === suggIdx ? 'bg-[#5C3030]/10 text-[#5C3030]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-mono font-semibold flex-1 truncate">{s.text}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0 ${
                    s.type === 'table' ? 'bg-blue-100 text-blue-600' : s.type === 'column' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {s.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          onClick={onExecute}
          disabled={isExecuting || !selectString.trim()}
          className="flex items-center justify-center gap-2 py-2 bg-[#5C3030] hover:bg-[#7a3c3c] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExecuting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isExecuting ? 'Running…' : 'Execute'}
        </button>
        <button
          onClick={() => {
            setSelectString('');
            setSuggestions([]);
          }}
          className="py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
        >
          Clear
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-[10px] text-blue-800 space-y-1">
        <p className="font-bold text-blue-900">Supported Syntax</p>
        <p><strong>PostgREST:</strong> <code className="bg-blue-100 px-1 rounded">id, name, mandals(name)</code></p>
        <p><strong>SQL:</strong> <code className="bg-blue-100 px-1 rounded">SELECT id, name FROM members</code></p>
        <p className="text-[9px] text-blue-700 mt-1">✓ Either format works. SELECT is extracted automatically.</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Column Manager — single panel for all column controls
// ══════════════════════════════════════════════════════════════
function ColumnManager({ allCols, visibleKeys, setVisibleKeys, columnConfigs, setColumnConfigs, includeInExport, setIncludeInExport }) {
  const [editingLabel, setEditingLabel] = useState(null);
  const [labelDraft,   setLabelDraft]   = useState('');

  const toggleVisible   = (key) => setVisibleKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
  const toggleExport    = (key) => setIncludeInExport(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
  const updateColConfig = (key, patch) => setColumnConfigs(p => ({ ...p, [key]: { ...(p?.[key] || {}), ...patch } }));

  const allVisible  = allCols.length === visibleKeys.length;
  const allExported = allCols.length === includeInExport.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        <span>Column</span>
        <div className="flex items-center gap-4">
          <button onClick={() => setVisibleKeys(allVisible ? allCols.slice(0,3).map(c=>c.key) : allCols.map(c=>c.key))} className="text-[#5C3030] hover:underline">
            {allVisible ? 'Hide most' : 'Show all'}
          </button>
          <span className="flex items-center gap-1"><Eye size={10} /> Grid</span>
          <span className="flex items-center gap-1"><FileDown size={10} /> Export</span>
        </div>
      </div>

      <div className="space-y-1 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
        {allCols.map(col => {
          const cfg     = columnConfigs?.[col.key] || {};
          const label   = cfg.label || col.label;
          const inGrid  = visibleKeys.includes(col.key);
          const inExport= includeInExport.includes(col.key);
          const isEditing = editingLabel === col.key;

          return (
            <div key={col.key} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all text-xs ${inGrid ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
              {/* Label */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    autoFocus
                    value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={() => { updateColConfig(col.key, { label: labelDraft || col.label }); setEditingLabel(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { updateColConfig(col.key, { label: labelDraft || col.label }); setEditingLabel(null); } if (e.key === 'Escape') setEditingLabel(null); }}
                    className="w-full border border-[#5C3030] rounded px-1.5 py-0.5 text-xs outline-none"
                  />
                ) : (
                  <button
                    className="text-left w-full truncate font-medium text-gray-700 hover:text-[#5C3030]"
                    onClick={() => { setEditingLabel(col.key); setLabelDraft(label); }}
                    title="Click to rename"
                  >
                    {label}
                    {label !== col.label && <span className="ml-1 text-[9px] text-[#5C3030]/60 italic">(renamed)</span>}
                  </button>
                )}
                <p className="text-[9px] text-gray-400 font-mono">{col.key}</p>
              </div>

              {/* Format */}
              <select
                value={cfg.format || 'auto'}
                onChange={e => updateColConfig(col.key, { format: e.target.value })}
                className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[#5C3030] w-20 shrink-0"
              >
                {[{ v: 'auto', l: 'Auto' }, { v: 'text', l: 'Text' }, { v: 'number', l: '#,###' }, { v: 'currency', l: '₹' }, { v: 'percentage', l: '%' }, { v: 'date', l: 'Date' }].map(o => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>

              {/* Color */}
              <input
                type="color"
                value={cfg.bgColor || '#ffffff'}
                onChange={e => updateColConfig(col.key, { bgColor: e.target.value === '#ffffff' ? '' : e.target.value })}
                className="w-7 h-7 rounded border border-gray-200 cursor-pointer shrink-0"
                title="Highlight color"
              />

              {/* Grid visibility */}
              <button
                onClick={() => toggleVisible(col.key)}
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${inGrid ? 'bg-[#5C3030]/10 border-[#5C3030]/20 text-[#5C3030]' : 'bg-gray-100 border-gray-200 text-gray-400'}`}
                title={inGrid ? 'Hide from grid' : 'Show in grid'}
              >
                {inGrid ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>

              {/* Export toggle */}
              <button
                onClick={() => toggleExport(col.key)}
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${inExport ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gray-100 border-gray-200 text-gray-400'}`}
                title={inExport ? 'Included in export' : 'Excluded from export'}
              >
                <FileDown size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => { setVisibleKeys(allCols.map(c => c.key)); setIncludeInExport(allCols.map(c => c.key)); }}
          className="text-xs text-[#5C3030] hover:underline"
        >
          Show all & Export all
        </button>
        <span className="text-gray-300">·</span>
        <button
          onClick={() => { setVisibleKeys(allCols.slice(0, 4).map(c => c.key)); }}
          className="text-xs text-gray-400 hover:underline"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Filter Builder — with unique value suggestions
// ══════════════════════════════════════════════════════════════
function FilterBuilder({ filters, setFilters, columns, rawData }) {
  const [suggestionFor, setSuggestionFor] = useState(null); // filterId
  const [valueSuggestions, setValueSuggestions] = useState([]);
  const [searchVal, setSearchVal] = useState({});

  const colOpts = columns.map(c => ({ value: c.key, label: c.label }));

  const OPS_BY_TYPE = {
    text:    [
      { value: 'contains',     label: 'contains' },
      { value: 'not_contains', label: 'does not contain' },
      { value: 'equals',       label: 'equals' },
      { value: 'not_equals',   label: 'not equals' },
      { value: 'starts_with',  label: 'starts with' },
      { value: 'is_empty',     label: 'is empty' },
      { value: 'is_filled',    label: 'is filled' },
    ],
    number:  [
      { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
      { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
      { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
    ],
    date:    [{ value: 'after', label: 'after' }, { value: 'before', label: 'before' }],
  };

  const getUniqVals = (colKey) => {
    if (!rawData?.length) return [];
    const search = (searchVal[colKey] || '').toLowerCase();
    const vals = [...new Set(rawData.map(r => r[colKey]).filter(v => v !== null && v !== undefined && v !== ''))]
      .sort()
      .filter(v => String(v).toLowerCase().includes(search))
      .slice(0, 50);
    return vals;
  };

  const add = () => {
    const col = columns[0];
    if (!col) return;
    const ops = OPS_BY_TYPE[col.type || 'text'];
    setFilters(p => [...p, { id: Date.now(), column: col.key, colType: col.type || 'text', operator: ops[0].value, value: '' }]);
  };
  const upd = (id, patch) => setFilters(p => p.map(f => f.id === id ? { ...f, ...patch } : f));
  const del = (id) => setFilters(p => p.filter(f => f.id !== id));

  return (
    <div className="space-y-2">
      {filters.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          No active filters. All rows are shown.
        </p>
      )}
      {filters.map((f, i) => {
        const colDef  = columns.find(c => c.key === f.column);
        const ops     = OPS_BY_TYPE[f.colType || colDef?.type || 'text'] || OPS_BY_TYPE.text;
        const noInput = ['is_empty', 'is_filled'].includes(f.operator);
        const uniqVals = suggestionFor === f.id ? getUniqVals(f.column) : [];

        return (
          <div key={f.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-1.5 py-0.5 bg-gray-200 rounded">
                {i === 0 ? 'WHERE' : 'AND'}
              </span>
              <button onClick={() => del(f.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"><X size={12} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Sel
                value={f.column}
                onChange={v => {
                  const c  = columns.find(col => col.key === v);
                  const op = (OPS_BY_TYPE[c?.type || 'text'] || OPS_BY_TYPE.text)[0].value;
                  upd(f.id, { column: v, colType: c?.type || 'text', operator: op, value: '' });
                }}
                options={colOpts}
                className="w-full text-xs"
              />
              <Sel value={f.operator} onChange={v => upd(f.id, { operator: v })} options={ops} className="w-full text-xs" />
            </div>
            {!noInput && (
              <div className="relative">
                <input
                  type={f.colType === 'number' ? 'number' : f.colType === 'date' ? 'date' : 'text'}
                  value={f.value}
                  onChange={e => upd(f.id, { value: e.target.value })}
                  onFocus={() => setSuggestionFor(f.id)}
                  onBlur={() => setTimeout(() => setSuggestionFor(null), 200)}
                  placeholder="Value..."
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-[#5C3030]"
                />
                {suggestionFor === f.id && uniqVals.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                    <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
                      <input
                        type="text"
                        placeholder="Search values..."
                        value={searchVal[f.id] || ''}
                        onChange={e => setSearchVal(p => ({ ...p, [f.id]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#5C3030]"
                      />
                    </div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase px-3 py-1.5 border-b border-gray-100 bg-gray-50">
                      Unique values
                    </p>
                    {uniqVals.map(v => (
                      <button
                        key={v}
                        onMouseDown={() => upd(f.id, { value: String(v) })}
                        className="w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-[#5C3030]/8 text-gray-700 transition-colors"
                      >
                        {String(v)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-xs font-bold text-gray-400 transition-all">
        <Plus size={12} /> Add Filter
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Sort Builder
// ══════════════════════════════════════════════════════════════
function SortBuilder({ sorts, setSorts, columns }) {
  const colOpts = columns.map(c => ({ value: c.key, label: c.label }));
  const add = () => columns[0] && setSorts(p => [...p, { id: Date.now(), column: columns[0].key, dir: 'asc' }]);
  const upd = (id, patch) => setSorts(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  const del = (id) => setSorts(p => p.filter(s => s.id !== id));

  return (
    <div className="space-y-2">
      {sorts.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          No sort rules. Data in query order.
        </p>
      )}
      {sorts.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2.5">
          <span className="w-5 h-5 bg-[#5C3030] text-white rounded-full text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <Sel value={s.column} onChange={v => upd(s.id, { column: v })} options={colOpts} className="flex-1 text-xs" />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
            {['asc', 'desc'].map(d => (
              <button key={d} onClick={() => upd(s.id, { dir: d })}
                className={`px-2.5 py-1.5 text-[11px] font-bold transition-colors ${s.dir === d ? 'bg-[#5C3030] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {d === 'asc' ? '↑ A→Z' : '↓ Z→A'}
              </button>
            ))}
          </div>
          <button onClick={() => del(s.id)} className="text-red-400 hover:text-red-600 p-1"><X size={12} /></button>
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-xs font-bold text-gray-400 transition-all">
        <Plus size={12} /> Add Sort Rule
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Group + Aggregation Builder
// ══════════════════════════════════════════════════════════════
function GroupBuilder({ reportTypeId, groupBy, setGroupBy, aggConfig, setAggConfig, columns }) {
  const rt      = REPORT_TYPES.find(r => r.id === reportTypeId);
  const grpOpts = [{ value: '', label: 'No grouping' },
    ...(rt?.groupableBy || []).map(key => {
      const col = columns.find(c => c.key === key);
      return { value: key, label: col?.label || key };
    })];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Group rows by</p>
        <Sel value={groupBy || ''} onChange={v => { setGroupBy(v || null); if (!v) setAggConfig({}); }} options={grpOpts} className="w-full" />
        {!groupBy && (
          <p className="text-[10px] text-gray-400 mt-1.5">When grouped, rows are collapsed into group headers with aggregated values.</p>
        )}
      </div>

      {groupBy && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Aggregation per column</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
            {columns.filter(c => c.key !== groupBy).map(col => (
              <div key={col.key} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-700 font-medium flex-1 truncate">{col.label}</span>
                <Sel
                  value={aggConfig?.[col.key] || 'none'}
                  onChange={v => setAggConfig(p => ({ ...p, [col.key]: v }))}
                  options={AGG_FUNCTIONS}
                  className="w-20 shrink-0 text-xs !py-1"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Export Dropdown
// ══════════════════════════════════════════════════════════════
function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#5C3030] hover:bg-[#7a3c3c] text-white rounded-xl border border-[#5C3030] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
        <FileDown size={15} />Export
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-1">
          {[
            { fmt: 'excel', label: 'Excel (.xlsx)', Icon: FileSpreadsheet, cls: 'hover:bg-emerald-50 hover:text-emerald-700' },
            { fmt: 'csv',   label: 'CSV (.csv)',    Icon: FileDown,        cls: 'hover:bg-amber-50 hover:text-amber-700'   },
            { fmt: 'pdf',   label: 'PDF (.pdf)',    Icon: FileText,        cls: 'hover:bg-red-50 hover:text-red-600'       },
          ].map(({ fmt, label, Icon, cls }) => (
            <button key={fmt} onClick={() => { onExport(fmt); setOpen(false); }}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold text-gray-700 rounded-lg ${cls}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Saved Reports Sidebar
// ══════════════════════════════════════════════════════════════
function Sidebar({ reports, isLoading, selectedId, isAdmin, onSelect, onNew }) {
  const [search, setSearch] = useState('');
  const filtered = (reports || []).filter(r => r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-60 shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Database size={14} className="text-[#5C3030]" /> Report Library
        </h2>
      </div>
      <div className="p-2.5 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports..."
            className="w-full pl-7 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:border-[#5C3030]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 min-h-0 custom-scrollbar">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#5C3030]" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">{search ? 'No results.' : 'No saved reports.'}</p>
        ) : filtered.map(r => {
          const rt     = REPORT_TYPES.find(t => t.id === r.base_module);
          const active = r.id === selectedId;
          return (
            <button key={r.id} onClick={() => onSelect(r)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${active ? 'bg-[#5C3030] border-[#5C3030] shadow-md' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50'}`}>
              <p className={`text-xs font-bold truncate ${active ? 'text-white' : 'text-gray-800'}`}>{r.title}</p>
              <div className="flex items-center justify-between mt-1">
                <p className={`text-[10px] ${active ? 'text-white/60' : 'text-gray-400'}`}>{rt?.label || r.base_module}</p>
                <p className={`text-[10px] flex items-center gap-0.5 ${active ? 'text-white/40' : 'text-gray-300'}`}>
                  <Clock size={9} />
                  {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {isAdmin && (
        <div className="p-2.5 border-t border-gray-100 shrink-0">
          <button onClick={onNew}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#5C3030] hover:bg-[#7a3c3c] text-white text-xs font-bold rounded-xl transition-colors">
            <Plus size={13} strokeWidth={2.5} /> New Report
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Dashboard
// ══════════════════════════════════════════════════════════════
const CTRL_TABS = [
  { id: 'type',    label: 'Source' },
  { id: 'columns', label: 'Columns' },
  { id: 'sql',     label: 'SQL Query' },
  { id: 'filter',  label: 'Filter'  },
  { id: 'sort',    label: 'Sort'    },
  { id: 'group',   label: 'Group'   },
];

const freshState = (typeId = 'member_directory') => ({
  reportTitle:    'New Report',
  reportTypeId:   typeId,
  visibleKeys:    REPORT_COLUMNS[typeId]?.map(c => c.key) || [],
  includeInExport:REPORT_COLUMNS[typeId]?.map(c => c.key) || [],
  filters:        [],
  sorts:          [],
  groupBy:        null,
  aggConfig:      {},
  columnConfigs:  {},
  projectId:      '',
  selectString:   '',
  baseTable:      'members',
  sqlMode:        false, // true when using custom SQL query
});

export default function ReportsDashboard() {
  const { profile } = useAuth();
  const isAdmin     = profile?.role === 'admin';
  const qc          = useQueryClient();

  const [selectedId,     setSelectedId]     = useState(null);
  const [saveOpen,       setSaveOpen]        = useState(false);
  const [ctrlTab,        setCtrlTab]         = useState('type');
  const [ctrlVisible,    setCtrlVisible]     = useState(true);

  // Report config
  const [reportTitle,    setReportTitle]     = useState('New Report');
  const [reportTypeId,   setReportTypeId]    = useState('member_directory');
  const [visibleKeys,    setVisibleKeys]     = useState(REPORT_COLUMNS.member_directory.map(c => c.key));
  const [includeInExport,setIncludeInExport] = useState(REPORT_COLUMNS.member_directory.map(c => c.key));
  const [columnConfigs,  setColumnConfigs]   = useState({});
  const [projectId,      setProjectId]       = useState('');
  const [selectString,   setSelectString]    = useState('');
  const [baseTable,      setBaseTable]       = useState('members');
  const [sqlMode,        setSqlMode]         = useState(false);

  // Data controls
  const [filters,   setFilters]   = useState([]);
  const [sorts,     setSorts]     = useState([]);
  const [groupBy,   setGroupBy]   = useState(null);
  const [aggConfig, setAggConfig] = useState({});

  // Data
  const [isRunning, setIsRunning] = useState(false);
  const [rawData,   setRawData]   = useState(null);

  // Saved reports
  const { data: savedReports, isLoading: loadingReports } = useQuery({
    queryKey: ['saved_reports'],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_reports').select('*').order('created_at', { ascending: false });
      if (error && error.code !== '42P01') throw error;
      return data || [];
    },
  });

  // Projects list for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ['projects_list'],
    queryFn: fetchProjectList,
  });

  const allCols  = useMemo(() => {
    if (sqlMode && rawData && rawData.length > 0) {
      // Generate columns from SQL query results
      const firstRow = rawData[0];
      return Object.keys(firstRow).map(key => ({
        key,
        label: columnConfigs?.[key]?.label || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        type: typeof firstRow[key] === 'number' ? 'number' : 'text',
      }));
    }
    return REPORT_COLUMNS[reportTypeId] || [];
  }, [reportTypeId, sqlMode, rawData, columnConfigs]);
  const visCols  = useMemo(() => visibleKeys.map(k => allCols.find(c => c.key === k)).filter(Boolean), [visibleKeys, allCols]);

  const processedData = useMemo(() => {
    if (!rawData) return { rows: null, isGrouped: false };
    let d = applyFilters(rawData, filters);
    d     = applySort(d, sorts);
    const { isGrouped, rows } = applyGrouping(d, groupBy, visCols, aggConfig);
    return { rows, isGrouped };
  }, [rawData, filters, sorts, groupBy, visCols, aggConfig]);

  // Run
  const run = useCallback(async (typeIdOverride, projectIdOverride) => {
    const tid = typeIdOverride || reportTypeId;
    const pid = projectIdOverride !== undefined ? projectIdOverride : projectId;
    setIsRunning(true);
    try {
      const data = await runReport(tid, { projectId: pid || undefined });
      setRawData(data);
      toast.success(`${data.length.toLocaleString('en-IN')} rows loaded.`);
      setSqlMode(false);
    } catch (err) {
      toast.error('Failed: ' + (err.message || 'Unknown error'));
      setRawData([]);
    } finally {
      setIsRunning(false);
    }
  }, [reportTypeId, projectId]);

  // Execute SQL Query
  // Helper: Extract column names from SQL or PostgREST syntax
  const extractColumnsFromQuery = (queryStr) => {
    let selectPart = queryStr.trim();
    
    // If full SQL (contains SELECT keyword), extract between SELECT and FROM
    if (/^\s*SELECT\s+/i.test(selectPart)) {
      const match = selectPart.match(/^\s*SELECT\s+(.+?)\s+FROM\s+/i);
      if (match) {
        selectPart = match[1]; // Extract between SELECT and FROM
      } else {
        throw new Error('Invalid SQL: Must have SELECT ... FROM syntax');
      }
    }
    
    // Clean up any leading SELECT keyword that got left
    selectPart = selectPart.replace(/^\s*SELECT\s+/i, '').trim();
    
    return selectPart;
  };

  const executeSqlQuery = useCallback(async () => {
    if (!selectString.trim()) return toast.error('Enter a query');
    if (!baseTable) return toast.error('Select a table');

    setIsRunning(true);
    try {
      // Extract columns from the query (handles both SQL and PostgREST syntax)
      const selectCols = extractColumnsFromQuery(selectString);
      
      const query = supabase.from(baseTable).select(selectCols);
      const { data, error } = await query.limit(5000);
      
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('No data returned');

      // Create column definitions from the data
      const firstRow = data[0];
      const generatedCols = Object.keys(firstRow).map(key => ({
        key,
        label: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        type: typeof firstRow[key] === 'number' ? 'number' : typeof firstRow[key] === 'object' ? 'text' : 'text',
      }));

      setRawData(data);
      setSqlMode(true);
      setVisibleKeys(generatedCols.map(c => c.key));
      setIncludeInExport(generatedCols.map(c => c.key));
      
      // Store column configs for display
      const configs = {};
      generatedCols.forEach(col => {
        configs[col.key] = { label: col.label };
      });
      setColumnConfigs(configs);

      toast.success(`${data.length.toLocaleString('en-IN')} rows loaded from SQL query.`);
    } catch (err) {
      toast.error('SQL Error: ' + (err.message || 'Unknown error'));
      setRawData([]);
    } finally {
      setIsRunning(false);
    }
  }, [selectString, baseTable]);

  // Change report type
  const handleTypeChange = (tid) => {
    setReportTypeId(tid);
    const cols = REPORT_COLUMNS[tid]?.map(c => c.key) || [];
    setVisibleKeys(cols); setIncludeInExport(cols);
    setFilters([]); setSorts([]); setGroupBy(null); setAggConfig({});
    setColumnConfigs({}); setRawData(null); setSelectedId(null);
    setProjectId('');
  };

  // Load saved
  const loadSavedReport = useCallback((report) => {
    const cfg = report.filters || {};
    setSelectedId(report.id);
    setReportTitle(report.title);
    setReportTypeId(report.base_module);
    const cols = REPORT_COLUMNS[report.base_module]?.map(c => c.key) || [];
    setVisibleKeys(cfg.visibleKeys || cols);
    setIncludeInExport(cfg.includeInExport || cols);
    setColumnConfigs(cfg.columnConfigs || {});
    setFilters(cfg.filters || []);
    setSorts(cfg.sorts || []);
    setGroupBy(cfg.groupBy || null);
    setAggConfig(cfg.aggConfig || {});
    setProjectId(cfg.projectId || '');
    setSelectString(cfg.selectString || '');
    setBaseTable(cfg.baseTable || 'members');
    setSqlMode(cfg.sqlMode || false);
    setRawData(null);
    setTimeout(() => {
      if (cfg.sqlMode) executeSqlQuery();
      else run(report.base_module, cfg.projectId || '');
    }, 50);
  }, [run, executeSqlQuery]);

  // Save
  const saveReport = async () => {
    if (!reportTitle?.trim()) return toast.error('Enter a title');
    const id = toast.loading(selectedId ? 'Updating…' : 'Saving…');
    const payload = {
      title: reportTitle.trim(), base_module: reportTypeId,
      columns: visibleKeys, allowed_roles: ['admin'],
      filters: { visibleKeys, includeInExport, columnConfigs, filters, sorts, groupBy, aggConfig, projectId, selectString, baseTable, sqlMode },
    };
    try {
      const { error } = selectedId
        ? await supabase.from('saved_reports').update(payload).eq('id', selectedId)
        : await supabase.from('saved_reports').insert(payload);
      if (error) throw error;
      toast.success(selectedId ? 'Updated!' : 'Saved!', { id });
      qc.invalidateQueries(['saved_reports']);
      setSaveOpen(false);
    } catch (err) { toast.error('Save failed: ' + err.message, { id }); }
  };

  // Delete
  const deleteReport = async () => {
    if (!selectedId) return;
    toast((t) => (
      <div className="flex gap-2 items-center">
        <span>Delete this report?</span>
        <button 
          onClick={async () => {
            toast.dismiss(t.id);
            const id = toast.loading('Deleting…');
            const { error } = await supabase.from('saved_reports').delete().eq('id', selectedId);
            if (error) return toast.error('Failed', { id });
            toast.success('Deleted', { id });
            setSelectedId(null); setRawData(null);
            qc.invalidateQueries(['saved_reports']);
          }}
          className="px-3 py-1 bg-red-600 text-white text-xs rounded font-semibold hover:bg-red-700"
        >
          Confirm
        </button>
      </div>
    ));
  };

  // Export — uses includeInExport (not visibleKeys)
  const doExport = async (format) => {
    if (!processedData.rows?.length) return toast.error('No data to export');
    const exportCols = allCols
      .filter(c => includeInExport.includes(c.key))
      .map(c => ({ ...c, label: columnConfigs?.[c.key]?.label || c.label }));
    const id = toast.loading(`Generating ${format.toUpperCase()}…`);
    try {
      await handleExport(format, processedData.rows, exportCols, reportTitle || 'Report');
      toast.success('Exported!', { id });
    } catch (err) { toast.error('Export failed: ' + err.message, { id }); }
  };

  const hasData    = processedData.rows !== null;
  const rowCount   = processedData.rows?.length ?? 0;
  const activeCtrl = filters.length + sorts.length + (groupBy ? 1 : 0);
  const rt         = REPORT_TYPES.find(t => t.id === reportTypeId);

  // Main tabs for layout
  const [mainTab, setMainTab] = useState('library'); // library, query, results, configure

  const handleNewReport = () => {
    const s = freshState();
    setSelectedId(null); setReportTitle(s.reportTitle); setReportTypeId(s.reportTypeId);
    setVisibleKeys(s.visibleKeys); setIncludeInExport(s.includeInExport);
    setFilters([]); setSorts([]); setGroupBy(null); setAggConfig({});
    setColumnConfigs({}); setRawData(null); setProjectId('');
    setSelectString(''); setSqlMode(false);
    setCtrlTab('type'); setCtrlVisible(true);
    setMainTab('query');
  };

  const mainTabs = [
    { id: 'library', label: 'Reports Library', icon: Database },
    { id: 'query', label: 'Query Builder', icon: Settings2 },
    { id: 'results', label: 'Results', icon: BarChart2 },
    { id: 'configure', label: 'Configure', icon: Layers },
  ];

  return (
    <div className="flex h-[calc(100vh-80px)] -mt-2 overflow-hidden bg-gray-50 flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {isAdmin && selectedId ? (
              <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder="Report title…"
                className="text-base sm:text-lg font-extrabold text-gray-900 bg-transparent outline-none border-b-2 border-dashed border-gray-200 focus:border-[#5C3030] transition-colors pb-0.5 w-full max-w-xs" />
            ) : (
              <h1 className="text-base sm:text-xl font-extrabold text-gray-900 truncate">{reportTitle || 'Report Builder'}</h1>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0">
            {hasData && isAdmin && selectedId && (
              <Btn variant="danger" size="sm" icon={Trash2} onClick={deleteReport} className="hidden sm:flex" />
            )}
            {hasData && <ExportMenu onExport={doExport} disabled={isRunning} />}
            {isAdmin && (
              <Btn size="sm" icon={Save} onClick={() => setSaveOpen(true)} className="hidden sm:flex">
                {selectedId ? 'Update' : 'Save'}
              </Btn>
            )}
            {mainTab !== 'results' && (
              <button
                onClick={() => run()}
                disabled={isRunning}
                className={`inline-flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-sm ${
                  isRunning
                    ? 'bg-[#5C3030]/60 text-white border border-[#5C3030]/60 cursor-not-allowed'
                    : 'bg-[#5C3030] hover:bg-[#7a3c3c] text-white border border-[#5C3030]'
                }`}
              >
                {isRunning ? <Loader2 size={12} className="animate-spin sm:block hidden" /> : <Play size={12} className="sm:block hidden" />}
                <span className="hidden sm:inline">{isRunning ? 'Running…' : 'Run'}</span>
                <span className="sm:hidden">{isRunning ? '…' : '▶'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-t border-gray-100 overflow-x-auto">
          <div className="flex px-4 sm:px-6 gap-1">
            {mainTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = mainTab === tab.id;
              let badge = 0;
              if (tab.id === 'configure') badge = filters.length + sorts.length + (groupBy ? 1 : 0);
              else if (tab.id === 'results') badge = hasData ? 1 : 0;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setMainTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'text-[#5C3030] border-[#5C3030]'
                      : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon size={isActive ? 16 : 14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden text-xs">{tab.label.split(' ')[0]}</span>
                  {badge > 0 && (
                    <span className="bg-[#5C3030] text-white text-[9px] sm:text-[10px] font-bold rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center leading-none">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area - Responsive Grid */}
      <div className="flex-1 overflow-hidden">
        {/* LIBRARY TAB */}
        {mainTab === 'library' && (
          <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Saved Reports</h2>
                {isAdmin && (
                  <Btn size="sm" icon={Plus} onClick={handleNewReport} className="hidden sm:flex">New Report</Btn>
                )}
              </div>

              {/* Search */}
              <div className="mb-4 sm:mb-6">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    placeholder="Search reports..."
                    className="w-full pl-9 pr-3 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:bg-white focus:outline-none focus:border-[#5C3030]"
                  />
                </div>
              </div>

              {/* Reports Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {loadingReports ? (
                  <div className="col-span-full flex justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-[#5C3030]" />
                  </div>
                ) : savedReports && savedReports.length > 0 ? (
                  savedReports.map(report => {
                    const rt = REPORT_TYPES.find(t => t.id === report.base_module);
                    const isSelected = selectedId === report.id;
                    return (
                      <button
                        key={report.id}
                        onClick={() => loadSavedReport(report)}
                        className={`text-left p-3 sm:p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'bg-[#5C3030] border-[#5C3030] text-white shadow-md'
                            : 'bg-white border-gray-200 hover:border-[#5C3030]/40 hover:bg-[#5C3030]/4'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`font-bold truncate text-sm sm:text-base ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                              {report.title}
                            </p>
                            <p className={`text-xs mt-1 ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>
                              {rt?.label || report.base_module}
                            </p>
                          </div>
                          {isSelected && <Check size={16} className="text-white flex-shrink-0" />}
                        </div>
                        <div className={`text-[10px] sm:text-xs mt-2 ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                          {new Date(report.created_at).toLocaleDateString('en-IN')}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-gray-400 text-sm">No saved reports yet</p>
                    {isAdmin && (
                      <Btn size="sm" icon={Plus} onClick={handleNewReport} className="mt-3">New Report</Btn>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QUERY BUILDER TAB */}
        {mainTab === 'query' && (
          <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Left: Report Type Selection */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">Report Type</h3>
                <div className="space-y-2">
                  {REPORT_TYPES.map(rt2 => {
                    const Icon = TYPE_ICONS[rt2.icon] || Database;
                    const active = reportTypeId === rt2.id;
                    return (
                      <button
                        key={rt2.id}
                        onClick={() => handleTypeChange(rt2.id)}
                        className={`w-full text-left flex items-center gap-2.5 p-2.5 sm:p-3 rounded-lg border transition-all ${
                          active ? 'bg-[#5C3030] border-[#5C3030] text-white shadow-sm' : 'bg-white border-gray-200 hover:border-[#5C3030]/40'
                        }`}
                      >
                        <Icon size={14} className={active ? 'text-white/80 shrink-0' : 'text-[#5C3030] shrink-0'} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs sm:text-sm font-bold ${active ? 'text-white' : 'text-gray-800'}`}>{rt2.label}</p>
                          <p className={`text-[10px] truncate ${active ? 'text-white/60' : 'text-gray-400'}`}>{rt2.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Project Selector */}
                {reportTypeId === 'project_member_attendance' && (
                  <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100">
                    <label className="text-xs sm:text-sm font-bold text-gray-700 block mb-2">Select Project</label>
                    <select
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#5C3030]"
                    >
                      <option value="">All Projects</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Right: SQL Query or Settings */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
                  <Code2 size={14} className="text-[#5C3030]" />
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">SQL Query (Optional)</h3>
                </div>
                <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6">
                  <SQLQueryBuilder
                    selectString={selectString}
                    setSelectString={setSelectString}
                    baseTable={baseTable}
                    setBaseTable={setBaseTable}
                    onExecute={executeSqlQuery}
                    isExecuting={isRunning}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {mainTab === 'results' && (
          <div className="h-full bg-white overflow-hidden">
            {isRunning ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full border-4 border-[#5C3030]/20 border-t-[#5C3030] animate-spin" />
                <p className="text-sm font-semibold text-gray-500 animate-pulse">Loading data…</p>
              </div>
            ) : rawData === null ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-400 p-4">
                <div className="w-16 h-16 rounded-2xl bg-[#5C3030]/8 flex items-center justify-center">
                  <BarChart2 size={32} className="text-[#5C3030]/40" />
                </div>
                <div className="text-center max-w-sm">
                  <p className="text-base font-bold text-gray-600">No data yet</p>
                  <p className="text-sm text-gray-400 mt-1">Configure your query and click "Run" to see results here</p>
                </div>
              </div>
            ) : (
              <div className="h-full overflow-hidden">
                <ReportDataGrid
                  columns={visCols}
                  rows={processedData.rows}
                  columnConfigs={columnConfigs}
                  sorts={sorts}
                  onSortChange={setSorts}
                  isGrouped={processedData.isGrouped}
                />
              </div>
            )}
          </div>
        )}

        {/* CONFIGURE TAB */}
        {mainTab === 'configure' && (
          <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Left Column */}
                <div className="space-y-4 sm:space-y-6">
                  {/* Columns Section */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                      <Eye size={14} className="text-[#5C3030]" />
                      <h3 className="text-sm sm:text-base font-bold text-gray-900">Columns</h3>
                      <span className="ml-auto text-xs text-gray-500">{visibleKeys.length} visible</span>
                    </div>
                    <div className="p-4 sm:p-6 max-h-96 overflow-y-auto custom-scrollbar">
                      <ColumnManager
                        allCols={allCols}
                        visibleKeys={visibleKeys}
                        setVisibleKeys={setVisibleKeys}
                        columnConfigs={columnConfigs}
                        setColumnConfigs={setColumnConfigs}
                        includeInExport={includeInExport}
                        setIncludeInExport={setIncludeInExport}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4 sm:space-y-6">
                  {/* Filter Section */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                      <Filter size={14} className="text-[#5C3030]" />
                      <h3 className="text-sm sm:text-base font-bold text-gray-900">Filters</h3>
                      {filters.length > 0 && (
                        <span className="ml-auto bg-[#5C3030] text-white text-[10px] font-bold px-2 py-1 rounded-full">
                          {filters.length}
                        </span>
                      )}
                    </div>
                    <div className="p-4 sm:p-6 max-h-96 overflow-y-auto custom-scrollbar">
                      <FilterBuilder filters={filters} setFilters={setFilters} columns={visCols} rawData={rawData} />
                    </div>
                  </div>

                  {/* Sort Section */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                      <ArrowUpDown size={14} className="text-[#5C3030]" />
                      <h3 className="text-sm sm:text-base font-bold text-gray-900">Sort</h3>
                      {sorts.length > 0 && (
                        <span className="ml-auto bg-[#5C3030] text-white text-[10px] font-bold px-2 py-1 rounded-full">
                          {sorts.length}
                        </span>
                      )}
                    </div>
                    <div className="p-4 sm:p-6 max-h-96 overflow-y-auto custom-scrollbar">
                      <SortBuilder sorts={sorts} setSorts={setSorts} columns={visCols} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group Section - Full Width */}
              <div className="mt-4 sm:mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <Layers size={14} className="text-[#5C3030]" />
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">Group & Aggregate</h3>
                  {groupBy && (
                    <span className="ml-auto bg-[#5C3030] text-white text-[10px] font-bold px-2 py-1 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <div className="p-4 sm:p-6">
                  <GroupBuilder reportTypeId={reportTypeId} groupBy={groupBy} setGroupBy={setGroupBy} aggConfig={aggConfig} setAggConfig={setAggConfig} columns={visCols} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save modal */}
      {saveOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">{selectedId ? 'Update Report' : 'Save Report'}</h2>
              <button onClick={() => setSaveOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">Report Title</label>
                <input type="text" value={reportTitle} onChange={e => setReportTitle(e.target.value)}
                  placeholder="e.g. Mandal-wise Attendance Q1"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#5C3030]"
                  autoFocus onKeyDown={e => e.key === 'Enter' && saveReport()} />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
                <p><strong>Type:</strong> {rt?.label}</p>
                <p><strong>Visible columns:</strong> {visibleKeys.length} · <strong>Export columns:</strong> {includeInExport.length}</p>
                {filters.length > 0 && <p><strong>Filters:</strong> {filters.length}</p>}
                {sorts.length > 0   && <p><strong>Sorts:</strong> {sorts.length}</p>}
                {groupBy            && <p><strong>Grouped by:</strong> {allCols.find(c => c.key === groupBy)?.label || groupBy}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Btn variant="secondary" className="flex-1" onClick={() => setSaveOpen(false)}>Cancel</Btn>
              <Btn className="flex-1" icon={Save} onClick={saveReport}>{selectedId ? 'Update' : 'Save'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}