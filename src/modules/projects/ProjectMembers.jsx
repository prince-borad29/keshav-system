import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, MapPin, X, Users, Phone } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { supabase, withTimeout } from '../../lib/supabase'; // 🛡️ Imported withTimeout
import Badge from '../../components/ui/Badge';

const PAGE_SIZE = 20;

export default function ProjectMembers({ project }) {
  const { ref: loadMoreRef, inView } = useInView();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 🛡️ Bulletproof Debounce search
  useEffect(() => {
    let isActive = true;
    const timer = setTimeout(() => {
      if (isActive) setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // Infinite Query for Registered Members
  const { 
    data: membersPages, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading,
    isFetching,
    isError
  } = useInfiniteQuery({
    queryKey: ['project-registered-members', project.id, debouncedSearch],
    queryFn: async ({ pageParam = 0, signal }) => {
      // Query members who have a registration for this project
      let query = supabase.from('members').select(`
        id, name, surname, internal_code, mobile, designation, gender,
        mandals!inner ( name ),
        project_registrations!inner ( project_id, external_qr )
      `, { count: 'exact' })
      .eq('project_registrations.project_id', project.id);

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,surname.ilike.%${debouncedSearch}%,internal_code.ilike.%${debouncedSearch}%,mobile.ilike.%${debouncedSearch}%`);
      }

      const from = pageParam * PAGE_SIZE;
      
      // 🛡️ Wrapped in withTimeout
      const { data, count, error } = await withTimeout(
        query.range(from, from + PAGE_SIZE - 1)
             .order('name', { ascending: true })
             .abortSignal(signal)
      );

      if (error) throw error;
      return { data, count, nextPage: data.length === PAGE_SIZE ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  // 🛡️ Strict Intersection Observer
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetching && !isError) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, isFetching, isError, fetchNextPage]);

  const members = useMemo(() => membersPages?.pages.flatMap(page => page.data) || [], [membersPages]);
  const totalCount = membersPages?.pages[0]?.count || 0;

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-md outline-none text-sm text-gray-900 focus:border-[#5C3030] transition-colors appearance-none";

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="bg-white p-4 rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users size={16} className="text-[#5C3030]"/> Registered Roster
          </h2>
          <Badge variant="secondary" className="font-inter">{totalCount} Members</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} strokeWidth={1.5} />
          {/* 🛡️ X Clear Button */}
          <input 
            className={`${inputClass} pl-9 pr-9`}
            placeholder="Search by name, ID, or mobile..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 transition-colors">
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Member List */}
      <div className="bg-white border border-gray-200 rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] divide-y divide-gray-100 relative min-h-[200px]">
        
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-gray-400 bg-white/80 backdrop-blur-sm">
            <Loader2 className="animate-spin mb-2" size={24} strokeWidth={1.5}/>
            <span className="text-[10px] font-semibold uppercase tracking-widest">Loading...</span>
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-8 text-center text-red-500 text-sm font-medium">
            Failed to load members. Please check your connection.
          </div>
        )}

        {!isLoading && !isError && members.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            {searchTerm ? "No members match your search." : "No members have registered for this project yet."}
          </div>
        ) : (
          members.map(m => (
            <div key={m.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm shrink-0">
                  {m.name[0]}{m.surname[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate flex items-center gap-2">
                    {m.name} {m.surname}
                    {m.project_registrations[0]?.external_qr && <Badge variant="success" className="!text-[9px] !py-0 px-1.5">Linked</Badge>}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 mt-0.5 truncate">
                    <MapPin size={10} strokeWidth={2} className="shrink-0"/> 
                    <span className="truncate">{m.mandals?.name}</span> 
                    <span className="font-inter lowercase tracking-normal text-gray-300 shrink-0">•</span> 
                    <span className="font-inter shrink-0">{m.internal_code}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 mt-1 sm:mt-0">
                <Badge variant="default">{m.designation}</Badge>
                {m.mobile && (
                  <a href={`tel:${m.mobile}`} className="p-2 text-gray-400 hover:text-[#5C3030] hover:bg-gray-100 rounded-md transition-colors border border-transparent hover:border-gray-200">
                    <Phone size={14} strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {/* Infinite Scroll Trigger */}
        {!isError && members.length > 0 && (
          <div ref={loadMoreRef} className="py-4 text-center text-[10px] uppercase font-semibold tracking-widest text-gray-400">
            {isFetchingNextPage ? <Loader2 className="animate-spin inline" size={14}/> : hasNextPage ? 'Scroll for more' : 'End of records'}
          </div>
        )}
      </div>
    </div>
  );
}