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
2. A Supabase Auth user is created with email `username@prosjektstyring.example.com`
3. The `auth_user_id` is linked
4. They're signed in via Supabase Auth

Future logins go directly through Supabase Auth.

**Email domain:** Synthetic emails use `@prosjektstyring.example.com` (reserved domain, never sent real email). Supabase rejects `@*.internal` as invalid format. If you had existing migrated users with `@prosjektstyring.internal`, run once: `npm run update-auth-emails` to update their Auth email to the new domain, then redeploy.

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

## Making sure all users can log in

**Why “old password” sometimes works:** If a user does **not** have `auth_user_id` set yet, the app runs the first-login migration when they sign in: it checks their **old** password (from `app_users.password_hash`), creates the Supabase Auth user with that same password, and links them. So the “old” password works because the app just migrated them with it. That is expected, not a bug.

**Check who is migrated:** From the project root run:

```bash
npm run check-auth
```

This lists every user and whether they are “Migrert (Supabase Auth)” or “Ikke migrert …”. Use this to see who will use the old password on first login vs who already uses Supabase Auth.

**Tomorrow / going forward:**

1. **Users without `auth_user_id` (not migrated yet):** They log in with their **current** password. The app migrates them on first login; no action needed.
2. **Users with `auth_user_id` (already migrated):** They use the password that is in Supabase Auth (the one they used when they were migrated, or the one you set via “Sett passord” in the app). If someone is locked out, log in as admin → Ansatte → Administrer brukere → “Sett passord” for that user.
3. **Admin locked out:** Run locally: `npm run set-password -- admin NewPassword` (see `.env` / `.env.local`).

So: everyone can log in tomorrow as long as they use the password they use today (or the one you set with “Sett passord”). No need to change anything for users who are not migrated yet.

## Other users can't log in / unstable login

**1. Deployed app (e.g. Vercel) must have the service role key**

The first-login migration runs on the **server**. If the deployed app does not have `SUPABASE_SERVICE_ROLE_KEY` set in its environment, migration will fail and non-migrated users will never get in.

- In Vercel: **Project → Settings → Environment Variables**
- Add **`SUPABASE_SERVICE_ROLE_KEY`** with the same value as in Supabase (Dashboard → Settings → API → service_role secret). The code also accepts **`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`** as a fallback, but for security you should use **`SUPABASE_SERVICE_ROLE_KEY`** (no `NEXT_PUBLIC_`) so the key is not exposed to the browser.
- Redeploy after adding the variable.

**2. What the other user should do**

- Use the **exact same username** they have always used (same spelling, usually lowercase).
- Use the **exact same password** they have always used. They do **not** need to change it; the app migrates them on first login with that password.
- Use a **normal browser window** (not private/incognito) and allow cookies/site data for the app.
- If it still fails: clear site data for the app (F12 → Application → Clear site data), then try again.

**3. If they are already migrated but locked out**

Run locally: `npm run check-auth` to see who is "Migrert". For those users, the password that works is the one in Supabase Auth (set at first login or via "Sett passord"). If they don't remember it: you (admin) log in → **Ansatte** → **Administrer brukere** → find the user → click **Sett passord** (key icon) → set a new password and tell them.

**4. Summary**

- **Not migrated yet:** They use their current password; the app migrates them when the **deployed** server has the service role key.
- **Already migrated:** They use the password in Supabase Auth; if locked out, admin sets a new one via "Sett passord".

## HaveIBeenPwned Password Check

Supabase Auth has a setting to check passwords against HaveIBeenPwned.org.
This only applies to NEW users created through Supabase Auth or when users change their password.

Enable it in: Supabase Dashboard → Authentication → Providers → Email → Password settings
