import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, ShieldAlert, FolderKey } from 'lucide-react';
import RegistrationRoster from './RegistrationRoster'; // We will create this next!

export default function RegistrationDashboard() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);

  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  
  // 🛑 Security Gate: Takers, Viewers, and Editors should NOT be here.
  // Allowed: Global Admins, Nirdeshaks, Nirikshaks, Sanchalaks.
  // (Note: If a project_admin is a 'Coordinator', they can be handled via specific project assignments, but generally Registration is run by local leaders).
  const allowedRoles = ['admin', 'nirdeshak', 'nirikshak', 'sanchalak', 'project_admin'];
  const isAuthorized = allowedRoles.includes(role);

  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    fetchActiveProjects();
  }, [isAuthorized]);

  const fetchActiveProjects = async () => {
    try {
      // Only fetch active projects where registration is open
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, registration_open, type')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center text-center p-6">
        <div className="bg-red-50 p-6 rounded-full mb-4"><ShieldAlert size={48} className="text-red-500" /></div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-slate-500 max-w-md">You do not have the required permissions to manage Event Registrations.</p>
      </div>
    );
  }

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin inline text-indigo-600"/> Loading Registration Desk...</div>;

  // If a project is selected, render the Roster
  if (selectedProject) {
    return (
      <RegistrationRoster 
        project={selectedProject} 
        onBack={() => setSelectedProject(null)} 
        isAdmin={isAdmin}
        profile={profile}
      />
    );
  }

  // Otherwise, render the Project Selection Screen
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 px-4 animate-in fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Registration Desk</h1>
        <p className="text-slate-500 text-sm mt-1">Select an active project to manage member registrations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map(p => (
          <div 
            key={p.id} 
            onClick={() => setSelectedProject(p)}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <FolderKey size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{p.name}</h3>
                  <div className="flex gap-2 mt-1 text-xs">
                    {p.registration_open ? (
                       <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded">Registration Open</span>
                    ) : (
                       <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">Registration Closed</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            No active projects found.
          </div>
        )}
      </div>
    </div>
  );
}