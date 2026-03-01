import React from 'react';
import IDCardGenerator from './IDCardGenerator';
import { BarChart3 } from 'lucide-react';

export default function ReportsDashboard() {
  return (
    <div className="space-y-6 pb-10">
      
      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports & Exports</h1>
        <p className="text-xs text-gray-500 mt-1">Generate ID cards and download system data.</p>
      </div>

      {/* MODULE 1: ID CARDS */}
      <IDCardGenerator />

      {/* MODULE 2: DATA EXPORTS (Coming Soon State) */}
      <div className="bg-white p-5 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] opacity-70 pointer-events-none">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-[#5C3030]" strokeWidth={1.5} /> Data Exports
        </h2>
        <div className="p-8 text-center bg-gray-50 rounded-md border border-dashed border-gray-300 text-gray-400 text-sm font-medium">
          CSV Exports for Attendance Logs will be available here.
        </div>
      </div>

    </div>
  );
}