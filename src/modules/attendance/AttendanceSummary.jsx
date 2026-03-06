import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ChevronRight, BarChart3, Download, FileText, FileSpreadsheet, UserX, Layers, MapPin, Shield } from 'lucide-react';
import { saveAs } from 'file-saver'; 
import toast from 'react-hot-toast'; 
import Modal from '../../components/Modal';
import Button from '../../components/ui/Button';

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

  // --- 🚀 UPGRADED MOBILE-PROOF EXPORT ENGINE ---
  const generatePDF = (title, subtitle, bodyHtml) => {
    const loadingToast = toast.loading("Generating PDF...");
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.write('<html><head><title>Attendance Report</title>');
      doc.write(`
        <style>
          /* 🛡️ FORCE BROWSER TO PRINT BACKGROUND COLORS */
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 20px; 
            background-color: #ffffff;
            color: #000000; 
          }
          h2 { color: #5C3030; margin-bottom: 5px; font-size: 20px; }
          p { color: #6b7280; font-size: 12px; margin-top: 0; margin-bottom: 20px; border-bottom: 2px solid #5C3030; padding-bottom: 10px; }
          table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 20px; }
          th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
          
          /* 🛡️ Strict Header Colors */
          th { 
            background-color: #5C3030 !important; 
            color: #ffffff !important; 
            font-weight: bold; 
            text-transform: uppercase; 
            letter-spacing: 0.05em; 
            font-size: 10px; 
          }
          
          /* 🛡️ Strict Row Colors (White bg, Black text) */
          td {
            background-color: #ffffff !important;
            color: #000000 !important;
          }

          /* Grouping Headers */
          .kshetra-head { 
            background-color: #ffffff !important; 
            color: #000000 !important; 
            padding: 10px; 
            font-weight: bold; 
            margin-top: 25px; 
            margin-bottom: 10px; 
            border-left: 4px solid #5C3030; 
            font-size: 14px; 
            border-top: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            border-bottom: 1px solid #e5e7eb;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
        </style>
      `);
      doc.write('</head><body>');
      doc.write(`<h2>${title}</h2>`);
      doc.write(`<p>${subtitle}</p>`);
      doc.write(bodyHtml);
      doc.write('</body></html>');
      doc.close();
      
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        toast.success("PDF opened successfully!", { id: loadingToast });
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
    } catch (err) {
      toast.error("Failed to generate PDF.", { id: loadingToast });
    }
  };

  const exportAdminMasterReport = () => {
    setShowExportMenu(false);
    
    // 🛡️ Data Structures for Master Report
    const kshetraSummary = {}; // High level totals
    const kshetraAbsentees = {}; // Grouped list of absent people
    
    rawRegs.forEach(r => {
      const m = r.members;
      const kName = m.mandals?.kshetras?.name || 'Unknown Kshetra';
      const mName = m.mandals?.name || 'Unknown Mandal';
      const isPres = presentSet.has(r.member_id);

      // Initialize Summary
      if (!kshetraSummary[kName]) {
        kshetraSummary[kName] = { present: 0, reg: 0 };
        kshetraAbsentees[kName] = [];
      }

      // Update Summary Totals
      kshetraSummary[kName].reg++;
      if (isPres) {
        kshetraSummary[kName].present++;
      } else {
        // Add to absentee list for this Kshetra
        kshetraAbsentees[kName].push({
          name: `${m.name} ${m.surname}`,
          mobile: m.mobile || '-',
          mandal: mName
        });
      }
    });

    // 🛡️ GENERATE HTML BODY
    let html = '';

    // --- PART 1: OVERALL KSHETRA SUMMARY TABLE ---
    html += `<div class="kshetra-head" style="margin-top:0;">Overall Kshetra Summary</div>`;
    html += `
      <table>
        <thead>
          <tr>
            <th>Kshetra Name</th>
            <th class="text-center">Registered</th>
            <th class="text-center">Present</th>
            <th class="text-right">Attendance %</th>
          </tr>
        </thead>
        <tbody>
    `;

    Object.keys(kshetraSummary).sort().forEach(kName => {
      const data = kshetraSummary[kName];
      const pct = getPct(data.present, data.reg);
      html += `
        <tr>
          <td class="font-bold">${kName}</td>
          <td class="text-center">${data.reg}</td>
          <td class="text-center">${data.present}</td>
          <td class="text-right font-bold" style="color: ${pct < 50 ? '#dc2626' : '#059669'}">${pct}%</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;

    // Space between sections
    html += `<div style="height: 30px;"></div>`;

    // --- PART 2: KSHETRA-WISE ABSENTEE LISTS ---
    html += `<h2 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Detailed Absentee Lists</h2>`;
    
    Object.keys(kshetraAbsentees).sort().forEach(kName => {
      const absentees = kshetraAbsentees[kName];
      
      html += `<div class="kshetra-head">${kName} - Absent Members (${absentees.length})</div>`;
      
      if (absentees.length === 0) {
        html += `<p style="font-style: italic; color: #6b7280; padding: 10px;">No absentees in this Kshetra.</p>`;
      } else {
        html += `
          <table>
            <thead>
              <tr>
                <th style="width: 40%;">Member Name</th>
                <th style="width: 30%;">Mobile Number</th>
                <th style="width: 30%;">Mandal</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        // Sort absentees by name A-Z
        absentees.sort((a, b) => a.name.localeCompare(b.name)).forEach(person => {
          html += `
            <tr>
              <td class="font-bold">${person.name}</td>
              <td>${person.mobile}</td>
              <td>${person.mandal}</td>
            </tr>
          `;
        });
        
        html += `</tbody></table>`;
      }
    });

    // 🛡️ TRIGGER THE MOBILE-PROOF PRINT ENGINE
    generatePDF(
      `${event.name} - Master Absentee Report`,
      `${project.name} &bull; Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      html
    );
  };

  const exportPDFSummary = () => {
    setShowExportMenu(false);
    let html = `<table><thead><tr><th>${groupBy === 'mandal' ? 'Mandal' : 'Kshetra'}</th><th class="text-center">Present / Reg</th><th class="text-right">Percentage</th></tr></thead><tbody>`;
    data.forEach(row => {
      html += `<tr><td class="font-bold">${row.name}</td><td class="text-center">${row.present} / ${row.registered}</td><td class="text-right">${getPct(row.present, row.registered)}%</td></tr>`;
    });
    html += `</tbody></table>`;

    generatePDF(
      `${event.name} - View Summary`,
      `${project.name} &bull; Total: ${totals.present} / ${totals.registered} (${getPct(totals.present, totals.registered)}%)`,
      html
    );
  };

  const exportPDFAbsent = () => {
    setShowExportMenu(false);
    if (absentList.length === 0) {
      toast.success("Everyone is present!");
      return;
    }

    let html = `<table><thead><tr><th>Name</th><th>Internal ID</th><th>Mobile</th><th>Mandal</th>${userScope.isGlobal ? '<th>Kshetra</th>' : ''}</tr></thead><tbody>`;
    absentList.forEach(row => {
      html += `<tr><td class="font-bold">${row.name}</td><td>${row.id}</td><td>${row.mobile}</td><td>${row.mandal}</td>${userScope.isGlobal ? `<td>${row.kshetra}</td>` : ''}</tr>`;
    });
    html += `</tbody></table>`;

    generatePDF(
      `${event.name} - Absent List`,
      `${project.name} &bull; Total Absent: ${absentList.length}`,
      html
    );
  };

  const exportExcel = () => {
    setShowExportMenu(false);
    const loadingToast = toast.loading("Generating CSV...");
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
  };

  if (!isVisible) return null;

  return (
    <Modal isOpen={isVisible} onClose={onClose} title="Attendance Summary">
      <div className="space-y-5">
        
        {/* Custom Export Trigger inside Modal Body */}
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
            {/* Flat Stats Grid */}
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

            {/* Radix Toggle */}
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

            {/* Dense Data Table */}
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