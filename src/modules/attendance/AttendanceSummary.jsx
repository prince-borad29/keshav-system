import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ChevronRight, BarChart3, Download, FileText, FileSpreadsheet, UserX, Layers, MapPin, Shield } from 'lucide-react';
import { saveAs } from 'file-saver'; 
import toast from 'react-hot-toast'; 
import Modal from '../../components/Modal';
import Button from '../../components/ui/Button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AttendanceSummary({ event, project, userScope, onMandalClick, isVisible, onClose }) {
  const [loading, setLoading] = useState(true);
  const [rawRegs, setRawRegs] = useState([]);
  const [presentSet, setPresentSet] = useState(new Set());
  const [groupBy, setGroupBy] = useState('mandal'); 

  const [data, setData] = useState([]);
  const [absentList, setAbsentList] = useState([]); 
  const [totals, setTotals] = useState({ present: 0, registered: 0 });
  const [showExportMenu, setShowExportMenu] = useState(false);

  const attendanceIdMap = useRef(new Map());

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      setLoading(true);
      try {
        let regQuery = supabase.from('project_registrations').select(`member_id, members!inner ( id, name, surname, mobile, internal_code, mandal_id, mandals ( id, name, kshetra_id, kshetras ( id, name ) ), gender )`).eq('project_id', project.id);

        if (!userScope.isGlobal) {
            if (userScope.gender) regQuery = regQuery.eq('members.gender', userScope.gender);
            if (['nirdeshak', 'project_admin'].includes(userScope.role) && userScope.kshetraId) regQuery = regQuery.eq('members.mandals.kshetra_id', userScope.kshetraId);
            else if (['sanchalak', 'nirikshak', 'taker'].includes(userScope.role)) {
              if (userScope.mandalIds?.length > 0) regQuery = regQuery.in('members.mandal_id', userScope.mandalIds);
              else { if (isMounted) { setRawRegs([]); setPresentSet(new Set()); setLoading(false); } return; }
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
        console.error("Summary Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (isVisible && event?.id) loadInitialData();
    return () => { isMounted = false; };
  }, [event?.id, isVisible, project.id, userScope]);

  useEffect(() => {
    if (!rawRegs) return;
    const groups = {};
    const absents = [];
    let totalReg = 0, totalPres = 0;

    rawRegs.forEach(r => {
      const m = r.members;
      let groupName = groupBy === 'mandal' ? m.mandals?.name || 'Unknown' : m.mandals?.kshetras?.name || 'Unknown';
      let groupId = groupBy === 'mandal' ? m.mandals?.id : m.mandals?.kshetra_id;
      
      if (!groups[groupName]) groups[groupName] = { id: groupId, name: groupName, registered: 0, present: 0 };
      groups[groupName].registered++;
      totalReg++;

      if (presentSet.has(r.member_id)) {
        groups[groupName].present++;
        totalPres++;
      } else {
        absents.push({ name: `${m.name} ${m.surname}`, mobile: m.mobile || '-', mandal: m.mandals?.name || '-', kshetra: m.mandals?.kshetras?.name || '-', id: m.internal_code || '-' });
      }
    });

    setData(Object.values(groups).sort((a, b) => b.present - a.present));
    setAbsentList(absents.sort((a, b) => a.name.localeCompare(b.name)));
    setTotals({ present: totalPres, registered: totalReg });
  }, [rawRegs, presentSet, groupBy]);

  const getPct = (curr, total) => total > 0 ? Math.round((curr / total) * 100) : 0;

  // ============================================================================
  // 🚀 BULLETPROOF PDF EXPORT ENGINE (jsPDF AutoTable)
  // ============================================================================
  const createBasePDF = (title, subtitle) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(92, 48, 48); 
    doc.text(title, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 28);
    return doc;
  };

  const exportAdminMasterReport = () => {
    setShowExportMenu(false);
    const loadingToast = toast.loading("Generating PDF...");
    
    // 🛡️ THE FIX: Use a timeout callback instead of async/await to preserve the data context
    setTimeout(() => {
      try {
        const doc = createBasePDF(`${event.name} - Master Report`, `Generated: ${new Date().toLocaleString()}`);
        
        let grandTotalReg = 0;
        let grandTotalPres = 0;
        const kshetraSummary = {}; 
        const kshetraAbsentees = {}; 
        
        rawRegs.forEach(r => {
          const m = r.members;
          const kName = m.mandals?.kshetras?.name || 'Unknown Kshetra';
          const mName = m.mandals?.name || 'Unknown Mandal';
          const isPres = presentSet.has(r.member_id);

          if (!kshetraSummary[kName]) {
            kshetraSummary[kName] = { present: 0, reg: 0 };
            kshetraAbsentees[kName] = [];
          }

          kshetraSummary[kName].reg++;
          if (isPres) {
            kshetraSummary[kName].present++;
          } else {
            kshetraAbsentees[kName].push({ name: `${m.name} ${m.surname}`, mobile: m.mobile || '-', mandal: mName });
          }
        });

        // Generate Rows and accumulate Totals
        const summaryRows = Object.keys(kshetraSummary).sort().map(kName => {
          const d = kshetraSummary[kName];
          grandTotalReg += d.reg;
          grandTotalPres += d.present;
          return [kName, d.reg.toString(), d.present.toString(), `${getPct(d.present, d.reg)}%`];
        });

        // 🛡️ NEW FEATURE: Add the Total Row at the bottom
        autoTable(doc, {
          startY: 35,
          head: [['Kshetra Name', 'Registered', 'Present', 'Attendance %']],
          body: summaryRows,
          foot: [['TOTAL', grandTotalReg.toString(), grandTotalPres.toString(), `${getPct(grandTotalPres, grandTotalReg)}%`]],
          theme: 'grid',
          headStyles: { fillColor: [92, 48, 48], textColor: 255, fontSize: 10 },
          footStyles: { fillColor: [240, 240, 240], textColor: [92, 48, 48], fontSize: 10, fontStyle: 'bold' },
          bodyStyles: { fontSize: 9 },
        });

        // Generate Absentee Tables (One per Kshetra)
        Object.keys(kshetraAbsentees).sort().forEach(kName => {
          const absentees = kshetraAbsentees[kName];
          
          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 15,
            head: [[`${kName} - Absent Members (${absentees.length})`, 'Mobile Number', 'Mandal']],
            body: absentees.length > 0 
                  ? absentees.sort((a,b) => a.name.localeCompare(b.name)).map(p => [p.name, p.mobile, p.mandal])
                  : [['No absentees in this Kshetra.', '-', '-']],
            theme: 'grid',
            headStyles: { fillColor: [240, 240, 240], textColor: [92, 48, 48], fontSize: 10, fontStyle: 'bold' },
            bodyStyles: { fontSize: 9 },
          });
        });

        doc.save(`Master_Report_${event.name.replace(/\s+/g, '_')}.pdf`);
        toast.success("PDF Downloaded!", { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error("Failed to generate PDF.", { id: loadingToast });
      }
    }, 50); // 50ms delay allows the loading spinner to appear before locking the thread
  };

  const exportPDFSummary = () => {
    setShowExportMenu(false);
    const loadingToast = toast.loading("Generating PDF...");
    
    setTimeout(() => {
      try {
        const doc = createBasePDF(`${event.name} - View Summary`, `Total: ${totals.present} / ${totals.registered} (${getPct(totals.present, totals.registered)}%)`);
        
        const tableRows = data.map(row => [
          row.name, 
          `${row.present} / ${row.registered}`, 
          `${getPct(row.present, row.registered)}%`
        ]);

        autoTable(doc, {
          startY: 35,
          head: [[groupBy === 'mandal' ? 'Mandal' : 'Kshetra', 'Present / Reg', 'Percentage']],
          body: tableRows,
          theme: 'grid',
          headStyles: { fillColor: [92, 48, 48], textColor: 255, fontSize: 10 },
        });

        doc.save(`Summary_${event.name.replace(/\s+/g, '_')}.pdf`);
        toast.success("PDF Downloaded!", { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error("Failed to generate PDF.", { id: loadingToast });
      }
    }, 50);
  };

  const exportPDFAbsent = () => {
    setShowExportMenu(false);
    if (absentList.length === 0) {
      toast.success("Everyone is present!");
      return;
    }

    const loadingToast = toast.loading("Generating PDF...");
    
    setTimeout(() => {
      try {
        const doc = createBasePDF(`${event.name} - Absent List`, `Total Absent: ${absentList.length}`);
        
        const head = userScope.isGlobal 
          ? [['Name', 'Internal ID', 'Mobile', 'Mandal', 'Kshetra']] 
          : [['Name', 'Internal ID', 'Mobile', 'Mandal']];

        const body = absentList.map(row => {
          const rowData = [row.name, row.id, row.mobile, row.mandal];
          if (userScope.isGlobal) rowData.push(row.kshetra);
          return rowData;
        });

        autoTable(doc, {
          startY: 35,
          head: head,
          body: body,
          theme: 'grid',
          headStyles: { fillColor: [92, 48, 48], textColor: 255, fontSize: 10 },
        });

        doc.save(`Absent_${event.name.replace(/\s+/g, '_')}.pdf`);
        toast.success("PDF Downloaded!", { id: loadingToast });
      } catch (err) {
        console.error(err);
        toast.error("Failed to generate PDF.", { id: loadingToast });
      }
    }, 50);
  };

  const exportExcel = () => {
    setShowExportMenu(false);
    const loadingToast = toast.loading("Generating CSV...");
    setTimeout(() => {
      try {
        const cleanData = rawRegs.map(r => {
          const m = r.members;
          const obj = {
            ID: m.internal_code || '-',
            Name: `${m.name} ${m.surname}`,
            Mobile: m.mobile || '-',
            Mandal: m.mandals?.name || '-',
            Status: presentSet.has(r.member_id) ? 'Present' : 'Absent'
          };
          if (userScope.isGlobal) obj.Kshetra = m.mandals?.kshetras?.name || '-';
          return obj;
        });

        if (cleanData.length === 0) throw new Error("No data to export");

        const headers = Object.keys(cleanData[0]);
        const csvRows = cleanData.map(row => headers.map(h => `"${row[h]}"`).join(','));
        const csvContent = "\uFEFF" + [headers.join(','), ...csvRows].join('\n'); 
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `Attendance_${event.name.replace(/\s+/g, '_')}.csv`);
        toast.success("CSV Downloaded!", { id: loadingToast });
      } catch (err) {
        toast.error(err.message, { id: loadingToast });
      }
    }, 50);
  };

  if (!isVisible) return null;

  return (
    <Modal isOpen={isVisible} onClose={onClose} title="Attendance Summary">
      <div className="space-y-5">
        
        <div className="flex justify-end relative">
          <Button variant="secondary" size="sm" icon={Download} onClick={() => setShowExportMenu(!showExportMenu)}>
            Export Reports
          </Button>

          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-10 w-56 bg-white rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                {userScope.isGlobal && (
                  <div className="mb-1 pb-1 border-b border-gray-100">
                    <button onClick={exportAdminMasterReport} className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-md text-sm flex items-center gap-2 text-gray-900 font-semibold transition-colors">
                      <Shield size={14} className="text-[#5C3030]"/> Master Report (PDF)
                    </button>
                  </div>
                )}
                <button onClick={exportPDFSummary} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md text-sm flex items-center gap-2 text-gray-700 transition-colors">
                  <FileText size={14} className="text-gray-400"/> Current Summary (PDF)
                </button>
                <button onClick={exportPDFAbsent} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md text-sm flex items-center gap-2 text-gray-700 transition-colors">
                  <UserX size={14} className="text-gray-400"/> Absent List (PDF)
                </button>
                <button onClick={exportExcel} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-md text-sm flex items-center gap-2 text-gray-700 transition-colors">
                  <FileSpreadsheet size={14} className="text-gray-400"/> Raw Excel (.csv)
                </button>
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={20}/> Calculating...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#5C3030] text-white p-4 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] text-center">
                <div className="text-3xl font-bold font-inter">{totals.present}</div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80 mt-0.5">Present</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 text-gray-900 p-4 rounded-md text-center">
                <div className="text-3xl font-bold font-inter">{totals.registered}</div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mt-0.5">Registered</div>
              </div>
            </div>

            {userScope.isGlobal && (
              <div className="flex bg-gray-100 p-1 rounded-md border border-gray-200">
                <button onClick={() => setGroupBy('mandal')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${groupBy === 'mandal' ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' : 'text-gray-500 hover:text-gray-700'}`}>
                  <MapPin size={14} strokeWidth={1.5}/> Mandal
                </button>
                <button onClick={() => setGroupBy('kshetra')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${groupBy === 'kshetra' ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Layers size={14} strokeWidth={1.5}/> Kshetra
                </button>
              </div>
            )}

            <div className="border border-gray-200 rounded-md overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)] max-h-60 overflow-y-auto">
              <table className="w-full text-left text-sm relative">
                <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-widest sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-3 py-2.5">{groupBy === 'mandal' ? 'Mandal' : 'Kshetra'}</th>
                    <th className="px-3 py-2.5 text-center">Count</th>
                    <th className="px-3 py-2.5 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {data.length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-gray-400 text-sm">No data found.</td></tr>
                  ) : data.map(row => (
                    <tr 
                      key={row.name} 
                      onClick={() => { if(groupBy === 'mandal') { onMandalClick(row.id, row.name); onClose(); } }} 
                      className={`${groupBy === 'mandal' ? 'hover:bg-gray-50 cursor-pointer' : ''} transition-colors`}
                    >
                      <td className="px-3 py-2.5 font-medium flex items-center gap-1.5 text-gray-900">
                        {row.name} {groupBy === 'mandal' && <ChevronRight size={14} className="text-gray-300"/>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-inter text-gray-600">
                        <span className="text-emerald-700 font-bold">{row.present}</span> / {row.registered}
                      </td>
                      <td className="px-3 py-2.5 text-right font-inter font-semibold text-gray-900">{getPct(row.present, row.registered)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}