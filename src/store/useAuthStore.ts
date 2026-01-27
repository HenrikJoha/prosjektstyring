import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, DbAppUser } from '@/lib/supabase';

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
  logout: () => void;
  updateProfile: (updates: { profileColor?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  
  // Admin actions
  createUser: (username: string, password: string, role: 'admin' | 'prosjektleder', workerId?: string) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  getUsers: () => Promise<AppUser[]>;
  linkUserToWorker: (userId: string, workerId: string) => Promise<boolean>;
}

// Simple hash function for demo purposes
// In production, use bcrypt on the server side
const simpleHash = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'prosjektstyring_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const dbUserToAppUser = (db: DbAppUser): AppUser => ({
  id: db.id,
  username: db.username,
  role: db.role,
  workerId: db.worker_id,
  profileColor: db.profile_color,
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const passwordHash = await simpleHash(password);
          
          const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .eq('username', username.toLowerCase().trim())
            .eq('password_hash', passwordHash)
            .maybeSingle();
          
          if (error || !data) {
            set({ isLoading: false, error: 'Feil brukernavn eller passord' });
            return false;
          }
          
          set({ 
            user: dbUserToAppUser(data),
            isLoading: false,
            error: null 
          });
          return true;
        } catch (err) {
          console.error('Login error:', err);
          set({ isLoading: false, error: 'En feil oppstod under innlogging' });
          return false;
        }
      },

      logout: () => {
        set({ user: null, error: null });
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) return;

        const dbUpdates: Partial<DbAppUser> = {};
        if (updates.profileColor) dbUpdates.profile_color = updates.profileColor;

        const { error } = await supabase
          .from('app_users')
          .update(dbUpdates)
          .eq('id', user.id);

        if (!error) {
          set({
            user: { ...user, ...updates }
          });
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        const { user } = get();
        if (!user) return false;

        try {
          const currentHash = await simpleHash(currentPassword);
          const newHash = await simpleHash(newPassword);

          // Verify current password
          const { data: existingUser } = await supabase
            .from('app_users')
            .select('id')
            .eq('id', user.id)
            .eq('password_hash', currentHash)
            .single();

          if (!existingUser) {
            set({ error: 'Nåværende passord er feil' });
            return false;
          }

          // Update password
          const { error } = await supabase
            .from('app_users')
            .update({ password_hash: newHash })
            .eq('id', user.id);

          if (error) {
            set({ error: 'Kunne ikke endre passord' });
            return false;
          }

          set({ error: null });
          return true;
        } catch {
          set({ error: 'En feil oppstod' });
          return false;
        }
      },

      // Admin actions
      createUser: async (username: string, password: string, role: 'admin' | 'prosjektleder', workerId?: string) => {
        const { user } = get();
        if (!user || user.role !== 'admin') return false;

        try {
          const passwordHash = await simpleHash(password);
          
          const { error } = await supabase
            .from('app_users')
            .insert({
              username: username.toLowerCase(),
              password_hash: passwordHash,
              role,
              worker_id: workerId || null,
            });

          if (error) {
            if (error.code === '23505') {
              set({ error: 'Brukernavn er allerede i bruk' });
            } else {
              set({ error: 'Kunne ikke opprette bruker' });
            }
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

        // Prevent deleting yourself
        if (userId === user.id) {
          set({ error: 'Du kan ikke slette din egen bruker' });
          return false;
        }

        const { error } = await supabase
          .from('app_users')
          .delete()
          .eq('id', userId);

        if (error) {
          set({ error: 'Kunne ikke slette bruker' });
          return false;
        }

        return true;
      },

      getUsers: async () => {
        const { data } = await supabase
          .from('app_users')
          .select('*')
          .order('username');

        return (data || []).map(dbUserToAppUser);
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
    }),
    {
      name: 'prosjektstyring-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
