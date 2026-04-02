// QueryStudio.jsx
import React, { useState, useEffect } from 'react';
import { Database, Code2, LayoutList, Zap, ChevronRight, ChevronDown, Check, Copy } from 'lucide-react';
import { DB_SCHEMA, PRESET_REPORTS } from './reportConfig';

const TYPE_COLORS = {
  uuid: 'bg-purple-100 text-purple-700', text: 'bg-blue-100 text-blue-700',
  date: 'bg-green-100 text-green-700', timestamp: 'bg-amber-100 text-amber-700',
  boolean: 'bg-orange-100 text-orange-700', number: 'bg-cyan-100 text-cyan-700',
};

function TypeBadge({ type }) {
  return (
    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-500'}`}>
      {type}
    </span>
  );
}

// ── Visual Builder ────────────────────────────────────────────
function VisualBuilder({ baseTable, setBaseTable, visualConfig, setVisualConfig, onSelectChange }) {
  const schema = DB_SCHEMA[baseTable];

  useEffect(() => {
    if (!schema) return;
    const cols = (visualConfig.columns || []).join(', ') || 'id';
    const rels = (visualConfig.relations || [])
      .filter(r => r.columns.length > 0)
      .map(r => `${r.key}(${r.columns.join(', ')})`)
      .join(', ');
    onSelectChange([cols, rels].filter(Boolean).join(', '));
  }, [visualConfig, schema]);

  const toggleCol = (col) => setVisualConfig(p => ({
    ...p,
    columns: p.columns?.includes(col)
      ? p.columns.filter(c => c !== col)
      : [...(p.columns || []), col],
  }));

  const toggleRelCol = (relKey, col) => setVisualConfig(p => {
    const rels = [...(p.relations || [])];
    const idx  = rels.findIndex(r => r.key === relKey);
    if (idx === -1) { rels.push({ key: relKey, columns: [col] }); }
    else {
      const r   = { ...rels[idx] };
      r.columns = r.columns.includes(col) ? r.columns.filter(c => c !== col) : [...r.columns, col];
      if (r.columns.length === 0) rels.splice(idx, 1); else rels[idx] = r;
    }
    return { ...p, relations: rels };
  });

  const getRelCols = (key) => (visualConfig.relations || []).find(r => r.key === key)?.columns || [];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Base Table</label>
        <select
          value={baseTable}
          onChange={e => { setBaseTable(e.target.value); setVisualConfig({ columns: [], relations: [] }); }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:border-[#5C3030] bg-white"
        >
          {Object.entries(DB_SCHEMA).map(([k, v]) => <option key={k} value={k}>{v.label} ({k})</option>)}
        </select>
      </div>

      {schema && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#5C3030] uppercase tracking-wider">
                Columns from <code className="bg-[#5C3030]/10 px-1 rounded font-mono">{baseTable}</code>
              </span>
              <button
                onClick={() => setVisualConfig(p => ({
                  ...p,
                  columns: p.columns?.length === schema.columns.length ? [] : schema.columns.map(c => c.name),
                }))}
                className="text-[10px] text-[#5C3030] font-bold hover:underline"
              >
                {visualConfig.columns?.length === schema.columns.length ? 'None' : 'All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {schema.columns.map(col => {
                const on = visualConfig.columns?.includes(col.name);
                return (
                  <label
                    key={col.name}
                    className={`flex items-center gap-2 text-xs p-2 rounded-lg border cursor-pointer transition-all ${
                      on ? 'bg-[#5C3030]/8 border-[#5C3030]/30 text-[#5C3030]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input type="checkbox" checked={!!on} onChange={() => toggleCol(col.name)} className="rounded text-[#5C3030] focus:ring-[#5C3030] w-3.5 h-3.5" />
                    <span className="flex-1 font-medium truncate">{col.name}</span>
                    <TypeBadge type={col.type} />
                  </label>
                );
              })}
            </div>
          </div>

          {schema.relations?.map(rel => {
            const relCols = getRelCols(rel.key);
            const active  = relCols.length > 0;
            return (
              <div key={rel.key} className={`rounded-xl border transition-all ${active ? 'border-[#5C3030]/30 bg-[#5C3030]/4' : 'border-gray-200 bg-gray-50'}`}>
                <button
                  onClick={() => {
                    if (active) { setVisualConfig(p => ({ ...p, relations: (p.relations || []).filter(r => r.key !== rel.key) })); }
                    else { setVisualConfig(p => ({ ...p, relations: [...(p.relations || []), { key: rel.key, columns: [rel.columns[0]] }] })); }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${active ? 'bg-[#5C3030] border-[#5C3030]' : 'border-gray-300 bg-white'}`}>
                    {active && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-xs font-bold text-gray-700 flex-1 text-left">JOIN: {rel.label}</span>
                  <code className="text-[10px] text-gray-400 font-mono">{rel.key}(...)</code>
                </button>
                {active && (
                  <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
                    {rel.columns.map(col => (
                      <label
                        key={col}
                        className={`flex items-center gap-2 text-xs p-2 rounded-lg border cursor-pointer transition-all ${
                          relCols.includes(col) ? 'bg-[#5C3030]/8 border-[#5C3030]/30 text-[#5C3030]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <input type="checkbox" checked={relCols.includes(col)} onChange={() => toggleRelCol(rel.key, col)} className="rounded text-[#5C3030] w-3.5 h-3.5" />
                        <span className="flex-1 font-medium truncate">{col}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── SQL Editor ────────────────────────────────────────────────
function SQLEditor({ selectString, setSelectString, baseTable, setBaseTable }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 h-full">
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Base Table</label>
        <select
          value={baseTable}
          onChange={e => setBaseTable(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:border-[#5C3030] bg-white"
        >
          {Object.entries(DB_SCHEMA).map(([k, v]) => <option key={k} value={k}>{v.label} ({k})</option>)}
        </select>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">PostgREST Select</label>
          <button onClick={() => { navigator.clipboard.writeText(selectString); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700">
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <textarea
          value={selectString}
          onChange={e => setSelectString(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-[160px] bg-[#1a1a2e] text-[#a8ff78] font-mono text-xs p-4 rounded-xl outline-none resize-none leading-relaxed"
          placeholder={`id, internal_code, name, surname, gender,\nmandals(name, kshetras(name)),\nattendance(count),\nproject_registrations(project_id, projects(name))`}
        />
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
        <p className="font-bold">PostgREST Tips</p>
        <p><code className="bg-blue-100 px-1 rounded">mandals(name)</code> — related table columns</p>
        <p><code className="bg-blue-100 px-1 rounded">attendance(count)</code> — count of related rows</p>
        <p><code className="bg-blue-100 px-1 rounded">table!inner(...)</code> — force INNER JOIN</p>
      </div>
    </div>
  );
}

// ── Schema Browser ────────────────────────────────────────────
function SchemaBrowser() {
  const [expanded, setExpanded] = useState({ members: true });
  return (
    <div className="space-y-2">
      {Object.entries(DB_SCHEMA).map(([table, def]) => {
        const open = !!expanded[table];
        return (
          <div key={table} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(p => ({ ...p, [table]: !open }))}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
            >
              {open ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
              <Database size={13} className="text-[#5C3030] shrink-0" />
              <span className="font-bold text-sm text-gray-800 flex-1">{table}</span>
              <span className="text-[10px] text-gray-400">{def.columns.length} cols</span>
            </button>
            {open && (
              <div className="p-3 bg-white space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {def.columns.map(c => (
                    <span key={c.name} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-1.5 py-1">
                      <span className="text-[11px] font-mono text-gray-700">{c.name}</span>
                      <TypeBadge type={c.type} />
                    </span>
                  ))}
                </div>
                {def.relations?.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    {def.relations.map(r => (
                      <div key={r.key} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                        <span className="text-[#5C3030]">→</span>
                        <code className="font-mono">{r.key}</code>
                        <span className="text-gray-400">({r.columns.join(', ')})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Preset Picker ─────────────────────────────────────────────
function PresetPicker({ onSelect }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick-start templates</p>
      {PRESET_REPORTS.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-[#5C3030]/40 hover:bg-[#5C3030]/4 transition-all group"
        >
          <div className="flex items-start gap-2">
            <Zap size={13} className="text-[#5C3030] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 group-hover:text-[#5C3030] transition-colors leading-tight">{p.title}</p>
              <code className="text-[10px] text-gray-400 font-mono mt-1 block truncate">FROM {p.baseTable} · group by {p.groupBy}</code>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function QueryStudio({ baseTable, setBaseTable, selectString, setSelectString, visualConfig, setVisualConfig }) {
  const [tab, setTab] = useState('visual');

  const tabs = [
    { id: 'visual',  label: 'Visual',  icon: LayoutList },
    { id: 'sql',     label: 'SQL',     icon: Code2 },
    { id: 'schema',  label: 'Schema',  icon: Database },
    { id: 'presets', label: 'Presets', icon: Zap },
  ];

  const handlePreset = (p) => {
    setBaseTable(p.baseTable);
    setSelectString(p.selectString);
    setVisualConfig({ columns: [], relations: [] });
    setTab('sql');
  };

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex border-b border-gray-200 bg-gray-50 p-1 gap-1 shrink-0">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                tab === t.id ? 'bg-white text-[#5C3030] shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
              }`}
            >
              <Icon size={13} /><span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {tab === 'visual'  && <VisualBuilder baseTable={baseTable} setBaseTable={setBaseTable} visualConfig={visualConfig} setVisualConfig={setVisualConfig} onSelectChange={setSelectString} />}
        {tab === 'sql'     && <SQLEditor selectString={selectString} setSelectString={setSelectString} baseTable={baseTable} setBaseTable={setBaseTable} />}
        {tab === 'schema'  && <SchemaBrowser />}
        {tab === 'presets' && <PresetPicker onSelect={handlePreset} />}
      </div>

      {tab !== 'schema' && tab !== 'presets' && (
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 shrink-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Generated Query</p>
          <p className="text-xs font-mono text-gray-600 truncate">
            <span className="text-purple-500">FROM</span> <span className="text-[#5C3030] font-bold">{baseTable}</span> <span className="text-purple-500">SELECT</span> {selectString || '*'}
          </p>
        </div>
      )}
    </div>
  );
}