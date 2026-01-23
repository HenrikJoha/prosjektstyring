import { create } from 'zustand';
import { Worker, Project, ProjectAssignment, DragSelection } from '@/types';
import { supabase, DbWorker, DbProject, DbProjectAssignment } from '@/lib/supabase';

interface AppState {
  // Data
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  isLoading: boolean;
  
  // Role-based filtering
  currentUserWorkerId: string | null; // The worker ID linked to the current user (for project leaders)
  isAdmin: boolean;
  
  // UI State
  activeTab: 'schedule' | 'workers' | 'finance';
  dragSelection: DragSelection | null;
  selectedProjectId: string | null;
  
  // Data loading
  loadData: (userWorkerId?: string | null, isAdmin?: boolean) => Promise<void>;
  
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
  fakturert: Number(db.fakturert),
  billingType: db.billing_type,
  status: db.status,
  projectType: db.project_type,
  isSystem: db.is_system,
  projectLeaderId: db.project_leader_id || undefined,
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
  currentUserWorkerId: null,
  isAdmin: false,
  activeTab: 'schedule',
  dragSelection: null,
  selectedProjectId: null,
  
  // Load data from Supabase with role-based filtering
  loadData: async (userWorkerId?: string | null, isAdmin: boolean = false) => {
    set({ isLoading: true, currentUserWorkerId: userWorkerId || null, isAdmin });
    
    // Fetch all data first
    const [workersRes, projectsRes, assignmentsRes] = await Promise.all([
      supabase.from('workers').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('project_assignments').select('*').order('created_at'),
    ]);
    
    let workers = (workersRes.data || []).map(dbWorkerToWorker);
    let projects = (projectsRes.data || []).map(dbProjectToProject);
    let assignments = (assignmentsRes.data || []).map(dbAssignmentToAssignment);
    
    // If user is a project leader (not admin), filter data
    if (!isAdmin && userWorkerId) {
      // Get the project leader's ID
      const projectLeader = workers.find(w => w.id === userWorkerId);
      
      if (projectLeader && projectLeader.role === 'prosjektleder') {
        // Filter workers: only show the project leader and their team members
        workers = workers.filter(w => 
          w.id === userWorkerId || // The project leader themselves
          w.projectLeaderId === userWorkerId // Workers under this project leader
        );
        
        const visibleWorkerIds = new Set(workers.map(w => w.id));
        
        // Filter assignments: only show assignments for the project leader's team
        assignments = assignments.filter(a => visibleWorkerIds.has(a.workerId));
        
        // Get all project IDs from the team's assignments
        // This allows seeing projects that are assigned to their calendar,
        // even if the project belongs to another project leader
        const projectIdsFromAssignments = new Set(assignments.map(a => a.projectId));
        
        // Filter projects: show projects that appear in the team's assignments
        // Also include system projects (sick leave, vacation) for everyone
        // Also include projects owned by this leader (even if no assignments yet)
        projects = projects.filter(p => 
          projectIdsFromAssignments.has(p.id) || // Projects visible in calendar
          p.projectLeaderId === userWorkerId || // Projects owned by this leader
          p.isSystem // System projects (sick leave, vacation)
        );
      }
    }
    
    set({
      workers,
      projects,
      assignments,
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
    const { currentUserWorkerId, isAdmin } = get();
    
    // If project leader is creating a project, auto-assign to them
    let projectLeaderId = project.projectLeaderId || null;
    if (!isAdmin && currentUserWorkerId && !projectLeaderId) {
      projectLeaderId = currentUserWorkerId;
    }
    
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: project.name,
        description: project.description,
        color: project.color,
        amount: project.amount,
        a_konto_percent: project.aKontoPercent,
        fakturert: project.fakturert || 0,
        billing_type: project.billingType || 'tilbud',
        status: project.status,
        project_type: project.projectType || 'regular',
        project_leader_id: projectLeaderId,
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
    if (updates.fakturert !== undefined) dbUpdates.fakturert = updates.fakturert;
    if (updates.billingType !== undefined) dbUpdates.billing_type = updates.billingType;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.projectType !== undefined) dbUpdates.project_type = updates.projectType;
    if (updates.projectLeaderId !== undefined) dbUpdates.project_leader_id = updates.projectLeaderId || null;
    
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
    
    if (project.billingType === 'timer_materiell') {
      // Timer og materiell: fakturert is manually entered
      const fakturert = project.fakturert;
      const ordrereserve = Math.max(0, project.amount - fakturert);
      return { fakturert, ordrereserve };
    } else {
      // Tilbud: fakturert is calculated from a konto percent
      const fakturert = (project.amount * project.aKontoPercent) / 100;
      const ordrereserve = project.amount - fakturert;
      return { fakturert, ordrereserve };
    }
  },
  
  getTotalOrdrereserve: () => {
    const { projects } = get();
    return projects
      .filter(p => p.status === 'active' && p.projectType === 'regular')
      .reduce((total, project) => {
        if (project.billingType === 'timer_materiell') {
          return total + Math.max(0, project.amount - project.fakturert);
        } else {
          const fakturert = (project.amount * project.aKontoPercent) / 100;
          return total + (project.amount - fakturert);
        }
      }, 0);
  },
}));
