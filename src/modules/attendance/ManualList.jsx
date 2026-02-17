import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, Loader2, User, ArrowLeft, MapPin, X, Filter, Tag, Briefcase } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Badge from '../../components/ui/Badge';

export default function ManualList({ event, project, onBack, mandalFilterId = null, mandalFilterName = null }) {
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'present', 'pending'
  const [desigFilter, setDesigFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  
  // Dropdown Options
  const [availableTags, setAvailableTags] = useState([]);
  const designations = ['Member', 'Nirdeshak', 'Nirikshak', 'Sanchalak', 'Sah Sanchalak', 'Sampark Karyakar', 'Utsahi Yuvak'];

  useEffect(() => {
    fetchData();
  }, [event.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Tags for Filter Dropdown
      const { data: tagData } = await supabase.from('tags').select('id, name').eq('category', 'Member').order('name');
      setAvailableTags(tagData || []);

      // 2. Fetch Attendees + Tags
      const { data, error } = await supabase
        .from('project_registrations')
        .select(`
          member_id,
          seat_number,
          members ( 
            id, name, surname, mobile, internal_code, designation, 
            mandals (id, name),
            member_tags ( tag_id ) 
          )
        `)
        .eq('project_id', project.id);

      if (error) throw error;

      // 3. Fetch Attendance Status
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('member_id, scanned_at')
        .eq('event_id', event.id);

      const attendanceMap = new Set(attendanceData?.map(a => a.member_id));

      // 4. Merge & Process
      const processed = data.map(reg => ({
        ...reg.members,
        seat_number: reg.seat_number,
        is_present: attendanceMap.has(reg.member_id),
        // Flatten tags for easier filtering
        tag_ids: reg.members.member_tags.map(t => t.tag_id)
      }));

      processed.sort((a, b) => a.name.localeCompare(b.name));
      setAttendees(processed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async (member) => {
    setTogglingId(member.id);
    try {
      const user = (await supabase.auth.getUser()).data.user;

      if (member.is_present) {
        if (!confirm(`Mark ${member.name} as ABSENT?`)) { setTogglingId(null); return; }
        await supabase.from('attendance').delete().match({ event_id: event.id, member_id: member.id });
        setAttendees(prev => prev.map(m => m.id === member.id ? { ...m, is_present: false } : m));
      } else {
        await supabase.from('attendance').insert({ event_id: event.id, member_id: member.id, marked_by: user.id });
        setAttendees(prev => prev.map(m => m.id === member.id ? { ...m, is_present: true } : m));
      }
    } catch (err) { alert(err.message); } 
    finally { setTogglingId(null); }
  };

  // --- FILTERING LOGIC ---
  const filteredList = attendees.filter(m => {
    // 1. Search
    const matchesSearch = `${m.name} ${m.surname} ${m.seat_number || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    // 2. Status
    const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'present' ? m.is_present : !m.is_present;
    // 3. Mandal (Drill Down)
    const matchesMandal = mandalFilterId ? m.mandals?.id === mandalFilterId : true;
    // 4. Designation
    const matchesDesig = desigFilter ? m.designation === desigFilter : true;
    // 5. Tags
    const matchesTag = tagFilter ? m.tag_ids.includes(tagFilter) : true;

    return matchesSearch && matchesStatus && matchesMandal && matchesDesig && matchesTag;
  });

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      
      {/* HEADER: FILTERS */}
      <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
        
        {/* Top Row: Search & Context */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
              placeholder="Search list..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          {mandalFilterName && (
            <div className="hidden sm:flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl text-xs font-bold border border-indigo-100">
              <MapPin size={12}/> {mandalFilterName}
              <button onClick={onBack} className="ml-1 hover:bg-indigo-100 rounded-full p-0.5"><X size={12}/></button>
            </div>
          )}
        </div>

        {/* Bottom Row: Dropdowns */}
        <div className="flex flex-wrap gap-2">
          {/* Status Tabs */}
          <div className="flex bg-slate-200/50 p-1 rounded-lg">
            {['all', 'present', 'pending'].map(f => (
              <button
                key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${statusFilter === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Designation Filter */}
          <div className="relative">
            <select 
              className="appearance-none pl-8 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 focus:border-indigo-300 outline-none"
              value={desigFilter}
              onChange={e => setDesigFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              {designations.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <Briefcase size={12} className="absolute left-2.5 top-2 text-slate-400 pointer-events-none"/>
          </div>

          {/* Tag Filter */}
          <div className="relative">
            <select 
              className="appearance-none pl-8 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 focus:border-indigo-300 outline-none"
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            >
              <option value="">All Tags</option>
              {availableTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Tag size={12} className="absolute left-2.5 top-2 text-slate-400 pointer-events-none"/>
          </div>

          {(desigFilter || tagFilter) && (
            <button onClick={() => { setDesigFilter(''); setTagFilter(''); }} className="text-xs text-red-500 hover:underline px-1">Reset</button>
          )}
        </div>
      </div>

      {/* LIST */}
      <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Loading list...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No members match your filters.</div>
        ) : (
          filteredList.map(m => (
            <div key={m.id} className={`p-3 flex items-center justify-between hover:bg-slate-50 transition-colors ${m.is_present ? 'bg-green-50/30' : ''}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${m.is_present ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {m.is_present ? <CheckCircle size={16}/> : m.name[0]}
                </div>
                <div className="min-w-0">
                  <div className={`font-bold text-sm truncate ${m.is_present ? 'text-green-900' : 'text-slate-800'}`}>
                    {m.name} {m.surname}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="bg-slate-100 px-1 rounded border border-slate-200">{m.designation}</span>
                    <span className="flex items-center gap-0.5"><MapPin size={8}/> {m.mandals?.name}</span>
                    {m.seat_number && <span className="font-mono text-indigo-600 font-medium">#{m.seat_number}</span>}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleToggleAttendance(m)}
                disabled={togglingId === m.id}
                className={`ml-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${
                  m.is_present
                    ? 'bg-white text-green-600 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                    : 'bg-indigo-600 text-white border-transparent hover:bg-indigo-700 shadow-sm'
                }`}
              >
                {togglingId === m.id ? <Loader2 size={12} className="animate-spin"/> : m.is_present ? "Undo" : "Check In"}
              </button>
            </div>
          ))
        )}
      </div>
      
      <div className="p-2 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400">
        Showing {filteredList.length} members
      </div>
    </div>
  );
}