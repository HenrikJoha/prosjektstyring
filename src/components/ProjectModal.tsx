'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { parseISO, format } from '@/utils/dates';
import { X, Plus, Check, User } from 'lucide-react';
import clsx from 'clsx';

const PROJECT_COLORS = [
  // Red (#EF4444) reserved for sick days only
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#78716C', // Stone
];

interface ProjectModalProps {
  workerId: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSelect: (projectId: string) => void;
}

export default function ProjectModal({
  workerId,
  startDate,
  endDate,
  onClose,
  onSelect,
}: ProjectModalProps) {
  const { projects, workers, addProject, isAdmin, visibleFinanceProjectIds } = useStore();
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [projectSearch, setProjectSearch] = useState('');
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    amount: 0,
    billingType: 'tilbud' as 'tilbud' | 'timer_materiell',
  });

  const sickLeaveProjects = projects.filter(
    (project) => project.status === 'active' && project.projectType === 'sick_leave'
  );
  const vacationProjects = projects.filter(
    (project) => project.status === 'active' && project.projectType === 'vacation'
  );
  const regularProjects = projects.filter(
    (project) => project.status === 'active' && project.projectType === 'regular'
  );
  const visibleFinanceProjectIdSet = useMemo(
    () => new Set(visibleFinanceProjectIds),
    [visibleFinanceProjectIds]
  );
  const selectableRegularProjects = useMemo(
    () =>
      isAdmin
        ? regularProjects
        : regularProjects.filter((project) => visibleFinanceProjectIdSet.has(project.id)),
    [isAdmin, regularProjects, visibleFinanceProjectIdSet]
  );
  const worker = workers.find((item) => item.id === workerId);

  const projectLeader = useMemo(() => {
    if (!worker) return null;

    if (worker.role === 'prosjektleder') {
      return worker;
    }

    if (worker.projectLeaderId) {
      return workers.find((item) => item.id === worker.projectLeaderId) ?? null;
    }

    return null;
  }, [worker, workers]);

  const filteredRegularProjects = useMemo(() => {
    const normalizedSearch = projectSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return selectableRegularProjects;
    }

    return selectableRegularProjects.filter((project) =>
      project.name.trim().toLowerCase().startsWith(normalizedSearch)
    );
  }, [projectSearch, selectableRegularProjects]);

  const formatDateRange = () => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (startDate === endDate) {
      return format(start, 'd. MMMM yyyy');
    }

    return `${format(start, 'd. MMM')} - ${format(end, 'd. MMM yyyy')}`;
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;

    const createdId = await addProject({
      name: newProject.name.trim(),
      description: newProject.description.trim(),
      color: newProject.color,
      amount: newProject.amount,
      aKontoPercent: 0,
      fakturert: 0,
      billingType: newProject.billingType,
      status: 'active',
      projectType: 'regular',
      isSystem: false,
      isPlaceholder: !isAdmin,
      projectLeaderId: projectLeader?.id,
    });

    if (createdId) {
      onSelect(createdId);
    }
  };

  const selectionTitle = isAdmin ? 'Velg eller opprett prosjekt' : 'Velg prosjekt eller opprett aktivitet';
  const createTitle = isAdmin ? 'Nytt prosjekt' : 'Ny aktivitet';
  const createButtonLabel = isAdmin ? 'Opprett nytt prosjekt' : 'Opprett ny aktivitet';
  const createSubmitLabel = isAdmin ? 'Opprett og tildel' : 'Opprett aktivitet';
  const emptyProjectsLabel = isAdmin
    ? 'Ingen eksisterende prosjekter. Opprett et nytt prosjekt for å starte.'
    : 'Ingen eksisterende prosjekter. Opprett en ny aktivitet for å starte.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'select' ? selectionTitle : createTitle}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {worker?.name} - {formatDateRange()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-140px)] overflow-y-auto p-6">
          {mode === 'select' ? (
            <>
              <div className="mb-4 rounded-xl border border-red-100/50 bg-red-50/30 p-4">
                <div className="mb-3 text-sm font-semibold text-red-800">Sykefravær</div>
                <div className="grid grid-cols-2 gap-2">
                  {sickLeaveProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onSelect(project.id)}
                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-white p-3 text-left transition-colors hover:border-red-400 hover:bg-red-50"
                    >
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-sm font-medium text-gray-900">{project.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="mb-3 text-sm font-semibold text-yellow-700">Fravær / Permisjon</div>
                <div className="grid grid-cols-3 gap-2">
                  {vacationProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onSelect(project.id)}
                      className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-white p-3 text-left transition-colors hover:border-yellow-500 hover:bg-yellow-50"
                    >
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-sm font-medium text-gray-900">{project.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-5 border-t border-gray-200" />

              <button
                onClick={() => setMode('create')}
                className="mb-4 flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-4 text-gray-600 transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                  <Plus size={24} />
                </div>
                <span className="font-medium">{createButtonLabel}</span>
              </button>

              {selectableRegularProjects.length > 0 && (
                <>
                  <div className="mb-3 text-sm font-medium text-gray-500">
                    Eller velg eksisterende prosjekt:
                  </div>
                  <div className="mb-3">
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder="Filtrer prosjekter..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    {filteredRegularProjects.map((project) => {
                      const leader = workers.find((item) => item.id === project.projectLeaderId);

                      return (
                        <button
                          key={project.id}
                          onClick={() => onSelect(project.id)}
                          className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-blue-500 hover:bg-blue-50"
                        >
                          <div
                            className="h-10 w-10 flex-shrink-0 rounded-lg"
                            style={{ backgroundColor: project.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-gray-900">{project.name}</div>
                            {leader && (
                              <div className="truncate text-sm text-gray-500">{leader.name}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {filteredRegularProjects.length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-500">
                      Ingen prosjekter matcher det du skriver.
                    </p>
                  )}
                </>
              )}

              {selectableRegularProjects.length === 0 && (
                <p className="py-4 text-center text-gray-500">{emptyProjectsLabel}</p>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setMode('select')}
                className="mb-4 text-sm text-blue-600 hover:text-blue-700"
              >
                {'<-'} Tilbake til valg
              </button>

              {projectLeader && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <User size={16} className="text-blue-600" />
                  <span className="text-sm text-blue-800">
                    Prosjektleder: <span className="font-medium">{projectLeader.name}</span>
                  </span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Prosjektnavn *
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(event) =>
                      setNewProject({ ...newProject, name: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    placeholder="F.eks. Klokkerjordet 16"
                    autoFocus
                  />
                </div>

                {isAdmin && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Prosjekttype
                    </label>
                    <select
                      value={newProject.billingType}
                      onChange={(event) =>
                        setNewProject({
                          ...newProject,
                          billingType: event.target.value as 'tilbud' | 'timer_materiell',
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="tilbud">Tilbud</option>
                      <option value="timer_materiell">Timer og materiell</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Beskrivelse
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(event) =>
                      setNewProject({ ...newProject, description: event.target.value })
                    }
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Valgfri beskrivelse..."
                  />
                </div>

                {isAdmin && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Beløp (NOK)
                    </label>
                    <input
                      type="number"
                      value={newProject.amount || ''}
                      onChange={(event) =>
                        setNewProject({ ...newProject, amount: Number(event.target.value) })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      min={0}
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Farge</label>
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewProject({ ...newProject, color })}
                        className={clsx(
                          'h-8 w-8 rounded-lg transition-transform hover:scale-110',
                          newProject.color === color && 'ring-2 ring-blue-500 ring-offset-2'
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {mode === 'create' && (
          <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
            >
              Avbryt
            </button>
            <button
              onClick={handleCreateProject}
              disabled={!newProject.name.trim()}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-4 py-2 transition-colors',
                newProject.name.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400'
              )}
            >
              <Check size={18} />
              {createSubmitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
