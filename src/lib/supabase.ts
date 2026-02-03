import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** In-memory fallback when localStorage/sessionStorage are blocked (e.g. by ad blocker). */
const memoryStore: Record<string, string> = {};

/**
 * Storage that prefers localStorage, then sessionStorage, then memory.
 * Lets the app work when an ad blocker blocks or clears localStorage.
 */
const fallbackStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const v = localStorage.getItem(key);
      if (v != null) return v;
    } catch {
      // localStorage blocked
    }
    try {
      const v = sessionStorage.getItem(key);
      if (v != null) return v;
    } catch {
      // sessionStorage blocked
    }
    return memoryStore[key] ?? null;
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore
    }
    memoryStore[key] = value;
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    delete memoryStore[key];
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: fallbackStorage,
    storageKey: 'prosjektstyring-supabase-auth',
  },
});

// Database types matching our schema
export interface DbWorker {
  id: string;
  name: string;
  role: 'prosjektleder' | 'tømrer';
  project_leader_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProject {
  id: string;
  name: string;
  description: string;
  color: string;
  amount: number;
  a_konto_percent: number;
  fakturert: number;
  billing_type: 'tilbud' | 'timer_materiell';
  status: 'active' | 'completed';
  project_type: 'regular' | 'sick_leave' | 'vacation';
  is_system: boolean;
  project_leader_id: string | null;
  planned_start_date: string | null;
  duration_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbProjectAssignment {
  id: string;
  project_id: string;
  worker_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface DbAppUser {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'prosjektleder';
  worker_id: string | null;
  profile_color: string;
  created_at: string;
  updated_at: string;
}
