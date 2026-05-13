# Quick-Fix Guide for Critical Issues

This document provides immediate code fixes for the 3 critical vulnerabilities.

---

## Fix 1: Remove Profile from localStorage

**File:** `src/contexts/AuthContext.jsx`

**Current Code (Lines 7-34):**
```javascript
const PROFILE_CACHE_KEY = 'keshav_profile_cache';
const PROFILE_CACHE_TTL = 1000 * 60 * 30;

const saveProfileCache = (profile) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      profile,
      cachedAt: Date.now(),
    }));
  } catch (_) {}
};

const loadProfileCache = (userId) => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const { profile, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > PROFILE_CACHE_TTL) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    if (profile?.id !== userId) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return profile;
  } catch (_) {
    return null;
  }
};

const clearProfileCache = () => {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch (_) {}
};
```

**Fixed Code:**
```javascript
// ❌ REMOVED: localStorage caching (security risk)
// Profile is sensitive data (role, mandal_id, etc.) - should NOT be cached

// NEW: Optional session-only user identifier cache (non-sensitive only)
const USER_ID_CACHE_KEY = 'keshav_user_id';

const saveUserIdCache = (userId) => {
  try {
    sessionStorage.setItem(USER_ID_CACHE_KEY, userId);
  } catch (_) {}
};

const loadUserIdCache = () => {
  try {
    return sessionStorage.getItem(USER_ID_CACHE_KEY);
  } catch (_) {
    return null;
  }
};

const clearUserIdCache = () => {
  try { sessionStorage.removeItem(USER_ID_CACHE_KEY); } catch (_) {}
};

// Function to fetch profile (always fresh from server)
const fetchUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
};
```

**Update useEffect in AuthProvider (Lines 54-75):**
```javascript
useEffect(() => {
  let mounted = true;
  let currentUserId = null;

  const initialize = async () => {
    try {
      // getSession() reads localStorage — zero network, instant
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        setUser(session.user);
        currentUserId = session.user.id;
        saveUserIdCache(session.user.id); // Cache only the ID

        // Always fetch fresh profile from server (no caching)
        const { data } = await Promise.race([
          fetchUserProfile(session.user.id),
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: null }), 8000)
          ),
        ]);

        if (mounted) {
          if (data) {
            setProfile(data);
          }
          setLoading(false);
        }
      } else {
        // No session — not logged in
        clearUserIdCache();
        setLoading(false);
      }
    } catch (err) {
      console.error('[AUTH] init error:', err.message);
      if (mounted) setLoading(false);
    }
  };

  initialize();

  // Listener handles changes AFTER init — login, logout, token refresh
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        currentUserId = null;
        clearUserIdCache(); // Clear session cache
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && session.user.id !== currentUserId) {
        currentUserId = session.user.id;
        setUser(session.user);
        saveUserIdCache(session.user.id);

        // Fetch fresh profile
        const { data } = await Promise.race([
          fetchUserProfile(session.user.id),
          new Promise((resolve) =>
            setTimeout(() => resolve({ data: null }), 8000)
          ),
        ]);
        if (mounted) {
          if (data) {
            setProfile(data);
          }
        }
      }
    }
  );

  return () => {
    mounted = false;
    subscription?.unsubscribe();
  };
}, []);
```

**Update logout function (src/components/Sidebar.jsx, Lines 29-37):**
```javascript
const handleLogout = async () => {
  try {
    // Clear only auth-related session data
    clearUserIdCache();
    sessionStorage.clear(); // Clear session storage
    
    // Clear only specific localStorage entries (not everything)
    localStorage.removeItem('sb-auth-token');
    localStorage.removeItem('sb-auth-token-code-verifier');
    
    // Sign out from Supabase
    await supabase.auth.signOut();
    
    // Hard reload to clear all in-memory state
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    // Always redirect, even if signOut fails
    window.location.href = '/login';
  }
};
```

---

## Fix 2: HTML Injection in Reports

**File:** `src/modules/registration/RegistrationRoster.jsx`

**Current Code (around Line 529):**
```javascript
doc.write('<style>body{font-family:sans-serif; padding:20px; color:#111827;} table{border-collapse:collapse; width:100%; font-size:12px; margin-top:20px;} th,td{border:1px solid #e5e7eb; padding:10px; text-align:left;} th{background-color:#f9fafb; color:#374151;}</style>');
doc.write('</head><body>');
doc.write(`<h2 style="color:#5C3030; margin-bottom:5px;">${project.name}</h2>`);
doc.write(`<p style="color:#6b7280; font-size:14px; margin-top:0;">${subtitle} &bull; Total: ${cleanData.length}</p>`);

doc.write('<table><thead><tr>');
Object.keys(cleanData[0]).forEach(h => doc.write(`<th>${h}</th>`));
// ... rest of table
```

**Fixed Code:**
```javascript
// Helper function to escape HTML entities
const escapeHTML = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Fixed print handler:
const handlePrint = () => {
  const doc = window.open('', 'print', 'height=600,width=800');
  
  // Safe header
  doc.write('<style>body{font-family:sans-serif; padding:20px; color:#111827;} table{border-collapse:collapse; width:100%; font-size:12px; margin-top:20px;} th,td{border:1px solid #e5e7eb; padding:10px; text-align:left;} th{background-color:#f9fafb; color:#374151;}</style>');
  doc.write('</head><body>');
  
  // Escape project name and subtitle
  doc.write(`<h2 style="color:#5C3030; margin-bottom:5px;">${escapeHTML(project.name)}</h2>`);
  doc.write(`<p style="color:#6b7280; font-size:14px; margin-top:0;">${escapeHTML(subtitle)} &bull; Total: ${cleanData.length}</p>`);

  // Build table with escaped data
  doc.write('<table><thead><tr>');
  Object.keys(cleanData[0]).forEach(header => {
    // Escape header names
    doc.write(`<th>${escapeHTML(String(header))}</th>`);
  });
  doc.write('</tr></thead><tbody>');

  // Escape all row data
  cleanData.forEach(row => {
    doc.write('<tr>');
    Object.values(row).forEach(value => {
      doc.write(`<td>${escapeHTML(String(value || ''))}</td>`);
    });
    doc.write('</tr>');
  });

  doc.write('</tbody></table>');
  doc.write('</body></html>');
  doc.close();
  doc.print();
};
```

**Alternative: Use jsPDF directly (Better approach):**
```javascript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const handleExport = async (format) => {
  if (format === 'print') {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Add title safely
    doc.setFontSize(14);
    doc.text(escapeHTML(project.name), 14, 20);
    doc.setFontSize(10);
    doc.text(escapeHTML(subtitle), 14, 30);

    // Add table with autoTable (automatically escapes)
    autoTable(doc, {
      head: [Object.keys(cleanData[0]).map(escapeHTML)],
      body: cleanData.map(row => 
        Object.values(row).map(v => escapeHTML(String(v || '')))
      ),
      startY: 40,
    });

    doc.output('dataurlstring'); // Don't use print() directly
    window.print();
  }
};
```

---

## Fix 3: SQL Query Whitelisting

**File:** `src/modules/reports/ReportsDashboard.jsx`

**Current Code (problematic free-form SQL):**
```javascript
// Users can write arbitrary PostgREST queries
const handleExecute = async () => {
  const { data, error } = await supabase.rpc('query', {
    sql: selectString // ❌ User-provided SQL!
  });
};
```

**Fixed Code - Implement Whitelist:**

Create a new file: `src/modules/reports/allowedQueries.js`

```javascript
// allowedQueries.js
// Define all allowed reports and their safe query patterns

export const ALLOWED_REPORTS = {
  member_directory: {
    name: 'Member Directory',
    table: 'members',
    defaultColumns: ['internal_code', 'name', 'surname', 'gender', 'mobile'],
    allowedColumns: [
      'internal_code', 'name', 'surname', 'father_name', 'gender',
      'mobile', 'dob', 'designation', 'created_at', 'address'
    ],
    joins: [
      { table: 'mandals', on: 'mandal_id', fields: ['name'] },
      { table: 'kshetras', on: 'kshetra_id', fields: ['name'] }
    ],
    allowedFilters: [
      { column: 'gender', operator: 'eq', type: 'select' },
      { column: 'designation', operator: 'eq', type: 'select' },
      { column: 'mandal_id', operator: 'eq', type: 'select' }
    ]
  },

  attendance_records: {
    name: 'Attendance Records',
    table: 'attendance',
    defaultColumns: ['scanned_at', 'member_id', 'event_id'],
    allowedColumns: [
      'id', 'member_id', 'event_id', 'scanned_at', 'marked_by'
    ],
    joins: [
      { table: 'members', on: 'member_id', fields: ['name', 'surname'] },
      { table: 'events', on: 'event_id', fields: ['name', 'date'] }
    ],
    allowedFilters: [
      { column: 'event_id', operator: 'eq', type: 'select' },
      { column: 'scanned_at', operator: 'after', type: 'date' }
    ]
  },

  project_registrations: {
    name: 'Project Registrations',
    table: 'project_registrations',
    defaultColumns: ['seat_number', 'member_id', 'project_id', 'registered_at'],
    allowedColumns: [
      'id', 'project_id', 'member_id', 'seat_number', 'exam_level', 'registered_at'
    ],
    joins: [
      { table: 'projects', on: 'project_id', fields: ['name'] },
      { table: 'members', on: 'member_id', fields: ['name', 'surname'] }
    ],
    allowedFilters: [
      { column: 'project_id', operator: 'eq', type: 'select' },
      { column: 'exam_level', operator: 'eq', type: 'select' }
    ]
  }
};

// Build safe query from whitelist
export async function buildSafeQuery(reportType, selectedColumns, filters) {
  const report = ALLOWED_REPORTS[reportType];
  if (!report) throw new Error('Invalid report type');

  // Validate columns
  const cols = selectedColumns.filter(c => 
    report.allowedColumns.includes(c)
  );
  if (cols.length === 0) throw new Error('No valid columns selected');

  // Build select string
  let selectStr = cols.join(',');

  // Add joins if needed
  for (const join of report.joins) {
    const needsJoin = cols.some(c => 
      join.fields.includes(c) || c.includes(`${join.table}.`)
    );
    if (needsJoin) {
      selectStr += `,${join.table}(${join.fields.join(',')})`;
    }
  }

  // Start query
  let query = supabase.from(report.table).select(selectStr);

  // Apply only whitelisted filters
  for (const filter of filters) {
    const allowed = report.allowedFilters.find(f => 
      f.column === filter.column
    );
    if (!allowed) continue; // Skip invalid filters

    // Validate operator matches whitelist
    if (allowed.operator !== filter.operator) {
      throw new Error(`Invalid operator for ${filter.column}`);
    }

    // Apply filter safely (Supabase handles parameterization)
    switch (filter.operator) {
      case 'eq':
        query = query.eq(filter.column, filter.value);
        break;
      case 'after':
        query = query.gt(filter.column, filter.value);
        break;
      case 'contains':
        query = query.ilike(filter.column, `%${filter.value}%`);
        break;
    }
  }

  return query;
}
```

**Update ReportsDashboard.jsx:**

```javascript
import { ALLOWED_REPORTS, buildSafeQuery } from './allowedQueries';

// Replace the old SQL builder with safe version
const handleExecute = async () => {
  try {
    setIsExecuting(true);
    
    // Get selected report type
    if (!selectedReportType) {
      throw new Error('Select a report type');
    }

    // Build query using whitelist
    const query = await buildSafeQuery(
      selectedReportType,
      visibleColumns,
      filters
    );

    const { data, error } = await query.limit(10000);
    
    if (error) throw error;
    
    setResults(data);
    setIsExecuting(false);
  } catch (err) {
    toast.error(err.message);
    setIsExecuting(false);
  }
};

// Render report selector instead of freeform SQL
return (
  <div className="space-y-4">
    <div>
      <label>Select Report Type</label>
      <select 
        value={selectedReportType}
        onChange={(e) => setSelectedReportType(e.target.value)}
      >
        <option value="">Choose a report...</option>
        {Object.entries(ALLOWED_REPORTS).map(([key, report]) => (
          <option key={key} value={key}>{report.name}</option>
        ))}
      </select>
    </div>

    {selectedReportType && (
      <>
        {/* Show allowed columns only */}
        <div>
          <label>Columns</label>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_REPORTS[selectedReportType].allowedColumns.map(col => (
              <button
                key={col}
                onClick={() => toggleColumn(col)}
                className={`px-3 py-1 rounded ${
                  visibleColumns.includes(col)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        </div>

        {/* Show allowed filters only */}
        <div>
          <label>Filters</label>
          {ALLOWED_REPORTS[selectedReportType].allowedFilters.map(f => (
            <div key={f.column} className="mb-2">
              <label>{f.column}</label>
              <input
                type={f.type}
                onChange={(e) => setFilters([
                  ...filters,
                  { column: f.column, operator: f.operator, value: e.target.value }
                ])}
              />
            </div>
          ))}
        </div>

        <button onClick={handleExecute} disabled={isExecuting}>
          {isExecuting ? 'Running...' : 'Execute'}
        </button>
      </>
    )}
  </div>
);
```

---

## Testing These Fixes

### Test Fix 1 (localStorage removal):
```bash
# Open DevTools Console
localStorage.getItem('keshav_profile_cache') 
// Should return null (not the profile)

// Login and logout
localStorage.getItem('keshav_user_id')
// Should return null after logout
```

### Test Fix 2 (HTML injection):
```bash
# In MemberForm, create a member with:
Name: <img src=x onerror="alert('xss')">

# Print/export the report
# Alert should NOT appear (HTML escaped)
# Should see: &lt;img src=x...&gt;
```

### Test Fix 3 (SQL whitelisting):
```bash
# Try to access Reports module
# Free-form SQL editor should be GONE
# Only predefined report types available

# Try to select unauthorized columns
# Should not show sensitive filters
```

---

## Deployment Checklist

- [ ] Test all three fixes locally
- [ ] Run full test suite
- [ ] Deploy to staging
- [ ] Test in staging environment
- [ ] Get security review approval
- [ ] Deploy to production
- [ ] Monitor error logs for 1 hour
- [ ] Verify no user complaints
- [ ] Document changes in release notes
