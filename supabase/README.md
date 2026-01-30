# Supabase Migration: Supabase Auth + RLS

This folder contains SQL migrations for enabling proper security with Supabase Auth and Row Level Security (RLS).

## Deployment Order (Important!)

**You MUST run the SQL migration BEFORE deploying the code changes.**

1. Run the SQL migration in Supabase (see below)
2. Deploy the new code to Vercel

If you deploy the code first, login will fail because the `auth_user_id` column won't exist.

## How to Apply the SQL Migration

Run the SQL in the Supabase Dashboard → SQL Editor:

1. **20250126000001_supabase_auth_rls.sql** - Sets up Supabase Auth integration and RLS policies (includes function search_path fixes)

## What It Does

### 1. Links app_users to Supabase Auth
- Adds `auth_user_id` column to `app_users` table
- This column links your existing users to Supabase Auth users

### 2. Creates Proper RLS Policies
- **app_users**: Users can read/update their own record; admins can read/update all
- **workers**: Admins see all; project leaders see themselves + their team
- **projects**: Admins see all; project leaders see their projects + team assignments
- **project_assignments**: Admins see all; project leaders see their team's assignments

### 3. First-Login Migration
When a user logs in for the first time after this migration:
1. Their old password hash is verified
2. A Supabase Auth user is created with email `username@prosjektstyring.internal`
3. The `auth_user_id` is linked
4. They're signed in via Supabase Auth

Future logins go directly through Supabase Auth.

## No Data Loss

This migration:
- Does NOT delete any existing data
- Does NOT modify existing user records (only adds a column)
- Preserves all usernames and passwords
- Users continue using the same login credentials

## If a project leader sees all projects

RLS only shows "their" data when the user has **role = 'prosjektleder'** and **worker_id** set to that project leader's worker row. If the user has **role = 'admin'**, they will see everything.

1. In Supabase → Table Editor → **app_users**, find the user (by username).
2. Set **role** to `prosjektleder` (not `admin`).
3. Set **worker_id** to the UUID of that project leader's row in **workers** (the worker who is the prosjektleder).

Example (run in SQL Editor after replacing the username):

```sql
-- Fix: make user "testuser" a project leader linked to worker abc-123...
UPDATE public.app_users
SET role = 'prosjektleder', worker_id = 'YOUR-PROJECT-LEADER-WORKER-UUID'
WHERE username = 'testuser';
```

The app also applies client-side filtering for project leaders, so even with wrong DB data they should only see their own data after the next code deploy.

## HaveIBeenPwned Password Check

Supabase Auth has a setting to check passwords against HaveIBeenPwned.org.
This only applies to NEW users created through Supabase Auth or when users change their password.

Enable it in: Supabase Dashboard → Authentication → Providers → Email → Password settings
