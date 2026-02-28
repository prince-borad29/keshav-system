import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

// --- EAGER IMPORTS (Keep these fast and lightweight) ---
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeDashboard from "./modules/home/HomeDashboard";

// --- LAZY IMPORTS (Code Splitting for heavy modules) ---
const MemberDirectory = lazy(() => import("./modules/members/MemberDirectory"));
const MemberProfile = lazy(() => import("./modules/members/MemberProfile"));
const ProjectDashboard = lazy(() => import("./modules/projects/ProjectDashboard"));
const SettingsDashboard = lazy(() => import("./modules/settings/SettingsDashboard"));
const Organization = lazy(() => import("./modules/organization/Organization"));
const TagManager = lazy(() => import("./modules/settings/TagManager"));
const ReportsDashboard = lazy(() => import("./modules/reports/ReportsDashboard"));
const RegistrationDashboard = lazy(() => import("./modules/registration/RegistrationDashboard"));
const Attendance = lazy(() => import("./modules/attendance/Attendance"));

// --- GLOBAL LOADING SPINNER ---
const PageLoader = () => (
  <div className="flex h-[80vh] w-full flex-col items-center justify-center text-slate-400 gap-4">
    <Loader2 className="animate-spin text-indigo-600" size={40} />
    <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading Module...</p>
  </div>
);

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

  return <HomeDashboard />;
};

// --- MAIN APP ROUTER ---
export default function App() {
  return (
    // The Global Suspense boundary catches all lazy-loaded routes
    <Suspense fallback={<PageLoader />}>
      <Routes>
        
        {/* PUBLIC ROUTE */}
        <Route path="/login" element={<Login />} />

        {/* PROTECTED ROUTES (Wrapped in Layout) */}
        <Route element={<Layout />}>
          
          {/* 1. Dashboard */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProtectedHome />} />
          </Route>

          {/* 2. MEMBER DIRECTORY */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "nirdeshak",
                  "nirikshak",
                  "sanchalak",
                  "project_admin",
                ]}
              />
            }
          >
            <Route path="/directory" element={<MemberDirectory />} />
            <Route path="/directory/:id" element={<MemberProfile />} />
          </Route>

          {/* 3. ATTENDANCE */}
          <Route
            element={
              <ProtectedRoute allowedRoles={["admin", "taker", "sanchalak", "project_admin"]} />
            }
          >
            <Route path="/attendance/:projectId/:eventId" element={<Attendance />} />
          </Route>

          {/* 4. PROJECTS */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "nirdeshak",
                  "nirikshak",
                  "sanchalak",
                  "project_admin",
                ]}
              />
            }
          >
            <Route path="/projects" element={<ProjectDashboard />} />
          </Route>

          {/* 5. REGISTRATION */}
          <Route
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "nirdeshak",
                  "nirikshak",
                  "sanchalak",
                  "project_admin",
                ]}
              />
            }
          >
            <Route path="/registration" element={<RegistrationDashboard />} />
          </Route>

          {/* 6. SETTINGS & ADMIN ONLY */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route path="/settings" element={<SettingsDashboard />} />
            <Route path="/tags" element={<TagManager />} />
            <Route path="/reports" element={<ReportsDashboard />} />
            <Route path="/organization" element={<Organization />} />
          </Route>

        </Route>
      </Routes>
    </Suspense>
  );
}