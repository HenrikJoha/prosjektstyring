import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

const EMAIL_DOMAIN = 'prosjektstyring.example.com';

export interface AppUser {
  id: string;
  username: string;
  role: 'admin' | 'prosjektleder';
  workerId: string | null;
  profileColor: string;
}

interface AuthState {
  user: AppUser | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: { profileColor?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;

  // Admin actions
  createUser: (
    username: string,
    password: string,
    role: 'admin' | 'prosjektleder',
    workerId?: string
  ) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  getUsers: () => Promise<AppUser[]>;
  linkUserToWorker: (userId: string, workerId: string) => Promise<boolean>;
  setUserPassword: (username: string, newPassword: string) => Promise<boolean>;

  // Session management
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      initAuth: async () => {
        // Check if there's an existing Supabase Auth session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Fetch app_users data
          const { data: appUser } = await supabase
            .from('app_users')
            .select('id, username, role, worker_id, profile_color')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

          if (appUser) {
            set({
              user: {
                id: appUser.id,
                username: appUser.username,
                role: appUser.role,
                workerId: appUser.worker_id ?? null,
                profileColor: appUser.profile_color,
              },
            });
          }
        }

        // Listen for auth state changes
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT' || !session) {
            set({ user: null });
          } else if (event === 'SIGNED_IN' && session?.user) {
            const { data: appUser } = await supabase
              .from('app_users')
              .select('id, username, role, worker_id, profile_color')
              .eq('auth_user_id', session.user.id)
              .maybeSingle();

            if (appUser) {
              set({
                user: {
                  id: appUser.id,
                  username: appUser.username,
                  role: appUser.role,
                  workerId: appUser.worker_id ?? null,
                  profileColor: appUser.profile_color,
                },
              });
            }
          }
        });
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        const email = `${username.toLowerCase().trim()}@${EMAIL_DOMAIN}`;

        try {
          // Try Supabase Auth sign-in first
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            const supabaseErrorMsg = error.message || String(error);
            // If sign-in failed, try to migrate the user (only works if not yet migrated)
            const migrateRes = await fetch('/api/auth/migrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: username.trim(), password }),
            });

            if (!migrateRes.ok) {
              const err = await migrateRes.json();
              const message = err.error || 'Feil brukernavn eller passord';
              set({ isLoading: false, error: `${message} (Auth: ${supabaseErrorMsg})` });
              return false;
            }

            // Migration successful, now sign in
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (retryError || !retryData.user) {
              set({ isLoading: false, error: 'Kunne ikke logge inn etter migrering' });
              return false;
            }
          }

          // Fetch app_users data
          const authUser = data?.user ?? (await supabase.auth.getUser()).data.user;
          if (!authUser) {
            set({ isLoading: false, error: 'Kunne ikke hente brukerdata' });
            return false;
          }

          const { data: appUser, error: appError } = await supabase
            .from('app_users')
            .select('id, username, role, worker_id, profile_color')
            .eq('auth_user_id', authUser.id)
            .maybeSingle();

          if (appError || !appUser) {
            set({ isLoading: false, error: 'Brukerdata ikke funnet' });
            return false;
          }

          set({
            user: {
              id: appUser.id,
              username: appUser.username,
              role: appUser.role,
              workerId: appUser.worker_id ?? null,
              profileColor: appUser.profile_color,
            },
            isLoading: false,
            error: null,
          });
          return true;
        } catch (err) {
          console.error('Login error:', err);
          set({ isLoading: false, error: 'En feil oppstod under innlogging' });
          return false;
        }
      },

      logout: async () => {
        await supabase.auth.signOut();
        set({ user: null, error: null });
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) return;

        const { error } = await supabase
          .from('app_users')
          .update({ profile_color: updates.profileColor })
          .eq('id', user.id);

        if (!error) {
          set({ user: { ...user, ...updates } });
        }
      },

      changePassword: async (_currentPassword: string, newPassword: string) => {
        // With Supabase Auth, we use updateUser to change password
        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
          set({ error: 'Kunne ikke endre passord' });
          return false;
        }

        set({ error: null });
        return true;
      },

      createUser: async (
        username: string,
        password: string,
        role: 'admin' | 'prosjektleder',
        workerId?: string
      ) => {
        const { user } = get();
        if (!user || user.role !== 'admin') return false;

        try {
          // Call API to create user (needs service role for Supabase Auth admin)
          const res = await fetch('/api/admin/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role, workerId }),
          });

          if (!res.ok) {
            const err = await res.json();
            set({ error: err.error || 'Kunne ikke opprette bruker' });
            return false;
          }

          return true;
        } catch {
          set({ error: 'En feil oppstod' });
          return false;
        }
      },

      deleteUser: async (userId: string) => {
        const { user } = get();
        if (!user || user.role !== 'admin') return false;
        if (userId === user.id) {
          set({ error: 'Du kan ikke slette din egen bruker' });
          return false;
        }

        try {
          const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });

          if (!res.ok) {
            const err = await res.json();
            set({ error: err.error || 'Kunne ikke slette bruker' });
            return false;
          }

          return true;
        } catch {
          set({ error: 'En feil oppstod' });
          return false;
        }
      },

      getUsers: async () => {
        const { data } = await supabase
          .from('app_users')
          .select('id, username, role, worker_id, profile_color')
          .order('username');

        return (data ?? []).map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          workerId: u.worker_id ?? null,
          profileColor: u.profile_color,
        }));
      },

      linkUserToWorker: async (userId: string, workerId: string) => {
        const { user } = get();
        if (!user || user.role !== 'admin') return false;

        const { error } = await supabase
          .from('app_users')
          .update({ worker_id: workerId })
          .eq('id', userId);

        if (error) {
          set({ error: 'Kunne ikke koble bruker til ansatt' });
          return false;
        }

        return true;
      },

      setUserPassword: async (username: string, newPassword: string) => {
        const { user } = get();
        if (!user || user.role !== 'admin') return false;
        if (!newPassword.trim()) {
          set({ error: 'Nytt passord er påkrevd' });
          return false;
        }

        try {
          const res = await fetch('/api/admin/set-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), newPassword }),
          });

          if (!res.ok) {
            const err = await res.json();
            set({ error: err.error || 'Kunne ikke sette passord' });
            return false;
          }

          set({ error: null });
          return true;
        } catch {
          set({ error: 'En feil oppstod' });
          return false;
        }
      },
    }),
    {
      name: 'prosjektstyring-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
