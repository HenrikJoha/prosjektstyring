-- =============================================================================
-- Migration to Supabase Auth with proper RLS
-- NO DATA IS DELETED. Adds auth_user_id and creates proper RLS policies.
-- =============================================================================

-- 1. Fix functions with mutable search_path (security best practice)
--    (IF EXISTS not supported for ALTER FUNCTION in all PostgreSQL versions)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_app_users_updated_at') THEN
    ALTER FUNCTION public.update_app_users_updated_at() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;
END $$;


-- 2. Drop ALL existing RLS policies (permissive and any old ones)
-- -----------------------------------------------------------------------------

-- app_users
DROP POLICY IF EXISTS "Allow all delete operations on app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all insert operations on app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all update operations on app_users" ON public.app_users;
DROP POLICY IF EXISTS "anon_no_select_app_users" ON public.app_users;
DROP POLICY IF EXISTS "anon_no_insert_app_users" ON public.app_users;
DROP POLICY IF EXISTS "anon_no_update_app_users" ON public.app_users;
DROP POLICY IF EXISTS "anon_no_delete_app_users" ON public.app_users;

-- project_assignments
DROP POLICY IF EXISTS "Allow all operations on project_assignments" ON public.project_assignments;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.project_assignments;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.project_assignments;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.project_assignments;
DROP POLICY IF EXISTS "anon_no_select_project_assignments" ON public.project_assignments;
DROP POLICY IF EXISTS "anon_no_insert_project_assignments" ON public.project_assignments;
DROP POLICY IF EXISTS "anon_no_update_project_assignments" ON public.project_assignments;
DROP POLICY IF EXISTS "anon_no_delete_project_assignments" ON public.project_assignments;

-- projects
DROP POLICY IF EXISTS "Allow all operations on projects" ON public.projects;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.projects;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.projects;
DROP POLICY IF EXISTS "anon_no_select_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_no_insert_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_no_update_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_no_delete_projects" ON public.projects;

-- workers
DROP POLICY IF EXISTS "Allow all operations on workers" ON public.workers;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.workers;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.workers;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.workers;
DROP POLICY IF EXISTS "anon_no_select_workers" ON public.workers;
DROP POLICY IF EXISTS "anon_no_insert_workers" ON public.workers;
DROP POLICY IF EXISTS "anon_no_update_workers" ON public.workers;
DROP POLICY IF EXISTS "anon_no_delete_workers" ON public.workers;


-- 3. Add auth_user_id column to app_users (links to Supabase Auth)
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON public.app_users(auth_user_id);


-- 4. Create helper functions for RLS
-- -----------------------------------------------------------------------------

-- Get current user's app_users record
CREATE OR REPLACE FUNCTION public.get_my_app_user()
RETURNS public.app_users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Get current user's worker_id
CREATE OR REPLACE FUNCTION public.my_worker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT worker_id FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Check if a worker is visible to the current user (for project leaders)
CREATE OR REPLACE FUNCTION public.can_see_worker(worker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_admin() 
    OR worker_id = public.my_worker_id()
    OR EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = worker_id 
        AND w.role = 'tømrer' 
        AND w.project_leader_id = public.my_worker_id()
    );
$$;


-- 5. Create proper RLS policies
-- -----------------------------------------------------------------------------

-- === app_users ===
-- Users can read their own row; admins can read all
CREATE POLICY "app_users_select"
  ON public.app_users FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid() 
    OR public.is_admin()
  );

-- Users can update their own row (profile color, etc.)
CREATE POLICY "app_users_update_own"
  ON public.app_users FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Admin can update any row (for linking worker_id, etc.)
CREATE POLICY "app_users_update_admin"
  ON public.app_users FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Insert/Delete only via service role (handled by API for user management)
-- No policies for anon or authenticated on INSERT/DELETE


-- === workers ===
-- Admin sees all; project leader sees self + their carpenters
CREATE POLICY "workers_select"
  ON public.workers FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR id = public.my_worker_id()
    OR (role = 'tømrer' AND project_leader_id = public.my_worker_id())
  );

-- Only admin can insert/update/delete workers
CREATE POLICY "workers_insert"
  ON public.workers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "workers_update"
  ON public.workers FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "workers_delete"
  ON public.workers FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- === projects ===
-- Admin sees all; project leader sees: own projects, system projects, 
-- and projects assigned to their team
CREATE POLICY "projects_select"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR is_system = true
    OR project_leader_id = public.my_worker_id()
    OR EXISTS (
      SELECT 1 FROM public.project_assignments pa
      WHERE pa.project_id = projects.id
        AND public.can_see_worker(pa.worker_id)
    )
  );

-- Admin can insert any project; project leaders can insert (auto-owned)
CREATE POLICY "projects_insert"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR project_leader_id = public.my_worker_id()
    OR project_leader_id IS NULL
  );

-- Admin can update any; project leader can update own projects
CREATE POLICY "projects_update"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR project_leader_id = public.my_worker_id()
  )
  WITH CHECK (
    public.is_admin()
    OR project_leader_id = public.my_worker_id()
  );

-- Admin can delete any; project leader can delete own non-system projects
CREATE POLICY "projects_delete"
  ON public.projects FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR (project_leader_id = public.my_worker_id() AND is_system = false)
  );


-- === project_assignments ===
-- Admin sees all; project leader sees assignments for their visible workers
CREATE POLICY "project_assignments_select"
  ON public.project_assignments FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.can_see_worker(worker_id)
  );

-- Admin can insert any; project leader can insert for their visible workers
CREATE POLICY "project_assignments_insert"
  ON public.project_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.can_see_worker(worker_id)
  );

-- Admin can update any; project leader can update for their visible workers
CREATE POLICY "project_assignments_update"
  ON public.project_assignments FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.can_see_worker(worker_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.can_see_worker(worker_id)
  );

-- Admin can delete any; project leader can delete for their visible workers
CREATE POLICY "project_assignments_delete"
  ON public.project_assignments FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.can_see_worker(worker_id)
  );


-- 6. Ensure RLS is enabled
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
