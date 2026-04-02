// ============================================================
// reportConfig.js
// Central config: DB schema, modules, columns, preset queries
// ============================================================

// reportConfig.js
export const DB_SCHEMA = {
  members: {
    label: 'Members',
    columns: [
      { name: 'id', type: 'uuid' }, { name: 'internal_code', type: 'text' },
      { name: 'name', type: 'text' }, { name: 'father_name', type: 'text' },
      { name: 'surname', type: 'text' }, { name: 'gender', type: 'text' },
      { name: 'dob', type: 'date' }, { name: 'mobile', type: 'text' },
      { name: 'address', type: 'text' }, { name: 'designation', type: 'text' },
      { name: 'is_guest', type: 'boolean' }, { name: 'mandal_id', type: 'uuid' },
      { name: 'created_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'mandals', label: 'Mandal', columns: ['id', 'name', 'kshetra_id'] },
      { key: 'project_registrations', label: 'Registrations', columns: ['project_id', 'exam_level', 'seat_number', 'registered_at'] },
      { key: 'attendance', label: 'Attendance', columns: ['event_id', 'scanned_at'] },
    ],
  },
  mandals: {
    label: 'Mandals',
    columns: [
      { name: 'id', type: 'uuid' }, { name: 'name', type: 'text' },
      { name: 'kshetra_id', type: 'uuid' }, { name: 'created_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'kshetras', label: 'Kshetra', columns: ['id', 'name'] },
      { key: 'members', label: 'Members', columns: ['id', 'name', 'surname', 'gender', 'internal_code'] },
    ],
  },
  kshetras: {
    label: 'Kshetras',
    columns: [{ name: 'id', type: 'uuid' }, { name: 'name', type: 'text' }, { name: 'created_at', type: 'timestamp' }],
    relations: [{ key: 'mandals', label: 'Mandals', columns: ['id', 'name'] }],
  },
  projects: {
    label: 'Projects',
    columns: [
      { name: 'id', type: 'uuid' }, { name: 'name', type: 'text' },
      { name: 'description', type: 'text' }, { name: 'type', type: 'text' },
      { name: 'allowed_gender', type: 'text' }, { name: 'is_active', type: 'boolean' },
      { name: 'registration_open', type: 'boolean' }, { name: 'created_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'events', label: 'Events', columns: ['id', 'name', 'date', 'is_primary'] },
      { key: 'project_registrations', label: 'Registrations', columns: ['member_id', 'exam_level', 'seat_number'] },
    ],
  },
  events: {
    label: 'Events',
    columns: [
      { name: 'id', type: 'uuid' }, { name: 'project_id', type: 'uuid' },
      { name: 'name', type: 'text' }, { name: 'date', type: 'date' },
      { name: 'is_primary', type: 'boolean' }, { name: 'created_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'projects', label: 'Project', columns: ['id', 'name', 'type'] },
      { key: 'attendance', label: 'Attendance', columns: ['member_id', 'scanned_at'] },
    ],
  },
  project_registrations: {
    label: 'Project Registrations',
    columns: [
      { name: 'project_id', type: 'uuid' }, { name: 'member_id', type: 'uuid' },
      { name: 'exam_level', type: 'text' }, { name: 'seat_number', type: 'text' },
      { name: 'registered_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'members', label: 'Member', columns: ['id', 'name', 'surname', 'gender', 'internal_code', 'mandal_id'] },
      { key: 'projects', label: 'Project', columns: ['id', 'name', 'type'] },
    ],
  },
  attendance: {
    label: 'Attendance',
    columns: [
      { name: 'id', type: 'uuid' }, { name: 'event_id', type: 'uuid' },
      { name: 'member_id', type: 'uuid' }, { name: 'scanned_at', type: 'timestamp' },
    ],
    relations: [
      { key: 'events', label: 'Event', columns: ['id', 'name', 'date', 'project_id'] },
      { key: 'members', label: 'Member', columns: ['id', 'name', 'surname', 'gender', 'internal_code', 'mandal_id'] },
    ],
  },
};

export const AGG_TYPES = [
  { value: '',       label: '— none —' },
  { value: 'count',  label: 'Count' },
  { value: 'filled', label: 'Filled' },
  { value: 'empty',  label: 'Empty' },
  { value: 'unique', label: 'Unique' },
  { value: 'sum',    label: 'Sum' },
  { value: 'avg',    label: 'Average' },
  { value: 'min',    label: 'Min' },
  { value: 'max',    label: 'Max' },
];

export const FILTER_OPS = [
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'not equals' },
  { value: 'starts',       label: 'starts with' },
  { value: 'ends',         label: 'ends with' },
  { value: 'gt',           label: '> greater' },
  { value: 'lt',           label: '< less' },
  { value: 'gte',          label: '≥ greater or equal' },
  { value: 'lte',          label: '≤ less or equal' },
  { value: 'empty',        label: 'is empty' },
  { value: 'filled',       label: 'is filled' },
];

export const PRESET_REPORTS = [
  {
    id: 'mandal_registration_count',
    title: 'Mandal-wise Registration Count',
    baseTable: 'project_registrations',
    selectString: 'project_id, member_id, projects(name), members(mandals(name, kshetras(name)))',
    groupBy: 'members.mandals.name',
  },
  {
    id: 'kshetra_attendance',
    title: 'Kshetra-wise Attendance',
    baseTable: 'attendance',
    selectString: 'member_id, event_id, members(mandals(name, kshetras(name))), events(name, date, projects(name))',
    groupBy: 'members.mandals.kshetras.name',
  },
  {
    id: 'member_attendance_detail',
    title: 'Individual Member Attendance',
    baseTable: 'attendance',
    selectString: 'member_id, event_id, members(internal_code, name, surname, gender, mandals(name, kshetras(name))), events(name, date, projects(name))',
    groupBy: 'members.name',
  },
  {
    id: 'inactive_members',
    title: 'Members with No Registrations',
    baseTable: 'members',
    selectString: 'id, internal_code, name, surname, gender, mobile, mandals(name, kshetras(name)), project_registrations(project_id)',
    groupBy: 'mandals.name',
  },
  {
    id: 'project_mandal_matrix',
    title: 'Project × Mandal Matrix',
    baseTable: 'project_registrations',
    selectString: 'project_id, member_id, projects(name), members(gender, mandals(name, kshetras(name)))',
    groupBy: 'projects.name',
  },
  {
    id: 'gender_breakdown',
    title: 'Gender Breakdown by Mandal',
    baseTable: 'members',
    selectString: 'id, gender, mandals(name, kshetras(name))',
    groupBy: 'mandals.name',
  },
  {
    id: 'event_attendance_rate',
    title: 'Event-wise Attendance',
    baseTable: 'events',
    selectString: 'id, name, date, projects(name), attendance(member_id)',
    groupBy: 'projects.name',
  },
];
// ============================================================
// reportConfig.js — Central configuration for the Reports Module
// Defines data sources, columns, filter definitions, aggregations
// ============================================================

export const MODULES = [
  { value: 'members',              label: 'Member Directory',            icon: 'Users' },
  { value: 'projects',             label: 'Projects & Events',           icon: 'FolderOpen' },
  { value: 'attendance_aggregate', label: 'Attendance Matrix',           icon: 'CalendarCheck' },
  { value: 'advanced_queries',     label: 'Advanced Analytics',          icon: 'Cpu' },
];

// ── Column definitions per module ───────────────────────────
export const AVAILABLE_COLUMNS = {
  members: [
    { key: 'internal_code',  label: 'Member ID',    type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'name',           label: 'First Name',   type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'surname',        label: 'Last Name',    type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'mobile',         label: 'Mobile',       type: 'string',  sortable: false, filterable: true,  groupable: false },
    { key: 'email',          label: 'Email',        type: 'string',  sortable: false, filterable: true,  groupable: false },
    { key: 'gender',         label: 'Gender',       type: 'string',  sortable: true,  filterable: true,  groupable: true,
      filterOptions: ['Yuvak', 'Yuvati'] },
    { key: 'designation',    label: 'Designation',  type: 'string',  sortable: true,  filterable: true,  groupable: true },
    { key: 'mandal_name',    label: 'Mandal',       type: 'string',  sortable: true,  filterable: true,  groupable: true },
    { key: 'join_date',      label: 'Join Date',    type: 'date',    sortable: true,  filterable: true,  groupable: false },
    { key: 'status',         label: 'Status',       type: 'string',  sortable: true,  filterable: true,  groupable: true,
      filterOptions: ['active', 'inactive'] },
  ],
  projects: [
    { key: 'name',           label: 'Project Name', type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'description',    label: 'Description',  type: 'string',  sortable: false, filterable: false, groupable: false },
    { key: 'status',         label: 'Status',       type: 'string',  sortable: true,  filterable: true,  groupable: true,
      filterOptions: ['active', 'completed', 'upcoming', 'cancelled'] },
    { key: 'start_date',     label: 'Start Date',   type: 'date',    sortable: true,  filterable: true,  groupable: false },
    { key: 'end_date',       label: 'End Date',     type: 'date',    sortable: true,  filterable: true,  groupable: false },
    { key: 'total_events',   label: 'Total Events', type: 'number',  sortable: true,  filterable: false, groupable: false },
    { key: 'total_members',  label: 'Registered Members', type: 'number', sortable: true, filterable: false, groupable: false },
  ],
  attendance_aggregate: [
    { key: 'member_name',           label: 'Member Name',         type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'internal_code',         label: 'Member ID',           type: 'string',  sortable: true,  filterable: true,  groupable: false },
    { key: 'mandal_name',           label: 'Mandal',              type: 'string',  sortable: true,  filterable: true,  groupable: true },
    { key: 'gender',                label: 'Gender',              type: 'string',  sortable: true,  filterable: true,  groupable: true,
      filterOptions: ['Yuvak', 'Yuvati'] },
    { key: 'total_events_attended', label: 'Events Attended',     type: 'number',  sortable: true,  filterable: false, groupable: false },
    { key: 'total_projects',        label: 'Projects Count',      type: 'number',  sortable: true,  filterable: false, groupable: false },
    { key: 'projects_participated', label: 'Projects',            type: 'string',  sortable: false, filterable: false, groupable: false },
    { key: 'attendance_rate',       label: 'Attendance Rate (%)', type: 'number',  sortable: true,  filterable: false, groupable: false },
  ],
  advanced_queries: [],
};

// ── Advanced (pre-built) analytics queries ───────────────────
export const ADVANCED_QUERIES = [
  {
    value: 'members_no_projects',
    label: 'Inactive: Members not in any project',
    description: 'Members who have zero project registrations',
    columns: [
      { key: 'internal_code', label: 'Member ID',   type: 'string' },
      { key: 'name',          label: 'Name',         type: 'string' },
      { key: 'mobile',        label: 'Mobile',       type: 'string' },
      { key: 'mandal_name',   label: 'Mandal',       type: 'string' },
    ],
  },
  {
    value: 'mandal_demographics',
    label: 'Demographics: Mandal-wise Gender Ratio',
    description: 'Member count and gender breakdown per mandal',
    columns: [
      { key: 'mandal',  label: 'Mandal',        type: 'string' },
      { key: 'total',   label: 'Total Members', type: 'number' },
      { key: 'yuvak',   label: 'Yuvaks',        type: 'number' },
      { key: 'yuvati',  label: 'Yuvatis',       type: 'number' },
      { key: 'ratio',   label: 'Yuvak %',       type: 'number' },
    ],
  },
  {
    value: 'top_attendees',
    label: 'Leaderboard: Top 50 Most Active Members',
    description: 'Members ranked by total events attended',
    columns: [
      { key: 'rank',                  label: 'Rank',           type: 'number' },
      { key: 'member_name',           label: 'Member Name',    type: 'string' },
      { key: 'mandal_name',           label: 'Mandal',         type: 'string' },
      { key: 'total_events_attended', label: 'Events',         type: 'number' },
      { key: 'total_projects',        label: 'Projects',       type: 'number' },
    ],
  },
  {
    value: 'project_participation_matrix',
    label: 'Project Participation: Cross-Reference Matrix',
    description: 'How many members from each mandal joined each project',
    columns: [
      { key: 'mandal_name',       label: 'Mandal',       type: 'string' },
      { key: 'project_name',      label: 'Project',      type: 'string' },
      { key: 'member_count',      label: 'Members',      type: 'number' },
      { key: 'avg_attendance',    label: 'Avg Attendance', type: 'number' },
    ],
  },
  {
    value: 'event_attendance_summary',
    label: 'Event-wise Attendance Summary',
    description: 'Attendance count for every event across all projects',
    columns: [
      { key: 'project_name',   label: 'Project',        type: 'string' },
      { key: 'event_name',     label: 'Event',          type: 'string' },
      { key: 'event_date',     label: 'Date',           type: 'date' },
      { key: 'present_count',  label: 'Present',        type: 'number' },
      { key: 'total_expected', label: 'Total Expected', type: 'number' },
      { key: 'rate',           label: 'Rate (%)',        type: 'number' },
    ],
  },
];

// ── Aggregation functions available for number columns ───────
export const AGGREGATION_FUNCTIONS = [
  { value: 'none',    label: 'None' },
  { value: 'sum',     label: 'Sum' },
  { value: 'avg',     label: 'Average' },
  { value: 'count',   label: 'Count' },
  { value: 'min',     label: 'Min' },
  { value: 'max',     label: 'Max' },
];

// ── Filter operator definitions by column type ───────────────
export const FILTER_OPERATORS = {
  string: [
    { value: 'contains',    label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'equals',      label: 'Equals' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'is_empty',    label: 'Is empty' },
    { value: 'in',          label: 'Is one of' },
  ],
  number: [
    { value: 'eq',  label: '= Equals' },
    { value: 'gt',  label: '> Greater than' },
    { value: 'gte', label: '≥ Greater or equal' },
    { value: 'lt',  label: '< Less than' },
    { value: 'lte', label: '≤ Less or equal' },
    { value: 'between', label: 'Between' },
  ],
  date: [
    { value: 'before',  label: 'Before' },
    { value: 'after',   label: 'After' },
    { value: 'between', label: 'Between' },
    { value: 'equals',  label: 'On date' },
  ],
};

// ── Relationship graph for visual join suggestions ────────────
// Add this at the BOTTOM of reportConfig.js if it's missing

export function getJoinSuggestions(fromTable) {
  const suggestions = [];
  const schema = DB_SCHEMA[fromTable];
  if (!schema) return suggestions;

  // Forward FKs: this table references others
  (schema.foreignKeys || []).forEach(fk => {
    suggestions.push({
      type: 'LEFT',
      table: fk.references,
      alias: fk.references,
      on: `${fromTable}.${fk.column} = ${fk.references}.${fk.refColumn}`,
      label: `→ ${DB_SCHEMA[fk.references]?.label || fk.references} (via ${fk.column})`,
      direction: 'outgoing',
    });
  });

  // Reverse FKs: other tables reference this one
  Object.entries(DB_SCHEMA).forEach(([tableName, def]) => {
    if (tableName === fromTable) return;
    (def.foreignKeys || []).forEach(fk => {
      if (fk.references === fromTable) {
        suggestions.push({
          type: 'LEFT',
          table: tableName,
          alias: tableName,
          on: `${tableName}.${fk.column} = ${fromTable}.${fk.refColumn}`,
          label: `← ${def.label || tableName} (via ${fk.column})`,
          direction: 'incoming',
        });
      }
    });
  });

  return suggestions;
}