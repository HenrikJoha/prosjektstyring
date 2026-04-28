'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Project, ProjectAssignment } from '@/types';
import { X, Check, Trash2, Calendar } from 'lucide-react';
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

interface EditProjectModalProps {
  project: Project;
  assignment?: ProjectAssignment;
  onClose: () => void;
}

export default function EditProjectModal({
  project,
  assignment,
  onClose,
}: EditProjectModalProps) {
  const { updateProject, deleteAssignment, isAdmin, currentUserWorkerId } = useStore();
  const user = useAuthStore((state) => state.user);
  const isAdminUser = isAdmin || user?.role === 'admin';
  const canEditProject =
    !project.isSystem &&
    (isAdminUser || project.projectLeaderId === currentUserWorkerId);
  const canEditFinanceFields = canEditProject && isAdminUser;

  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description,
    color: project.color,
    amount: project.amount,
    billingType: project.billingType,
  });
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleSave = () => {
    if (formData.name.trim() && canEditProject) {
      updateProject(project.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        ...(canEditFinanceFields
          ? {
              amount: formData.amount,
              billingType: formData.billingType,
              ...(project.isPlaceholder ? { isPlaceholder: false } : {}),
            }
          : {}),
      });
    }
    onClose();
  };

  const handleRemoveAssignment = () => {
    if (assignment) {
      deleteAssignment(assignment.id);
    }
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  const modalTitle = project.isSystem
    ? project.name
    : project.isPlaceholder
      ? isAdminUser
        ? 'Gjør om aktivitet til prosjekt'
        : 'Rediger aktivitet'
      : 'Rediger prosjekt';

  const saveLabel =
    canEditFinanceFields && project.isPlaceholder
      ? 'Gjør om til prosjekt'
      : project.isPlaceholder
        ? 'Lagre aktivitet'
        : 'Lagre';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{modalTitle}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {project.isSystem ? (
            <div className="py-4 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: project.color }}
              >
                <Calendar size={32} className="text-white" />
              </div>
              <p className="text-gray-600">Dette er en systemoppføring som ikke kan redigeres.</p>
              {assignment && (
                <p className="mt-2 text-sm text-gray-500">
                  Du kan fjerne denne tildelingen fra kalenderen.
                </p>
              )}
            </div>
          ) : !canEditProject ? (
            <div className="py-4 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: project.color }}
              >
                <Calendar size={32} className="text-white" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">{project.name}</h3>
              {project.description && (
                <p className="mb-2 text-sm text-gray-600">{project.description}</p>
              )}
              <p className="text-sm text-gray-500">
                Dette prosjektet tilhører en annen prosjektleder.
              </p>
              {assignment && (
                <p className="mt-2 text-sm text-gray-500">
                  Du kan fjerne din tildeling fra kalenderen.
                </p>
              )}
            </div>
          ) : (
            <>
              {project.isPlaceholder && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  {canEditFinanceFields
                    ? 'Denne aktiviteten vises bare i kalenderen. Legg til prosjekttype og beløp, og gjør den om til et prosjekt for å vise den i Økonomi.'
                    : 'Dette er en kalenderaktivitet. Admin må fylle ut prosjekttype og beløp før den vises i Økonomi.'}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Prosjektnavn
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder="F.eks. Klokkerjordet 16"
                  autoFocus
                />
              </div>

              {canEditFinanceFields && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Prosjekttype
                  </label>
                  <select
                    value={formData.billingType}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
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
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({ ...formData, description: event.target.value })
                  }
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Valgfri beskrivelse..."
                />
              </div>

              {canEditFinanceFields && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Beløp (NOK)
                  </label>
                  <input
                    type="number"
                    value={formData.amount || ''}
                    onChange={(event) =>
                      setFormData({ ...formData, amount: Number(event.target.value) })
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
                      onClick={() => setFormData({ ...formData, color })}
                      className={clsx(
                        'h-8 w-8 rounded-lg transition-transform hover:scale-110',
                        formData.color === color && 'ring-2 ring-blue-500 ring-offset-2'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          {showRemoveConfirm && assignment && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-3 text-sm text-red-800">
                Er du sikker på at du vil fjerne denne tildelingen fra kalenderen?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRemoveAssignment}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                >
                  Ja, fjern
                </button>
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {!showRemoveConfirm && (
            <div className="flex flex-col gap-2">
              {assignment && (
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={18} />
                  Fjern fra kalender
                </button>
              )}
            </div>
          )}

          {canEditProject && !showRemoveConfirm && (
            <div className="flex justify-end gap-3 border-t border-gray-200 pt-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name.trim()}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-4 py-2 transition-colors',
                  formData.name.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-gray-200 text-gray-400'
                )}
              >
                <Check size={18} />
                {saveLabel}
              </button>
            </div>
          )}

          {(project.isSystem || !canEditProject) && !showRemoveConfirm && (
            <div className="flex justify-end border-t border-gray-200 pt-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
              >
                Lukk
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
