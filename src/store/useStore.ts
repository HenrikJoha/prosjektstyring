import { create } from 'zustand';
import { Worker, Project, ProjectAssignment, DragSelection } from '@/types';
import { supabase, DbWorker, DbProject, DbProjectAssignment } from '@/lib/supabase';

interface AppState {
  // Data
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  isLoading: boolean;
  
  // UI State
  activeTab: 'schedule' | 'workers' | 'finance';
  dragSelection: DragSelection | null;
  selectedProjectId: string | null;
  
  // Data loading
  loadData: () => Promise<void>;
  
  // Worker actions
  addWorker: (worker: Omit<Worker, 'id'>) => Promise<void>;
  updateWorker: (id: string, updates: Partial<Worker>) => Promise<void>;
  deleteWorker: (id: string) => Promise<void>;
  
  // Project actions
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  
  // Assignment actions
  addAssignment: (assignment: Omit<ProjectAssignment, 'id'>) => Promise<void>;
  updateAssignment: (id: string, updates: Partial<ProjectAssignment>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  
  // UI actions
  setActiveTab: (tab: 'schedule' | 'workers' | 'finance') => void;
  setDragSelection: (selection: DragSelection | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  
  // Computed
  getTotalOrdrereserve: () => number;
  getProjectFinance: (projectId: string) => { fakturert: number; ordrereserve: number };
}

// Convert database types to app types
const dbWorkerToWorker = (db: DbWorker): Worker => ({
  id: db.id,
  name: db.name,
  role: db.role,
  projectLeaderId: db.project_leader_id || undefined,
});

const dbProjectToProject = (db: DbProject): Project => ({
  id: db.id,
  name: db.name,
  description: db.description,
  color: db.color,
  amount: Number(db.amount),
  aKontoPercent: Number(db.a_konto_percent),
  status: db.status,
  projectType: db.project_type,
  isSystem: db.is_system,
  createdAt: db.created_at,
});

const dbAssignmentToAssignment = (db: DbProjectAssignment): ProjectAssignment => ({
  id: db.id,
  projectId: db.project_id,
  workerId: db.worker_id,
  startDate: db.start_date,
  endDate: db.end_date,
});

export const useStore = create<AppState>()((set, get) => ({
  // Initial state
  workers: [],
  projects: [],
  assignments: [],
  isLoading: true,
  activeTab: 'schedule',
  dragSelection: null,
  selectedProjectId: null,
  
  // Load all data from Supabase
  loadData: async () => {
    set({ isLoading: true });
    
    const [workersRes, projectsRes, assignmentsRes] = await Promise.all([
      supabase.from('workers').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('project_assignments').select('*').order('created_at'),
    ]);
    
    set({
      workers: (workersRes.data || []).map(dbWorkerToWorker),
      projects: (projectsRes.data || []).map(dbProjectToProject),
      assignments: (assignmentsRes.data || []).map(dbAssignmentToAssignment),
      isLoading: false,
    });
  },
  
  // Worker actions
  addWorker: async (worker) => {
    const { data, error } = await supabase
      .from('workers')
      .insert({
        name: worker.name,
        role: worker.role,
        project_leader_id: worker.projectLeaderId || null,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding worker:', error);
      return;
    }
    
    set((state) => ({
      workers: [...state.workers, dbWorkerToWorker(data)]
    }));
  },
  
  updateWorker: async (id, updates) => {
    const dbUpdates: Partial<DbWorker> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.projectLeaderId !== undefined) dbUpdates.project_leader_id = updates.projectLeaderId || null;
    
    const { error } = await supabase
      .from('workers')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating worker:', error);
      return;
    }
    
    set((state) => ({
      workers: state.workers.map(w => w.id === id ? { ...w, ...updates } : w)
    }));
  },
  
  deleteWorker: async (id) => {
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting worker:', error);
      return;
    }
    
    set((state) => ({
      workers: state.workers.filter(w => w.id !== id),
      assignments: state.assignments.filter(a => a.workerId !== id)
    }));
  },
  
  // Project actions
  addProject: async (project) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: project.name,
        description: project.description,
        color: project.color,
        amount: project.amount,
        a_konto_percent: project.aKontoPercent,
        status: project.status,
        project_type: project.projectType || 'regular',
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding project:', error);
      return '';
    }
    
    set((state) => ({
      projects: [...state.projects, dbProjectToProject(data)]
    }));
    
    return data.id;
  },
  
  updateProject: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.aKontoPercent !== undefined) dbUpdates.a_konto_percent = updates.aKontoPercent;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.projectType !== undefined) dbUpdates.project_type = updates.projectType;
    
    const { error } = await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating project:', error);
      return;
    }
    
    set((state) => ({
      projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  },
  
  deleteProject: async (id) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting project:', error);
      return;
    }
    
    set((state) => ({
      projects: state.projects.filter(p => p.id !== id),
      assignments: state.assignments.filter(a => a.projectId !== id)
    }));
  },
  
  // Assignment actions
  addAssignment: async (assignment) => {
    const { data, error } = await supabase
      .from('project_assignments')
      .insert({
        project_id: assignment.projectId,
        worker_id: assignment.workerId,
        start_date: assignment.startDate,
        end_date: assignment.endDate,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding assignment:', error);
      return;
    }
    
    set((state) => ({
      assignments: [...state.assignments, dbAssignmentToAssignment(data)]
    }));
  },
  
  updateAssignment: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
    if (updates.workerId !== undefined) dbUpdates.worker_id = updates.workerId;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    
    const { error } = await supabase
      .from('project_assignments')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating assignment:', error);
      return;
    }
    
    set((state) => ({
      assignments: state.assignments.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
  },
  
  deleteAssignment: async (id) => {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting assignment:', error);
      return;
    }
    
    set((state) => ({
      assignments: state.assignments.filter(a => a.id !== id)
    }));
  },
  
  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDragSelection: (selection) => set({ dragSelection: selection }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  
  // Computed
  getProjectFinance: (projectId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return { fakturert: 0, ordrereserve: 0 };
    
    const fakturert = (project.amount * project.aKontoPercent) / 100;
    const ordrereserve = project.amount - fakturert;
    
    return { fakturert, ordrereserve };
  },
  
  getTotalOrdrereserve: () => {
    const { projects } = get();
    return projects
      .filter(p => p.status === 'active' && p.projectType === 'regular')
      .reduce((total, project) => {
        const fakturert = (project.amount * project.aKontoPercent) / 100;
        return total + (project.amount - fakturert);
      }, 0);
  },
}));
