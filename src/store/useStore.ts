import { create } from 'zustand';
import {
  Worker,
  Project,
  ProjectAssignment,
  DragSelection,
  BillingType,
  ProjectLeaderCalendarLink,
} from '@/types';
import {
  supabase,
  DbWorker,
  DbProject,
  DbProjectAssignment,
  DbProjectLeaderCalendarLink,
} from '@/lib/supabase';
import { parseISO, addDays, format, isWeekend } from 'date-fns';

interface AppState {
  // Data
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  projectLeaderCalendarLinks: ProjectLeaderCalendarLink[];
  isLoading: boolean;

  // Role info (from auth store, passed in on loadData)
  currentUserWorkerId: string | null;
  isAdmin: boolean;
  editableWorkerIds: string[];
  visibleCalendarWorkerIds: string[];
  visibleFinanceProjectIds: string[];

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
  setProjectLeaderCalendarLinks: (leaderId: string, linkedLeaderIds: string[]) => Promise<void>;

  // Project actions
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Assignment actions
  addAssignment: (assignment: Omit<ProjectAssignment, 'id'>) => Promise<void>;
  updateAssignment: (id: string, updates: Partial<ProjectAssignment>) => Promise<boolean>;
  deleteAssignment: (id: string) => Promise<void>;

  // UI actions
  setActiveTab: (tab: 'schedule' | 'workers' | 'finance') => void;
  setDragSelection: (selection: DragSelection | null) => void;
  setSelectedProjectId: (id: string | null) => void;

  // Computed
  getTotalOrdrereserve: () => number;
  getProjectFinance: (projectId: string) => { fakturert: number; ordrereserve: number };
}

interface ScopedStoreData {
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  projectLeaderCalendarLinks: ProjectLeaderCalendarLink[];
  editableWorkerIds: string[];
  visibleCalendarWorkerIds: string[];
  visibleFinanceProjectIds: string[];
}

// Convert database types to app types
const dbWorkerToWorker = (db: DbWorker): Worker => ({
  id: db.id,
  name: db.name,
  role: db.role,
  projectLeaderId: db.project_leader_id || undefined,
});

// Red is reserved for sick days; migrate existing red regular projects to orange
const SICK_DAY_RED = '#EF4444';
const REPLACEMENT_FOR_RED = '#F97316';
const PLACEHOLDER_BILLING_TYPE: BillingType = 'tilbud';

const dbProjectToProject = (db: DbProject): Project => ({
  id: db.id,
  name: db.name,
  description: db.description,
  color:
    !db.is_system && db.color === SICK_DAY_RED ? REPLACEMENT_FOR_RED : db.color,
  amount: Number(db.amount),
  aKontoPercent: Number(db.a_konto_percent),
  fakturert: Number(db.fakturert),
  billingType: db.billing_type,
  status: db.status,
  projectType: db.project_type,
  isSystem: db.is_system,
  isPlaceholder: db.is_placeholder,
  projectLeaderId: db.project_leader_id || undefined,
  plannedStartDate: db.planned_start_date || undefined,
  durationDays: db.duration_days || undefined,
  startIsUrgent: db.start_is_urgent ?? false,
  createdAt: db.created_at,
});

const dbAssignmentToAssignment = (db: DbProjectAssignment): ProjectAssignment => ({
  id: db.id,
  projectId: db.project_id,
  workerId: db.worker_id,
  startDate: db.start_date,
  endDate: db.end_date,
});

const dbCalendarLinkToCalendarLink = (
  db: DbProjectLeaderCalendarLink
): ProjectLeaderCalendarLink => ({
  id: db.id,
  projectLeaderAId: db.project_leader_a_id,
  projectLeaderBId: db.project_leader_b_id,
  createdAt: db.created_at,
});

const normalizeLeaderPair = (leaderId: string, otherLeaderId: string) => {
  return leaderId < otherLeaderId
    ? { projectLeaderAId: leaderId, projectLeaderBId: otherLeaderId }
    : { projectLeaderAId: otherLeaderId, projectLeaderBId: leaderId };
};

const getLeaderPairKey = (pair: {
  projectLeaderAId: string;
  projectLeaderBId: string;
}) => `${pair.projectLeaderAId}:${pair.projectLeaderBId}`;

const getEditableWorkerIdsForLeader = (workers: Worker[], leaderId: string): string[] => {
  const ids = new Set<string>([leaderId]);
  workers.forEach((worker) => {
    if (worker.role === 'tømrer' && worker.projectLeaderId === leaderId) {
      ids.add(worker.id);
    }
  });
  return Array.from(ids);
};

const getConnectedLeaderIds = (
  workers: Worker[],
  links: ProjectLeaderCalendarLink[],
  leaderId: string
): string[] => {
  const leaderIds = new Set(
    workers.filter((worker) => worker.role === 'prosjektleder').map((worker) => worker.id)
  );

  if (!leaderIds.has(leaderId)) {
    return [leaderId];
  }

  const adjacency = new Map<string, Set<string>>();
  leaderIds.forEach((id) => adjacency.set(id, new Set()));
  links.forEach((link) => {
    if (
      !leaderIds.has(link.projectLeaderAId) ||
      !leaderIds.has(link.projectLeaderBId)
    ) {
      return;
    }
    adjacency.get(link.projectLeaderAId)?.add(link.projectLeaderBId);
    adjacency.get(link.projectLeaderBId)?.add(link.projectLeaderAId);
  });

  const visited = new Set<string>();
  const queue = [leaderId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    adjacency.get(current)?.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }

  return Array.from(visited);
};

const getVisibleCalendarWorkerIdsForLeader = (
  workers: Worker[],
  leaderId: string,
  links: ProjectLeaderCalendarLink[]
): string[] => {
  const connectedLeaderIds = new Set(getConnectedLeaderIds(workers, links, leaderId));
  const visibleWorkerIds = new Set<string>();

  workers.forEach((worker) => {
    if (worker.role === 'prosjektleder' && connectedLeaderIds.has(worker.id)) {
      visibleWorkerIds.add(worker.id);
    }
    if (
      worker.role === 'tømrer' &&
      worker.projectLeaderId &&
      connectedLeaderIds.has(worker.projectLeaderId)
    ) {
      visibleWorkerIds.add(worker.id);
    }
  });

  return Array.from(visibleWorkerIds);
};

const getVisibleFinanceProjectIdsForLeader = (
  projects: Project[],
  assignments: ProjectAssignment[],
  editableWorkerIds: string[],
  leaderId: string
): string[] => {
  const editableWorkerIdSet = new Set(editableWorkerIds);
  const projectIds = new Set<string>();

  assignments.forEach((assignment) => {
    if (editableWorkerIdSet.has(assignment.workerId)) {
      projectIds.add(assignment.projectId);
    }
  });

  projects.forEach((project) => {
    if (project.isSystem || project.projectLeaderId === leaderId) {
      projectIds.add(project.id);
    }
  });

  return Array.from(projectIds);
};

const buildScopedStoreData = ({
  workers,
  projects,
  assignments,
  links,
  userWorkerId,
  isAdmin,
}: {
  workers: Worker[];
  projects: Project[];
  assignments: ProjectAssignment[];
  links: ProjectLeaderCalendarLink[];
  userWorkerId?: string | null;
  isAdmin: boolean;
}): ScopedStoreData => {
  if (isAdmin) {
    const allWorkerIds = workers.map((worker) => worker.id);
    const allProjectIds = projects.map((project) => project.id);
    return {
      workers,
      projects,
      assignments,
      projectLeaderCalendarLinks: links,
      editableWorkerIds: allWorkerIds,
      visibleCalendarWorkerIds: allWorkerIds,
      visibleFinanceProjectIds: allProjectIds,
    };
  }

  if (!userWorkerId) {
    return {
      workers: [],
      projects: [],
      assignments: [],
      projectLeaderCalendarLinks: [],
      editableWorkerIds: [],
      visibleCalendarWorkerIds: [],
      visibleFinanceProjectIds: [],
    };
  }

  const editableWorkerIds = getEditableWorkerIdsForLeader(workers, userWorkerId);
  const visibleCalendarWorkerIds = getVisibleCalendarWorkerIdsForLeader(
    workers,
    userWorkerId,
    links
  );
  const connectedLeaderIds = new Set(
    workers
      .filter(
        (worker) =>
          worker.role === 'prosjektleder' &&
          visibleCalendarWorkerIds.includes(worker.id)
      )
      .map((worker) => worker.id)
  );
  const visibleCalendarWorkerIdSet = new Set(visibleCalendarWorkerIds);
  const visibleAssignments = assignments.filter((assignment) =>
    visibleCalendarWorkerIdSet.has(assignment.workerId)
  );
  const visibleFinanceProjectIds = getVisibleFinanceProjectIdsForLeader(
    projects,
    assignments,
    editableWorkerIds,
    userWorkerId
  );
  const visibleProjectIds = new Set(visibleFinanceProjectIds);
  projects.forEach((project) => {
    if (project.isSystem) {
      visibleProjectIds.add(project.id);
    }
  });
  visibleAssignments.forEach((assignment) => visibleProjectIds.add(assignment.projectId));

  return {
    workers: workers.filter((worker) => visibleCalendarWorkerIdSet.has(worker.id)),
    projects: projects.filter((project) => visibleProjectIds.has(project.id)),
    assignments: visibleAssignments,
    projectLeaderCalendarLinks: links.filter(
      (link) =>
        connectedLeaderIds.has(link.projectLeaderAId) &&
        connectedLeaderIds.has(link.projectLeaderBId)
    ),
    editableWorkerIds,
    visibleCalendarWorkerIds,
    visibleFinanceProjectIds,
  };
};

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
  projectLeaderCalendarLinks: [],
  isLoading: true,
  currentUserWorkerId: null,
  isAdmin: false,
  editableWorkerIds: [],
  visibleCalendarWorkerIds: [],
  visibleFinanceProjectIds: [],
  activeTab: 'schedule',
  dragSelection: null,
  selectedProjectId: null,

  // Load data - RLS filters at DB; we also filter client-side for project leaders (defense in depth)
  loadData: async (userWorkerId?: string | null, isAdmin: boolean = false) => {
    set({ isLoading: true, currentUserWorkerId: userWorkerId ?? null, isAdmin });

    // Validate session first (handles Chrome/Edge differences: missing or stale session in localStorage)
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !authUser) {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('prosjektstyring_session_expired', '1');
      }
      await supabase.auth.signOut();
      set({ isLoading: false });
      return;
    }

    const [workersRes, projectsRes, assignmentsRes, linksRes] = await Promise.all([
      supabase.from('workers').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('project_assignments').select('*').order('created_at'),
      supabase.from('project_leader_calendar_links').select('*').order('created_at'),
    ]);

    // If any query failed with auth error (401/403 or JWT/session), sign out so user can log in again
    const authErr = [workersRes.error, projectsRes.error, assignmentsRes.error, linksRes.error].find(
      (error) =>
        error &&
        ((error as { status?: number }).status === 401 ||
          (error as { status?: number }).status === 403 ||
          /jwt|session|unauthorized|forbidden/i.test(
            String((error as { message?: string }).message ?? '')
          ))
    );
    if (authErr) {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('prosjektstyring_session_expired', '1');
      }
      await supabase.auth.signOut();
      set({
        workers: [],
        projects: [],
        assignments: [],
        projectLeaderCalendarLinks: [],
        editableWorkerIds: [],
        visibleCalendarWorkerIds: [],
        visibleFinanceProjectIds: [],
        isLoading: false,
      });
      return;
    }

    if (workersRes.error || projectsRes.error || assignmentsRes.error || linksRes.error) {
      console.error('Error loading data:', {
        workers: workersRes.error,
        projects: projectsRes.error,
        assignments: assignmentsRes.error,
        links: linksRes.error,
      });
      set({ isLoading: false });
      return;
    }

    // One-time migration: red is reserved for sick days; update any regular project with red to orange in DB
    const rawProjects = projectsRes.data ?? [];
    for (const project of rawProjects) {
      if (!project.is_system && project.color === SICK_DAY_RED) {
        await supabase
          .from('projects')
          .update({ color: REPLACEMENT_FOR_RED })
          .eq('id', project.id);
      }
    }

    const allWorkers = (workersRes.data ?? []).map(dbWorkerToWorker);
    const allProjects = rawProjects.map(dbProjectToProject);
    const allAssignments = (assignmentsRes.data ?? []).map(dbAssignmentToAssignment);
    const allLinks = (linksRes.data ?? []).map(dbCalendarLinkToCalendarLink);

    const scopedData = buildScopedStoreData({
      workers: allWorkers,
      projects: allProjects,
      assignments: allAssignments,
      links: allLinks,
      userWorkerId,
      isAdmin,
    });

    set({
      workers: scopedData.workers,
      projects: scopedData.projects,
      assignments: scopedData.assignments,
      projectLeaderCalendarLinks: scopedData.projectLeaderCalendarLinks,
      editableWorkerIds: scopedData.editableWorkerIds,
      visibleCalendarWorkerIds: scopedData.visibleCalendarWorkerIds,
      visibleFinanceProjectIds: scopedData.visibleFinanceProjectIds,
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

    const newWorker = dbWorkerToWorker(data);
    set((state) => ({
      workers: [...state.workers, newWorker],
      editableWorkerIds: state.isAdmin
        ? [...state.editableWorkerIds, newWorker.id]
        : state.editableWorkerIds,
      visibleCalendarWorkerIds: state.isAdmin
        ? [...state.visibleCalendarWorkerIds, newWorker.id]
        : state.visibleCalendarWorkerIds,
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
      workers: state.workers.map((worker) =>
        worker.id === id ? { ...worker, ...updates } : worker
      ),
    }));
  },

  deleteWorker: async (id) => {
    const { error } = await supabase.from('workers').delete().eq('id', id);

    if (error) {
      console.error('Error deleting worker:', error);
      return;
    }

    set((state) => ({
      workers: state.workers.filter((worker) => worker.id !== id),
      assignments: state.assignments.filter((assignment) => assignment.workerId !== id),
      projectLeaderCalendarLinks: state.projectLeaderCalendarLinks.filter(
        (link) => link.projectLeaderAId !== id && link.projectLeaderBId !== id
      ),
      editableWorkerIds: state.editableWorkerIds.filter((workerId) => workerId !== id),
      visibleCalendarWorkerIds: state.visibleCalendarWorkerIds.filter(
        (workerId) => workerId !== id
      ),
    }));
  },

  setProjectLeaderCalendarLinks: async (leaderId, linkedLeaderIds) => {
    const { isAdmin, workers, projectLeaderCalendarLinks } = get();
    if (!isAdmin) return;

    const isLeader = workers.some(
      (worker) => worker.id === leaderId && worker.role === 'prosjektleder'
    );
    if (!isLeader) return;

    const validLinkedLeaderIds = Array.from(
      new Set(
        linkedLeaderIds.filter(
          (linkedLeaderId) =>
            linkedLeaderId !== leaderId &&
            workers.some(
              (worker) =>
                worker.id === linkedLeaderId && worker.role === 'prosjektleder'
            )
        )
      )
    );

    const requestedPairs = validLinkedLeaderIds.map((linkedLeaderId) =>
      normalizeLeaderPair(leaderId, linkedLeaderId)
    );
    const requestedPairKeys = new Set(
      requestedPairs.map((pair) => getLeaderPairKey(pair))
    );
    const currentLinksForLeader = projectLeaderCalendarLinks.filter(
      (link) =>
        link.projectLeaderAId === leaderId || link.projectLeaderBId === leaderId
    );
    const currentPairKeys = new Set(
      currentLinksForLeader.map((link) => getLeaderPairKey(link))
    );

    const linkIdsToDelete = currentLinksForLeader
      .filter((link) => !requestedPairKeys.has(getLeaderPairKey(link)))
      .map((link) => link.id);

    if (linkIdsToDelete.length > 0) {
      const { error } = await supabase
        .from('project_leader_calendar_links')
        .delete()
        .in('id', linkIdsToDelete);

      if (error) {
        console.error('Error deleting calendar links:', error);
        return;
      }
    }

    const pairsToInsert = requestedPairs.filter(
      (pair) => !currentPairKeys.has(getLeaderPairKey(pair))
    );
    let insertedLinks: ProjectLeaderCalendarLink[] = [];

    if (pairsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('project_leader_calendar_links')
        .insert(
          pairsToInsert.map((pair) => ({
            project_leader_a_id: pair.projectLeaderAId,
            project_leader_b_id: pair.projectLeaderBId,
          }))
        )
        .select();

      if (error) {
        console.error('Error saving calendar links:', error);
        return;
      }

      insertedLinks = (data ?? []).map(dbCalendarLinkToCalendarLink);
    }

    set((state) => {
      const remainingLinks = state.projectLeaderCalendarLinks.filter(
        (link) => !linkIdsToDelete.includes(link.id)
      );
      return {
        projectLeaderCalendarLinks: [...remainingLinks, ...insertedLinks],
      };
    });
  },

  // Project actions
  addProject: async (project) => {
    const { currentUserWorkerId, isAdmin } = get();

    // Auto-assign to current user if they're a project leader
    let projectLeaderId = project.projectLeaderId || null;
    if (!isAdmin && currentUserWorkerId && !projectLeaderId) {
      projectLeaderId = currentUserWorkerId;
    }

    const projectData = !isAdmin
      ? {
          ...project,
          amount: 0,
          aKontoPercent: 0,
          fakturert: 0,
          billingType: PLACEHOLDER_BILLING_TYPE,
          isPlaceholder: true,
        }
      : {
          ...project,
          isPlaceholder: project.isPlaceholder ?? false,
        };

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: projectData.name,
        description: projectData.description,
        color: projectData.color,
        amount: projectData.amount,
        a_konto_percent: projectData.aKontoPercent,
        fakturert: projectData.fakturert || 0,
        billing_type: projectData.billingType || PLACEHOLDER_BILLING_TYPE,
        status: projectData.status,
        project_type: projectData.projectType || 'regular',
        is_placeholder: projectData.isPlaceholder,
        project_leader_id: projectLeaderId,
        planned_start_date: projectData.plannedStartDate || null,
        duration_days: projectData.durationDays || null,
        start_is_urgent: projectData.startIsUrgent ?? false,
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
      visibleFinanceProjectIds:
        state.isAdmin || !projectLeaderId || projectLeaderId !== state.currentUserWorkerId
          ? state.visibleFinanceProjectIds
          : Array.from(new Set([...state.visibleFinanceProjectIds, newProject.id])),
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
    const { addAssignment, assignments, isAdmin, currentUserWorkerId } = get();
    const currentProject = get().projects.find((project) => project.id === id);
    if (!currentProject) return;

    if (!isAdmin && currentProject.projectLeaderId !== currentUserWorkerId) {
      return;
    }

    const sanitizedUpdates = { ...updates };
    if (!isAdmin) {
      delete sanitizedUpdates.amount;
      delete sanitizedUpdates.aKontoPercent;
      delete sanitizedUpdates.fakturert;
      delete sanitizedUpdates.billingType;
      delete sanitizedUpdates.isPlaceholder;
    }

    const dbUpdates: Record<string, unknown> = {};
    if (sanitizedUpdates.name !== undefined) dbUpdates.name = sanitizedUpdates.name;
    if (sanitizedUpdates.description !== undefined) {
      dbUpdates.description = sanitizedUpdates.description;
    }
    if (sanitizedUpdates.color !== undefined) dbUpdates.color = sanitizedUpdates.color;
    if (sanitizedUpdates.amount !== undefined) dbUpdates.amount = sanitizedUpdates.amount;
    if (sanitizedUpdates.aKontoPercent !== undefined) {
      dbUpdates.a_konto_percent = sanitizedUpdates.aKontoPercent;
    }
    if (sanitizedUpdates.fakturert !== undefined) {
      dbUpdates.fakturert = sanitizedUpdates.fakturert;
    }
    if (sanitizedUpdates.billingType !== undefined) {
      dbUpdates.billing_type = sanitizedUpdates.billingType;
    }
    if (sanitizedUpdates.status !== undefined) dbUpdates.status = sanitizedUpdates.status;
    if (sanitizedUpdates.projectType !== undefined) {
      dbUpdates.project_type = sanitizedUpdates.projectType;
    }
    if (sanitizedUpdates.isPlaceholder !== undefined) {
      dbUpdates.is_placeholder = sanitizedUpdates.isPlaceholder;
    }
    if (sanitizedUpdates.projectLeaderId !== undefined) {
      dbUpdates.project_leader_id =
        sanitizedUpdates.projectLeaderId === null || sanitizedUpdates.projectLeaderId === ''
          ? null
          : sanitizedUpdates.projectLeaderId;
    }
    if (sanitizedUpdates.plannedStartDate !== undefined) {
      dbUpdates.planned_start_date = sanitizedUpdates.plannedStartDate || null;
    }
    if (sanitizedUpdates.durationDays !== undefined) {
      dbUpdates.duration_days = sanitizedUpdates.durationDays || null;
    }
    if (sanitizedUpdates.startIsUrgent !== undefined) {
      dbUpdates.start_is_urgent = sanitizedUpdates.startIsUrgent;
    }

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase.from('projects').update(dbUpdates).eq('id', id);

    if (error) {
      console.error('Error updating project:', error);
      return;
    }

    const updatedProject = { ...currentProject, ...sanitizedUpdates } as Project;

    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === id ? updatedProject : project
      ),
    }));

    // Auto-create or update assignment if project has start date, duration, and project leader
    if (updatedProject.plannedStartDate && updatedProject.durationDays && updatedProject.projectLeaderId) {
      const endDate = calculateEndDate(updatedProject.plannedStartDate, updatedProject.durationDays);

      const existingAssignment = assignments.find(
        (assignment) =>
          assignment.projectId === id &&
          assignment.workerId === updatedProject.projectLeaderId
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
      projects: state.projects.filter((project) => project.id !== id),
      assignments: state.assignments.filter((assignment) => assignment.projectId !== id),
      visibleFinanceProjectIds: state.visibleFinanceProjectIds.filter(
        (projectId) => projectId !== id
      ),
    }));
  },

  // Assignment actions
  addAssignment: async (assignment) => {
    const { isAdmin, editableWorkerIds } = get();
    if (!isAdmin && !editableWorkerIds.includes(assignment.workerId)) {
      return;
    }

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
    const { assignments, isAdmin, editableWorkerIds } = get();
    const currentAssignment = assignments.find((assignment) => assignment.id === id);
    if (!currentAssignment) return false;

    if (
      !isAdmin &&
      (!editableWorkerIds.includes(currentAssignment.workerId) ||
        (updates.workerId !== undefined && !editableWorkerIds.includes(updates.workerId)))
    ) {
      return false;
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
    if (updates.workerId !== undefined) dbUpdates.worker_id = updates.workerId;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;

    const { error } = await supabase.from('project_assignments').update(dbUpdates).eq('id', id);

    if (error) {
      console.error('Error updating assignment:', error);
      return false;
    }

    set((state) => ({
      assignments: state.assignments.map((assignment) =>
        assignment.id === id ? { ...assignment, ...updates } : assignment
      ),
    }));
    return true;
  },

  deleteAssignment: async (id) => {
    const { assignments, isAdmin, editableWorkerIds } = get();
    const currentAssignment = assignments.find((assignment) => assignment.id === id);
    if (!currentAssignment) return;

    if (!isAdmin && !editableWorkerIds.includes(currentAssignment.workerId)) {
      return;
    }

    const { error } = await supabase.from('project_assignments').delete().eq('id', id);

    if (error) {
      console.error('Error deleting assignment:', error);
      return;
    }

    set((state) => ({
      assignments: state.assignments.filter((assignment) => assignment.id !== id),
    }));
  },

  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDragSelection: (selection) => set({ dragSelection: selection }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  // Computed
  getProjectFinance: (projectId) => {
    const { projects, isAdmin, visibleFinanceProjectIds } = get();
    if (!isAdmin && !visibleFinanceProjectIds.includes(projectId)) {
      return { fakturert: 0, ordrereserve: 0 };
    }

    const project = projects.find((item) => item.id === projectId);
    if (!project || project.isPlaceholder) return { fakturert: 0, ordrereserve: 0 };

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
    const { projects, isAdmin, visibleFinanceProjectIds } = get();
    const visibleProjectIds = new Set(visibleFinanceProjectIds);

    return projects
      .filter(
        (project) =>
          project.status === 'active' &&
          project.projectType === 'regular' &&
          !project.isPlaceholder &&
          (isAdmin || visibleProjectIds.has(project.id))
      )
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
