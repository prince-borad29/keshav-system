import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

// Components
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import MemberDirectory from "./modules/members/MemberDirectory";
import Attendance from "./modules/attendance/Attendance";
import HomeDashboard from "./modules/home/HomeDashboard";
import ProtectedRoute from './components/ProtectedRoute'; 
import MemberProfile from "./modules/members/MemberProfile";
import ProjectDashboard from "./modules/projects/ProjectDashboard";
import SettingsDashboard from "./modules/settings/SettingsDashboard";
import Organization from "./modules/organization/Organization";
import TagManager from "./modules/settings/TagManager";
import ReportsDashboard from "./modules/reports/ReportsDashboard";

// --- AUTH GUARD & HOME WRAPPER ---
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

  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center text-center p-8 bg-slate-50">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Profile Error</h2>
          <p className="text-slate-500 mb-4">
            You are logged in, but your user profile details could not be found.
          </p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return <HomeDashboard />;
};

// --- MAIN APP ROUTER ---
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Layout />}> 
        
        {/* 1. Dashboard */}
        <Route element={<ProtectedRoute />}> 
           <Route path="/" element={<ProtectedHome />} />
        </Route>

        {/* 2. MEMBER DIRECTORY */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak', 'sanchalak']} />}>
           <Route path="/directory" element={<MemberDirectory />} />
           <Route path="/directory/:id" element={<MemberProfile />} />
        </Route>

        {/* 3. ATTENDANCE */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'taker', 'sanchalak','project_admin']} />}>
           <Route path="/attendance/:projectId/:eventId" element={<Attendance />} />
        </Route>

        {/* 4. PROJECTS: Allowed 'taker' here so they can see their assigned projects */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak', 'sanchalak','project_admin']} />}>
           <Route path="/projects" element={<ProjectDashboard />} />
        </Route>

        {/* 5. SETTINGS */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
           <Route path="/settings" element={<SettingsDashboard />} />
           <Route path="/tags" element={<TagManager />} />
           <Route path="/reports" element={<ReportsDashboard />} />
           <Route path="/organization" element={<Organization />} />
        </Route>

      </Route>
    </Routes>
  );
}