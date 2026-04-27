import React from 'react';
import { Settings } from 'lucide-react';
import TagManager from './TagManager';
import AbsenceCategoryManager from './AbsenceCategoryManager';

export default function SettingsDashboard() {
  return (
    <div className="space-y-6 pb-10">
      
      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="text-[#5C3030]" size={20} strokeWidth={2}/> System Settings
        </h1>
        <p className="text-xs text-gray-500 mt-1">Manage global master data and tags.</p>
      </div>

      {/* CONTENT */}
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <AbsenceCategoryManager />
        </div>
        
        <div className="bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <TagManager />
        </div>
      </div>
      
    </div>
  );
}