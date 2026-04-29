import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, withTimeout } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Loader2, ShieldAlert, FolderKey, Lock } from "lucide-react";
import RegistrationRoster from "./RegistrationRoster";
import { useLocation } from "react-router-dom";

export default function RegistrationDashboard() {
  const { profile } = useAuth();
  const location = useLocation();
  const [selectedProject, setSelectedProject] = React.useState(
    location.state?.autoSelectProject || null,
  );

  const role = (profile?.role || "").toLowerCase();
  const isAdmin = role === "admin";
  const isNirdeshak = role === "nirdeshak";

  // 🛑 Security Gate
  const allowedRoles = [
    "admin",
    "nirdeshak",
    "nirikshak",
    "sanchalak",
    "project_admin",
  ];
  const isAuthorized = allowedRoles.includes(role);

  // Fetch Active Projects via React Query with Access Control
  const {
    data: projects,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["active-projects-registration", profile?.id],
    queryFn: async () => {
      // 1. Get all active projects (Now only querying 'type', access_mode is gone)
      const { data: allProjects, error: projectsError } = await withTimeout(
        supabase
          .from("projects")
          .select("id, name, registration_open, type")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      );

      if (projectsError) throw projectsError;

      // 2. If Admin or Nirdeshak, they see everything.
      if (isAdmin || isNirdeshak) {
        return allProjects || [];
      }

      // 3. For others, find out which Restricted projects they are assigned to.
      const { data: assignments, error: assignmentsError } = await withTimeout(
        supabase
          .from("project_assignments")
          .select("project_id")
          .eq("user_id", profile.id),
      );

      if (assignmentsError) throw assignmentsError;

      // Extract just the array of assigned project IDs
      const assignedProjectIds = assignments?.map((a) => a.project_id) || [];

      // 4. BULLETPROOF FILTERING (Checking the 'type' column)
      const visibleProjects = (allProjects || []).filter((p) => {
        // Force lowercase and default to 'standard' if the field is empty/null
        const projectType = (p.type || "standard").toLowerCase().trim();

        // If it's standard, everyone can see it
        if (projectType === "standard") return true;

        // If it's a restricted project, only show it if they are specifically assigned
        if (projectType === "restricted" && assignedProjectIds.includes(p.id))
          return true;

        return false;
      });

      return visibleProjects;
    },
    enabled: isAuthorized && !!profile?.id, // Only run if authorized and profile is loaded
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  if (!isAuthorized) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-6 bg-gray-50">
        <div className="bg-red-50 p-6 rounded-full mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <ShieldAlert size={48} className="text-red-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md text-sm">
          You do not have the required permissions to manage Event
          Registrations.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-400">
        <Loader2
          className="animate-spin mb-3 text-[#5C3030]"
          size={28}
          strokeWidth={1.5}
        />
        <span className="text-xs font-semibold uppercase tracking-widest">
          Loading Desk...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-red-500">
        <ShieldAlert className="mb-3" size={28} strokeWidth={1.5} />
        <span className="text-sm font-semibold">
          Error loading projects. Please try again.
        </span>
      </div>
    );
  }

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

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Registration Desk
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Select an active project to manage member registrations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects?.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedProject(p)}
            className="bg-white p-5 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-[#5C3030]/40 hover:shadow-md cursor-pointer transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#5C3030]/10 text-[#5C3030] rounded-md group-hover:bg-[#5C3030] group-hover:text-white transition-colors">
                  <FolderKey size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2">
                    {p.name}
                    {/* UI now checks the 'type' column for the lock icon */}
                    {p.type?.toLowerCase() === "restricted" && (
                      <Lock
                        size={12}
                        className="text-amber-500"
                        title="Restricted Access"
                      />
                    )}
                  </h3>
                  <div className="flex gap-2 mt-1.5">
                    {p.registration_open ? (
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border border-emerald-200">
                        Registration Open
                      </span>
                    ) : (
                      <span className="text-red-700 font-semibold bg-red-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border border-red-200">
                        Registration Closed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {projects?.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-500 bg-white rounded-md border border-dashed border-gray-300 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            No active projects available for your role.
          </div>
        )}
      </div>
    </div>
  );
}
