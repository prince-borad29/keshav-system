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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Organization</h1>
        <p className="text-gray-500 text-sm font-medium mt-1">Manage hierarchy and system access controls.</p>
      </div>

      {/* Flat Radix Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-md border border-gray-200 w-fit">
        <button 
          onClick={() => setActiveTab('structure')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'structure' 
              ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid size={16} strokeWidth={1.5} /> Hierarchy
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
            activeTab === 'users' 
              ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={16} strokeWidth={1.5} /> User Roles
        </button>
      </div>

      {/* Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
        {activeTab === 'structure' ? <StructureManager /> : <UserManager />}
      </div>
    </div>
  );
}