import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Loader2, Search, Archive, Check, ChevronDown, 
  Download, MapPin, Users, Filter, Briefcase 
} from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

export default function IDCardGenerator() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  const [isRolesOpen, setIsRolesOpen] = useState(false);

  const [kshetras, setKshetras] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [filters, setFilters] = useState({ 
    kshetra_id: '', 
    mandal_id: '', 
    designations: [],
    gender: '' 
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const designationOptions = ['Member', 'Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Utsahi Yuvak'];
  const genderOptions = ['Yuvak', 'Yuvati'];

  useEffect(() => { fetchDropdowns(); }, []);

  const fetchDropdowns = async () => {
    const [kRes, mRes] = await Promise.all([
      supabase.from('kshetras').select('id, name').order('name'),
      supabase.from('mandals').select('id, name, kshetra_id').order('name')
    ]);
    if (kRes.data) setKshetras(kRes.data);
    if (mRes.data) setMandals(mRes.data);
  };

  useEffect(() => {
    if (searchTerm.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('members')
        .select('*, mandals(name)')
        .or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%,internal_code.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%`)
        .limit(5);
      setSearchResults(data || []);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const createCardBlob = async (m) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 54] });
    const qrDataUrl = await QRCode.toDataURL(m.internal_code || 'MISSING_ID', { width: 100, margin: 1 });
    const isYuvati = m.gender === 'Yuvati';
    doc.setFillColor(isYuvati ? 236 : 63, isYuvati ? 72 : 81, isYuvati ? 153 : 181);
    doc.rect(0, 0, 85, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("KESHAV APP", 5, 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(m.designation || 'Member', 80, 8, { align: 'right' });
    doc.addImage(qrDataUrl, 'PNG', 4, 15, 24, 24);
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${m.name} ${m.surname}`, 32, 22);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(m.mandals?.name || 'Unassigned', 32, 27);
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('courier', 'bold');
    doc.text(m.internal_code || 'NO ID', 32, 36);
    doc.setFontSize(5);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text("Official Member Card", 42.5, 51, { align: 'center' });
    return doc.output('blob');
  };

  const handleBulkZip = async () => {
    setProcessing(true);
    setProgress(0);
    setStatusText("Fetching...");
    try {
      let query = supabase.from('members').select('*, mandals(name)');
      if (filters.mandal_id) query = query.eq('mandal_id', filters.mandal_id);
      else if (filters.kshetra_id) {
        const mIds = mandals.filter(m => m.kshetra_id === filters.kshetra_id).map(m => m.id);
        if(mIds.length > 0) query = query.in('mandal_id', mIds);
      }
      if (filters.designations.length > 0) query = query.in('designation', filters.designations);
      if (filters.gender) query = query.eq('gender', filters.gender);

      const { data: members, error } = await query;
      if (error) throw error;
      if (!members || members.length === 0) throw new Error("No members found matching filters.");

      const zip = new JSZip();
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        setProgress(Math.round(((i + 1) / members.length) * 100));
        setStatusText(`Creating: ${m.name}`);
        const blob = await createCardBlob(m);
        let folderPath = m.mandals?.name || "Unassigned";
        if (!filters.gender) folderPath = `${m.gender}/${folderPath}`;
        const fileName = `${m.designation}_${m.name}_${m.surname}.pdf`.replace(/[\/\\]/g, '-');
        zip.folder(folderPath).file(fileName, blob);
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `ID_Cards_${new Date().toISOString().split('T')[0]}.zip`);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
      setStatusText('');
    }
  };

  const toggleDesignation = (role) => {
    setFilters(prev => ({
      ...prev,
      designations: prev.designations.includes(role) 
        ? prev.designations.filter(d => d !== role)
        : [...prev.designations, role]
    }));
  };

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";
  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";

  return (
    <div className="space-y-6">
      
      {/* 1. Single Card Search */}
      <div className="bg-white p-5 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Search & Generate</h2>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          <input 
            className={`${inputClass} pl-9`}
            placeholder="Search by name, ID, or mobile to generate single card..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded-md bg-white overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.08)] absolute z-20 w-full max-w-[calc(100%-48px)] sm:max-w-[calc(1000px-48px)]">
            {searchResults.map((m, i) => (
              <div key={m.id} className={`flex justify-between items-center p-3 hover:bg-gray-50 transition-colors ${i !== searchResults.length - 1 ? 'border-b border-gray-100' : ''}`}>
                 <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">{m.name} {m.surname}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{m.designation}</span> <span className="font-inter lowercase tracking-normal text-gray-300">•</span> <span>{m.mandals?.name}</span>
                    </div>
                 </div>
                 <Button size="sm" variant="secondary" icon={Download} onClick={async () => saveAs(await createCardBlob(m), `${m.name}_ID.pdf`)}>
                    Download
                 </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Bulk Generation Configuration */}
      <div className="bg-white p-5 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
          <Filter size={16} className="text-gray-400" strokeWidth={1.5} />
          <h2 className="text-sm font-semibold text-gray-900">Bulk Generation Filters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          {/* Kshetra */}
          <div>
            <label className={labelClass}>Kshetra</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
              <select className={`${inputClass} pl-9 pr-9`} value={filters.kshetra_id} onChange={e => setFilters({...filters, kshetra_id: e.target.value, mandal_id: ''})}>
                <option value="">All Kshetras</option>
                {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" size={16} strokeWidth={1.5}/>
            </div>
          </div>

          {/* Mandal */}
          <div>
            <label className={labelClass}>Mandal</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
              <select className={`${inputClass} pl-9 pr-9`} value={filters.mandal_id} onChange={e => setFilters({...filters, mandal_id: e.target.value})}>
                <option value="">All Mandals</option>
                {mandals.filter(m => !filters.kshetra_id || m.kshetra_id === filters.kshetra_id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" size={16} strokeWidth={1.5}/>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className={labelClass}>Gender Scope</label>
            <div className="relative">
              <Users className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
              <select className={`${inputClass} pl-9 pr-9`} value={filters.gender} onChange={e => setFilters({...filters, gender: e.target.value})}>
                <option value="">Both (Combined)</option>
                {genderOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" size={16} strokeWidth={1.5}/>
            </div>
          </div>

          {/* Designations (Custom Accordion Styled as Native) */}
          <div>
            <label className={labelClass}>Designations</label>
            <div className="border border-gray-200 rounded-md bg-white overflow-hidden transition-all">
              <button 
                onClick={() => setIsRolesOpen(!isRolesOpen)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-700 text-sm">
                  <Briefcase size={16} className="text-gray-400" strokeWidth={1.5}/>
                  {filters.designations.length === 0 ? "All Roles" : <span className="font-semibold text-[#5C3030]">{filters.designations.length} Selected</span>}
                </div>
                <ChevronDown className={`text-gray-400 transition-transform ${isRolesOpen ? 'rotate-180' : ''}`} size={16} strokeWidth={1.5}/>
              </button>

              {isRolesOpen && (
                <div className="p-2 bg-gray-50 border-t border-gray-200 space-y-1 animate-in slide-in-from-top-2">
                  {designationOptions.map(role => {
                    const isSelected = filters.designations.includes(role);
                    return (
                      <div 
                        key={role} 
                        onClick={() => toggleDesignation(role)}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-[#5C3030]/10 text-[#5C3030]' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        <span className="text-xs font-semibold">{role}</span>
                        {isSelected && <Check size={14} className="text-[#5C3030]" strokeWidth={2}/>}
                      </div>
                    )
                  })}
                  {filters.designations.length > 0 && (
                     <button onClick={() => { setFilters(p => ({...p, designations: []})); setIsRolesOpen(false); }} className="w-full pt-2 pb-1 text-xs text-red-600 font-semibold hover:underline">
                       Clear Selection
                     </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status / Export Button */}
        <div className="pt-5 border-t border-gray-100">
          {processing ? (
             <div className="space-y-2">
               <div className="flex justify-between text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  <span>{statusText}</span>
                  <span className="font-inter">{progress}%</span>
               </div>
               <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                 <div className="h-full bg-[#5C3030] transition-all duration-300" style={{ width: `${progress}%` }} />
               </div>
             </div>
          ) : (
            <Button 
              className="w-full shadow-md" 
              onClick={handleBulkZip} 
              disabled={processing}
            >
              <Archive size={16} strokeWidth={1.5} className="mr-2" /> Generate ZIP Bundle
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}