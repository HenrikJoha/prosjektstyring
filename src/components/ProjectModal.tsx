'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { parseISO, format } from '@/utils/dates';
import { X, Plus, Check, User } from 'lucide-react';
import clsx from 'clsx';

const PROJECT_COLORS = [
  '#EF4444', // Red
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
  const { projects, workers, addProject } = useStore();
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    amount: 0,
    billingType: 'tilbud' as 'tilbud' | 'timer_materiell',
  });

  // Separate sick leave, vacation, and regular projects
  const sickLeaveProjects = projects.filter(p => 
    p.status === 'active' && p.projectType === 'sick_leave'
  );
  const vacationProjects = projects.filter(p => 
    p.status === 'active' && p.projectType === 'vacation'
  );
  const regularProjects = projects.filter(p => 
    p.status === 'active' && p.projectType === 'regular'
  );
  const worker = workers.find(w => w.id === workerId);

  // Determine the project leader for this assignment
  const projectLeader = useMemo(() => {
    if (!worker) return null;
    
    if (worker.role === 'prosjektleder') {
      return worker;
    } else if (worker.projectLeaderId) {
      return workers.find(w => w.id === worker.projectLeaderId);
    }
    return null;
  }, [worker, workers]);

  const formatDateRange = () => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (startDate === endDate) {
      return format(start, 'd. MMMM yyyy');
    }
    return `${format(start, 'd. MMM')} - ${format(end, 'd. MMM yyyy')}`;
  };

  const handleCreateProject = async () => {
    if (newProject.name.trim()) {
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
        projectLeaderId: projectLeader?.id,
      });
      if (createdId) {
        onSelect(createdId);
      }
    }
  };

  const handleSelectProject = (projectId: string) => {
    onSelect(projectId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'select' ? 'Velg eller opprett prosjekt' : 'Nytt prosjekt'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {worker?.name} • {formatDateRange()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {mode === 'select' ? (
            <>
              {/* Sick Leave Section */}
              <div className="mb-4 p-4 bg-red-50 rounded-xl border border-red-100">
                <div className="text-sm font-semibold text-red-800 mb-3">Sykefravær</div>
                <div className="grid grid-cols-2 gap-2">
                  {sickLeaveProjects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className="flex items-center gap-2 p-3 bg-white border border-red-200 rounded-lg hover:border-red-400 hover:bg-red-50 transition-colors text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="font-medium text-gray-900 text-sm">
                        {project.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vacation/Leave Section */}
              <div className="mb-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                <div className="text-sm font-semibold text-yellow-700 mb-3">Fravær / Permisjon</div>
                <div className="grid grid-cols-3 gap-2">
                  {vacationProjects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className="flex items-center gap-2 p-3 bg-white border border-yellow-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-colors text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="font-medium text-gray-900 text-sm">
                        {project.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 my-5" />

              {/* Create new project button */}
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors mb-4"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Plus size={24} />
                </div>
                <span className="font-medium">Opprett nytt prosjekt</span>
              </button>

              {/* Existing regular projects */}
              {regularProjects.length > 0 && (
                <>
                  <div className="text-sm font-medium text-gray-500 mb-3">
                    Eller velg eksisterende prosjekt:
                  </div>
                  <div className="space-y-2">
                    {regularProjects.map(project => {
                      const leader = workers.find(w => w.id === project.projectLeaderId);
                      return (
                        <button
                          key={project.id}
                          onClick={() => handleSelectProject(project.id)}
                          className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {project.name}
                            </div>
                            {leader && (
                              <div className="text-sm text-gray-500 truncate">
                                {leader.name}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {regularProjects.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  Ingen eksisterende prosjekter. Opprett et nytt prosjekt for å starte.
                </p>
              )}
            </>
          ) : (
            <>
              {/* Back button */}
              <button
                onClick={() => setMode('select')}
                className="text-sm text-blue-600 hover:text-blue-700 mb-4"
              >
                ← Tilbake til valg
              </button>

              {/* Project leader info */}
              {projectLeader && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-2">
                  <User size={16} className="text-blue-600" />
                  <span className="text-sm text-blue-800">
                    Prosjektleder: <span className="font-medium">{projectLeader.name}</span>
                  </span>
                </div>
              )}

              {/* Create form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prosjektnavn *
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="F.eks. Klokkerjordet 16"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prosjekttype
                  </label>
                  <select
                    value={newProject.billingType}
                    onChange={(e) => setNewProject({ ...newProject, billingType: e.target.value as 'tilbud' | 'timer_materiell' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="tilbud">Tilbud</option>
                    <option value="timer_materiell">Timer og materiell</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beskrivelse
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={2}
                    placeholder="Valgfri beskrivelse..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beløp (NOK)
                  </label>
                  <input
                    type="number"
                    value={newProject.amount || ''}
                    onChange={(e) => setNewProject({ ...newProject, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Farge
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewProject({ ...newProject, color })}
                        className={clsx(
                          'w-8 h-8 rounded-lg transition-transform hover:scale-110',
                          newProject.color === color && 'ring-2 ring-offset-2 ring-blue-500'
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

        {/* Footer */}
        {mode === 'create' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={handleCreateProject}
              disabled={!newProject.name.trim()}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                newProject.name.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              )}
            >
              <Check size={18} />
              Opprett og tildel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
