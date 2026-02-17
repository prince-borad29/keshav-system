    import React from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Adjust path to your AuthContext
import { Loader2, ShieldAlert } from 'lucide-react';
import Button from './ui/Button'; // Adjust path to your Button component

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  // 1. Check if User is Logged In
  if (!profile) {
    // Redirect to login, but remember where they were trying to go
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Check Role Permissions
  // If allowedRoles is empty, it means "Any logged-in user can access"
  if (allowedRoles.length > 0) {
    const userRole = (profile.role || '').toLowerCase();
    
    // Normalize allowed roles to lowercase to avoid case-sensitive bugs
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      // 🛑 ACCESS DENIED UI
      return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-6 bg-slate-50">
          <div className="bg-red-100 p-6 rounded-full mb-6 shadow-sm animate-in zoom-in-50">
            <ShieldAlert size={64} className="text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">Access Restricted</h1>
          <p className="text-slate-500 max-w-md mb-8 text-lg">
            You are signed in as a <strong className="capitalize text-slate-900 bg-slate-200 px-2 py-0.5 rounded">{userRole}</strong>.
            You do not have permission to view this page.
          </p>
          <div className="flex gap-4">
            <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
            <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
          </div>
        </div>
      );
    }
  }

  // 3. Authorized! Render the requested page (Outlet)
  return <Outlet />;
}