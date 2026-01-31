import React, { useMemo, useEffect } from 'react';
import { X, Download, FileText, CheckCircle, XCircle, BarChart, UserX } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext'; 

export default function EventReports({ 
  isOpen, 
  onClose, 
  event, 
  members = [], 
  presentIds = new Set() 
}) {
  const { profile } = useAuth();

  // --- PERMISSIONS ---
  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isNirdeshak = userRole === 'nirdeshak';
  const isMandalLeader = ['sanchalak', 'nirikshak'].includes(userRole);
  const isTaker = userRole === 'taker';

  useEffect(() => { if (isOpen && isTaker) onClose(); }, [isOpen, isTaker, onClose]);

  // --- 1. SCOPE AND STATS ---
  const { scopedMembers, stats } = useMemo(() => {
    if (!event || !members) return { scopedMembers: [], stats: [] };

    // ✅ A. STRICT SCOPING
    let filtered = members;
    if (!isAdmin && profile) {
       if (isMandalLeader && profile.mandal_id) {
          filtered = members.filter(m => m.mandal_id === profile.mandal_id);
       }
       else if (isNirdeshak && profile.kshetra_id) {
          filtered = members.filter(m => m.kshetra_id === profile.kshetra_id);
       }
    }

    // ✅ B. CALCULATE STATS (On Scoped Data)
    const mandalStats = {};
    filtered.forEach(m => {
      const mandal = m.mandal || 'Unknown';
      if (!mandalStats[mandal]) mandalStats[mandal] = { name: mandal, total: 0, present: 0 };
      mandalStats[mandal].total += 1;
      if (presentIds && presentIds.has(m.id)) mandalStats[mandal].present += 1;
    });

    const calculatedStats = Object.values(mandalStats).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
    })).sort((a, b) => a.name.localeCompare(b.name));

    return { scopedMembers: filtered, stats: calculatedStats };
  }, [members, presentIds, event, isAdmin, isNirdeshak, isMandalLeader, profile]);

  if (!isOpen || !event || isTaker) return null;

  const totalPresent = stats.reduce((sum, s) => sum + s.present, 0);
  const totalMem = stats.reduce((sum, s) => sum + s.total, 0);
  const totalPerc = totalMem > 0 ? Math.round((totalPresent / totalMem) * 100) : 0;

  // --- 2. DOWNLOAD HELPER ---
  const downloadFile = async (fileName, dataBase64, mimeType) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: fileName,
          data: dataBase64,
          directory: Directory.Documents,
        });
        alert(`File Saved to Documents folder:\n${fileName}`);
      } else {
        const byteCharacters = atob(dataBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      alert("Download Error: " + e.message);
    }
  };

  // --- 3. EXPORT FUNCTIONS (Using Scoped Data) ---
  const downloadExcel = () => {
    const headers = ['ID', 'Name', 'Surname', 'Mandal', 'Mobile', 'Status'];
    const rows = scopedMembers.map(m => [
      m.id, m.name, m.surname, m.mandal || '', m.mobile_number || '-',
      presentIds.has(m.id) ? 'Present' : 'Absent'
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(item => `"${item}"`).join(','))].join('\n');
    const base64Data = btoa(unescape(encodeURIComponent(csvContent)));
    downloadFile(`${event.name.replace(/\s+/g, '_')}_Log.csv`, base64Data, 'text/csv');
  };

  // ✅ NEW: ABSENT LIST PDF
  const downloadAbsentPDF = () => {
    const doc = new jsPDF();
    doc.text(event.name.toUpperCase(), 14, 15);
    doc.setFontSize(10);
    doc.text(`ABSENT LIST • Total Absent: ${totalMem - totalPresent}`, 14, 22);

    const absentMembers = scopedMembers.filter(m => !presentIds.has(m.id));
    const grouped = {};
    absentMembers.forEach(m => {
      const k = m.mandal || 'Other';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(m);
    });

    let yPos = 30;
    Object.keys(grouped).sort().forEach(mandal => {
      autoTable(doc, {
        startY: yPos,
        head: [[`${mandal} (${grouped[mandal].length})`]],
        theme: 'plain',
        styles: { fillColor: [255, 235, 235], fontStyle: 'bold', halign: 'center', textColor: [200, 50, 50] }
      });
      yPos = doc.lastAutoTable.finalY;
      const bodyData = grouped[mandal].map(m => [`${m.name} ${m.surname}`, m.mobile_number || '-']);
      autoTable(doc, {
        startY: yPos,
        head: [['Name', 'Mobile']],
        body: bodyData,
        theme: 'grid',
        styles: { fontSize: 10 }
      });
      yPos = doc.lastAutoTable.finalY + 5; 
    });

    const base64PDF = doc.output('datauristring').split(',')[1];
    downloadFile(`${event.name}_Absent_List.pdf`, base64PDF, 'application/pdf');
  };

  const downloadSummaryPDF = () => {
    const doc = new jsPDF();
    doc.text(`SUMMARY: ${event.name}`, 14, 15);
    const bodyData = stats.map(s => [s.name, s.present, s.total, `${s.percentage}%`]);
    bodyData.push(['TOTAL', totalPresent, totalMem, `${totalPerc}%`]);
    
    autoTable(doc, {
      startY: 25,
      head: [['Mandal', 'Present', 'Total', '%']],
      body: bodyData,
      theme: 'grid',
      didParseCell: function (data) {
        if (data.row.index === bodyData.length - 1) data.cell.styles.fontStyle = 'bold';
      }
    });
    const base64PDF = doc.output('datauristring').split(',')[1];
    downloadFile(`${event.name}_Summary.pdf`, base64PDF, 'application/pdf');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pt-safe-top animate-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-[#002B3D] p-5 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={24} className="text-sky-300"/> Event Reports</h2>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <button onClick={downloadExcel} className="p-4 bg-green-50 border border-green-200 rounded-xl flex flex-col items-center gap-2 hover:bg-green-100">
              <div className="p-3 bg-green-100 text-green-700 rounded-full"><Download size={24}/></div>
              <span className="font-bold text-green-800">Excel Log</span>
              <span className="text-xs text-green-600">Full Data</span>
            </button>
            
            {/* ✅ MIDDLE BUTTON: ABSENT LIST */}
            <button onClick={downloadAbsentPDF} className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col items-center gap-2 hover:bg-red-100">
              <div className="p-3 bg-red-100 text-red-700 rounded-full"><UserX size={24}/></div>
              <span className="font-bold text-red-800">Absent PDF</span>
              <span className="text-xs text-red-600">Absentee List</span>
            </button>
            
            <button onClick={downloadSummaryPDF} className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex flex-col items-center gap-2 hover:bg-orange-100">
              <div className="p-3 bg-orange-100 text-orange-700 rounded-full"><BarChart size={24}/></div>
              <span className="font-bold text-orange-800">Summary PDF</span>
              <span className="text-xs text-orange-600">Stats Table</span>
            </button>
          </div>

          <h3 className="font-bold text-lg text-[#002B3D] mb-3">Live Statistics ({isMandalLeader ? 'Mandal' : isNirdeshak ? 'Kshetra' : 'Global'})</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr><th className="p-3">Mandal</th><th className="p-3 text-center">Present</th><th className="p-3 text-center">Total</th><th className="p-3 text-right">%</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.length === 0 ? <tr><td colSpan="4" className="p-4 text-center">No Data</td></tr> : stats.map(s => (
                  <tr key={s.name}>
                    <td className="p-3 font-semibold">{s.name}</td>
                    <td className="p-3 text-center text-green-600 font-bold">{s.present}</td>
                    <td className="p-3 text-center">{s.total}</td>
                    <td className="p-3 text-right">{s.percentage}%</td>
                  </tr>
                ))}
                {stats.length > 0 && (
                  <tr className="bg-slate-50 font-bold border-t">
                    <td className="p-3">TOTAL</td><td className="p-3 text-center">{totalPresent}</td><td className="p-3 text-center">{totalMem}</td><td className="p-3 text-right">{totalPerc}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}