import React from 'react';
import IDCardGenerator from './IDCardGenerator';
import { BarChart3 } from 'lucide-react';

export default function ReportsDashboard() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in">
      
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports & Exports</h1>
        <p className="text-slate-500 text-sm">Generate ID cards and download attendance data.</p>
      </div>

      {/* MODULE 1: ID CARDS */}
      <IDCardGenerator />

      {/* MODULE 2: DATA EXPORTS (Placeholder / Simple Implementation) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm opacity-60 pointer-events-none">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-indigo-600"/> Data Exports (Coming Soon)
        </h2>
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">
          CSV Exports for Attendance Logs will be available here.
        </div>
      </div>

    </div>
  );
}