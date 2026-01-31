import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Folder, UserCheck, Database, Tag, 
  LogOut, Menu, X, User, ShieldCheck, MapPin, Shield // ✅ Added Shield
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext'; // ✅ Import Auth Hook

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { profile, isAdmin, canEdit } = useAuth(); // ✅ Get role permissions
  const location = useLocation();
  const navigate = useNavigate();

  // --- 1. DEFINE MENU BASED ON ROLES ---
  const navItems = [
  { name: 'Overview', icon: <Home size={20} />, path: '/', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak', 'taker', 'viewer'] },
  { name: 'Projects', icon: <Folder size={20} />, path: '/projects', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'] },
  { name: 'Registration', icon: <UserCheck size={20} />, path: '/registration', roles: ['admin', 'nirdeshak', 'sanchalak'] },
  { name: 'Database', icon: <Database size={20} />, path: '/database', roles: ['admin', 'nirdeshak', 'nirikshak', 'sanchalak'] },
  { name: 'Admin Console', icon: <Shield size={20} />, path: '/admin', roles: ['admin'] }, // ✅ New Item
  { name: 'Tags', icon: <Tag size={20} />, path: '/tags', roles: ['admin'] },
];

  // Filter items the current user is allowed to see
  const visibleNavItems = navItems.filter(item => item.roles.includes(profile?.role));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* MOBILE OVERLAY */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-64 bg-[#002B3D] text-white transform transition-transform duration-300 ease-in-out z-50 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          
          {/* LOGO AREA */}
          <div className="p-6 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-sky-400">Keshav App</h1>
            <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}><X size={24} /></button>
          </div>

          {/* USER PROFILE BOX */}
          <div className="px-6 mb-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-sky-500/20 rounded-lg text-sky-400">
                  <User size={20} />
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Logged in as</p>
                  <p className="text-sm font-bold truncate capitalize">{profile?.role}</p>
                </div>
              </div>
              
              {profile?.gender && (
                <div className="flex items-center gap-2 text-[10px] text-white/60 font-medium">
                  <ShieldCheck size={12} className="text-green-400" /> {profile.gender} Department
                </div>
              )}
            </div>
          </div>

          {/* NAVIGATION */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <span className={`${isActive ? 'text-white' : 'text-slate-500 group-hover:text-sky-400'}`}>
                    {item.icon}
                  </span>
                  <span className="font-bold text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* LOGOUT */}
          <div className="p-4 mt-auto">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors font-bold text-sm"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* MOBILE TOP BAR */}
        <header className="lg:hidden bg-white border-b p-4 flex items-center justify-between shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-[#002B3D]"><Menu size={24} /></button>
          <h2 className="font-bold text-[#002B3D]">Keshav Mandal</h2>
          <div className="w-10"></div> {/* Spacer */}
        </header>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-hidden relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
}