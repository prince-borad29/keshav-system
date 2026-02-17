import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.includes('organization')) return 'Organization Settings';
    if (path.includes('directory')) return 'Member Directory';
    if (path.includes('projects')) return 'Projects & Events';
    if (path.includes('reports')) return 'Reports & Analytics';
    return 'Keshav Portal';
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 transition-all duration-300">
        
        {/* Mobile Header */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-bold text-slate-800">{getPageTitle()}</h1>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            PK
          </div>
        </div>

        {/* Scrollable Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {/* Max-width container prevents content from stretching too wide on 4k screens */}
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}