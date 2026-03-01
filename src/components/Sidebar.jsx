import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, FileText, 
  Settings, LogOut, Shield, X, Layers, ClipboardList, Database, 
  Folder,
  FilePlus,
  QrCode,
  Tags
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function Sidebar({ isOpen, onClose }) {
  const { profile } = useAuth();
  
  const role = profile?.role;
  const isAdmin = role === 'admin';
  const isRegional = ['nirdeshak', 'nirikshak', 'sanchalak'].includes(role);
  const isProjectOnly = ['project_admin', 'taker'].includes(role);

  const [isCoordinator, setIsCoordinator] = useState(false);

  useEffect(() => {
    if (role === 'project_admin') {
      supabase
        .from('project_assignments')
        .select('role')
        .eq('user_id', profile.id)
        .then(({ data }) => {
          if (data && data.some(a => a.role === 'Coordinator')) {
            setIsCoordinator(true);
          }
        });
    }
  }, [role, profile?.id]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear(); 
      sessionStorage.clear();
      window.location.replace('/login'); 
    } catch (error) {
      window.location.replace('/login');
    }
  };

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink 
      to={to} 
      onClick={onClose}
      className={({ isActive }) => 
        `flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors font-medium text-sm ${
          isActive 
            ? 'bg-[#5C3030] text-white' 
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon size={18} strokeWidth={1.5} />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <>
      <div 
        className={`fixed inset-0 bg-gray-900/60 z-40 transition-opacity duration-200 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 flex flex-col transition-transform duration-200 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        
        <div className="px-5 py-6 flex justify-between items-center border-b border-gray-100">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Keshav</h1>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest mt-1">
              {isAdmin ? 'Global Admin' : role?.replace('_', ' ') || 'Portal'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md lg:hidden">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          
          {isAdmin && (
            <>
              {/* <div className="pt-5 pb-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Management</div> */}
              <NavItem to="/projects" icon={Folder} label="Projects" />
              <NavItem to="/registration" icon={FilePlus} label="Registration" />
              <NavItem to="/directory" icon={Database} label="Database" />
              <NavItem to="/reports" icon={QrCode} label="QR Code" />
              <NavItem to="/organization" icon={Shield} label="Organization" />
              <NavItem to="/settings" icon={Tags} label="Tags" />
              {/* <div className="pt-5 pb-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Modules</div> */}
            </>
          )}

          {isRegional && (
            <>
              <div className="pt-5 pb-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Workspace</div>
              <NavItem to="/directory" icon={Users} label="My Mandal" />
              <NavItem to="/projects" icon={Calendar} label="Projects" />
              <NavItem to="/registration" icon={ClipboardList} label="Registration" />
            </>
          )}

          {isProjectOnly && (
            <>
              <div className="pt-5 pb-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Assignments</div>
              <NavItem to="/projects" icon={Calendar} label="My Projects" />
              {role === 'project_admin' && isCoordinator && (
                <NavItem to="/registration" icon={ClipboardList} label="Registration" />
              )}
              {role === 'project_admin' && !isCoordinator && (
                <NavItem to="/directory" icon={Database} label="Database" />
              )}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-4 px-1">
            <div className="w-9 h-9 rounded-md bg-white border border-gray-200 flex items-center justify-center text-[#5C3030] font-inter font-bold text-xs uppercase shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              {profile?.full_name?.[0] || 'U'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-gray-500 capitalize truncate">{role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-sm font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
          >
            <LogOut size={16} strokeWidth={1.5} /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}