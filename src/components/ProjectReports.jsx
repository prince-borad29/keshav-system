import React, { useState, useEffect } from 'react';
import { 
  X, Download, BarChart, Users, CheckCircle, XCircle, FileText, ClipboardList 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Import the function directlyimport { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';

export default function ProjectReports({ isOpen, onClose, project, members, registeredIds }) {
  const { profile } = useAuth();
  
  const [stats, setStats] = useState({
    total: 0,
    registered: 0,
    unregistered: 0,
    mandalStats: {}
  });

  const [exportableData, setExportableData] = useState([]);

  const userRole = (profile?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isNirdeshak = userRole === 'nirdeshak';
  const isMandalLeader = ['sanchalak', 'nirikshak'].includes(userRole);
  const isTaker = userRole === 'taker';

  useEffect(() => {
    if (!isOpen || !members) return;
    if (isTaker) { onClose(); return; }

    let scopedMembers = members;
    if (!isAdmin) {
       if (isMandalLeader && profile?.mandal_id) {
          scopedMembers = members.filter(m => m.mandal_id === profile.mandal_id);
       }
       else if (isNirdeshak && profile?.kshetra_id) {
          scopedMembers = members.filter(m => m.kshetra_id === profile.kshetra_id);
       }
    }

    const total = scopedMembers.length;
    const registeredMembers = scopedMembers.filter(m => registeredIds.has(m.id));
    const registered = registeredMembers.length;
    const unregistered = total - registered;

    const mStats = {};
    if (isAdmin || isNirdeshak) {
        scopedMembers.forEach(m => {
            const mandal = m.mandal || 'Unknown';
            if (!mStats[mandal]) mStats[mandal] = { total: 0, registered: 0 };
            mStats[mandal].total++;
            if (registeredIds.has(m.id)) mStats[mandal].registered++;
        });
    }

    setStats({ total, registered, unregistered, mandalStats: mStats });
    setExportableData(scopedMembers);

  }, [isOpen, members, registeredIds, profile, isAdmin, isNirdeshak, isMandalLeader, isTaker]);

  if (!isOpen || isTaker) return null;

  // ✅ HELPER: UNIVERSAL DOWNLOAD (Fixed for PDF)
  const downloadFile = async (fileName, dataBase64, mimeType) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: fileName,
          data: dataBase64,
          directory: Directory.Documents
        });
        alert(`Saved to Documents/${fileName}`);
      } else {
        const link = document.createElement('a');
        link.href = `data:${mimeType};base64,${dataBase64}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      alert("Download failed: " + e.message);
    }
  };

  const exportExcel = () => {
    const data = exportableData.map(m => ({
      ID: m.id,
      Name: `${m.name} ${m.surname}`,
      Mandal: m.mandal,
      Designation: m.designation,
      Mobile: m.mobile_number || '-',
      Status: registeredIds.has(m.id) ? 'Registered' : 'Not Registered'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    downloadFile(`${project.name}_Report.xlsx`, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

 // ✅ FIXED: PDF EXPORT
  const exportPDF = (onlyRegistered = false) => {
    try {
      const doc = new jsPDF();
      const title = onlyRegistered ? `Registered Members: ${project.name}` : `Full Report: ${project.name}`;
      
      doc.text(title, 14, 15);
      
      const dataToUse = onlyRegistered 
        ? exportableData.filter(m => registeredIds.has(m.id)) 
        : exportableData;

      const tableRows = dataToUse.map(m => [
        m.id, 
        `${m.name} ${m.surname}`, 
        m.mandal, 
        registeredIds.has(m.id) ? 'YES' : 'NO'
      ]);

      // Use the imported function directly instead of doc.autoTable
      autoTable(doc, {
        head: [['ID', 'Name', 'Mandal', 'Registered']],
        body: tableRows,
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: [0, 43, 61] }
      });
      
      const base64PDF = doc.output('datauristring').split(',')[1];
      const fileName = onlyRegistered ? `${project.name}_Registered_List.pdf` : `${project.name}_Full_Report.pdf`;
      downloadFile(fileName, base64PDF, 'application/pdf');
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Could not generate PDF. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div>
             <h2 className="text-xl font-bold text-[#002B3D] flex items-center gap-2"><FileText size={24}/> Project Report</h2>
             <p className="text-sm text-slate-500">
               {isMandalLeader ? 'Mandal Summary' : isNirdeshak ? 'Kshetra Summary' : 'All India Summary'}
             </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-4">
                 <div className="p-3 bg-blue-100 text-blue-600 rounded-full"><Users size={24}/></div>
                 <div>
                    <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
                    <div className="text-xs text-blue-700 font-bold uppercase">Total Scope</div>
                 </div>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-center gap-4">
                 <div className="p-3 bg-green-100 text-green-600 rounded-full"><CheckCircle size={24}/></div>
                 <div>
                    <div className="text-2xl font-bold text-green-900">{stats.registered}</div>
                    <div className="text-xs text-green-700 font-bold uppercase">Registered</div>
                 </div>
              </div>
              <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center gap-4">
                 <div className="p-3 bg-red-100 text-red-600 rounded-full"><XCircle size={24}/></div>
                 <div>
                    <div className="text-2xl font-bold text-red-900">{stats.unregistered}</div>
                    <div className="text-xs text-red-700 font-bold uppercase">Pending</div>
                 </div>
              </div>
           </div>

           {(isAdmin || isNirdeshak) && (
             <div>
                <h3 className="text-lg font-bold text-[#002B3D] mb-4 flex items-center gap-2"><BarChart size={20}/> Breakdown by Mandal</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                   <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                         <tr><th className="p-3">Mandal</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Reg.</th><th className="p-3 text-right">%</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {Object.keys(stats.mandalStats).sort().map(mandal => {
                            const d = stats.mandalStats[mandal];
                            const percent = Math.round((d.registered / d.total) * 100);
                            return (
                               <tr key={mandal} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700">{mandal}</td>
                                  <td className="p-3 text-right">{d.total}</td>
                                  <td className="p-3 text-right text-green-600 font-bold">{d.registered}</td>
                                  <td className="p-3 text-right"><span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold">{percent}%</span></td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
             </div>
           )}
        </div>

        <div className="p-5 border-t bg-slate-50 rounded-b-2xl flex flex-wrap gap-3">
           <button onClick={exportExcel} className="flex-1 min-w-[120px] py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Download size={18}/> Excel</button>
           
           {/* ✅ NEW BUTTON: REGISTERED LIST ONLY */}
           <button onClick={() => exportPDF(true)} className="flex-1 min-w-[120px] py-3 bg-[#002B3D] hover:bg-[#0b3d52] text-white font-bold rounded-xl flex items-center justify-center gap-2"><ClipboardList size={18}/> Registered PDF</button>
           
           <button onClick={() => exportPDF(false)} className="flex-1 min-w-[120px] py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Download size={18}/> Full PDF</button>
        </div>
      </div>
    </div>
  );
}