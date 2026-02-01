import React, { useMemo, useEffect } from 'react';
import { X, Download, FileText, BarChart, UserX, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
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

  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isNirdeshak = userRole === 'nirdeshak';
  const isMandalLeader = ['sanchalak', 'nirikshak'].includes(userRole);
  const isTaker = userRole === 'taker';

  useEffect(() => { if (isOpen && isTaker) onClose(); }, [isOpen, isTaker, onClose]);

  // --- 1. SCOPE AND STATS ---
  const { scopedMembers, stats } = useMemo(() => {
    if (!event || !members) return { scopedMembers: [], stats: [] };

    let filtered = members;
    if (!isAdmin && profile) {
       if (isMandalLeader && profile.mandal_id) {
          filtered = members.filter(m => m.mandal_id === profile.mandal_id);
       }
       else if (isNirdeshak && profile.kshetra_id) {
          filtered = members.filter(m => m.kshetra_id === profile.kshetra_id);
       }
    }

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
        alert(`File Saved to Documents:\n${fileName}`);
      } else {
        const link = document.createElement('a');
        link.href = `data:${mimeType};base64,${dataBase64}`;
        link.download = fileName;
        link.click();
      }
    } catch (e) {
      alert("Download Error: " + e.message);
    }
  };

  // --- 3. EXPORT FUNCTIONS ---
  const downloadExcel = () => {
    const headers = ['ID', 'Name', 'Surname', 'Mandal', 'Mobile', 'Status'];
    const rows = scopedMembers.map(m => [
      m.id, m.name, m.surname, m.mandal || '', m.mobile_number || '-',
      presentIds.has(m.id) ? 'Present' : 'Absent'
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(item => `"${item}"`).join(','))].join('\n');
    const base64Data = btoa(unescape(encodeURIComponent(csvContent)));
    downloadFile(`${event.name}_Log.csv`, base64Data, 'text/csv');
  };

  const downloadAbsentPDF = () => {
    const doc = new jsPDF();
    doc.text(event.name.toUpperCase(), 14, 15);
    doc.setFontSize(10);
    doc.text(`ABSENT LIST • Total: ${totalMem - totalPresent}`, 14, 22);

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
    downloadFile(`${event.name}_Absent.pdf`, base64PDF, 'application/pdf');
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
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-4xl bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="bg-[#002B3D] p-4 sm:p-5 flex justify-between items-center text-white shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <FileText size={20} className="text-sky-300"/> Event Reports
            </h2>
            <p className="text-xs text-sky-200/80 line-clamp-1">{event.name}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
          
          {/* ✅ DOWNLOAD BUTTONS (1 Row, Icon Only on Mobile) */}
          <div className="grid grid-cols-3 gap-6 mb-6  sm:mb-8">
            
            {/* 1. Excel Button */}
            <button onClick={downloadExcel} className="group p-3 bg-green-50 border border-green-200 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 hover:bg-green-100 transition-all active:scale-95 shadow-sm" title="Download Excel">
              <div className="p-2 bg-green-100 text-green-700 rounded-full group-hover:bg-white transition-colors">
                <FileSpreadsheet size={24} />
              </div>
              {/* Text hidden on mobile, visible on sm+ */}
              <div className="hidden sm:block text-left">
                <span className="block font-bold text-green-900 text-sm">Excel Log</span>
                <span className="block text-[10px] text-green-600 font-medium">Full Data</span>
              </div>
            </button>
            
            {/* 2. Absent PDF Button */}
            <button onClick={downloadAbsentPDF} className="group p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 hover:bg-red-100 transition-all active:scale-95 shadow-sm" title="Download Absent List">
              <div className="p-2 bg-red-100 text-red-700 rounded-full group-hover:bg-white transition-colors">
                <UserX size={24} />
              </div>
              <div className="hidden sm:block text-left">
                <span className="block font-bold text-red-900 text-sm">Absent PDF</span>
                <span className="block text-[10px] text-red-600 font-medium">Missing Members</span>
              </div>
            </button>
            
            {/* 3. Summary PDF Button */}
            <button onClick={downloadSummaryPDF} className="group p-3 bg-orange-50 border border-orange-200 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 hover:bg-orange-100 transition-all active:scale-95 shadow-sm" title="Download Stats">
              <div className="p-2 bg-orange-100 text-orange-700 rounded-full group-hover:bg-white transition-colors">
                <BarChart size={24} />
              </div>
              <div className="hidden sm:block text-left">
                <span className="block font-bold text-orange-900 text-sm">Summary PDF</span>
                <span className="block text-[10px] text-orange-600 font-medium">Statistics</span>
              </div>
            </button>

          </div>

          {/* Stats Header */}
          <h3 className="font-bold text-base sm:text-lg text-[#002B3D] mb-3 flex justify-between items-end">
            <span>Live Statistics</span>
            <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
              {isMandalLeader ? 'Mandal' : isNirdeshak ? 'Kshetra' : 'Global'}
            </span>
          </h3>
          
          {/* Table Container */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3">Mandal</th>
                    <th className="p-3 text-center">Present</th>
                    <th className="p-3 text-center">Total</th>
                    <th className="p-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.length === 0 ? (
                    <tr><td colSpan="4" className="p-6 text-center text-slate-400 italic">No Data Available</td></tr>
                  ) : (
                    stats.map(s => (
                      <tr key={s.name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-semibold text-slate-700">{s.name}</td>
                        <td className="p-3 text-center text-green-600 font-bold bg-green-50/30">{s.present}</td>
                        <td className="p-3 text-center text-slate-600">{s.total}</td>
                        <td className="p-3 text-right font-medium">{s.percentage}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {stats.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200 sticky bottom-0 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                    <tr>
                      <td className="p-3 text-[#002B3D]">TOTAL</td>
                      <td className="p-3 text-center text-green-700">{totalPresent}</td>
                      <td className="p-3 text-center text-[#002B3D]">{totalMem}</td>
                      <td className="p-3 text-right text-sky-600">{totalPerc}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}