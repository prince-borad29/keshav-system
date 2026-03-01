import React from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';
import Button from './ui/Button';

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-[#5C3030]" size={24} strokeWidth={1.5} />
      </div>
    );
  }

  // 1. Guard: Not Logged In
  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Guard: Role Based Access Control
  if (allowedRoles.length > 0) {
    const userRole = (profile.role || '').toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-gray-50 font-sora">
          <div className="bg-white border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-md p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-200">
            <ShieldAlert size={40} strokeWidth={1.5} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h1>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              You are signed in as <span className="font-semibold text-gray-900 uppercase tracking-widest text-[10px] bg-gray-100 px-1.5 py-0.5 rounded ml-1">{userRole}</span>.<br/>
              You do not have the required permissions to view this resource.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
              <Button onClick={() => navigate('/')}>Dashboard</Button>
            </div>
          </div>
        </div>
      );
    }
  }

  // 3. Authorized
  return <Outlet />;
}