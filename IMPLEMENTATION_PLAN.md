# Implementation Action Plan

## Executive Overview

**Total Issues Found:** 22  
**Critical (Must Fix):** 3  
**High Priority (This Week):** 8  
**Medium Priority (This Month):** 7  
**Low Priority (Backlog):** 4  

**Estimated Total Effort:** 40-50 hours  
**Recommended Timeline:** 2-3 weeks

---

## PHASE 1: CRITICAL SECURITY FIXES (48 hours)

These must be fixed immediately to prevent exploitation.

### Sprint 1.1: Sensitive Data Exposure Fix
**Duration:** 2 hours  
**Files:** `src/contexts/AuthContext.jsx`, `src/components/Sidebar.jsx`  
**PR Title:** "Security: Remove sensitive profile data from localStorage"

**Tasks:**
- [ ] Update AuthContext to remove profile caching
- [ ] Change to sessionStorage for non-sensitive data only
- [ ] Update logout flow to clear only auth data
- [ ] Add comments explaining security rationale
- [ ] Run: `npm run lint`
- [ ] Test: Local auth flow (login/logout)
- [ ] Test: localStorage inspection (should be empty)

**Acceptance Criteria:**
- ✅ `localStorage.getItem('keshav_profile_cache')` returns null
- ✅ Profile fetched fresh on every auth check
- ✅ No role/designation in browser storage
- ✅ All lint passes

**Code Changes Required:**
```diff
- const saveProfileCache = (profile) => {
-   localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({profile, cachedAt}))
- }
+ // Profile no longer cached (security risk)

- const handleLogout = async () => {
-   localStorage.clear()
+ const handleLogout = async () => {
+   sessionStorage.clear()
+   localStorage.removeItem('sb-auth-token')
```

---

### Sprint 1.2: HTML Injection Fix
**Duration:** 2 hours  
**Files:** `src/modules/registration/RegistrationRoster.jsx`  
**PR Title:** "Security: Escape HTML in print/export features"

**Tasks:**
- [ ] Add `escapeHTML()` utility function
- [ ] Update all `doc.write()` calls to escape user data
- [ ] Test print functionality with special characters
- [ ] Test export functionality with `<script>` tags in names
- [ ] Verify table headers are escaped
- [ ] Run: `npm run lint`

**Acceptance Criteria:**
- ✅ XSS payload in member names doesn't execute
- ✅ Print preview shows escaped content (`&lt;` instead of `<`)
- ✅ All data fields escaped (name, mandal, designation)
- ✅ Special chars display correctly (é, ñ, etc.)

**Code Changes Required:**
```diff
+ const escapeHTML = (text) => {
+   const div = document.createElement('div');
+   div.textContent = text;
+   return div.innerHTML;
+ }

- doc.write(`<h2>${project.name}</h2>`)
+ doc.write(`<h2>${escapeHTML(project.name)}</h2>`)

- Object.keys(cleanData[0]).forEach(h => doc.write(`<th>${h}</th>`))
+ Object.keys(cleanData[0]).forEach(h => doc.write(`<th>${escapeHTML(h)}</th>`))
```

---

### Sprint 1.3: SQL Injection Prevention
**Duration:** 4 hours  
**Files:** `src/modules/reports/ReportsDashboard.jsx`, new `src/modules/reports/allowedQueries.js`  
**PR Title:** "Security: Implement query whitelisting for reports"

**Tasks:**
- [ ] Create `allowedQueries.js` with report definitions
- [ ] Implement `buildSafeQuery()` function
- [ ] Replace SQL editor with report type selector
- [ ] Update ReportsDashboard to use whitelisting
- [ ] Test: Try to access unauthorized data (should fail)
- [ ] Test: Visual report builder still works
- [ ] Run: `npm run lint`

**Acceptance Criteria:**
- ✅ Free-form SQL editor removed
- ✅ Only pre-defined reports available
- ✅ Cannot inject PostgREST operators
- ✅ Cannot access restricted tables
- ✅ Filter suggestions only show allowed filters

**Code Changes Required:**
```diff
- const { data } = await supabase.rpc('query', { sql: userInput })
+ const query = await buildSafeQuery(reportType, columns, filters)
+ const { data } = await query.limit(10000)

- <textarea placeholder="SELECT..." value={userSQL} />
+ <select value={reportType}>
+   <option value="member_directory">Member Directory</option>
+   <option value="attendance">Attendance Records</option>
+ </select>
```

---

### Phase 1 Testing Checklist
```bash
# Before merging any Phase 1 PR:

# 1. Security tests
npm test -- --testPathPattern=security
npm run lint

# 2. Manual testing
# - Login/logout cycle
# - Check DevTools → Application → Storage (should be empty)
# - Create member with XSS payload: <img src=x onerror="alert(1)">
# - Export/print report (no alert should appear)
# - Access Reports, try freeform SQL (should show error)

# 3. Build test
npm run build
# Should succeed with no warnings
```

---

## PHASE 2: HIGH PRIORITY FIXES (This Week)

Target: Complete by end of week

### Sprint 2.1: Database RLS Implementation
**Duration:** 3 hours (assumes DB access)  
**Files:** Database schema (run SQL migrations)  
**PR Title:** "Security: Enable Row-Level Security on all tables"

**Database SQL:**
```sql
-- Create RLS policies for members table
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_own_profile"
ON members
AS SELECT
USING (
  -- Users can see:
  -- 1. Their own profile
  id = auth.uid()
  -- 2. Members in their mandal (if regional role)
  OR mandal_id IN (
    SELECT assigned_mandal_id FROM user_profiles 
    WHERE id = auth.uid() AND role IN ('sanchalak', 'nirikshak')
  )
  -- 3. Members in their kshetra (if nirdeshak)
  OR mandal_id IN (
    SELECT m.id FROM mandals m
    WHERE m.kshetra_id = (
      SELECT assigned_kshetra_id FROM user_profiles 
      WHERE id = auth.uid() AND role = 'nirdeshak'
    )
  )
  -- 4. All members (if admin)
  OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
);

-- Create RLS policies for attendance table
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_project_access"
ON attendance
AS SELECT
USING (
  -- Users can see attendance for events in their projects
  event_id IN (
    SELECT e.id FROM events e
    WHERE e.project_id IN (
      SELECT project_id FROM project_assignments 
      WHERE user_id = auth.uid()
    )
  )
  -- Or admins can see all
  OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
);

-- Create RLS policies for project_registrations table
ALTER TABLE project_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registrations_project_access"
ON project_registrations
AS SELECT
USING (
  -- Users can see registrations for their projects
  project_id IN (
    SELECT project_id FROM project_assignments 
    WHERE user_id = auth.uid()
  )
  -- Or admins can see all
  OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
);
```

**Tasks:**
- [ ] Review current RLS status in Supabase console
- [ ] Write RLS policies for all sensitive tables
- [ ] Test policies with different user roles
- [ ] Verify frontend queries still work
- [ ] Document RLS strategy in POLICIES.md

**Testing:**
```bash
# Create test user with 'sanchalak' role assigned to Mandal A
# - Can see members in Mandal A ✓
# - Cannot see members in Mandal B ✗
# - Can see attendance for their projects ✓
# - Cannot see attendance for other projects ✗
```

---

### Sprint 2.2: Form Input Validation
**Duration:** 3 hours  
**Files:** `src/modules/members/MemberForm.jsx`, `src/modules/projects/ProjectForm.jsx`, `src/modules/projects/EventForm.jsx`  
**PR Title:** "Security & UX: Enhance form input validation"

**Tasks:**
- [ ] Add validation helper functions
- [ ] Validate all text inputs (name, description, etc.)
- [ ] Add max length limits
- [ ] Add pattern validation for specific fields
- [ ] Show validation errors to user
- [ ] Test with edge cases and special characters

**Validation Rules:**
```javascript
const VALIDATION_RULES = {
  name: { pattern: /^[a-zA-Z\s'-]{2,100}$/, minLength: 2, maxLength: 100 },
  surname: { pattern: /^[a-zA-Z\s'-]{2,100}$/, minLength: 2, maxLength: 100 },
  father_name: { pattern: /^[a-zA-Z\s'-]{2,100}$/, minLength: 2, maxLength: 100 },
  mobile: { pattern: /^\d{10}$/, minLength: 10, maxLength: 10 },
  designation: { pattern: /^[a-zA-Z\s]{2,50}$/, maxLength: 50 },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxLength: 100 },
  dob: { type: 'date', required: false },
  project_name: { pattern: /^[a-zA-Z0-9\s\-.,&()]{2,200}$/, maxLength: 200 },
  description: { maxLength: 500 }
};
```

**Code Changes:**
```javascript
const validateInput = (fieldName, value) => {
  const rule = VALIDATION_RULES[fieldName];
  if (!rule) return { valid: true };
  
  if (rule.required && !value) {
    return { valid: false, error: `${fieldName} is required` };
  }
  
  if (value.length < (rule.minLength || 0)) {
    return { valid: false, error: `Minimum length: ${rule.minLength}` };
  }
  
  if (value.length > rule.maxLength) {
    return { valid: false, error: `Maximum length: ${rule.maxLength}` };
  }
  
  if (rule.pattern && !rule.pattern.test(value)) {
    return { valid: false, error: `Invalid format for ${fieldName}` };
  }
  
  return { valid: true };
};
```

---

### Sprint 2.3: Search Request Cancellation
**Duration:** 2 hours  
**Files:** `src/modules/registration/RegistrationRoster.jsx`, `src/modules/members/MemberDirectory.jsx`  
**PR Title:** "Performance: Cancel outdated search requests"

**Tasks:**
- [ ] Implement AbortController for search requests
- [ ] Cancel previous requests before new search
- [ ] Test: Rapid typing doesn't cause data inconsistency
- [ ] Add loading state while request is in-flight

**Code Changes:**
```javascript
const abortControllerRef = useRef(null);

const handleSearch = useCallback(async (query) => {
  // Cancel previous
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  
  // New request
  abortControllerRef.current = new AbortController();
  
  try {
    const { data } = await supabase
      .from('members')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(50)
      .signal(abortControllerRef.current.signal);
    
    setResults(data);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Search error:', err);
    }
  }
}, []);
```

---

### Sprint 2.4: Logout Flow Security
**Duration:** 1 hour  
**Files:** `src/components/Sidebar.jsx`  
**PR Title:** "Security: Improve logout flow and session handling"

**Tasks:**
- [ ] Update logout to clear only auth data
- [ ] Use hard reload instead of window.location.replace
- [ ] Add logout confirmation (optional)
- [ ] Test logout in multiple tabs
- [ ] Test: Token not reused after logout

**Code Changes:**
```javascript
const handleLogout = async () => {
  try {
    // Clear only auth data
    sessionStorage.clear();
    localStorage.removeItem('sb-auth-token');
    localStorage.removeItem('keshav_user_id');
    
    // Sign out
    await supabase.auth.signOut();
    
    // Hard reload to clear memory
    window.location.href = '/login?logout=true';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
};
```

---

### Phase 2 Testing Checklist
```bash
# After completing Phase 2:

npm test -- --testPathPattern="high-priority"
npm run lint
npm run build

# Manual testing:
# - Forms reject invalid input ✓
# - Search doesn't show stale results ✓
# - Logout clears session properly ✓
# - RLS prevents unauthorized data access ✓
```

---

## PHASE 3: MEDIUM PRIORITY FIXES (This Month)

Target: Complete by end of month

### Sprint 3.1: Report Query Optimization
**Duration:** 4 hours  
**Files:** `src/modules/reports/reportQueryEngine.js`  

**Changes:**
- [ ] Reduce default limits (5000 → 500)
- [ ] Implement cursor-based pagination
- [ ] Add database indexes for common filters
- [ ] Cache report results for 5 minutes

**Expected Improvements:**
- Memory: 100-200MB → 20-30MB
- Load time: 5-10s → 1-2s
- Report generation: 10-30s → 2-5s

---

### Sprint 3.2: Component Performance
**Duration:** 3 hours  
**Files:** `src/modules/members/MemberDirectory.jsx`, `src/modules/attendance/Attendance.jsx`  

**Changes:**
- [ ] Memoize MemberRow component
- [ ] Memoize AttendanceRow component
- [ ] Add memo to filter/sort calculations
- [ ] Use useCallback for all event handlers

---

### Sprint 3.3: Bundle Optimization
**Duration:** 2 hours  
**Files:** `vite.config.js`, `src/App.jsx`  

**Changes:**
- [ ] Move IDCardGenerator to lazy import
- [ ] Remove unused dependencies
- [ ] Add bundle size monitoring
- [ ] Expected reduction: 50-80KB

---

## PHASE 4: LOW PRIORITY / NICE-TO-HAVE (Backlog)

### 4.1 Security Headers
- Add CSP headers to index.html
- Add X-Frame-Options, X-Content-Type-Options
- Effort: 1 hour

### 4.2 Offline Support
- Implement full offline sync with Dexie
- Effort: 8 hours

### 4.3 Audit Logging
- Log all state-changing operations
- Track report exports, member edits
- Effort: 6 hours

### 4.4 Rate Limiting
- Implement rate limits on login
- Prevent brute force attacks
- Effort: 3 hours

---

## Success Metrics

### Security Metrics
- [ ] No critical vulnerabilities reported
- [ ] All sensitive data removed from localStorage
- [ ] HTML injection tests pass
- [ ] SQL injection tests pass
- [ ] RLS policies active on all tables

### Performance Metrics
- [ ] Member directory loads in < 2 seconds
- [ ] Reports generate in < 5 seconds
- [ ] Bundle size < 300KB (gzipped)
- [ ] Lighthouse score > 85

### Quality Metrics
- [ ] 100% of PRs reviewed
- [ ] All tests passing
- [ ] No ESLint warnings
- [ ] Code coverage > 70%

---

## Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Breaking existing auth flow | Medium | High | Thorough testing of login/logout |
| RLS policies too restrictive | Medium | Medium | Test each role thoroughly |
| Performance degradation | Low | Medium | Monitor metrics during rollout |
| User confusion with new report UI | Low | Low | Add help text and tooltips |

---

## Rollout Strategy

### Option 1: Phased Rollout (Recommended)
1. Deploy Phase 1 to production (critical fixes)
2. Monitor error rates for 24 hours
3. Deploy Phase 2 next week (high priority)
4. Continue with phases 3 & 4

### Option 2: Big Bang
Deploy all phases at once (only if very confident)
- Risk: Higher chance of production issues
- Benefit: Faster completion

---

## Monitoring & Alerts

**After each deployment, monitor:**
- Error rate (alert if > 1%)
- Auth failures (alert if > 0.5%)
- Response times (alert if avg > 3s)
- Storage usage (alert if > 100MB)

**Tools:**
- Supabase dashboard for error logs
- Lighthouse for performance
- Chrome DevTools for memory leaks

---

## Communication Plan

### For Dev Team
- [ ] Schedule kickoff meeting
- [ ] Assign owners for each sprint
- [ ] Daily standups during Phase 1
- [ ] Weekly reviews after each phase

### For Product/Stakeholders
- [ ] Explain security concerns (non-technical)
- [ ] Show roadmap and timeline
- [ ] Demonstrate improvements (before/after)
- [ ] Get approval for Phase 1 deployment

### For Users
- [ ] No user-facing changes (mostly backend)
- [ ] Slight UI change for reports (whitelisting)
- [ ] Document in release notes

---

## Estimated Timeline

| Phase | Effort | Timeline | Start Date | End Date |
|-------|--------|----------|-----------|----------|
| Phase 1 (Critical) | 8h | 1 day | Week 1, Day 1 | Week 1, Day 2 |
| Phase 2 (High) | 12h | 2-3 days | Week 1, Day 3 | Week 1, Day 5 |
| Phase 3 (Medium) | 12h | Full week | Week 2 | Week 2 |
| Phase 4 (Low) | 20h | Backlog | Week 3+ | As capacity allows |

**Total: 40-50 hours across 2-3 weeks**

---

## Final Checklist Before Launch

- [ ] All code reviewed and approved
- [ ] All tests passing (unit, integration, security)
- [ ] Security review completed
- [ ] Performance baseline established
- [ ] Monitoring & alerts configured
- [ ] Rollback plan documented
- [ ] Team trained on new security measures
- [ ] Stakeholders informed and approved
- [ ] Release notes prepared
- [ ] User documentation updated

---

**Report Generated:** May 13, 2026  
**Next Review:** June 13, 2026 (1 month follow-up)
