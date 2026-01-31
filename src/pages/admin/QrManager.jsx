import React, { useState, useEffect, useRef } from 'react';
import { Search, Download, FileArchive, Layers, Loader2, X } from 'lucide-react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from '../../lib/supabase';
import { encryptMemberData } from '../../lib/qrUtils';

export default function QRManager() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedMandal, setSelectedMandal] = useState('All');
  const [exportStatus, setExportStatus] = useState({ active: false, current: 0, total: 0 });
  
  // Create a persistent hidden canvas to avoid re-creating DOM elements
  const canvasRef = useRef(null);

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase.from('members').select('*').order('name');
    setMembers(data || []);
    setLoading(false);
  };

  const mandals = ['All', ...new Set(members.map(m => m.mandal))].filter(Boolean);

  const filteredMembers = members.filter(m => {
    const matchesSearch = (m.name + m.surname + m.id).toLowerCase().includes(search.toLowerCase());
    const matchesMandal = selectedMandal === 'All' || m.mandal === selectedMandal;
    return matchesSearch && matchesMandal;
  });

  // --- OPTIMIZED GENERATION ENGINE ---

  const generateIDCardBlob = async (member) => {
    // Optimization: Reuse a single canvas if possible, but for parallel processing 
    // we create a lightweight offscreen-style canvas.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for speed
    canvas.width = 400;
    canvas.height = 550;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header
    ctx.fillStyle = '#002B3D';
    ctx.fillRect(0, 0, canvas.width, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('YUVAK MANDAL', canvas.width / 2, 50);

    // QR Code generation is often the bottleneck
    const encryptedData = encryptMemberData(member);
    const qrDataUrl = await QRCode.toDataURL(encryptedData, { 
      margin: 1, 
      width: 250, 
      errorCorrectionLevel: 'M' // Medium is faster to generate than High
    });
    
    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await qrImg.decode(); // Modern way to wait for image loading without new Promise
    ctx.drawImage(qrImg, 75, 110, 250, 250);

    // Border
    ctx.strokeStyle = '#002B3D';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Text Content
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${member.name.toUpperCase()} ${member.surname.toUpperCase()}`, canvas.width / 2, 410);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`ID: ${member.id}`, canvas.width / 2, 440);
    
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#0ea5e9';
    ctx.fillText(member.mandal || '', canvas.width / 2, 485);

    // Optimization: Use toBlob instead of toDataURL for ZIP creation (less memory)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.8));
  };

  const downloadSingleQR = async (member) => {
    const blob = await generateIDCardBlob(member);
    saveAs(blob, `${member.surname}_${member.name}_QR.png`);
  };

  // Optimization: Process in chunks to prevent UI freeze
  const processInChunks = async (memberList, zipInstance, folderName) => {
    const folder = zipInstance.folder(folderName);
    const CHUNK_SIZE = 5; // Process 5 images at a time
    
    for (let i = 0; i < memberList.length; i += CHUNK_SIZE) {
      const chunk = memberList.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (member) => {
        const blob = await generateIDCardBlob(member);
        folder.file(`${member.surname}_${member.name}_${member.id}.png`, blob);
      }));
      
      setExportStatus(prev => ({ ...prev, current: Math.min(i + CHUNK_SIZE, memberList.length) }));
    }
  };

  const downloadMandalZip = async () => {
    if (selectedMandal === 'All') return alert("Select a Mandal or use 'Download All Mandals'");
    
    setExportStatus({ active: true, current: 0, total: filteredMembers.length });
    const zip = new JSZip();
    
    await processInChunks(filteredMembers, zip, `${selectedMandal}_QR_Cards`);

    const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    saveAs(content, `${selectedMandal}_QR_Export.zip`);
    setExportStatus({ active: false, current: 0, total: 0 });
  };

  const downloadAllMandalsBulk = async () => {
    setExportStatus({ active: true, current: 0, total: members.length });
    const zip = new JSZip();
    
    // Group members by mandal locally
    const grouped = members.reduce((acc, m) => {
      const mName = m.mandal || 'Unknown';
      if (!acc[mName]) acc[mName] = [];
      acc[mName].push(m);
      return acc;
    }, {});

    let processedCount = 0;
    for (const mandalName of Object.keys(grouped)) {
      const folder = zip.folder(mandalName);
      const memberList = grouped[mandalName];
      
      // Process members of this mandal
      for (const member of memberList) {
        const blob = await generateIDCardBlob(member);
        folder.file(`${member.surname}_${member.name}_${member.id}.png`, blob);
        processedCount++;
        setExportStatus(prev => ({ ...prev, current: processedCount }));
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `Full_Organization_QR_Export.zip`);
    setExportStatus({ active: false, current: 0, total: 0 });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 relative">
      
      {/* EXPORT OVERLAY */}
      {exportStatus.active && (
        <div className="fixed inset-0 z-[100] bg-[#002B3D]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <Loader2 className="w-12 h-12 text-[#002B3D] animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Generating ID Cards</h2>
            <p className="text-slate-500 mb-6 text-sm">Processing {exportStatus.current} of {exportStatus.total}</p>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div 
                className="bg-sky-500 h-full transition-all duration-300" 
                style={{ width: `${(exportStatus.current / exportStatus.total) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs text-red-500 font-bold">Do not close this tab</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#002B3D]">QR Management</h1>
          <p className="text-slate-500 text-sm font-medium italic">Parallel Generation Mode: High Speed</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={downloadAllMandalsBulk}
            disabled={exportStatus.active || members.length === 0}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Layers size={18}/> All Mandals (ZIP)
          </button>
          
          <button 
            onClick={downloadMandalZip}
            disabled={exportStatus.active || selectedMandal === 'All'}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-[#002B3D] text-white rounded-xl font-bold hover:bg-[#155e7a] transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:bg-slate-300"
          >
            <FileArchive size={18}/> Mandal ZIP
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search Name or ID..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:border-[#002B3D] shadow-sm"
          />
        </div>
        <select 
          value={selectedMandal} 
          onChange={e => setSelectedMandal(e.target.value)}
          className="p-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-[#002B3D] outline-none shadow-sm cursor-pointer"
        >
          {mandals.map(m => <option key={m} value={m}>{m === 'All' ? 'Filter by Mandal' : m}</option>)}
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-y-auto overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Member Info</th>
                <th className="px-6 py-4">ID / Mandal</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="3" className="p-10 text-center text-slate-400 font-bold">Loading members...</td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan="3" className="p-10 text-center text-slate-400">No members found.</td></tr>
              ) : filteredMembers.map(member => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{member.name} {member.surname}</div>
                    <div className="text-xs text-slate-400 font-medium">{member.designation}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-[#002B3D]">{member.id}</div>
                    <div className="text-xs text-slate-400">{member.mandal}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => downloadSingleQR(member)}
                      className="p-2.5 text-sky-600 bg-sky-50 rounded-xl hover:bg-sky-600 hover:text-white transition-all active:scale-90"
                      title="Download ID Card"
                    >
                      <Download size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}