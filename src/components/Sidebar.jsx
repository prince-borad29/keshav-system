import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, FileText, 
  Settings, LogOut, Shield, X, Layers, ClipboardList 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function Sidebar({ isOpen, onClose }) {
  const { profile } = useAuth();
  
  // Clean role definitions for the new architecture
  const role = profile?.role;
  const isAdmin = role === 'admin';
  const isRegional = ['nirdeshak', 'nirikshak', 'sanchalak'].includes(role);
  const isProjectOnly = ['project_admin', 'taker'].includes(role);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('sb-bdtjcwvmefjieauhnmdi-auth-token');
    window.location.href = '/login';
  };

  const NavItem = ({ to, icon: Icon, label, onClick }) => (
    <NavLink 
      to={to} 
      onClick={onClick}
      className={({ isActive }) => 
        `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-sm ${
          isActive 
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-bold' 
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-slate-900/50 z-40 transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sidebar - Fixed 'lg:translate-x-0' ensures it shows on desktop */}
      <div className={`fixed top-0 left-0 h-full w-72 bg-white border-r border-slate-100 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl lg:shadow-none lg:w-64 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Header */}
        <div className="p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-indigo-600 tracking-tight">Project Keshav</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              {isAdmin ? 'Global Admin' : role?.replace('_', ' ') || 'Portal'}
            </p>
          </div>
          {/* Close Button (Mobile Only) */}
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-lg text-slate-500 lg:hidden hover:bg-red-50 hover:text-red-500">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-4">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" onClick={onClose} />
          
          {/* ADMIN VIEW */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Management</div>
              <NavItem to="/organization" icon={Shield} label="Organization" onClick={onClose} />
              <NavItem to="/directory" icon={Users} label="Database" onClick={onClose} />
              
              <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modules</div>
              <NavItem to="/projects" icon={Layers} label="Projects & Events" onClick={onClose} />
              <NavItem to="/registration" icon={ClipboardList} label="Registration" onClick={onClose} />
              <NavItem to="/reports" icon={FileText} label="Reports" onClick={onClose} />
              <NavItem to="/settings" icon={Settings} label="Settings" onClick={onClose} />
            </>
          )}

          {/* REGIONAL MANAGERS VIEW (Sanchalak, Nirdeshak, Nirikshak) */}
          {isRegional && (
            <>
              <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operational</div>
              <NavItem to="/directory" icon={Users} label="My Mandal" onClick={onClose} />
              <NavItem to="/projects" icon={Calendar} label="Projects & Events" onClick={onClose} />
              <NavItem to="/registration" icon={ClipboardList} label="Registration" onClick={onClose} />
            </>
          )}

          {/* PROJECT STAFF VIEW (Project Admin, Taker) */}
          {isProjectOnly && (
            <>
              <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">My Assignments</div>
              <NavItem to="/projects" icon={Calendar} label="My Projects" onClick={onClose} />
              {/* project_admin gets Registration, taker does NOT */}
              {role === 'project_admin' && (
                <NavItem to="/registration" icon={ClipboardList} label="Registration" onClick={onClose} />
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-indigo-600 font-bold shadow-sm text-sm uppercase">
              {profile?.full_name?.[0] || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-slate-500 capitalize">{role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all text-xs font-bold shadow-sm cursor-pointer"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </>
  );
}