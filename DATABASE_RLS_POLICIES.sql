-- 🔐 SECURITY: Row-Level Security (RLS) Policies for Keshav System
-- This document contains SQL policies to implement in Supabase
-- These policies ensure users can only access data they're authorized to see

-- ============================================================================
-- RLS SETUP INSTRUCTIONS
-- ============================================================================
-- 1. Go to Supabase Dashboard > Project > SQL Editor
-- 2. Create a new query and copy-paste the relevant policy sections below
-- 3. Execute each section to enable RLS on the table
-- 4. Test permissions in your frontend

-- ============================================================================
-- 1. MEMBERS TABLE - Restrict by Mandal/Kshetra/Role
-- ============================================================================

-- Enable RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Admin can see all members
CREATE POLICY "Admin can access all members"
ON members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM user_profiles WHERE role = 'admin'
  )
);

-- Sanchalak can see members in their assigned mandal only
CREATE POLICY "Sanchalak can access assigned mandal members"
ON members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM user_profiles 
    WHERE role = 'sanchalak' 
    AND mandal_id = members.mandal_id
  )
);

-- Nirdeshak can see members in their assigned kshetra
CREATE POLICY "Nirdeshak can access kshetra members"
ON members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT up.id FROM user_profiles up
    JOIN mandals m ON m.kshetra_id = up.assigned_kshetra_id
    WHERE up.role = 'nirdeshak'
    AND m.id = members.mandal_id
  )
);

-- Nirikshak can see members in assigned mandals
CREATE POLICY "Nirikshak can access assigned mandal members"
ON members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT up.id FROM user_profiles up
    WHERE up.role = 'nirikshak'
    AND members.mandal_id IN (
      SELECT na.mandal_id FROM nirikshak_assignments na WHERE na.nirikshak_id = up.id
    )
  )
);

-- ============================================================================
-- 2. USER_PROFILES TABLE - Prevent unauthorized role viewing
-- ============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "Users can see their own profile"
ON user_profiles
FOR SELECT
USING (auth.uid() = id);

-- Admin can see all profiles
CREATE POLICY "Admin can see all profiles"
ON user_profiles
FOR SELECT
USING (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- Users can only update their own profile (limited fields)
CREATE POLICY "Users can update their own profile"
ON user_profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()) -- Prevent privilege escalation
);

-- ============================================================================
-- 3. PROJECT_REGISTRATIONS TABLE - Scope by project membership
-- ============================================================================

ALTER TABLE project_registrations ENABLE ROW LEVEL SECURITY;

-- Admin can see all registrations
CREATE POLICY "Admin can see all registrations"
ON project_registrations
FOR SELECT
USING (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- Project coordinators and admins can see project registrations
CREATE POLICY "Project staff can see registrations"
ON project_registrations
FOR SELECT
USING (
  project_id IN (
    SELECT project_id FROM project_assignments 
    WHERE user_id = auth.uid()
    AND role IN ('coordinator', 'editor', 'project_admin')
  )
);

-- ============================================================================
-- 4. ATTENDANCE TABLE - Restrict by project and event
-- ============================================================================

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Admin can see all attendance
CREATE POLICY "Admin can see all attendance"
ON attendance
FOR SELECT
USING (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- Project staff can see attendance for their project
CREATE POLICY "Project staff can see project attendance"
ON attendance
FOR SELECT
USING (
  event_id IN (
    SELECT e.id FROM events e
    WHERE e.project_id IN (
      SELECT project_id FROM project_assignments
      WHERE user_id = auth.uid()
    )
  )
);

-- Only authorized users can mark attendance
CREATE POLICY "Authorized users can mark attendance"
ON attendance
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT up.id FROM user_profiles up
    WHERE up.role IN ('admin', 'taker', 'sanchalak', 'project_admin')
  )
);

-- ============================================================================
-- 5. PROJECT_ASSIGNMENTS TABLE - Prevent unauthorized role assignment
-- ============================================================================

ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

-- Users can only see their own assignments
CREATE POLICY "Users can see their own assignments"
ON project_assignments
FOR SELECT
USING (auth.uid() = user_id);

-- Admin can see all assignments
CREATE POLICY "Admin can see all assignments"
ON project_assignments
FOR SELECT
USING (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- Only admin can insert/update assignments
CREATE POLICY "Only admin can manage assignments"
ON project_assignments
FOR INSERT
WITH CHECK (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

CREATE POLICY "Only admin can update assignments"
ON project_assignments
FOR UPDATE
WITH CHECK (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- ============================================================================
-- 6. SAVED_REPORTS TABLE - Restrict by creator and project
-- ============================================================================

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- Users can see their own reports
CREATE POLICY "Users can see their own reports"
ON saved_reports
FOR SELECT
USING (auth.uid() = created_by);

-- Admin can see all reports
CREATE POLICY "Admin can see all reports"
ON saved_reports
FOR SELECT
USING (
  auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin')
);

-- Users can only update/delete their own reports
CREATE POLICY "Users can update their own reports"
ON saved_reports
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own reports"
ON saved_reports
FOR DELETE
USING (auth.uid() = created_by);

-- ============================================================================
-- TESTING QUERIES
-- ============================================================================
-- Run these queries to verify RLS is working:

-- Test 1: Verify sanchalak only sees their mandal's members
-- SELECT COUNT(*) FROM members WHERE mandal_id = '<sanchalak_assigned_mandal>';

-- Test 2: Verify non-admin cannot see role field
-- SELECT * FROM user_profiles WHERE id = '<current_user_id>';

-- Test 3: Verify authorization check for attendance marking
-- INSERT INTO attendance (event_id, member_id, marked_by)
-- VALUES ('<event_id>', '<member_id>', auth.uid());

-- ============================================================================
-- COMMON ISSUES & SOLUTIONS
-- ============================================================================

-- Issue: "You do not have permission to access this data"
-- Solution: Check that the RLS policy has the correct table/column names
--           Verify user_profiles table has id column matching auth.uid()

-- Issue: "Duplicate policy" error
-- Solution: Check for existing policies with `SELECT pg_policies`
--           Drop existing policy: DROP POLICY IF EXISTS "policy_name" ON table_name;

-- Issue: Admin cannot see data despite RLS
-- Solution: Make sure user_profiles.role column is correctly set to 'admin'
--           Check auth.uid() matches user_profiles.id

-- ============================================================================
-- USEFUL DIAGNOSTIC COMMANDS
-- ============================================================================

-- List all RLS policies on a table
SELECT pg_policies FROM pg_policies WHERE tablename = 'members';

-- Check if RLS is enabled
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'members';

-- Test policy effectiveness (as authenticated user)
SELECT COUNT(*) FROM members; -- Should respect RLS policy

-- ============================================================================
-- GRADUAL IMPLEMENTATION PLAN
-- ============================================================================
-- 1. Start with read-only policies (SELECT)
-- 2. Test thoroughly with different user roles
-- 3. Add insert/update/delete policies incrementally
-- 4. Monitor application logs for permission errors
-- 5. Adjust policies based on access patterns

-- Phase 1 (Immediate): user_profiles - highest sensitivity
-- Phase 2 (Week 1): members, project_assignments
-- Phase 3 (Week 2): attendance, project_registrations
-- Phase 4 (Week 3): saved_reports, events

-- ============================================================================
