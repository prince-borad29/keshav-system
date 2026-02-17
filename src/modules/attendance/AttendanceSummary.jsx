import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ChevronRight, BarChart3, X, Download, FileText, FileSpreadsheet, UserX } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // 1. Direct Import
import * as XLSX from 'xlsx';

export default function AttendanceSummary({ event, project, userScope, onMandalClick, isVisible, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [absentList, setAbsentList] = useState([]); 
  const [totals, setTotals] = useState({ present: 0, registered: 0 });
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    if (isVisible) calculateStats();
  }, [event.id, isVisible]);

  const calculateStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch Registrations
      let regQuery = supabase
        .from('project_registrations')
        .select(`
          member_id,
          members!inner ( 
            id, name, surname, mobile, internal_code,
            mandal_id, 
            mandals ( id, name, kshetra_id ), 
            gender 
          )
        `)
        .eq('project_id', project.id);

      // --- APPLY FILTERS ---
      if (!userScope.isGlobal) {
          if (userScope.gender) {
            regQuery = regQuery.eq('members.gender', userScope.gender);
          }
          
          if (userScope.role === 'nirdeshak' && userScope.kshetraId) {
            regQuery = regQuery.eq('members.mandals.kshetra_id', userScope.kshetraId);
          } 
          else if (['sanchalak', 'nirikshak'].includes(userScope.role)) {
            if (userScope.mandalIds && userScope.mandalIds.length > 0) {
                regQuery = regQuery.in('members.mandal_id', userScope.mandalIds);
            } else {
                setData([]); setTotals({ present: 0, registered: 0 }); setLoading(false); return; 
            }
          }
      }

      const { data: regs, error: regError } = await regQuery;
      if (regError) throw regError;

      // 2. Fetch Attendance
      const { data: atts, error: attError } = await supabase
        .from('attendance')
        .select('member_id')
        .eq('event_id', event.id);
      
      if (attError) throw attError;

      // 3. Aggregate & Build Absent List
      const presentSet = new Set(atts.map(a => a.member_id));
      
      const groups = {};
      const absents = [];
      let totalReg = 0, totalPres = 0;

      regs.forEach(r => {
        const m = r.members;
        const mandalName = m.mandals?.name || 'Unknown';
        const mandalId = m.mandals?.id;
        
        if (!groups[mandalName]) {
            groups[mandalName] = { 
                id: mandalId, 
                name: mandalName, 
                registered: 0, 
                present: 0 
            };
        }

        groups[mandalName].registered++;
        totalReg++;

        if (presentSet.has(r.member_id)) {
          groups[mandalName].present++;
          totalPres++;
        } else {
          // Add to Absent List
          absents.push({
            name: `${m.name} ${m.surname}`,
            mobile: m.mobile || 'N/A',
            mandal: mandalName,
            id: m.internal_code
          });
        }
      });

      const sortedData = Object.values(groups).sort((a, b) => b.present - a.present);
      setData(sortedData);
      setAbsentList(absents);
      setTotals({ present: totalPres, registered: totalReg });

    } catch (err) {
      console.error("Summary Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getPct = (curr, total) => total > 0 ? Math.round((curr / total) * 100) : 0;

  // --- EXPORT FUNCTIONS (FIXED) ---

  const exportPDFSummary = () => {
    const doc = new jsPDF();
    doc.text(`${event.name} - Attendance Summary`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Present: ${totals.present} / ${totals.registered} (${getPct(totals.present, totals.registered)}%)`, 14, 22);
    
    const tableData = data.map(row => [
      row.name, 
      `${row.present} / ${row.registered}`, 
      `${getPct(row.present, row.registered)}%`
    ]);

    // 2. Use Functional Call
    autoTable(doc, {
      head: [['Mandal', 'Count', '%']],
      body: tableData,
      startY: 30,
    });
    doc.save(`Summary_${event.name}.pdf`);
    setShowExportMenu(false);
  };

  const exportPDFAbsent = () => {
    const doc = new jsPDF();
    doc.text(`${event.name} - Absent Members List`, 14, 15);
    
    // Group by Mandal for better readability
    absentList.sort((a,b) => a.mandal.localeCompare(b.mandal));
    
    const tableData = absentList.map(row => [
      row.name,
      row.mobile,
      row.mandal
    ]);

    // 2. Use Functional Call
    autoTable(doc, {
      head: [['Name', 'Mobile', 'Mandal']],
      body: tableData,
      startY: 25,
    });
    doc.save(`Absent_${event.name}.pdf`);
    setShowExportMenu(false);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Summary
    const summaryData = data.map(d => ({
        Mandal: d.name,
        Present: d.present,
        Registered: d.registered,
        Percentage: `${getPct(d.present, d.registered)}%`
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Sheet 2: Absent List
    const absentData = absentList.map(a => ({
        ID: a.id,
        Name: a.name,
        Mobile: a.mobile,
        Mandal: a.mandal
    }));
    const wsAbsent = XLSX.utils.json_to_sheet(absentData);
    XLSX.utils.book_append_sheet(wb, wsAbsent, "Absent Members");

    XLSX.writeFile(wb, `Attendance_Report_${event.name}.xlsx`);
    setShowExportMenu(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 border-b relative">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600"/> Summary
          </h3>
          
          <div className="flex gap-2">
             {/* EXPORT BUTTON & DROPDOWN */}
             {!loading && (
               <div className="relative">
                 <button 
                   onClick={() => setShowExportMenu(!showExportMenu)}
                   className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center gap-1 text-xs font-bold transition-colors"
                 >
                   <Download size={16} /> <span className="hidden sm:inline">Export</span>
                 </button>

                 {showExportMenu && (
                   <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50 animate-in zoom-in-95">
                     <button onClick={exportPDFSummary} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <FileText size={14} className="text-red-500"/> PDF Summary
                     </button>
                     <button onClick={exportPDFAbsent} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <UserX size={14} className="text-orange-500"/> PDF Absent List
                     </button>
                     <button onClick={exportExcel} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <FileSpreadsheet size={14} className="text-green-600"/> Excel Report
                     </button>
                   </div>
                 )}
               </div>
             )}
             
             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 overflow-y-auto space-y-6">
          {loading ? (
            <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Calculating stats...</div>
          ) : (
            <>
              {/* BIG STATS */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-md text-center">
                  <div className="text-3xl font-bold">{totals.present}</div>
                  <div className="text-xs text-indigo-200 uppercase font-bold tracking-wide">Present</div>
                </div>
                <div className="bg-slate-100 text-slate-600 p-4 rounded-xl text-center border border-slate-200">
                  <div className="text-3xl font-bold">{totals.registered}</div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wide">Total Registered</div>
                </div>
              </div>

              {/* TABLE */}
              {data.length === 0 ? (
                  <div className="text-center p-8 text-slate-400 border border-dashed rounded-xl">No data found for your scope.</div>
              ) : (
                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[10px] uppercase">
                            <tr><th className="p-3">Mandal</th><th className="p-3 text-center">Count</th><th className="p-3 text-right">%</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.map(row => (
                            <tr key={row.name} onClick={() => { onMandalClick(row.id, row.name); onClose(); }} className="hover:bg-indigo-50 cursor-pointer transition-colors">
                                <td className="p-3 font-medium flex items-center gap-1 text-slate-700">{row.name} <ChevronRight size={14} className="text-slate-300"/></td>
                                <td className="p-3 text-center"><span className="text-green-600 font-bold">{row.present}</span> / {row.registered}</td>
                                <td className="p-3 text-right font-mono text-slate-600">{getPct(row.present, row.registered)}%</td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                  </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}