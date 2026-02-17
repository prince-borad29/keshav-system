import React, { useState } from 'react';
import { LayoutGrid, Users } from 'lucide-react';
import StructureManager from './StructureManager';
import UserManager from './UserManager';

export default function Organization() {
  const [activeTab, setActiveTab] = useState('structure');

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Organization Settings</h1>
        <p className="text-slate-500 text-sm font-medium">Manage hierarchy and user access controls</p>
      </div>

      {/* Tabs */}
      <div className="bg-white p-1.5 rounded-xl border border-slate-200 inline-flex shadow-sm overflow-x-auto max-w-full">
        <button 
          onClick={() => setActiveTab('structure')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'structure' 
              ? 'bg-slate-800 text-white shadow-md' 
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <LayoutGrid size={16} /> Hierarchy
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'users' 
              ? 'bg-slate-800 text-white shadow-md' 
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <Users size={16} /> User Roles
        </button>
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'structure' ? <StructureManager /> : <UserManager />}
      </div>
    </div>
  );
}