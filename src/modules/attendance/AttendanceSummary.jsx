import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ChevronRight, BarChart3, X } from 'lucide-react';

export default function AttendanceSummary({ event, project, userScope, onMandalClick, isVisible, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({ present: 0, registered: 0 });

  useEffect(() => {
    if (isVisible) calculateStats();
  }, [event.id, isVisible]); // Removed userScope from dependency to avoid infinite loop if object ref changes

  const calculateStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch Registrations (Who should be here?)
      let regQuery = supabase
        .from('project_registrations')
        .select(`
          member_id,
          members!inner ( id, mandal_id, mandals ( id, name, kshetra_id ), gender )
        `)
        .eq('project_id', project.id);

      // --- APPLY FILTERS ---
      // Debugging: Check what scope we received
      // console.log("Scope in Summary:", userScope);

      if (!userScope.isGlobal) {
          // Gender Filter
          if (userScope.gender) {
            regQuery = regQuery.eq('members.gender', userScope.gender);
          }
          
          // Role-Based Location Filter
          if (userScope.role === 'nirdeshak' && userScope.kshetraId) {
            regQuery = regQuery.eq('members.mandals.kshetra_id', userScope.kshetraId);
          } 
          else if (['sanchalak', 'nirikshak'].includes(userScope.role)) {
            // Safety: Ensure we have IDs to filter by
            if (userScope.mandalIds && userScope.mandalIds.length > 0) {
                regQuery = regQuery.in('members.mandal_id', userScope.mandalIds);
            } else {
                console.warn("Summary: User role requires mandalIds but none provided.");
                // If it's a sanchalak with no assigned mandal, return empty.
                setData([]); setTotals({ present: 0, registered: 0 }); setLoading(false); return; 
            }
          }
      }

      const { data: regs, error: regError } = await regQuery;
      if (regError) throw regError;

      // 2. Fetch Attendance
      // We fetch ALL attendance for this event. 
      // Filtering happens in memory by intersecting with 'regs'.
      const { data: atts, error: attError } = await supabase
        .from('attendance')
        .select('member_id')
        .eq('event_id', event.id);
      
      if (attError) throw attError;

      // 3. Aggregate
      const presentSet = new Set(atts.map(a => a.member_id));
      
      const groups = {};
      let totalReg = 0, totalPres = 0;

      regs.forEach(r => {
        const mandalName = r.members?.mandals?.name || 'Unknown';
        const mandalId = r.members?.mandals?.id;
        
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
        }
      });

      const sortedData = Object.values(groups).sort((a, b) => b.present - a.present);
      setData(sortedData);
      setTotals({ present: totalPres, registered: totalReg });

    } catch (err) {
      console.error("Summary Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getPct = (curr, total) => total > 0 ? Math.round((curr / total) * 100) : 0;

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600"/> Attendance Summary
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
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
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[10px] uppercase">
                        <tr><th className="p-3">Mandal</th><th className="p-3 text-center">Count</th><th className="p-3 text-right">%</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.map(row => (
                          <tr key={row.name} onClick={() => { onMandalClick(row.id, row.name); onClose(); }} className="hover:bg-indigo-50 cursor-pointer transition-colors">
                            <td className="p-3 font-medium flex items-center gap-1">{row.name} <ChevronRight size={14} className="text-slate-300"/></td>
                            <td className="p-3 text-center"><span className="text-green-600 font-bold">{row.present}</span> / {row.registered}</td>
                            <td className="p-3 text-right font-mono">{getPct(row.present, row.registered)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}