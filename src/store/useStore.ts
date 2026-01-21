import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Worker, Project, ProjectAssignment, DragSelection } from '@/types';

interface AppState {
  // Data
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  
  // UI State
  activeTab: 'schedule' | 'workers' | 'finance';
  dragSelection: DragSelection | null;
  selectedProjectId: string | null;
  
  // Worker actions
  addWorker: (worker: Omit<Worker, 'id'>) => void;
  updateWorker: (id: string, updates: Partial<Worker>) => void;
  deleteWorker: (id: string) => void;
  
  // Project actions
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  
  // Assignment actions
  addAssignment: (assignment: Omit<ProjectAssignment, 'id'>) => void;
  updateAssignment: (id: string, updates: Partial<ProjectAssignment>) => void;
  deleteAssignment: (id: string) => void;
  
  // UI actions
  setActiveTab: (tab: 'schedule' | 'workers' | 'finance') => void;
  setDragSelection: (selection: DragSelection | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  
  // Computed
  getTotalOrdrereserve: () => number;
  getProjectFinance: (projectId: string) => { fakturert: number; ordrereserve: number };
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      workers: [],
      projects: [],
      assignments: [],
      activeTab: 'schedule',
      dragSelection: null,
      selectedProjectId: null,
      
      // Worker actions
      addWorker: (worker) => set((state) => ({
        workers: [...state.workers, { ...worker, id: generateId() }]
      })),
      
      updateWorker: (id, updates) => set((state) => ({
        workers: state.workers.map(w => w.id === id ? { ...w, ...updates } : w)
      })),
      
      deleteWorker: (id) => set((state) => ({
        workers: state.workers.filter(w => w.id !== id),
        assignments: state.assignments.filter(a => a.workerId !== id)
      })),
      
      // Project actions
      addProject: (project) => set((state) => ({
        projects: [...state.projects, { 
          ...project, 
          id: generateId(),
          createdAt: new Date().toISOString()
        }]
      })),
      
      updateProject: (id, updates) => set((state) => ({
        projects: state.projects.map(p => p.id === id ? { ...p, ...updates } : p)
      })),
      
      deleteProject: (id) => set((state) => ({
        projects: state.projects.filter(p => p.id !== id),
        assignments: state.assignments.filter(a => a.projectId !== id)
      })),
      
      // Assignment actions
      addAssignment: (assignment) => set((state) => ({
        assignments: [...state.assignments, { ...assignment, id: generateId() }]
      })),
      
      updateAssignment: (id, updates) => set((state) => ({
        assignments: state.assignments.map(a => a.id === id ? { ...a, ...updates } : a)
      })),
      
      deleteAssignment: (id) => set((state) => ({
        assignments: state.assignments.filter(a => a.id !== id)
      })),
      
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
          .filter(p => p.status === 'active')
          .reduce((total, project) => {
            const fakturert = (project.amount * project.aKontoPercent) / 100;
            return total + (project.amount - fakturert);
          }, 0);
      },
    }),
    {
      name: 'prosjektstyring-storage',
      partialize: (state) => ({
        workers: state.workers,
        projects: state.projects,
        assignments: state.assignments,
      }),
    }
  )
);
