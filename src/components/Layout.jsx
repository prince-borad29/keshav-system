import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Folder, UserCheck, Database, Tag, 
  LogOut, Menu, X, User, ShieldCheck, Shield 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext'; 

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { profile } = useAuth(); // Profile now has name/surname directly!
  const location = useLocation();
  const navigate = useNavigate();

  // --- 1. DEFINE MENU BASED ON ROLES ---
  const navItems = [
    { name: 'Overview', icon: <Home size={20} />, path: '/', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak', 'taker', 'viewer'] },
    { name: 'Projects', icon: <Folder size={20} />, path: '/projects', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'] },
    { name: 'Registration', icon: <UserCheck size={20} />, path: '/registration', roles: ['admin', 'nirdeshak', 'sanchalak' , 'nirikshak'] },
    { name: 'Database', icon: <Database size={20} />, path: '/database', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'] },
    { name: 'Admin Console', icon: <Shield size={20} />, path: '/admin', roles: ['admin'] },
    { name: 'Manage QR', icon: <Shield size={20} />, path: '/manage-qr', roles: ['admin'] },
    { name: 'Tags', icon: <Tag size={20} />, path: '/tags', roles: ['admin'] },
  ];

  // Filter items the current user is allowed to see
  const visibleNavItems = navItems.filter(item => item.roles.includes(profile?.role));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* MOBILE OVERLAY */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out z-50 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          
          {/* PROFILE HEADER (Top) */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-4">
              {/* Avatar Box */}
              <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 font-bold text-lg shrink-0">
                {profile?.name ? profile.name[0].toUpperCase() : <User size={20}/>}
              </div>
              
              {/* Name & Role Text */}
              <div className="overflow-hidden">
                <h3 className="text-sm font-bold text-slate-800 truncate">
                  {profile?.name ? `${profile.name} ${profile.surname || ''}` : 'Keshav User'}
                </h3>
                <p className="text-xs font-medium text-slate-400 capitalize truncate">
                  {profile?.role || 'Viewer'}
                </p>
              </div>

              {/* Mobile Close */}
              <button className="lg:hidden ml-auto text-slate-400" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            {/* Optional Gender Badge */}
            {profile?.gender && (
               <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 text-[10px] font-bold text-slate-400 border border-slate-100">
                  <ShieldCheck size={10} className="text-green-500" /> {profile.gender} Wing
               </div>
            )}
          </div>

          {/* NAVIGATION */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group 
                    ${isActive 
                      ? 'bg-slate-100 text-slate-900 font-bold' 
                      : 'text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-900'
                    }`}
                >
                  <span className={`${isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {item.icon}
                  </span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* LOGOUT */}
          <div className="p-6 mt-auto border-t border-gray-50">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-2 rounded-lg transition-colors font-medium text-sm w-full"
            >
              <LogOut size={20} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        
        {/* MOBILE TOP BAR */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-lg">
               <Menu size={24} />
             </button>
             <h1 className="font-bold text-slate-800">Keshav App</h1>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-auto relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
}