export type WorkerRole = 'prosjektleder' | 'tømrer';
export type ProjectType = 'regular' | 'sick_leave' | 'vacation';

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
  aKontoPercent: number; // Percentage invoiced (0-100)
  status: 'active' | 'completed';
  projectType: ProjectType; // regular, sick_leave, or vacation
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
