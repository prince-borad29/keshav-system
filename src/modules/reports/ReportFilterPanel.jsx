// ============================================================
// ReportFilterPanel.jsx
// WHERE filters + ORDER BY + GROUP BY + aggregations + HAVING
// Works on flattened column keys from the data grid
// ============================================================
import React, { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, Filter, ArrowUpDown, Layers, Sigma } from 'lucide-react';
import { AGGREGATION_FUNCTIONS } from './reportConfig';

const OPERATORS = [
  { value: 'ilike', label: 'Contains' },
  { value: 'eq',    label: '= Equals' },
  { value: 'neq',   label: '≠ Not equals' },
  { value: 'gt',    label: '> Greater than' },
  { value: 'gte',   label: '≥ Greater or equal' },
  { value: 'lt',    label: '< Less than' },
  { value: 'lte',   label: '≤ Less or equal' },
  { value: 'is',    label: 'Is empty' },
];

function Sel({ value, onChange, options, className = '', placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:border-[#5C3030] cursor-pointer ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Section({ title, icon: Icon, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/80 hover:bg-gray-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Icon size={14} className="text-[#5C3030]" />
          {title}
          {badge > 0 && (
            <span className="bg-[#5C3030] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

export default function ReportFilterPanel({
  columns,               // Array of { key, label, type }
  filters, setFilters,   // WHERE conditions
  sortColumns, setSortColumns,    // [{ column, dir }] multi-sort
  groupKeys, setGroupKeys,        // [colKey] multi-group
  aggregations, setAggregations,  // { colKey: aggFn }
  havingRules, setHavingRules,    // [{ id, column, operator, value }]
}) {
  const colOptions = columns.map(c => ({ value: c.key, label: c.label || c.key }));

  // ── Filters ───────────────────────────────────────────────
  const addFilter = () => {
    const col = columns[0];
    if (!col) return;
    setFilters(p => [...p, { id: Date.now(), column: col.key, operator: 'ilike', value: '' }]);
  };
  const updateFilter = (id, patch) => setFilters(p => p.map(f => f.id === id ? { ...f, ...patch } : f));
  const removeFilter = (id) => setFilters(p => p.filter(f => f.id !== id));

  // ── Sort ──────────────────────────────────────────────────
  const addSort = () => {
    const col = columns[0];
    if (!col) return;
    setSortColumns(p => [...p, { id: Date.now(), column: col.key, dir: 'asc' }]);
  };
  const updateSort = (id, patch) => setSortColumns(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSort = (id) => setSortColumns(p => p.filter(s => s.id !== id));

  // ── Group keys ────────────────────────────────────────────
  const toggleGroupKey = (key) => {
    setGroupKeys(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
  };

  // ── Having ────────────────────────────────────────────────
  const aggCols = Object.keys(aggregations).filter(k => aggregations[k] && aggregations[k] !== 'none');
  const addHaving = () => {
    if (!aggCols.length) return;
    setHavingRules(p => [...p, { id: Date.now(), column: aggCols[0], operator: '>', value: '' }]);
  };

  return (
    <div className="space-y-3">

      {/* ── WHERE Filters ─────────────────────────────── */}
      <Section title="Filters (WHERE)" icon={Filter} badge={filters.length} defaultOpen>
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={f.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase">
                  {i === 0 ? 'WHERE' : 'AND'}
                </span>
                <button onClick={() => removeFilter(f.id)} className="text-red-400 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Sel
                  value={f.column}
                  onChange={v => updateFilter(f.id, { column: v })}
                  options={colOptions}
                />
                <Sel
                  value={f.operator}
                  onChange={v => updateFilter(f.id, { operator: v })}
                  options={OPERATORS}
                />
              </div>
              {f.operator !== 'is' && (
                <input
                  type="text"
                  value={f.value}
                  onChange={e => updateFilter(f.id, { value: e.target.value })}
                  placeholder="Value..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5C3030]"
                />
              )}
            </div>
          ))}
          <button
            onClick={addFilter}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-gray-300 hover:border-[#5C3030]/50 hover:text-[#5C3030] hover:bg-[#5C3030]/4 rounded-xl text-sm font-bold text-gray-500 transition-all"
          >
            <Plus size={14} /> Add Filter
          </button>
        </div>
      </Section>

      {/* ── Sort ──────────────────────────────────────── */}
      <Section title="Sort (ORDER BY)" icon={ArrowUpDown} badge={sortColumns.length}>
        <div className="space-y-2">
          {sortColumns.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 w-6 shrink-0 text-center">
                {i + 1}
              </span>
              <Sel
                value={s.column}
                onChange={v => updateSort(s.id, { column: v })}
                options={colOptions}
                className="flex-1"
              />
              <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                {['asc', 'desc'].map(d => (
                  <button
                    key={d}
                    onClick={() => updateSort(s.id, { dir: d })}
                    className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                      s.dir === d ? 'bg-[#5C3030] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {d === 'asc' ? '↑' : '↓'}
                  </button>
                ))}
              </div>
              <button onClick={() => removeSort(s.id)} className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addSort}
            className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 hover:border-[#5C3030]/50 hover:text-[#5C3030] rounded-xl text-sm font-bold text-gray-500 transition-all"
          >
            <Plus size={14} /> Add Sort
          </button>
        </div>
      </Section>

      {/* ── Group By ──────────────────────────────────── */}
      <Section title="Group By" icon={Layers} badge={groupKeys.length}>
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Select one or more columns to group rows together.</p>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
            {columns.map(col => {
              const active = groupKeys.includes(col.key);
              const order  = groupKeys.indexOf(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleGroupKey(col.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    active
                      ? 'bg-[#5C3030] text-white border-[#5C3030]'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#5C3030]/40'
                  }`}
                >
                  {active && <span className="w-4 h-4 bg-white/30 rounded-full flex items-center justify-center text-[9px] leading-none">{order + 1}</span>}
                  {col.label || col.key}
                </button>
              );
            })}
          </div>

          {/* Aggregation rules */}
          {groupKeys.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sigma size={11} className="text-[#5C3030]" /> Aggregation per column
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                {columns
                  .filter(c => !groupKeys.includes(c.key))
                  .map(col => (
                    <div key={col.key} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                      <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{col.label || col.key}</span>
                      <Sel
                        value={aggregations?.[col.key] || 'none'}
                        onChange={v => setAggregations(p => ({ ...p, [col.key]: v }))}
                        options={AGGREGATION_FUNCTIONS}
                        className="w-32 shrink-0 !py-1 !text-xs"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* HAVING */}
          {aggCols.length > 0 && (
            <div className="pt-3 border-t border-dashed border-gray-200">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">
                Having (filter on aggregated values)
              </p>
              {havingRules.map(rule => (
                <div key={rule.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-2 mb-2">
                  <Sel
                    value={rule.column}
                    onChange={v => setHavingRules(p => p.map(r => r.id === rule.id ? { ...r, column: v } : r))}
                    options={aggCols.map(k => ({ value: k, label: `${(aggregations[k] || '').toUpperCase()}(${k})` }))}
                    className="flex-1 !bg-white !text-xs !py-1.5"
                  />
                  <Sel
                    value={rule.operator}
                    onChange={v => setHavingRules(p => p.map(r => r.id === rule.id ? { ...r, operator: v } : r))}
                    options={[{value:'>',label:'>'},{value:'<',label:'<'},{value:'=',label:'='},{value:'>=',label:'≥'},{value:'<=',label:'≤'}]}
                    className="w-14 !bg-white !text-xs !py-1.5"
                  />
                  <input
                    type="number"
                    value={rule.value}
                    onChange={e => setHavingRules(p => p.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))}
                    className="w-20 border border-emerald-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none"
                  />
                  <button onClick={() => setHavingRules(p => p.filter(r => r.id !== rule.id))} className="text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={addHaving}
                className="w-full text-xs font-bold text-emerald-700 border border-emerald-200 rounded-xl py-1.5 hover:bg-emerald-50 transition-colors"
              >
                + Add Having Rule
              </button>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}