// reportQueryEngine.js
import { supabase } from '../../lib/supabase';

// ── Unique values from a column (for filter suggestions) ──────
export async function fetchUniqueValues(reportTypeId, columnKey, currentData) {
  if (currentData && currentData.length > 0) {
    const vals = [...new Set(currentData.map(r => r[columnKey]).filter(v => v !== null && v !== undefined && v !== ''))].sort();
    return vals.slice(0, 100);
  }
  return [];
}

// ── Client-side filter ────────────────────────────────────────
export function applyFilters(data, filters) {
  if (!filters || filters.length === 0) return data;
  return data.filter(row =>
    filters.every(f => {
      if (!f.column) return true;
      const raw = row[f.column];
      const val = raw === null || raw === undefined ? '' : String(raw);
      const fv  = String(f.value ?? '');
      switch (f.operator) {
        case 'contains':     return val.toLowerCase().includes(fv.toLowerCase());
        case 'not_contains': return !val.toLowerCase().includes(fv.toLowerCase());
        case 'equals':       return val.toLowerCase() === fv.toLowerCase();
        case 'not_equals':   return val.toLowerCase() !== fv.toLowerCase();
        case 'starts_with':  return val.toLowerCase().startsWith(fv.toLowerCase());
        case 'is_empty':     return raw === '' || raw === null || raw === undefined;
        case 'is_filled':    return raw !== '' && raw !== null && raw !== undefined;
        case 'eq':           return parseFloat(raw) === parseFloat(fv);
        case 'neq':          return parseFloat(raw) !== parseFloat(fv);
        case 'gt':           return parseFloat(raw) > parseFloat(fv);
        case 'gte':          return parseFloat(raw) >= parseFloat(fv);
        case 'lt':           return parseFloat(raw) < parseFloat(fv);
        case 'lte':          return parseFloat(raw) <= parseFloat(fv);
        case 'after':        return new Date(raw) > new Date(fv);
        case 'before':       return new Date(raw) < new Date(fv);
        default:             return true;
      }
    })
  );
}

// ── Client-side multi-sort ────────────────────────────────────
export function applySort(data, sorts) {
  if (!sorts || sorts.length === 0) return data;
  return [...data].sort((a, b) => {
    for (const s of sorts) {
      if (!s.column) continue;
      const av = a[s.column], bv = b[s.column];
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      const na = parseFloat(av), nb = parseFloat(bv);
      const cmp = !isNaN(na) && !isNaN(nb)
        ? na - nb
        : String(av).localeCompare(String(bv), 'en-IN');
      if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

// ── Client-side grouping + aggregation ───────────────────────
export function applyGrouping(data, groupByKey, columns, aggConfig) {
  if (!groupByKey) return { isGrouped: false, rows: data };

  const groups = {};
  const order  = [];
  data.forEach(row => {
    const gVal = row[groupByKey] ?? '(blank)';
    if (!groups[gVal]) { groups[gVal] = []; order.push(gVal); }
    groups[gVal].push(row);
  });

  const result = [];
  order.forEach(gVal => {
    const rows = groups[gVal];
    const headerRow = { _type: 'group_header', _groupValue: String(gVal), _count: rows.length };
    columns.forEach(col => {
      if (col.key === groupByKey) { headerRow[col.key] = gVal; return; }
      const agg  = aggConfig?.[col.key] || 'none';
      const vals = rows.map(r => r[col.key]);
      const nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n));
      switch (agg) {
        case 'count': headerRow[col.key] = rows.length; break;
        case 'sum':   headerRow[col.key] = nums.length ? +nums.reduce((a,b)=>a+b,0).toFixed(2) : ''; break;
        case 'avg':   headerRow[col.key] = nums.length ? +(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(2) : ''; break;
        case 'min':   headerRow[col.key] = nums.length ? Math.min(...nums) : ''; break;
        case 'max':   headerRow[col.key] = nums.length ? Math.max(...nums) : ''; break;
        default:      headerRow[col.key] = '';
      }
    });
    result.push(headerRow);
    rows.forEach(r => result.push({ ...r, _type: 'data', _group: gVal }));
  });

  return { isGrouped: true, rows: result };
}

// ════════════════════════════════════════════════════════════
// FETCHERS
// ════════════════════════════════════════════════════════════

async function fetchMemberDirectory() {
  const { data, error } = await supabase
    .from('members')
    .select('internal_code,name,father_name,surname,gender,mobile,dob,designation,is_guest,address,created_at,mandals(name,kshetras(name))')
    .limit(5000);
  if (error) throw error;
  return data.map(m => ({
    internal_code: m.internal_code,
    name:          m.name,
    surname:       m.surname,
    father_name:   m.father_name || '',
    gender:        m.gender,
    mobile:        m.mobile || '',
    dob:           m.dob || '',
    designation:   m.designation || '',
    mandal_name:   m.mandals?.name || '',
    kshetra_name:  m.mandals?.kshetras?.name || '',
    address:       m.address || '',
    is_guest:      m.is_guest ? 'Yes' : 'No',
    created_at:    m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN') : '',
  }));
}

async function fetchProjectRegistrations() {
  const { data, error } = await supabase
    .from('project_registrations')
    .select('exam_level,seat_number,registered_at,members(internal_code,name,surname,gender,mandals(name,kshetras(name))),projects(name)')
    .limit(10000);
  if (error) throw error;
  return data.map(r => ({
    member_code:   r.members?.internal_code || '',
    member_name:   `${r.members?.name || ''} ${r.members?.surname || ''}`.trim(),
    gender:        r.members?.gender || '',
    mandal_name:   r.members?.mandals?.name || '',
    kshetra_name:  r.members?.mandals?.kshetras?.name || '',
    project_name:  r.projects?.name || '',
    exam_level:    r.exam_level || '',
    seat_number:   r.seat_number || '',
    registered_at: r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-IN') : '',
  }));
}

async function fetchAttendanceByMember() {
  const { data: regs, error: rErr } = await supabase
    .from('project_registrations')
    .select('project_id,member_id,projects(id,name,events(id)),members(internal_code,name,surname,gender,mandals(name,kshetras(name)))')
    .limit(10000);
  if (rErr) throw rErr;

  const { data: att, error: aErr } = await supabase
    .from('attendance')
    .select('member_id,event_id,events(project_id)')
    .limit(50000);
  if (aErr) throw aErr;

  const attMap = {};
  att.forEach(a => {
    const pid = a.events?.project_id;
    if (!pid) return;
    if (!attMap[a.member_id]) attMap[a.member_id] = {};
    if (!attMap[a.member_id][pid]) attMap[a.member_id][pid] = new Set();
    attMap[a.member_id][pid].add(a.event_id);
  });

  return regs.map(reg => {
    const m       = reg.members;
    const total   = (reg.projects?.events || []).length;
    const present = attMap[reg.member_id]?.[reg.project_id]?.size || 0;
    const absent  = Math.max(0, total - present);
    return {
      member_code:    m?.internal_code || '',
      member_name:    `${m?.name || ''} ${m?.surname || ''}`.trim(),
      gender:         m?.gender || '',
      mandal_name:    m?.mandals?.name || '',
      kshetra_name:   m?.mandals?.kshetras?.name || '',
      project_name:   reg.projects?.name || '',
      events_total:   total,
      events_present: present,
      events_absent:  absent,
      attendance_pct: total > 0 ? +((present / total) * 100).toFixed(1) : 0,
    };
  });
}

async function fetchAttendanceByEvent() {
  const { data: events, error: eErr } = await supabase
    .from('events').select('id,name,date,project_id,projects(name)').limit(2000);
  if (eErr) throw eErr;

  const { data: regs, error: rErr } = await supabase
    .from('project_registrations').select('project_id').limit(10000);
  if (rErr) throw rErr;

  const { data: att, error: aErr } = await supabase
    .from('attendance').select('event_id').limit(50000);
  if (aErr) throw aErr;

  const regCount = {};
  regs.forEach(r => { regCount[r.project_id] = (regCount[r.project_id] || 0) + 1; });
  const attCount = {};
  att.forEach(a => { attCount[a.event_id] = (attCount[a.event_id] || 0) + 1; });

  return events.map(ev => {
    const reg = regCount[ev.project_id] || 0;
    const pre = attCount[ev.id] || 0;
    return {
      project_name:   ev.projects?.name || '',
      event_name:     ev.name,
      event_date:     ev.date || '',
      registered:     reg,
      present:        pre,
      absent:         Math.max(0, reg - pre),
      attendance_pct: reg > 0 ? +((pre / reg) * 100).toFixed(1) : 0,
    };
  });
}

// ── Project × Member Attendance (project-scoped) ─────────────
export async function fetchProjectList() {
  const { data, error } = await supabase
    .from('projects').select('id,name').order('name').limit(500);
  if (error) throw error;
  return data || [];
}

async function fetchProjectMemberAttendance(params = {}) {
  const projectId = params.projectId;

  let regsQuery = supabase
    .from('project_registrations')
    .select('project_id,member_id,exam_level,projects(id,name,events(id)),members(internal_code,name,surname,gender,mandals(name,kshetras(name)))')
    .limit(10000);
  if (projectId) regsQuery = regsQuery.eq('project_id', projectId);

  const { data: regs, error: rErr } = await regsQuery;
  if (rErr) throw rErr;

  let attQuery = supabase
    .from('attendance')
    .select('member_id,event_id,events(project_id)')
    .limit(50000);
  if (projectId) {
    // Get event IDs for this project first
    const { data: evs } = await supabase.from('events').select('id').eq('project_id', projectId);
    const evIds = (evs || []).map(e => e.id);
    if (evIds.length > 0) attQuery = attQuery.in('event_id', evIds);
  }

  const { data: att, error: aErr } = await attQuery;
  if (aErr) throw aErr;

  const attMap = {};
  att.forEach(a => {
    const pid = a.events?.project_id;
    if (!pid) return;
    if (!attMap[a.member_id]) attMap[a.member_id] = {};
    if (!attMap[a.member_id][pid]) attMap[a.member_id][pid] = new Set();
    attMap[a.member_id][pid].add(a.event_id);
  });

  return regs.map(reg => {
    const m       = reg.members;
    const total   = (reg.projects?.events || []).length;
    const present = attMap[reg.member_id]?.[reg.project_id]?.size || 0;
    const absent  = Math.max(0, total - present);
    return {
      member_code:    m?.internal_code || '',
      member_name:    `${m?.name || ''} ${m?.surname || ''}`.trim(),
      gender:         m?.gender || '',
      mandal_name:    m?.mandals?.name || '',
      kshetra_name:   m?.mandals?.kshetras?.name || '',
      exam_level:     reg.exam_level || '',
      events_total:   total,
      events_present: present,
      events_absent:  absent,
      attendance_pct: total > 0 ? +((present / total) * 100).toFixed(1) : 0,
    };
  });
}

async function fetchMandalSummary() {
  const { data: mandals, error: mErr } = await supabase.from('mandals').select('id,name,kshetras(name)').limit(500);
  if (mErr) throw mErr;
  const { data: members, error: mbErr } = await supabase.from('members').select('id,gender,mandal_id').limit(10000);
  if (mbErr) throw mbErr;
  const { data: regs, error: rErr } = await supabase.from('project_registrations').select('member_id,members(mandal_id)').limit(10000);
  if (rErr) throw rErr;
  const { data: att, error: aErr } = await supabase.from('attendance').select('member_id,members(mandal_id)').limit(50000);
  if (aErr) throw aErr;

  return mandals.map(mandal => {
    const mm = members.filter(m => m.mandal_id === mandal.id);
    const mr = regs.filter(r => r.members?.mandal_id === mandal.id);
    const ma = att.filter(a => a.members?.mandal_id === mandal.id);
    return {
      mandal_name:         mandal.name,
      kshetra_name:        mandal.kshetras?.name || '',
      total_members:       mm.length,
      yuvak_count:         mm.filter(m => m.gender === 'Yuvak').length,
      yuvati_count:        mm.filter(m => m.gender === 'Yuvati').length,
      total_registrations: mr.length,
      total_attendance:    ma.length,
    };
  });
}

async function fetchKshetraSummary() {
  const { data: kshetras, error: kErr } = await supabase.from('kshetras').select('id,name').limit(200);
  if (kErr) throw kErr;
  const { data: mandals, error: mErr } = await supabase.from('mandals').select('id,kshetra_id').limit(500);
  if (mErr) throw mErr;
  const { data: members, error: mbErr } = await supabase.from('members').select('id,gender,mandals(kshetra_id)').limit(10000);
  if (mbErr) throw mbErr;
  const { data: regs, error: rErr } = await supabase.from('project_registrations').select('member_id,members(mandals(kshetra_id))').limit(10000);
  if (rErr) throw rErr;
  const { data: att, error: aErr } = await supabase.from('attendance').select('member_id,members(mandals(kshetra_id))').limit(50000);
  if (aErr) throw aErr;

  return kshetras.map(k => {
    const km = members.filter(m => m.mandals?.kshetra_id === k.id);
    const kr = regs.filter(r => r.members?.mandals?.kshetra_id === k.id);
    const ka = att.filter(a => a.members?.mandals?.kshetra_id === k.id);
    return {
      kshetra_name:        k.name,
      total_mandals:       mandals.filter(m => m.kshetra_id === k.id).length,
      total_members:       km.length,
      yuvak_count:         km.filter(m => m.gender === 'Yuvak').length,
      yuvati_count:        km.filter(m => m.gender === 'Yuvati').length,
      total_registrations: kr.length,
      total_attendance:    ka.length,
    };
  });
}

async function fetchInactiveMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('internal_code,name,surname,gender,mobile,designation,mandals(name,kshetras(name)),project_registrations(project_id)')
    .limit(5000);
  if (error) throw error;
  return data
    .filter(m => (m.project_registrations || []).length === 0)
    .map(m => ({
      internal_code: m.internal_code,
      name:          m.name,
      surname:       m.surname,
      gender:        m.gender,
      mobile:        m.mobile || '',
      mandal_name:   m.mandals?.name || '',
      kshetra_name:  m.mandals?.kshetras?.name || '',
      designation:   m.designation || '',
    }));
}

export async function runReport(reportTypeId, params = {}) {
  switch (reportTypeId) {
    case 'member_directory':          return fetchMemberDirectory();
    case 'project_registrations':     return fetchProjectRegistrations();
    case 'attendance_by_member':      return fetchAttendanceByMember();
    case 'attendance_by_event':       return fetchAttendanceByEvent();
    case 'project_member_attendance': return fetchProjectMemberAttendance(params);
    case 'mandal_summary':            return fetchMandalSummary();
    case 'kshetra_summary':           return fetchKshetraSummary();
    case 'inactive_members':          return fetchInactiveMembers();
    default: throw new Error('Unknown report type: ' + reportTypeId);
  }
}