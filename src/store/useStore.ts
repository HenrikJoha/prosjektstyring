import { create } from 'zustand';
import { Worker, Project, ProjectAssignment, DragSelection } from '@/types';
import { supabase, DbWorker, DbProject, DbProjectAssignment } from '@/lib/supabase';
import { parseISO, addDays, format, isWeekend } from 'date-fns';

interface AppState {
  // Data
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  isLoading: boolean;

  // Role info (from auth store, passed in on loadData)
  currentUserWorkerId: string | null;
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
  plannedStartDate: db.planned_start_date || undefined,
  durationDays: db.duration_days || undefined,
  createdAt: db.created_at,
});

const dbAssignmentToAssignment = (db: DbProjectAssignment): ProjectAssignment => ({
  id: db.id,
  projectId: db.project_id,
  workerId: db.worker_id,
  startDate: db.start_date,
  endDate: db.end_date,
});

// Helper: Calculate end date from start date + duration (excluding weekends)
function calculateEndDate(startDateString: string, durationDays: number): string {
  const startDate = parseISO(startDateString);
  let currentDate = startDate;
  let workingDaysAdded = 0;

  while (workingDaysAdded < durationDays) {
    if (!isWeekend(currentDate)) {
      workingDaysAdded++;
    }
    if (workingDaysAdded < durationDays) {
      currentDate = addDays(currentDate, 1);
    }
  }

  return format(currentDate, 'yyyy-MM-dd');
}

export const useStore = create<AppState>()((set, get) => ({
  workers: [],
  projects: [],
  assignments: [],
  isLoading: true,
  currentUserWorkerId: null,
  isAdmin: false,
  activeTab: 'schedule',
  dragSelection: null,
  selectedProjectId: null,

  // Load data - RLS filters at DB; we also filter client-side for project leaders (defense in depth)
  loadData: async (userWorkerId?: string | null, isAdmin: boolean = false) => {
    set({ isLoading: true, currentUserWorkerId: userWorkerId ?? null, isAdmin });

    const [workersRes, projectsRes, assignmentsRes] = await Promise.all([
      supabase.from('workers').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('project_assignments').select('*').order('created_at'),
    ]);

    let workers = (workersRes.data ?? []).map(dbWorkerToWorker);
    let projects = (projectsRes.data ?? []).map(dbProjectToProject);
    let assignments = (assignmentsRes.data ?? []).map(dbAssignmentToAssignment);

    // Project leaders: only show their own workers, projects, and assignments (safety net if RLS or role is wrong)
    if (!isAdmin && userWorkerId) {
      const myWorkerId = userWorkerId;
      workers = workers.filter(
        (w) =>
          w.id === myWorkerId ||
          (w.role === 'tømrer' && w.projectLeaderId === myWorkerId)
      );
      const visibleWorkerIds = new Set(workers.map((w) => w.id));
      assignments = assignments.filter((a) => visibleWorkerIds.has(a.workerId));
      projects = projects.filter(
        (p) =>
          p.isSystem ||
          p.projectLeaderId === myWorkerId ||
          assignments.some((a) => a.projectId === p.id)
      );
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
      workers: [...state.workers, dbWorkerToWorker(data)],
    }));
  },

  updateWorker: async (id, updates) => {
    const dbUpdates: Partial<DbWorker> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) {
      dbUpdates.role = updates.role;
      if (updates.role === 'prosjektleder') {
        dbUpdates.project_leader_id = null;
        updates.projectLeaderId = undefined;
      }
    }
    if (updates.projectLeaderId !== undefined) {
      if (updates.role !== 'prosjektleder') {
        dbUpdates.project_leader_id = updates.projectLeaderId || null;
      } else {
        dbUpdates.project_leader_id = null;
      }
    }

    const { error } = await supabase.from('workers').update(dbUpdates).eq('id', id);

    if (error) {
      console.error('Error updating worker:', error);
      return;
    }

    set((state) => ({
      workers: state.workers.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    }));
  },

  deleteWorker: async (id) => {
    const { error } = await supabase.from('workers').delete().eq('id', id);

    if (error) {
      console.error('Error deleting worker:', error);
      return;
    }

    set((state) => ({
      workers: state.workers.filter((w) => w.id !== id),
      assignments: state.assignments.filter((a) => a.workerId !== id),
    }));
  },

  // Project actions
  addProject: async (project) => {
    const { currentUserWorkerId, isAdmin } = get();

    // Auto-assign to current user if they're a project leader
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
        planned_start_date: project.plannedStartDate || null,
        duration_days: project.durationDays || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding project:', error);
      return '';
    }

    const newProject = dbProjectToProject(data);

    set((state) => ({
      projects: [...state.projects, newProject],
    }));

    // Auto-create assignment if project has start date, duration, and project leader
    if (newProject.plannedStartDate && newProject.durationDays && newProject.projectLeaderId) {
      const endDate = calculateEndDate(newProject.plannedStartDate, newProject.durationDays);
      await get().addAssignment({
        projectId: newProject.id,
        workerId: newProject.projectLeaderId,
        startDate: newProject.plannedStartDate,
        endDate,
      });
    }

    return data.id;
  },

  updateProject: async (id, updates) => {
    const { addAssignment, assignments } = get();
    const currentProject = get().projects.find((p) => p.id === id);

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
    if (updates.projectLeaderId !== undefined) {
      dbUpdates.project_leader_id =
        updates.projectLeaderId === null || updates.projectLeaderId === ''
          ? null
          : updates.projectLeaderId;
    }
    if (updates.plannedStartDate !== undefined)
      dbUpdates.planned_start_date = updates.plannedStartDate || null;
    if (updates.durationDays !== undefined) dbUpdates.duration_days = updates.durationDays || null;

    const { error } = await supabase.from('projects').update(dbUpdates).eq('id', id);

    if (error) {
      console.error('Error updating project:', error);
      return;
    }

    const updatedProject = { ...currentProject, ...updates } as Project;

    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? updatedProject : p)),
    }));

    // Auto-create or update assignment if project has start date, duration, and project leader
    if (updatedProject.plannedStartDate && updatedProject.durationDays && updatedProject.projectLeaderId) {
      const endDate = calculateEndDate(updatedProject.plannedStartDate, updatedProject.durationDays);

      const existingAssignment = assignments.find(
        (a) => a.projectId === id && a.workerId === updatedProject.projectLeaderId
      );

      if (existingAssignment) {
        await get().updateAssignment(existingAssignment.id, {
          startDate: updatedProject.plannedStartDate,
          endDate,
        });
      } else {
        await addAssignment({
          projectId: id,
          workerId: updatedProject.projectLeaderId,
          startDate: updatedProject.plannedStartDate,
          endDate,
        });
      }
    }
  },

  deleteProject: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (error) {
      console.error('Error deleting project:', error);
      return;
    }

    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      assignments: state.assignments.filter((a) => a.projectId !== id),
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
      assignments: [...state.assignments, dbAssignmentToAssignment(data)],
    }));
  },

  updateAssignment: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
    if (updates.workerId !== undefined) dbUpdates.worker_id = updates.workerId;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;

    const { error } = await supabase.from('project_assignments').update(dbUpdates).eq('id', id);

    if (error) {
      console.error('Error updating assignment:', error);
      return;
    }

    set((state) => ({
      assignments: state.assignments.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },

  deleteAssignment: async (id) => {
    const { error } = await supabase.from('project_assignments').delete().eq('id', id);

    if (error) {
      console.error('Error deleting assignment:', error);
      return;
    }

    set((state) => ({
      assignments: state.assignments.filter((a) => a.id !== id),
    }));
  },

  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDragSelection: (selection) => set({ dragSelection: selection }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  // Computed
  getProjectFinance: (projectId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return { fakturert: 0, ordrereserve: 0 };

    if (project.billingType === 'timer_materiell') {
      const fakturert = project.fakturert;
      const ordrereserve = Math.max(0, project.amount - fakturert);
      return { fakturert, ordrereserve };
    } else {
      const fakturert = (project.amount * project.aKontoPercent) / 100;
      const ordrereserve = project.amount - fakturert;
      return { fakturert, ordrereserve };
    }
  },

  getTotalOrdrereserve: () => {
    const { projects } = get();
    return projects
      .filter((p) => p.status === 'active' && p.projectType === 'regular')
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
