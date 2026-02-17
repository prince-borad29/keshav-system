import React, { useState } from 'react';
import { Map, Tag, Settings, Users } from 'lucide-react';
import TagManager from './TagManager';

export default function SettingsDashboard() {

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 p-4 animate-in fade-in">
      
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-indigo-600"/> Settings & Master Data
        </h1>
        <p className="text-slate-500 text-sm">Manage the core structure of your organization.</p>
      </div>

      {/* CONTENT */}
      <div className="mt-6">
         <TagManager />
      </div>
    </div>
  );
}