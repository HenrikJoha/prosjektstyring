import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
