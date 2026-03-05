import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import IDCardGenerator from './IDCardGenerator';
import { BarChart3, Loader2, Folder, Filter, FileText } from 'lucide-react';
import { supabase, withTimeout } from '../../lib/supabase'; // 🛡️ Imported withTimeout
import toast from 'react-hot-toast'; // 🛡️ Imported toast
import Button from '../../components/ui/Button';

export default function ReportsDashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [reportConfig, setReportConfig] = useState({ gender: '', grouping: 'none' });
  const [generating, setGenerating] = useState(false);

  // 1. Fetch Projects for the dropdown
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['report-projects'],
    queryFn: async () => {
      const { data, error } = await withTimeout(supabase.from('projects').select('id, name').order('created_at', { ascending: false }));
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10
  });

  // 2. The Engine: Generate and Group the PDF
  const handleGenerateProjectReport = async () => {
    if (!selectedProjectId) {
      toast.error("Please select a project first.");
      return;
    }
    
    setGenerating(true);
    const loadingToast = toast.loading("Crunching attendance data...");

    try {
      // Step A: Get all events for the selected project to know the total possible attendance
      const { data: events, error: eventError } = await withTimeout(
        supabase.from('events').select('id, name').eq('project_id', selectedProjectId)
      );
      if (eventError) throw eventError;
      
      const totalEvents = events?.length || 0;
      const eventIds = events?.map(e => e.id) || [];

      // Step B: Get all registered members for this project
      let memQuery = supabase.from('project_registrations').select(`
        member_id,
        members!inner(id, name, surname, mobile, gender, designation, mandals(name), member_tags(tags(name)))
      `).eq('project_id', selectedProjectId);
      
      if (reportConfig.gender) {
        memQuery = memQuery.eq('members.gender', reportConfig.gender);
      }

      const { data: registrations, error: regError } = await withTimeout(memQuery);
      if (regError) throw regError;

      if (!registrations || registrations.length === 0) {
        throw new Error("No members found matching this criteria.");
      }

      // Step C: Fetch actual attendance records (Only for this project's events)
      let attCounts = {};
      if (eventIds.length > 0) {
        const { data: attendance, error: attError } = await withTimeout(
          supabase.from('attendance').select('member_id').in('event_id', eventIds)
        );
        if (attError) throw attError;

        attendance.forEach(a => {
          attCounts[a.member_id] = (attCounts[a.member_id] || 0) + 1;
        });
      }

      // Step D: Calculate math and format rows
      const reportData = registrations.map(r => {
        const m = r.members;
        const present = attCounts[m.id] || 0;
        const percentage = totalEvents > 0 ? Math.round((present / totalEvents) * 100) : 0;
        
        // Safely extract tags
        const tagList = m.member_tags?.map(mt => mt.tags?.name).filter(Boolean).join(', ') || 'Untagged';

        return {
          name: `${m.name} ${m.surname}`,
          mobile: m.mobile || '-',
          mandal: m.mandals?.name || '-',
          designation: m.designation || 'Member',
          gender: m.gender,
          tags: tagList,
          present,
          totalEvents,
          percentage
        };
      });

      // Step E: Grouping Engine
      const groupedData = {};
      reportData.forEach(row => {
        let key = 'All Members';
        
        if (reportConfig.grouping === 'percentage') {
          if (row.percentage === 100) key = '100% Attendance';
          else if (row.percentage >= 75) key = '75% - 99% Attendance';
          else if (row.percentage >= 50) key = '50% - 74% Attendance';
          else key = 'Below 50% Attendance';
        } else if (reportConfig.grouping === 'designation') {
          key = row.designation;
        } else if (reportConfig.grouping === 'gender') {
          key = row.gender;
        } else if (reportConfig.grouping === 'tags') {
          key = row.tags; 
        }

        if (!groupedData[key]) groupedData[key] = [];
        groupedData[key].push(row);
      });

      // Step F: Generate Native Print-to-PDF HTML
      const projName = projects.find(p => p.id === selectedProjectId)?.name || 'Project';
      
      const printWindow = window.open('', '', 'height=800,width=1000');
      printWindow.document.write('<html><head><title>Attendance Report</title>');
      printWindow.document.write(`
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #111827; }
          h1 { color: #5C3030; margin-bottom: 5px; font-size: 24px; }
          .meta { color: #6b7280; font-size: 14px; margin-bottom: 30px; border-bottom: 2px solid #5C3030; padding-bottom: 10px; }
          .group-header { background-color: #f3f4f6; color: #374151; padding: 10px; font-weight: bold; margin-top: 25px; margin-bottom: 10px; border-left: 4px solid #5C3030; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 20px; }
          th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
          th { background-color: #5C3030; color: white; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
          tr:nth-child(even) { background-color: #fafafa; }
          .perc-badge { font-weight: bold; }
          .perc-100 { color: #059669; }
          .perc-high { color: #d97706; }
          .perc-low { color: #dc2626; }
        </style>
      `);
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<h1>${projName}</h1>`);
      printWindow.document.write(`<div class="meta">Comprehensive Attendance Report &bull; Generated: ${new Date().toLocaleDateString()} &bull; Total Registered: ${reportData.length}</div>`);
      
      // Render Tables by Group
      Object.keys(groupedData).sort().forEach(groupName => {
        const rows = groupedData[groupName];
        if (reportConfig.grouping !== 'none') {
          printWindow.document.write(`<div class="group-header">${groupName} (${rows.length} Members)</div>`);
        }
        
        printWindow.document.write(`
          <table>
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Mobile</th>
                <th>Mandal</th>
                <th>Designation</th>
                <th>Present</th>
                <th>Total Events</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
        `);
        
        rows.forEach(row => {
          let percClass = 'perc-low';
          if (row.percentage === 100) percClass = 'perc-100';
          else if (row.percentage >= 75) percClass = 'perc-high';

          printWindow.document.write(`
            <tr>
              <td style="font-weight: 600;">${row.name}</td>
              <td>${row.mobile}</td>
              <td>${row.mandal}</td>
              <td>${row.designation}</td>
              <td>${row.present}</td>
              <td>${row.totalEvents}</td>
              <td class="perc-badge ${percClass}">${row.percentage}%</td>
            </tr>
          `);
        });
        
        printWindow.document.write('</tbody></table>');
      });

      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      
      toast.success("Report generated successfully!", { id: loadingToast });
      
      // Auto trigger print dialog
      setTimeout(() => { printWindow.print(); }, 250);

    } catch (err) {
      toast.error(err.message, { id: loadingToast });
    } finally {
      setGenerating(false);
    }
  };

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";
  const labelClass = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5";

  return (
    <div className="space-y-6 pb-10">
      
      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports & Exports</h1>
        <p className="text-xs text-gray-500 mt-1">Generate ID cards and download system data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* MODULE 1: ID CARDS */}
        <div className="w-full">
          <IDCardGenerator />
        </div>

        {/* MODULE 2: PROJECT ATTENDANCE EXPORTS */}
        <div className="bg-white p-5 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
            <BarChart3 size={16} className="text-[#5C3030]" strokeWidth={1.5} />
            <h2 className="text-sm font-semibold text-gray-900">Project Attendance Reports</h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className={labelClass}>Select Project</label>
              <div className="relative">
                <Folder className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
                <select 
                  className={`${inputClass} pl-9`} 
                  value={selectedProjectId} 
                  onChange={e => setSelectedProjectId(e.target.value)}
                  disabled={projectsLoading}
                >
                  <option value="">Choose a project...</option>
                  {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {projectsLoading && <Loader2 className="absolute right-3 top-2.5 text-gray-400 animate-spin" size={16} />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Filter by Gender</label>
                <select className={inputClass} value={reportConfig.gender} onChange={e => setReportConfig({...reportConfig, gender: e.target.value})}>
                  <option value="">All Genders</option>
                  <option value="Yuvak">Yuvak</option>
                  <option value="Yuvati">Yuvati</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Group Data By</label>
                <div className="relative">
                  <Filter className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
                  <select className={`${inputClass} pl-9`} value={reportConfig.grouping} onChange={e => setReportConfig({...reportConfig, grouping: e.target.value})}>
                    <option value="none">No Grouping (Flat List)</option>
                    <option value="percentage">Attendance Percentage</option>
                    <option value="designation">Designation</option>
                    <option value="tags">Tags</option>
                    <option value="gender">Gender</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <Button 
                className="w-full" 
                onClick={handleGenerateProjectReport}
                disabled={generating || !selectedProjectId}
              >
                {generating ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <><FileText size={16} strokeWidth={1.5} className="mr-2" /> Generate PDF Report</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}