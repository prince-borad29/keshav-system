import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
// 1. Core Industry-Grade Imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// --- EAGER IMPORTS ---
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeDashboard from "./modules/home/HomeDashboard";
import ProjectView from "./modules/projects/ProjectView";

// --- LAZY IMPORTS ---
const MemberDirectory = lazy(() => import("./modules/members/MemberDirectory"));
const MemberProfile = lazy(() => import("./modules/members/MemberProfile"));
const ProjectDashboard = lazy(() => import("./modules/projects/ProjectDashboard"));
const SettingsDashboard = lazy(() => import("./modules/settings/SettingsDashboard"));
const Organization = lazy(() => import("./modules/organization/Organization"));
const TagManager = lazy(() => import("./modules/settings/TagManager"));
const ReportsDashboard = lazy(() => import("./modules/reports/ReportsDashboard"));
const RegistrationDashboard = lazy(() => import("./modules/registration/RegistrationDashboard"));
const Attendance = lazy(() => import("./modules/attendance/Attendance"));

// 2. Global Query Configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache
      retry: 2, // Auto-retry on ISP hiccups
      refetchOnWindowFocus: false, 
    },
  },
});

// 🛡️ Fixed: Removed blue loader, applied standard UI colors
const PageLoader = () => (
  <div className="flex h-[80vh] w-full flex-col items-center justify-center text-gray-400 gap-3">
    <Loader2 className="animate-spin text-[#5C3030]" size={32} strokeWidth={1.5} />
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Loading Module...</p>
  </div>
);

const ProtectedHome = () => {
  const { user, profile } = useAuth(); // 🛡️ Removed 'loading' check since AuthContext handles it
  
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return (
    <div className="h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md bg-white p-8 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-gray-200 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Error</h2>
        <p className="text-gray-500 text-sm mb-6">Profile details not found.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#5C3030] text-white text-sm font-semibold rounded-md transition-colors hover:bg-[#4a2626]">
          Retry
        </button>
      </div>
    </div>
  );
  return <HomeDashboard />;
};

// --- MAIN APP ROUTER ---
export default function App() {
  return (
    // 3. Wrap everything in the Provider
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<Layout />}>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<ProtectedHome />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["admin", "nirdeshak", "nirikshak", "sanchalak", "project_admin"]} />}>
              <Route path="/directory" element={<MemberDirectory />} />
              <Route path="/directory/:id" element={<MemberProfile />} />
              <Route path="/projects" element={<ProjectDashboard />} />
              <Route path="/projects/:projectId" element={<ProjectView />} />
              <Route path="/registration" element={<RegistrationDashboard />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["admin", "taker", "sanchalak", "project_admin"]} />}>
              <Route path="/attendance/:projectId/:eventId" element={<Attendance />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route path="/settings" element={<SettingsDashboard />} />
              <Route path="/tags" element={<TagManager />} />
              <Route path="/reports" element={<ReportsDashboard />} />
              <Route path="/organization" element={<Organization />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      
      {/* 4. DevTools for debugging (only shows in development) */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}