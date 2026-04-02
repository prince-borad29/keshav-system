import React from 'react';
import { Database, Code, Settings2, Shield, Type, Palette, AlignLeft } from 'lucide-react';
import { MODULES, AVAILABLE_COLUMNS, ADVANCED_QUERIES } from './reportConfig.js';

// Native Select Wrapper (Never clips, never overlaps)
function Sel({ value, onChange, options, className = '' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#5C3030]/20 focus:border-[#5C3030] w-full transition-all cursor-pointer ${className}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const ROLE_OPTIONS = [{ value: 'admin', label: 'Admin' }, { value: 'nirdeshak', label: 'Nirdeshak' }, { value: 'sanchalak', label: 'Sanchalak' }, { value: 'member', label: 'Member' }];
const FORMAT_OPTIONS = [{ value: 'text', label: 'Plain Text' }, { value: 'number', label: 'Number (1,000)' }, { value: 'currency', label: 'Currency (₹)' }, { value: 'date', label: 'Date (DD/MM/YYYY)' }, { value: 'percentage', label: 'Percentage (%)' }];
const ALIGN_OPTIONS = [{ value: 'left', label: 'Left Align' }, { value: 'center', label: 'Center Align' }, { value: 'right', label: 'Right Align' }];

export default function ReportBuilderPanel({
  baseModule, onModuleChange, selectedColumns, setSelectedColumns,
  customQueryId, setCustomQueryId, allowedRoles, setAllowedRoles, isAdmin,
  columnConfigs, setColumnConfigs
}) {
  const availableCols = AVAILABLE_COLUMNS[baseModule] || [];
  const isAdvanced = baseModule === 'advanced_queries';
  const selectedQuery = ADVANCED_QUERIES.find(q => q.value === customQueryId);

  const toggleColumn = (key) => {
    setSelectedColumns(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
    if (!selectedColumns.includes(key)) {
      setColumnConfigs(prev => ({ ...prev, [key]: { label: availableCols.find(c => c.key === key)?.label || key, format: 'text', align: 'left', color: '' } }));
    }
  };

  const toggleAllColumns = () => setSelectedColumns(selectedColumns.length === availableCols.length ? availableCols.slice(0, 2).map(c => c.key) : availableCols.map(c => c.key));
  const toggleRole = (role) => { if (role !== 'admin') setAllowedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]); };
  const updateConfig = (key, field, value) => setColumnConfigs(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));

  return (
    <div className="space-y-6">
      <div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><Database size={14} className="text-[#5C3030]" /> 1. Data Source</label>
        <Sel options={MODULES} value={baseModule} onChange={onModuleChange} />
      </div>

      {isAdvanced && (
        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"><Code size={14} className="text-[#5C3030]" /> Analytics Query</label>
          <Sel options={ADVANCED_QUERIES.map(q => ({ value: q.value, label: q.label }))} value={customQueryId} onChange={setCustomQueryId} />
          {selectedQuery?.description && <p className="mt-2 text-xs text-gray-500 leading-relaxed px-1">{selectedQuery.description}</p>}
        </div>
      )}

      {!isAdvanced && availableCols.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider"><Settings2 size={14} className="text-[#5C3030]" /> 2. Select Columns</label>
            <button onClick={toggleAllColumns} className="text-xs text-[#5C3030] hover:underline font-bold">
              {selectedColumns.length === availableCols.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col gap-1 max-h-60 overflow-y-auto custom-scrollbar">
            {availableCols.map(col => (
              <label key={col.key} className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer py-2 px-2.5 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all">
                <input type="checkbox" checked={selectedColumns.includes(col.key)} onChange={() => toggleColumn(col.key)} className="w-4 h-4 rounded border-gray-300 text-[#5C3030] focus:ring-[#5C3030]" />
                <span className="flex-1 font-medium truncate">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {selectedColumns.length > 0 && !isAdvanced && (
        <div className="border-t border-gray-100 pt-4">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3"><Palette size={14} className="text-[#5C3030]" /> 3. Format & Customize</label>
          <div className="space-y-3">
            {selectedColumns.map(key => {
              const conf = columnConfigs[key] || { label: key, format: 'text', align: 'left', color: '' };
              const orig = availableCols.find(c => c.key === key);
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                  <div className="text-xs font-bold text-[#5C3030] mb-2">{orig?.label || key}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-semibold"><Type size={10} className="inline mr-1"/>Custom Name</span><input type="text" value={conf.label} onChange={e => updateConfig(key, 'label', e.target.value)} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-[#5C3030]" /></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-semibold">Format</span><Sel options={FORMAT_OPTIONS} value={conf.format} onChange={v => updateConfig(key, 'format', v)} className="!py-1.5 !text-xs !px-2" /></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-semibold"><AlignLeft size={10} className="inline mr-1"/>Align</span><Sel options={ALIGN_OPTIONS} value={conf.align} onChange={v => updateConfig(key, 'align', v)} className="!py-1.5 !text-xs !px-2" /></div>
                    <div className="flex flex-col gap-1"><span className="text-[10px] text-gray-500 font-semibold">Highlight Color</span><input type="color" value={conf.color || '#ffffff'} onChange={e => updateConfig(key, 'color', e.target.value)} className="w-full h-7 rounded border border-gray-200 cursor-pointer" /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="pt-4 border-t border-gray-100">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3"><Shield size={14} className="text-[#5C3030]" /> Access Roles</label>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map(r => (
              <button key={r.value} onClick={() => toggleRole(r.value)} disabled={r.value === 'admin'} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${allowedRoles.includes(r.value) ? 'bg-[#5C3030] text-white border-[#5C3030]' : 'bg-gray-50 text-gray-600 border-gray-200'} ${r.value === 'admin' ? 'opacity-70' : ''}`}>
                {r.label} {r.value === 'admin' && ' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}