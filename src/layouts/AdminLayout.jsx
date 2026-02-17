// src/layouts/AdminLayout.jsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Calendar, 
  FileText, 
  Menu, 
  X, 
  LogOut,
  User
} from 'lucide-react'

export default function AdminLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { signOut, user, profile } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  // Navigation Links Configuration
  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'Organization', path: '/admin/organization', icon: <Building2 size={20} /> },
    { label: 'Members', path: '/admin/members', icon: <Users size={20} /> },
    { label: 'Projects & Events', path: '/admin/projects', icon: <Calendar size={20} /> },
    { label: 'Reports', path: '/admin/reports', icon: <FileText size={20} /> },
  ]

  // Sidebar Component (Reusable)
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Logo Area */}
      <div className="p-6 border-b border-slate-800">
        <h2 className="text-xl font-bold tracking-wide">Keshav Mandal</h2>
        <span className="text-xs text-slate-400 uppercase tracking-wider">Admin Panel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)} // Close mobile menu on click
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white font-medium' // Active State (Teal from PDF)
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User Profile / Logout Section */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-sm font-bold">
            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{profile?.full_name || 'Admin User'}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* 1. Desktop Sidebar (Hidden on Mobile) */}
      <aside className="hidden md:flex w-64 flex-col fixed h-full z-20 shadow-xl">
        <SidebarContent />
      </aside>

      {/* 2. Mobile Header & Menu */}
      <div className="md:hidden fixed top-0 w-full bg-slate-900 text-white z-30 flex items-center justify-between p-4 shadow-md">
        <span className="font-bold">Keshav Mandal</span>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* 3. Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-20 md:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-64 bg-slate-900 h-full shadow-xl">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* 4. Main Content Area */}
      <main className="flex-1 md:ml-64 flex flex-col h-full overflow-hidden">
        {/* Mobile Spacer (pushes content down below the fixed header) */}
        <div className="h-16 md:h-0 flex-shrink-0" />
        
        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet /> {/* This is where your Dashboard/Members pages render */}
        </div>
      </main>

    </div>
  )
}