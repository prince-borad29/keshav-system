import React, { lazy, Suspense, Component } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { useAuth } from "./contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// everything is lazy now, so each route only downloads its own code
const AuthShell = lazy(() => import("./components/AuthShell"));
const Layout = lazy(() => import("./components/Layout"));
const Login = lazy(() => import("./modules/auth/Login"));
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute"));
const HomeDashboard = lazy(() => import("./modules/home/HomeDashboard"));
const ProjectView = lazy(() => import("./modules/projects/ProjectView"));
const IDCardGenerator = lazy(() => import("./modules/reports/IDCardGenerator"));
const PublicLinksManager = lazy(() => import("./modules/admin/PublicLinksManager"));

// public pages: separate tiny chunks, no auth
const PublicDispatch = lazy(() => import("./modules/public/PublicDispatch"));
const PublicSelfServe = lazy(() => import("./modules/public/PublicSelfServe"));
const DirectPassDownload = lazy(() => import("./modules/public/DirectPassDownload"));

const MemberDirectory = lazy(() => import("./modules/members/MemberDirectory"));
const MemberProfile = lazy(() => import("./modules/members/MemberProfile"));
const ProjectDashboard = lazy(() => import("./modules/projects/ProjectDashboard"));
const SettingsDashboard = lazy(() => import("./modules/settings/SettingsDashboard"));
const Organization = lazy(() => import("./modules/organization/Organization"));
const TagManager = lazy(() => import("./modules/settings/TagManager"));
const ReportsDashboard = lazy(() => import("./modules/reports/ReportsDashboard"));
const RegistrationDashboard = lazy(() => import("./modules/registration/RegistrationDashboard"));
const Attendance = lazy(() => import("./modules/attendance/Attendance"));

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools }))
    )
  : () => null;

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
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-500 text-sm mb-6 max-w-xs">
            We encountered an error loading this page.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
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
    <Loader2
      className="animate-spin text-[#5C3030]"
      size={32}
      strokeWidth={1.5}
    />
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
      Loading...
    </p>
  </div>
);

const ProtectedHome = () => {
  const { user, profile, loading } = useAuth();

  // Still initializing
  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2
          className="animate-spin text-[#5C3030]"
          size={28}
          strokeWidth={1.5}
        />
      </div>
    );

  // Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // Logged in but profile genuinely failed to load — show retry
  if (!profile)
    return (
      <div className="h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="max-w-md bg-white p-8 rounded-md shadow border border-gray-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Profile Error
          </h2>
          <p className="text-gray-500 text-sm mb-2">
            Could not load your profile.
          </p>
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
            {/* PUBLIC: no AuthProvider, no Layout */}
            <Route path="/pass/:token/:memberId" element={<DirectPassDownload />} />
            <Route path="/public/dispatch/:token" element={<PublicDispatch />} />
            <Route path="/public/qr-pass/:token" element={<PublicSelfServe />} />

            {/* PRIVATE: auth only loads here */}
            <Route element={<AuthShell />}>
              <Route path="/login" element={<Login />} />

              <Route element={<Layout />}>
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<ProtectedHome />} />
                </Route>

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "nirdeshak", "nirikshak", "sanchalak", "project_admin"]}
                    />
                  }
                >
                  <Route path="/id" element={<IDCardGenerator />} />
                  <Route path="/directory" element={<MemberDirectory />} />
                  <Route path="/directory/:id" element={<MemberProfile />} />
                  <Route path="/projects" element={<ProjectDashboard />} />
                  <Route path="/projects/:projectId" element={<ProjectView />} />
                  <Route path="/registration" element={<RegistrationDashboard />} />
                </Route>

                <Route
                  element={
                    <ProtectedRoute allowedRoles={["admin", "taker", "sanchalak", "project_admin"]} />
                  }
                >
                  <Route path="/attendance/:projectId/:eventId" element={<Attendance />} />
                </Route>

                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                  <Route path="/settings" element={<SettingsDashboard />} />
                  <Route path="/tags" element={<TagManager />} />
                  <Route path="/reports" element={<ReportsDashboard />} />
                  <Route path="/organization" element={<Organization />} />
                  <Route path="/public-links" element={<PublicLinksManager />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>

        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>

        <Toaster
          position="top-center"
          gutter={8}
          toastOptions={{
            duration: 1500,
            style: { background: "#fff", color: "#000", borderRadius: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          }}
        />
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}
