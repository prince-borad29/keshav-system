import React, { lazy, Suspense, Component, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// --- EAGER IMPORTS ---
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeDashboard from "./modules/home/HomeDashboard";
import ProjectView from "./modules/projects/ProjectView";
import IDCardGenerator from "./modules/reports/IDCardGenerator";

// --- STANDARD LAZY IMPORTS ---
const MemberDirectory = lazy(() => import("./modules/members/MemberDirectory"));
const MemberProfile = lazy(() => import("./modules/members/MemberProfile"));
const ProjectDashboard = lazy(() => import("./modules/projects/ProjectDashboard"));
const SettingsDashboard = lazy(() => import("./modules/settings/SettingsDashboard"));
const Organization = lazy(() => import("./modules/organization/Organization"));
const TagManager = lazy(() => import("./modules/settings/TagManager"));
const ReportsDashboard = lazy(() => import("./modules/reports/ReportsDashboard"));
const RegistrationDashboard = lazy(() => import("./modules/registration/RegistrationDashboard"));
const Attendance = lazy(() => import("./modules/attendance/Attendance"));

// --- CLEAN ERROR BOUNDARY ---
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("App crashed cleanly caught by boundary:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <WifiOff size={40} className="text-red-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-xs">
            We encountered an error loading this page.
          </p>
          <button 
            onClick={() => window.location.href = '/'} 
            className="px-6 py-2.5 bg-[#5C3030] hover:bg-[#4a2626] transition-colors text-white rounded-md font-semibold text-sm shadow-md"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // ADD THIS — prevents queries from being garbage collected while inactive
      gcTime: 1000 * 60 * 10, // (was cacheTime in v4)
      // ADD THIS — if a query is enabled and has no data, always try
      retryOnMount: true,
    },
  },
});

const PageLoader = () => (
  <div className="flex h-[80vh] w-full flex-col items-center justify-center text-gray-400 gap-3">
    <Loader2 className="animate-spin text-[#5C3030]" size={32} strokeWidth={1.5} />
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Loading...</p>
  </div>
);

const ProtectedHome = () => {
  const { user, profile, loading } = useAuth();

  // Still initializing
  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-[#5C3030]" size={28} strokeWidth={1.5} />
    </div>
  );

  // Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // Logged in but profile genuinely failed to load — show retry
  if (!profile) return (
    <div className="h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md bg-white p-8 rounded-md shadow border border-gray-200 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Error</h2>
        <p className="text-gray-500 text-sm mb-2">Could not load your profile.</p>
        {/* Show raw auth user id to confirm user exists */}
        <p className="text-xs font-mono bg-gray-50 border rounded p-2 mb-4 break-all">
          user.id: {user?.id}
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-[#5C3030] text-white text-sm font-semibold rounded-md"
        >
          Retry
        </button>
      </div>
    </div>
  );

  return <HomeDashboard />;
};



export default function App() {

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<Layout />}>
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<ProtectedHome />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={["admin", "nirdeshak", "nirikshak", "sanchalak", "project_admin"]} />}>
                <Route path="/id" element={<IDCardGenerator/>}/>
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
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}