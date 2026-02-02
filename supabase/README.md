# Supabase Auth + RLS

This folder contains SQL migrations for enabling proper security with Supabase Auth and Row Level Security (RLS).

## Authentication

All users are authenticated via **Supabase Auth**. Each user in `app_users` is linked to a Supabase Auth user via `auth_user_id`.

**Email format:** Usernames are converted to ASCII-only emails for Supabase (e.g. "ståle" → `stale@prosjektstyring.example.com`). These are synthetic emails; no real email is sent.

## Creating New Users

New users must be created through the app's admin UI:

1. Log in as admin.
2. Go to **Ansatte** → **Administrer brukere** → **Opprett ny bruker**.
3. Enter username, password, and link to a project leader if needed.

This automatically creates:
- A Supabase Auth user (with the transliterated email)
- An `app_users` row linked to that Auth user

## RLS Policies

- **app_users**: Users can read/update their own record; admins can read/update all
- **workers**: Admins see all; project leaders see themselves + their team
- **projects**: Admins see all; project leaders see their projects + team assignments
- **project_assignments**: Admins see all; project leaders see their team's assignments

## If a project leader sees all projects

RLS only shows "their" data when the user has **role = 'prosjektleder'** and **worker_id** set to that project leader's worker row. If the user has **role = 'admin'**, they will see everything.

1. In Supabase → Table Editor → **app_users**, find the user (by username).
2. Set **role** to `prosjektleder` (not `admin`).
3. Set **worker_id** to the UUID of that project leader's row in **workers**.

## If a user is locked out

**Option 1: Admin UI**
Log in as admin → **Ansatte** → **Administrer brukere** → find the user → click **Sett passord** (key icon) → set a new password.

**Option 2: Script**
Run locally:
```bash
npm run set-password -- <username> <new_password>
```

Example:
```bash
npm run set-password -- ståle NyttPassord123
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run set-password -- <user> <pass>` | Set password for one user |
| `npm run check-auth` | List all users and their auth status |
| `npm run fix-all-auth` | Fix all Auth users (update email + set password) |
| `npm run migrate-all` | Migrate all non-migrated users (legacy) |
| `npm run migrate-one -- <user> <pass>` | Migrate one user (legacy) |
| `npm run debug-login -- <user> <pass>` | Debug login for a user |

## Environment Variables

**Required on server (Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon/public key (safe for browser)
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service role key (server only, secret!)

The service role key is needed for admin actions (create user, set password, etc.).
