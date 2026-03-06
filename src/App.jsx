import React, { lazy, Suspense, Component } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// --- EAGER IMPORTS ---
import Layout from "./components/Layout";
import Login from "./modules/auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeDashboard from "./modules/home/HomeDashboard";
import ProjectView from "./modules/projects/ProjectView";

// ----------------------------------------------------------------------
// 🛡️ 1. INDUSTRY GRADE LAZY LOADER (The "Dead Chunk" Fix)
// ----------------------------------------------------------------------
// If the device went to sleep and drops the network, loading a new module will fail.
// This wrapper catches the failure, writes a temporary lock to sessionStorage, and forces a hard reload.
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-force-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      // Success! Clear the refresh flag.
      window.sessionStorage.setItem('page-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        // Assume the network dropped while idle. Force a hard reload to wake it up.
        window.sessionStorage.setItem('page-force-refreshed', 'true');
        window.location.reload();
        // Return a dummy spinner component while the browser executes the refresh
        return { default: () => <PageLoader /> };
      }
      // If it fails twice in a row, let the ErrorBoundary handle it.
      throw error;
    }
  });

// --- LAZY IMPORTS (Wrapped in our bulletproof function) ---
const MemberDirectory = lazyWithRetry(() => import("./modules/members/MemberDirectory"));
const MemberProfile = lazyWithRetry(() => import("./modules/members/MemberProfile"));
const ProjectDashboard = lazyWithRetry(() => import("./modules/projects/ProjectDashboard"));
const SettingsDashboard = lazyWithRetry(() => import("./modules/settings/SettingsDashboard"));
const Organization = lazyWithRetry(() => import("./modules/organization/Organization"));
const TagManager = lazyWithRetry(() => import("./modules/settings/TagManager"));
const ReportsDashboard = lazyWithRetry(() => import("./modules/reports/ReportsDashboard"));
const RegistrationDashboard = lazyWithRetry(() => import("./modules/registration/RegistrationDashboard"));
const Attendance = lazyWithRetry(() => import("./modules/attendance/Attendance"));

// ----------------------------------------------------------------------
// 🛡️ 2. GLOBAL APP ERROR BOUNDARY
// ----------------------------------------------------------------------
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
    // If it's specifically a module loading error, force a reload automatically
    if (error.message && (error.message.includes('fetch') || error.message.includes('module'))) {
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <WifiOff size={40} className="text-red-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Lost</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-xs">
            The application lost connection to the server while your device was idle.
          </p>
          <button 
            onClick={() => {
              window.sessionStorage.clear();
              window.location.reload();
            }} 
            className="px-6 py-2.5 bg-[#5C3030] hover:bg-[#4a2626] transition-colors text-white rounded-md font-semibold text-sm shadow-md"
          >
            Restart Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------------------------
// 🛡️ 3. OPTIMIZED REACT QUERY CONFIG
// ----------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, 
      retry: 2, 
      refetchOnWindowFocus: true, // Crucial: Refreshes data when they unlock their phone
      refetchOnReconnect: true,   // Crucial: Automatically retries failed queries when Wi-Fi returns
    },
  },
});

// Force React Query to aggressively listen to the OS network status
window.addEventListener('online', () => onlineManager.setOnline(true));
window.addEventListener('offline', () => onlineManager.setOnline(false));

const PageLoader = () => (
  <div className="flex h-[80vh] w-full flex-col items-center justify-center text-gray-400 gap-3">
    <Loader2 className="animate-spin text-[#5C3030]" size={32} strokeWidth={1.5} />
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Loading Module...</p>
  </div>
);

const ProtectedHome = () => {
  const { user, profile } = useAuth(); 
  
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return (
    <div className="h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md bg-white p-8 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-gray-200 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Error</h2>
        <p className="text-gray-500 text-sm mb-6">Profile details not found. Please refresh.</p>
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