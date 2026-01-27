export type WorkerRole = 'prosjektleder' | 'tømrer';
export type ProjectType = 'regular' | 'sick_leave' | 'vacation';
export type BillingType = 'tilbud' | 'timer_materiell';

export interface Worker {
  id: string;
  name: string;
  role: WorkerRole;
  projectLeaderId?: string; // For tømrer, links to their prosjektleder
}

export interface ProjectAssignment {
  id: string;
  projectId: string;
  workerId: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  amount: number; // Total project amount in NOK
  aKontoPercent: number; // Percentage invoiced (0-100) - used for 'tilbud' billing type
  fakturert: number; // Manually entered invoiced amount - used for 'timer_materiell' billing type
  billingType: BillingType; // 'tilbud' = A konto %, 'timer_materiell' = manual fakturert
  status: 'active' | 'completed';
  projectType: ProjectType; // regular, sick_leave, or vacation
  isSystem: boolean; // System projects (sick leave, vacation) cannot be deleted
  projectLeaderId?: string; // The project leader responsible for this project
  plannedStartDate?: string; // ISO date string - planned start date for the project
  durationDays?: number; // Duration in working days (excluding weekends)
  createdAt: string;
}

export interface DragSelection {
  workerId: string;
  startDate: string;
  endDate: string;
}

// Computed values
export interface ProjectFinance {
  projectId: string;
  projectName: string;
  totalAmount: number;
  aKontoPercent: number;
  fakturert: number; // Invoiced amount
  ordrereserve: number; // Remaining amount
}
