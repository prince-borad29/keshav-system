import React, { useMemo } from 'react';
import { X, Download, FileText, Share2 } from 'lucide-react';
import { jsPDF } from "jspdf"; // ✅ FIXED IMPORT
import autoTable from 'jspdf-autotable'; // ✅ FIXED IMPORT
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function ProjectReports({ 
  isOpen, 
  onClose, 
  project, 
  members = [], 
  registeredIds = new Set() 
}) {
  
  // --- 1. STATISTICS CALCULATION ---
  const stats = useMemo(() => {
    if (!project || !members) return [];

    const mandalStats = {};

    members.forEach(m => {
      const mandal = m.mandal || 'Unknown';
      if (!mandalStats[mandal]) {
        mandalStats[mandal] = { name: mandal, total: 0, registered: 0 };
      }
      mandalStats[mandal].total += 1;
      
      if (registeredIds && registeredIds.has(m.id)) {
        mandalStats[mandal].registered += 1;
      }
    });

    return Object.values(mandalStats).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.registered / s.total) * 100) : 0
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, registeredIds, project]);

  if (!isOpen || !project) return null;

  const totalReg = stats.reduce((sum, s) => sum + s.registered, 0);
  const totalMem = stats.reduce((sum, s) => sum + s.total, 0);
  const totalPerc = totalMem > 0 ? Math.round((totalReg / totalMem) * 100) : 0;

  // --- 2. HELPER: SAVE & SHARE (For Android APK) ---
  const saveAndShare = async (fileName, base64Data, mimeType) => {
    try {
      // 1. Write file to Cache
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache, 
      });

      // 2. Share the file URI
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: 'Send Report',
      });
    } catch (e) {
      console.error("Share Error:", e);
      if (e.message !== 'Share canceled') {
        alert("Error sharing file: " + e.message);
      }
    }
  };

  // --- 3. DOWNLOAD HANDLERS ---

  // ✅ A. EXCEL / CSV
  const downloadExcel = async () => {
    const headers = ['ID', 'Name', 'Surname', 'Mobile', 'Designation', 'Mandal', 'Status'];
    const rows = members.map(m => [
      m.id, m.name, m.surname, m.mobile_number || '', m.designation || '', m.mandal || '',
      registeredIds.has(m.id) ? 'Registered' : 'Not Registered'
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(item => `"${item}"`).join(','))].join('\n');
    const base64Data = btoa(unescape(encodeURIComponent(csvContent)));
    
    await saveAndShare(`${project.name.replace(/\s+/g, '_')}_Report.csv`, base64Data, 'text/csv');
  };

  // ✅ B. REGISTER PDF (Replaces Print)
  const downloadRegisterPDF = async () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(16);
    doc.text(project.name.toUpperCase(), 14, 15);
    doc.setFontSize(10);
    doc.text(`REGISTRATION LIST • TOTAL: ${registeredMembers.length}`, 14, 22);
    doc.line(14, 25, 196, 25);

    // Data Preparation
    const registeredMembers = members.filter(m => registeredIds.has(m.id));
    
    // Grouping
    const grouped = {};
    registeredMembers.forEach(m => {
      const k = m.mandal || 'Other';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(m);
    });

    const sortedMandals = Object.keys(grouped).sort();
    let yPos = 30;

    sortedMandals.forEach(mandal => {
      // Mandal Header
      autoTable(doc, {
        startY: yPos,
        head: [[`${mandal} (${grouped[mandal].length})`]],
        theme: 'plain',
        styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'center', textColor: 50 },
        margin: { top: 0 }
      });
      
      yPos = doc.lastAutoTable.finalY;

      // Members Rows
      const bodyData = grouped[mandal].map(m => [
        `${m.name} ${m.surname}`, 
        m.mobile_number || '-', 
        m.designation || '-'
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Name', 'Mobile', 'Designation']],
        body: bodyData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [0, 43, 61], textColor: 255 },
        margin: { left: 14, right: 14 }
      });

      yPos = doc.lastAutoTable.finalY + 5; 
    });

    const base64PDF = doc.output('datauristring').split(',')[1];
    await saveAndShare(`${project.name.replace(/\s+/g, '_')}_Register.pdf`, base64PDF, 'application/pdf');
  };

  // ✅ C. SUMMARY PDF (Replaces Print)
  const downloadSummaryPDF = async () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`SUMMARY: ${project.name}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Statistical Report`, 14, 22);

    const bodyData = stats.map(s => [s.name, s.registered, s.total, `${s.percentage}%`]);
    
    // Add Total Row
    bodyData.push(['TOTAL', totalReg, totalMem, `${totalPerc}%`]);

    autoTable(doc, {
      startY: 30,
      head: [['Mandal', 'Registered', 'Total', '%']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [0, 43, 61] },
      didParseCell: function (data) {
        if (data.row.index === bodyData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 230, 230];
        }
      }
    });

    const base64PDF = doc.output('datauristring').split(',')[1];
    await saveAndShare(`${project.name.replace(/\s+/g, '_')}_Summary.pdf`, base64PDF, 'application/pdf');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pt-safe-top animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#002B3D] p-5 flex justify-between items-center text-white shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText size={24} className="text-sky-300"/> Project Reports
          </h2>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <button onClick={downloadExcel} className="p-4 bg-green-50 border border-green-200 rounded-xl flex flex-col items-center gap-2 hover:bg-green-100 transition-colors cursor-pointer active:scale-95">
              <div className="p-3 bg-green-100 text-green-700 rounded-full"><Download size={24}/></div>
              <span className="font-bold text-green-800">Download Excel</span>
              <span className="text-xs text-green-600">Full Register List</span>
            </button>
            
            <button onClick={downloadRegisterPDF} className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col items-center gap-2 hover:bg-blue-100 transition-colors cursor-pointer active:scale-95">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-full"><Share2 size={24}/></div>
              <span className="font-bold text-blue-800">Register PDF</span>
              <span className="text-xs text-blue-600">Grouped by Mandal</span>
            </button>
            
            <button onClick={downloadSummaryPDF} className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex flex-col items-center gap-2 hover:bg-orange-100 transition-colors cursor-pointer active:scale-95">
              <div className="p-3 bg-orange-100 text-orange-700 rounded-full"><Share2 size={24}/></div>
              <span className="font-bold text-orange-800">Summary PDF</span>
              <span className="text-xs text-orange-600">Statistical Table</span>
            </button>
          </div>

          {/* Preview Table */}
          <h3 className="font-bold text-lg text-[#002B3D] mb-3">Statistical Preview</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Mandal</th>
                  <th className="p-3 text-center">Registered</th>
                  <th className="p-3 text-center">Total</th>
                  <th className="p-3 text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.map(s => (
                  <tr key={s.name} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-700">{s.name}</td>
                    <td className="p-3 text-center font-bold text-[#002B3D]">{s.registered}</td>
                    <td className="p-3 text-center text-slate-500">{s.total}</td>
                    <td className="p-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${s.percentage > 75 ? 'bg-green-100 text-green-700' : s.percentage > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {s.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                  <td className="p-3 text-[#002B3D]">TOTAL</td>
                  <td className="p-3 text-center text-[#002B3D]">{totalReg}</td>
                  <td className="p-3 text-center text-[#002B3D]">{totalMem}</td>
                  <td className="p-3 text-right text-[#002B3D]">{totalPerc}%</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}