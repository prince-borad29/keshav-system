import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

// Components
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import MemberDirectory from "./modules/members/MemberDirectory";
import Attendance from "./modules/attendance/Attendance";
import HomeDashboard from "./modules/home/HomeDashboard";
import ProtectedRoute from './components/ProtectedRoute'; // Import the new file
import MemberProfile from "./modules/members/MemberProfile";
import ProjectDashboard from "./modules/projects/ProjectDashboard"
import SettingsDashboard from "./modules/settings/SettingsDashboard";
import Organization from "./modules/organization/Organization"

// --- AUTH GUARD & HOME WRAPPER ---
// This ensures the user is logged in and has a profile before showing the dashboard
const ProtectedHome = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center text-indigo-600">
        <Loader2 className="animate-spin mb-4" size={40} />
        <p className="font-bold animate-pulse">Verifying Access...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Edge Case: User exists in Auth, but data missing in 'user_profiles' table
  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center text-center p-8 bg-slate-50">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Profile Error</h2>
          <p className="text-slate-500 mb-4">
            You are logged in, but your user profile details could not be found.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ✅ LOGIC UPDATE: 
  // We no longer need separate Admin/Sanchalak components here.
  // HomeDashboard handles the role-based view internally.
  return <HomeDashboard />;
};

// --- MAIN APP ROUTER ---
export default function App() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* --- PROTECTED ROUTES --- */}
      <Route element={<Layout />}> {/* Your Sidebar/Navbar Layout */}
        
        {/* 1. Dashboard: Accessible by everyone logged in */}
        <Route element={<ProtectedRoute />}> 
           <Route path="/" element={< HomeDashboard/>} />
        </Route>

        {/* 2. MEMBER DIRECTORY: Block Takers & Volunteers */}
        {/* Only these roles can enter /members */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak', 'sanchalak']} />}>
           <Route path="/directory" element={<MemberDirectory />} />
           <Route path="/directory/:id" element={<MemberProfile />} />
        </Route>

        {/* 3. ATTENDANCE: Allow Takers here */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'taker', 'sanchalak']} />}>
           <Route path="/attendance/:projectId/:eventId" element={<Attendance />} />
        </Route>

        {/* 4. PROJECTS: Maybe only Admin & Nirdeshak? */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'nirdeshak']} />}>
           <Route path="/projects" element={<ProjectDashboard />} />
        </Route>

        {/* 5. SETTINGS: Admin Only */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
           <Route path="/settings" element={<SettingsDashboard />} />
           <Route path="/organization" element={<Organization />} />
        </Route>

      </Route>
    </Routes>
  );
}