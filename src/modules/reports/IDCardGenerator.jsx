import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Loader2, Search, Archive, Check, ChevronDown, 
  X, Download, MapPin, Users, Filter, Briefcase 
} from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Button from '../../components/ui/Button';

export default function IDCardGenerator() {
  // --- STATE & LOGIC (Unchanged) ---
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  // UI State for the Custom Role Dropdown
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
      if (!members || members.length === 0) throw new Error("No members found.");

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

  return (
    <div className="min-h-screen bg-white">
      
      {/* 1. Header & Search - Full Width */}
      <div className="bg-slate-900 text-white pt-6 pb-8 px-5 rounded-b-[2rem] shadow-2xl shadow-indigo-200/40 mb-6">
        <h1 className="text-2xl font-bold mb-1">ID Card Studio</h1>
        <p className="text-slate-400 text-sm mb-6">Manage and generate identity cards</p>
        
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            className="w-full h-14 pl-12 pr-4 bg-white/10 border border-white/10 rounded-2xl text-white placeholder:text-slate-400 focus:outline-none focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all text-base" 
            placeholder="Search member..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-4 bg-white rounded-xl shadow-xl overflow-hidden text-slate-800 animate-in fade-in slide-in-from-top-2">
            {searchResults.map((m, i) => (
              <div key={m.id} className={`flex justify-between items-center p-4 ${i !== searchResults.length - 1 ? 'border-b border-slate-100' : ''}`}>
                 <div>
                    <div className="font-bold">{m.name} {m.surname}</div>
                    <div className="text-xs text-slate-500">{m.designation} • {m.mandals?.name}</div>
                 </div>
                 <button onClick={async () => saveAs(await createCardBlob(m), `${m.name}_ID.pdf`)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Download size={18}/>
                 </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Bulk Filter Section - Full Width & Clean */}
      <div className="px-1 pb-32"> {/* pb-32 for sticky button space */}
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
            <Filter size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Bulk Generation</h2>
        </div>

        <div className="space-y-5">
          
          {/* Kshetra Dropdown (Native) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Kshetra</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select 
                className="w-full h-14 pl-11 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-700 font-medium appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                value={filters.kshetra_id} 
                onChange={e => setFilters({...filters, kshetra_id: e.target.value, mandal_id: ''})}
              >
                <option value="">All Kshetras</option>
                {kshetras.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20}/>
            </div>
          </div>

          {/* Mandal Dropdown (Native) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Mandal</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select 
                className="w-full h-14 pl-11 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-700 font-medium appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                value={filters.mandal_id} 
                onChange={e => setFilters({...filters, mandal_id: e.target.value})}
              >
                <option value="">All Mandals</option>
                {mandals.filter(m => !filters.kshetra_id || m.kshetra_id === filters.kshetra_id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20}/>
            </div>
          </div>

          {/* Gender Dropdown (Native) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Gender</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select 
                className="w-full h-14 pl-11 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-700 font-medium appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                value={filters.gender} 
                onChange={e => setFilters({...filters, gender: e.target.value})}
              >
                <option value="">Both (Combined)</option>
                {genderOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20}/>
            </div>
          </div>

          {/* ROLES CUSTOM ACCORDION DROPDOWN */}
          {/* This solves the mobile clipping issue by pushing content down instead of floating over */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Designations</label>
            <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden transition-all">
              
              {/* The "Trigger" Button - Looks like an Input */}
              <button 
                onClick={() => setIsRolesOpen(!isRolesOpen)}
                className="w-full h-14 px-4 flex items-center justify-between bg-white"
              >
                <div className="flex items-center gap-3 text-slate-700 font-medium">
                  <Briefcase size={18} className="text-slate-400"/>
                  {filters.designations.length === 0 
                    ? "All Roles" 
                    : `${filters.designations.length} Selected`}
                </div>
                <ChevronDown className={`text-slate-400 transition-transform ${isRolesOpen ? 'rotate-180' : ''}`} size={20}/>
              </button>

              {/* The "Dropdown" Content - Accordion Style */}
              {isRolesOpen && (
                <div className="p-2 bg-slate-50 border-t border-slate-100 space-y-1 animate-in slide-in-from-top-2">
                  {designationOptions.map(role => {
                    const isSelected = filters.designations.includes(role);
                    return (
                      <div 
                        key={role} 
                        onClick={() => toggleDesignation(role)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-600'}`}
                      >
                        <span className="text-sm font-semibold">{role}</span>
                        {isSelected && <Check size={16} className="text-indigo-600"/>}
                      </div>
                    )
                  })}
                  {filters.designations.length > 0 && (
                     <button onClick={() => { setFilters(p => ({...p, designations: []})); setIsRolesOpen(false); }} className="w-full py-3 text-sm text-red-500 font-bold">
                        Clear Selection
                     </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 3. Sticky Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-md border-t border-slate-200 z-50">
         {processing && (
            <div className="mb-2 flex justify-between text-xs font-bold uppercase text-slate-500">
               <span>{statusText}</span>
               <span>{progress}%</span>
            </div>
         )}
         <Button 
            className={`w-full h-14 rounded-xl text-lg font-bold shadow-lg ${processing ? 'bg-slate-800' : 'bg-indigo-600'}`} 
            onClick={handleBulkZip} 
            disabled={processing}
         >
            {processing ? (
               <div className="flex items-center gap-3">
                  <Loader2 className="animate-spin" /> Processing
               </div>
            ) : (
               <div className="flex items-center gap-2">
                  <Archive size={22} /> Generate ZIP Pack
               </div>
            )}
         </Button>
         {/* Integrated Progress Bar */}
         {processing && (
            <div className="absolute top-0 left-0 h-1 bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
         )}
      </div>

    </div>
  );
}