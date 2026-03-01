import React, { useState } from 'react';
import { Search, Loader2, UserCheck, Plus, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';

export default function RegistrationDashboard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  // 1. Fetch Active Projects
  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['active-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch Roster (NO abortSignal to prevent header corruption)
  const { data: roster, isLoading: loadingRoster, isFetching } = useQuery({
    queryKey: ['registration-roster', selectedProject, searchTerm],
    queryFn: async () => {
      if (!selectedProject) return [];

      let query = supabase.from('members').select(`
        id, name, surname, internal_code, mandal_id,
        mandals ( name ),
        project_registrations ( project_id )
      `);

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,surname.ilike.%${searchTerm}%,internal_code.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50); 
      if (error) throw error;

      return data.map(m => ({
        ...m,
        isRegistered: m.project_registrations.some(r => r.project_id === selectedProject)
      }));
    },
    enabled: !!selectedProject,
    keepPreviousData: true,
  });

  // 3. Safe Registration Mutation
  const registerMutation = useMutation({
    mutationFn: async ({ memberId, isRegistering }) => {
      if (isRegistering) {
        const { error } = await supabase.from('project_registrations').insert({
          project_id: selectedProject,
          member_id: memberId,
          registered_by: profile.id
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('project_registrations').delete()
          .match({ project_id: selectedProject, member_id: memberId });
        if (error) throw error;
      }
    },
    onMutate: async (variables) => {
      // Safely cancel without dropping headers
      await queryClient.cancelQueries({ queryKey: ['registration-roster', selectedProject] });
      const previousRoster = queryClient.getQueryData(['registration-roster', selectedProject, searchTerm]);
      
      // Optimistic Update
      queryClient.setQueryData(['registration-roster', selectedProject, searchTerm], old => {
        if (!old) return old;
        return old.map(m => m.id === variables.memberId ? { ...m, isRegistered: variables.isRegistering } : m);
      });

      return { previousRoster };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registration-roster', selectedProject] });
    },
    onError: (err, variables, context) => {
      if (context?.previousRoster) {
        queryClient.setQueryData(['registration-roster', selectedProject, searchTerm], context.previousRoster);
      }
      alert(`Update failed: ${err.message}`);
    }
  });

  const inputClass = "px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors";

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            Registration Desk
          </h1>
          <p className="text-xs text-gray-500 mt-1">Quickly assign members to active events.</p>
        </div>
        
        <select 
          className={`${inputClass} w-full sm:w-64 appearance-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]`}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">Select an Active Project...</option>
          {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
        <input 
          className={`w-full pl-9 pr-10 ${inputClass} shadow-[0_1px_3px_rgba(0,0,0,0.02)]`}
          placeholder="Search by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {isFetching && <Loader2 className="absolute right-3 top-2.5 animate-spin text-gray-400" size={16} strokeWidth={1.5} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loadingRoster ? (
          <div className="col-span-full py-12 text-center text-gray-400 text-sm">
            {selectedProject ? <><Loader2 className="animate-spin inline mr-2" size={16}/> Loading roster...</> : "Select a project to load the roster."}
          </div>
        ) : (
          roster?.map(member => {
            const isProcessing = (registerMutation.isPending || registerMutation.isLoading) && registerMutation.variables?.memberId === member.id;

            return (
              <div 
                key={member.id} 
                className={`p-3 rounded-md border shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all flex justify-between items-center ${
                  member.isRegistered ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-gray-900 truncate">{member.name} {member.surname}</p>
                    {member.isRegistered && <Badge variant="primary" className="shrink-0">Added</Badge>}
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-inter truncate">
                    {member.internal_code} • {member.mandals?.name}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant={member.isRegistered ? "secondary" : "primary"}
                  onClick={() => registerMutation.mutate({ memberId: member.id, isRegistering: !member.isRegistered })}
                  disabled={isProcessing}
                  className="shrink-0 w-10 h-8 !px-0" 
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin text-gray-400" /> : member.isRegistered ? <X size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}