import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ChevronRight, BarChart3, X, Download, FileText, FileSpreadsheet, UserX, Layers, MapPin, Shield } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function AttendanceSummary({ event, project, userScope, onMandalClick, isVisible, onClose }) {
  const [loading, setLoading] = useState(true);
  
  // Base Data State
  const [rawRegs, setRawRegs] = useState([]);
  const [presentSet, setPresentSet] = useState(new Set());
  
  // Grouping State (Dynamic Toggle)
  const [groupBy, setGroupBy] = useState('mandal'); // 'mandal' | 'kshetra'

  // Computed Stats State
  const [data, setData] = useState([]);
  const [absentList, setAbsentList] = useState([]); 
  const [totals, setTotals] = useState({ present: 0, registered: 0 });
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Reverse Lookup Dictionary for Realtime DELETEs
  const attendanceIdMap = useRef(new Map());

  // --- 1. FETCH INITIAL DATA ---
  useEffect(() => {
    let isMounted = true; 

    const loadInitialData = async () => {
      setLoading(true);
      try {
        let regQuery = supabase
          .from('project_registrations')
          .select(`
            member_id,
            members!inner ( id, name, surname, mobile, internal_code, mandal_id, mandals ( id, name, kshetra_id, kshetras ( id, name ) ), gender )
          `)
          .eq('project_id', project.id);

        if (!userScope.isGlobal) {
            if (userScope.gender) regQuery = regQuery.eq('members.gender', userScope.gender);
            if (userScope.role === 'nirdeshak' && userScope.kshetraId) regQuery = regQuery.eq('members.mandals.kshetra_id', userScope.kshetraId);
            else if (['sanchalak', 'nirikshak'].includes(userScope.role)) {
              if (userScope.mandalIds && userScope.mandalIds.length > 0) regQuery = regQuery.in('members.mandal_id', userScope.mandalIds);
              else {
                  if (isMounted) { setRawRegs([]); setPresentSet(new Set()); setLoading(false); }
                  return; 
              }
            }
        }

        const [regRes, attRes] = await Promise.all([
           regQuery,
           supabase.from('attendance').select('id, member_id').eq('event_id', event.id)
        ]);

        if (regRes.error) throw regRes.error;
        if (attRes.error) throw attRes.error;

        if (isMounted) {
          setRawRegs(regRes.data || []);
          const newSet = new Set();
          attendanceIdMap.current.clear();
          attRes.data?.forEach(a => {
            newSet.add(a.member_id);
            attendanceIdMap.current.set(a.id, a.member_id); 
          });
          setPresentSet(newSet);
        }

      } catch (err) {
        console.error("Summary Load Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (isVisible && event?.id) {
      loadInitialData();
    } else {
      setRawRegs([]);
      setData([]);
      setLoading(true);
    }

    return () => { isMounted = false; };
  }, [event?.id, isVisible, project.id, userScope]);

  // --- 2. REALTIME SYNC ---
  useEffect(() => {
    if (!isVisible || !event?.id) return;

    const channel = supabase
      .channel(`summary-sync-${event.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.event_id === event.id) {
             attendanceIdMap.current.set(payload.new.id, payload.new.member_id);
             setPresentSet(prev => {
                const next = new Set(prev);
                next.add(payload.new.member_id);
                return next;
             });
          } 
          else if (payload.eventType === 'DELETE') {
             const delId = payload.old?.id;
             const memberId = attendanceIdMap.current.get(delId);

             if (memberId) {
                attendanceIdMap.current.delete(delId);
                setPresentSet(prev => {
                   const next = new Set(prev);
                   next.delete(memberId);
                   return next;
                });
             }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isVisible, event?.id]);

  // --- 3. DYNAMIC STATS COMPUTATION ---
  useEffect(() => {
    if (!rawRegs) return;

    const groups = {};
    const absents = [];
    let totalReg = 0, totalPres = 0;

    rawRegs.forEach(r => {
      const m = r.members;
      
      let groupName = 'Unknown';
      let groupId = null;

      if (groupBy === 'mandal') {
        groupName = m.mandals?.name || 'Unknown Mandal';
        groupId = m.mandals?.id;
      } else {
        groupName = m.mandals?.kshetras?.name || 'Unknown Kshetra';
        groupId = m.mandals?.kshetra_id;
      }
      
      if (!groups[groupName]) {
          groups[groupName] = { id: groupId, name: groupName, registered: 0, present: 0 };
      }

      groups[groupName].registered++;
      totalReg++;

      if (presentSet.has(r.member_id)) {
        groups[groupName].present++;
        totalPres++;
      } else {
        absents.push({
          name: `${m.name} ${m.surname}`,
          mobile: m.mobile || 'N/A',
          mandal: m.mandals?.name || 'Unknown Mandal',
          kshetra: m.mandals?.kshetras?.name || 'Unknown Kshetra',
          id: m.internal_code
        });
      }
    });

    const sortedData = Object.values(groups).sort((a, b) => b.present - a.present);
    setData(sortedData);
    setAbsentList(absents);
    setTotals({ present: totalPres, registered: totalReg });

  }, [rawRegs, presentSet, groupBy]);

  const getPct = (curr, total) => total > 0 ? Math.round((curr / total) * 100) : 0;

  // --- EXPORT FUNCTIONS ---

  // 1. ADMIN MASTER REPORT (Kshetra Summary + Absent List)
  const exportAdminMasterReport = () => {
    const doc = new jsPDF();
    
    // Calculate Kshetra data instantly (ignores current UI grouping state)
    const kGroups = {};
    const kAbsents = [];
    let tReg = 0, tPres = 0;

    rawRegs.forEach(r => {
      const m = r.members;
      const kName = m.mandals?.kshetras?.name || 'Unknown Kshetra';

      if (!kGroups[kName]) kGroups[kName] = { name: kName, registered: 0, present: 0 };
      kGroups[kName].registered++;
      tReg++;

      if (presentSet.has(r.member_id)) {
        kGroups[kName].present++;
        tPres++;
      } else {
        kAbsents.push({
          name: `${m.name} ${m.surname}`, mobile: m.mobile || 'N/A',
          mandal: m.mandals?.name || 'Unknown', kshetra: kName
        });
      }
    });

    const summaryData = Object.values(kGroups)
      .sort((a, b) => b.present - a.present)
      .map(row => [row.name, `${row.present} / ${row.registered}`, `${getPct(row.present, row.registered)}%`]);

    kAbsents.sort((a, b) => a.kshetra.localeCompare(b.kshetra) || a.mandal.localeCompare(b.mandal));
    const absentData = kAbsents.map(row => [row.name, row.mobile, row.kshetra, row.mandal]);

    // SECTION 1: HEADER & SUMMARY TABLE
    doc.setFontSize(14);
    doc.text(`${event.name} - Master Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Present: ${tPres} / ${tReg} (${getPct(tPres, tReg)}%)`, 14, 22);

    autoTable(doc, { 
      head: [['Kshetra', 'Count', '%']], 
      body: summaryData, 
      startY: 28,
      headStyles: { fillColor: [79, 70, 229] } // Indigo Color
    });

    // SECTION 2: ABSENT LIST TABLE (Positioned directly below the summary)
    let finalY = doc.lastAutoTable.finalY || 28;
    
    doc.setFontSize(12);
    doc.text("Absent Members List", 14, finalY + 12);

    autoTable(doc, { 
      head: [['Name', 'Mobile', 'Kshetra', 'Mandal']], 
      body: absentData, 
      startY: finalY + 16,
      headStyles: { fillColor: [249, 115, 22] } // Orange Color
    });

    doc.save(`Admin_Master_Report_${event.name}.pdf`);
    setShowExportMenu(false);
  };

  // 2. Standard Exports
  const exportPDFSummary = () => {
    const doc = new jsPDF();
    const groupLabel = groupBy === 'mandal' ? 'Mandal' : 'Kshetra';
    
    doc.text(`${event.name} - ${groupLabel}-wise Summary`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Present: ${totals.present} / ${totals.registered} (${getPct(totals.present, totals.registered)}%)`, 14, 22);
    
    const tableData = data.map(row => [
      row.name, `${row.present} / ${row.registered}`, `${getPct(row.present, row.registered)}%`
    ]);

    autoTable(doc, { head: [[groupLabel, 'Count', '%']], body: tableData, startY: 30 });
    doc.save(`${groupLabel}_Summary_${event.name}.pdf`);
    setShowExportMenu(false);
  };

  const exportPDFAbsent = () => {
    const doc = new jsPDF();
    doc.text(`${event.name} - Absent Members List`, 14, 15);
    
    absentList.sort((a,b) => groupBy === 'mandal' ? a.mandal.localeCompare(b.mandal) : a.kshetra.localeCompare(b.kshetra));
    const tableData = absentList.map(row => [row.name, row.mobile, row.mandal, row.kshetra]);

    autoTable(doc, { head: [['Name', 'Mobile', 'Mandal', 'Kshetra']], body: tableData, startY: 25 });
    doc.save(`Absent_${event.name}.pdf`);
    setShowExportMenu(false);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const groupLabel = groupBy === 'mandal' ? 'Mandal' : 'Kshetra';
    
    const summaryData = data.map(d => ({
        [groupLabel]: d.name, Present: d.present, Registered: d.registered, Percentage: `${getPct(d.present, d.registered)}%`
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

    const absentData = absentList.map(a => ({
        ID: a.id, Name: a.name, Mobile: a.mobile, Mandal: a.mandal, Kshetra: a.kshetra
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(absentData), "Absent Members");

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
             {!loading && (
               <div className="relative">
                 <button 
                   onClick={() => setShowExportMenu(!showExportMenu)}
                   className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center gap-1 text-xs font-bold transition-colors"
                 >
                   <Download size={16} /> <span className="hidden sm:inline">Export</span>
                 </button>

                 {showExportMenu && (
                   <div className="absolute right-0 top-10 w-56 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50 animate-in zoom-in-95">
                     
                     {/* ADMIN ONLY MASTER REPORT */}
                     {userScope.isGlobal && (
                       <div className="mb-1 pb-1 border-b border-slate-100">
                         <button onClick={exportAdminMasterReport} className="cursor-pointer w-full text-left px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm flex items-center gap-2 text-indigo-700 font-bold transition-colors">
                            <Shield size={14} className="text-indigo-600"/> Master Report (PDF)
                         </button>
                       </div>
                     )}

                     <button onClick={exportPDFSummary} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <FileText size={14} className="text-slate-500"/> Current Summary (PDF)
                     </button>
                     <button onClick={exportPDFAbsent} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <UserX size={14} className="text-slate-500"/> Current Absent List (PDF)
                     </button>
                     <button onClick={exportExcel} className="cursor-pointer w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm flex items-center gap-2 text-slate-700 transition-colors">
                        <FileSpreadsheet size={14} className="text-slate-500"/> Excel Report
                     </button>
                   </div>
                 )}
               </div>
             )}
             
             <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 overflow-y-auto space-y-5">
          {loading ? (
            <div className="p-12 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Calculating stats...</div>
          ) : (
            <>
              {/* BIG STATS */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-600 text-white p-4 rounded-xl shadow-md text-center transition-all duration-300">
                  <div className="text-3xl font-bold">{totals.present}</div>
                  <div className="text-xs text-indigo-200 uppercase font-bold tracking-wide">Present</div>
                </div>
                <div className="bg-slate-100 text-slate-600 p-4 rounded-xl text-center border border-slate-200 transition-all duration-300">
                  <div className="text-3xl font-bold">{totals.registered}</div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wide">Total Registered</div>
                </div>
              </div>

              {/* DYNAMIC GROUPING TOGGLE */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                 <button 
                   onClick={() => setGroupBy('mandal')}
                   className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${groupBy === 'mandal' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <MapPin size={14}/> Mandal
                 </button>
                 <button 
                   onClick={() => setGroupBy('kshetra')}
                   className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${groupBy === 'kshetra' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   <Layers size={14}/> Kshetra
                 </button>
              </div>

              {/* TABLE */}
              {data.length === 0 ? (
                  <div className="text-center p-8 text-slate-400 border border-dashed rounded-xl">No data found for your scope.</div>
              ) : (
                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[10px] uppercase tracking-wider">
                            <tr>
                              <th className="p-3">{groupBy === 'mandal' ? 'Mandal' : 'Kshetra'}</th>
                              <th className="p-3 text-center">Count</th>
                              <th className="p-3 text-right">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.map(row => (
                            <tr 
                              key={row.name} 
                              onClick={() => { 
                                if(groupBy === 'mandal') { onMandalClick(row.id, row.name); onClose(); }
                              }} 
                              className={`${groupBy === 'mandal' ? 'hover:bg-indigo-50 cursor-pointer' : ''} transition-colors`}
                            >
                                <td className="p-3 font-medium flex items-center gap-1 text-slate-700">
                                  {row.name} 
                                  {groupBy === 'mandal' && <ChevronRight size={14} className="text-slate-300"/>}
                                </td>
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