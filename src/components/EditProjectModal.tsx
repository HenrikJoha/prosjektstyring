'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Project, ProjectAssignment } from '@/types';
import { X, Check, Trash2, Calendar } from 'lucide-react';
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

interface EditProjectModalProps {
  project: Project;
  assignment?: ProjectAssignment; // Optional - if provided, we can remove this specific assignment
  onClose: () => void;
}

export default function EditProjectModal({ project, assignment, onClose }: EditProjectModalProps) {
  const { updateProject, deleteProject, deleteAssignment, assignments } = useStore();
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description,
    color: project.color,
    amount: project.amount,
    billingType: project.billingType,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState<'assignment' | 'project' | null>(null);

  // Check how many assignments this project has
  const projectAssignments = assignments.filter(a => a.projectId === project.id);
  const isLastAssignment = assignment && projectAssignments.length === 1;

  const handleSave = () => {
    if (formData.name.trim() && !project.isSystem) {
      updateProject(project.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color,
        amount: formData.amount,
        billingType: formData.billingType,
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

  const handleDeleteProject = () => {
    // Delete all assignments for this project first, then the project
    projectAssignments.forEach(a => deleteAssignment(a.id));
    deleteProject(project.id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {project.isSystem ? project.name : 'Rediger prosjekt'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* For system projects (holidays/sickdays), only show info */}
          {project.isSystem ? (
            <div className="text-center py-4">
              <div 
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: project.color }}
              >
                <Calendar size={32} className="text-white" />
              </div>
              <p className="text-gray-600">
                Dette er en systemoppføring som ikke kan redigeres.
              </p>
              {assignment && (
                <p className="text-sm text-gray-500 mt-2">
                  Du kan fjerne denne tildelingen fra kalenderen.
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prosjektnavn
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  value={formData.billingType}
                  onChange={(e) => setFormData({ ...formData, billingType: e.target.value as 'tilbud' | 'timer_materiell' })}
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
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  placeholder="Valgfri beskrivelse..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beløp (NOK)
                </label>
                <input
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
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
                      onClick={() => setFormData({ ...formData, color })}
                      className={clsx(
                        'w-8 h-8 rounded-lg transition-transform hover:scale-110',
                        formData.color === color && 'ring-2 ring-offset-2 ring-blue-500'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer with delete options */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
          {/* Delete confirmation */}
          {showDeleteConfirm && deleteType && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
              <p className="text-sm text-red-800 mb-3">
                {deleteType === 'assignment' 
                  ? 'Er du sikker på at du vil fjerne denne tildelingen fra kalenderen?'
                  : isLastAssignment
                    ? 'Dette er den siste tildelingen for dette prosjektet. Vil du slette hele prosjektet?'
                    : 'Er du sikker på at du vil slette hele prosjektet og alle tildelinger?'
                }
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (deleteType === 'assignment') {
                      handleRemoveAssignment();
                    } else {
                      handleDeleteProject();
                    }
                  }}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  {deleteType === 'assignment' ? 'Ja, fjern' : 'Ja, slett'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteType(null);
                  }}
                  className="px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!showDeleteConfirm && (
            <div className="flex flex-col gap-2">
              {/* Remove from calendar - always show if we have an assignment */}
              {assignment && (
                <button
                  onClick={() => {
                    if (isLastAssignment && !project.isSystem) {
                      // Last assignment for a regular project - ask about deleting project
                      setDeleteType('project');
                      setShowDeleteConfirm(true);
                    } else {
                      // Just remove assignment
                      setDeleteType('assignment');
                      setShowDeleteConfirm(true);
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                  Fjern fra kalender
                </button>
              )}
              
              {/* Delete entire project - only for non-system projects with multiple assignments */}
              {!project.isSystem && projectAssignments.length > 1 && (
                <button
                  onClick={() => {
                    setDeleteType('project');
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                >
                  <Trash2 size={16} />
                  Slett hele prosjektet ({projectAssignments.length} tildelinger)
                </button>
              )}
            </div>
          )}

          {/* Save/Cancel buttons - only for editable projects */}
          {!project.isSystem && !showDeleteConfirm && (
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name.trim()}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  formData.name.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                <Check size={18} />
                Lagre
              </button>
            </div>
          )}

          {/* Close button for system projects */}
          {project.isSystem && !showDeleteConfirm && (
            <div className="flex justify-end pt-2 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
