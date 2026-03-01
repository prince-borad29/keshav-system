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
    if (path.includes('organization')) return 'Organization';
    if (path.includes('directory')) return 'Directory';
    if (path.includes('projects')) return 'Projects & Events';
    if (path.includes('registration')) return 'Registration';
    if (path.includes('reports')) return 'Reports';
    if (path.includes('settings')) return 'Settings';
    return 'Keshav Portal';
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sora text-gray-900 selection:bg-[#5C3030]/20">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 transition-all duration-300">
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <h1 className="text-base font-semibold text-gray-900">{getPageTitle()}</h1>
          </div>
        </header>

        {/* Core Layout Constraints Applied Here */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden pt-safe pb-safe">
          <div className="w-full max-w-[1000px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}