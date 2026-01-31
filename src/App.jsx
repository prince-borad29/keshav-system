import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";

// ✅ UPDATED IMPORTS with new path structure
import Login from "./pages/auth/Login";
import AdminDashboard from "./pages/admin/AdminDashboard"; // New File
import Tags from "./pages/admin/Tags"; // Moved File

import Home from "./pages/app/Home";
import Database from "./pages/app/Database";
import Projects from "./pages/app/Projects";
import Registration from "./pages/app/Registration";
import Events from "./pages/app/Events";
import Attendance from "./pages/app/Attendance";

const LoadingScreen = () => (
  <div className="h-screen w-full flex items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-4 border-[#002B3D] border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 text-sm font-bold">Loading Keshav App...</p>
    </div>
  </div>
);

// 2. Updated PrivateRoute
const PrivateRoute = ({ children }) => {
  const { session, loading } = useAuth();
  
  if (loading) return <LoadingScreen />; // ✅ Show Spinner, not blank
  
  return session ? children : <Navigate to="/login" replace />;
};

// 3. Updated RoleRoute
const RoleRoute = ({ children, allowedRoles }) => {
  const { profile, loading } = useAuth();
  
  if (loading) return <LoadingScreen />; // ✅ Show Spinner, not blank

  // Safety check: if profile is still null (shouldn't happen due to default), send home
  if (!profile) return <Navigate to="/" replace />;

  if (allowedRoles.includes(profile.role)) {
    return children;
  } else {
    // If not allowed, redirect to Home (Overview)
    return <Navigate to="/" replace />;
  }
};

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            
            {/* PUBLIC APP ROUTES */}
            <Route path="/" element={<Home />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/events" element={<Events />} />

            {/* LEADER ROUTES */}
            <Route path="/projects" element={
              <RoleRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak', 'sanchalak']}>
                <Projects />
              </RoleRoute>
            } />
            
            <Route path="/database" element={
              <RoleRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak', 'sanchalak']}>
                <Database />
              </RoleRoute>
            } />

            <Route path="/registration" element={
              <RoleRoute allowedRoles={['admin', 'nirdeshak', 'nirikshak','sanchalak']}>
                <Registration />
              </RoleRoute>
            } />

            {/* ✅ ADMIN ROUTES */}
            <Route path="/admin" element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </RoleRoute>
            } />

            <Route path="/tags" element={
              <RoleRoute allowedRoles={['admin']}>
                <Tags />
              </RoleRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}