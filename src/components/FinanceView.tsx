'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Project } from '@/types';
import { formatCurrency, parseISO, eachDayOfInterval } from '@/utils/dates';
import { Check, X, DollarSign, TrendingUp, Trash2, Plus, User, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// Helper to check if a date is a weekend
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Count working days (exclude weekends) between two dates
function countWorkingDays(start: Date, end: Date): number {
  if (start > end) return 0;
  const days = eachDayOfInterval({ start, end });
  return days.filter(d => !isWeekend(d)).length;
}

const PROJECT_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
  '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#78716C',
];

export default function FinanceView() {
  const { projects, assignments, workers, updateProject, deleteProject, addProject, getProjectFinance, getTotalOrdrereserve } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<'akonto' | 'amount' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Create project modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    amount: '',
    projectLeaderId: '',
  });

  // Assign leader dropdown state
  const [assigningLeaderId, setAssigningLeaderId] = useState<string | null>(null);

  // Get all project leaders
  const projectLeaders = workers.filter(w => w.role === 'prosjektleder');

  // Only show regular projects in finance (exclude sick_leave and vacation)
  const activeProjects = projects.filter(p => p.status === 'active' && p.projectType === 'regular');
  const completedProjects = projects.filter(p => p.status === 'completed' && p.projectType === 'regular');

  // Group active projects by project leader
  const groupedProjects = useMemo(() => {
    const groups: { leader: { id: string; name: string } | null; projects: Project[] }[] = [];
    
    // Group by each project leader
    projectLeaders.forEach(leader => {
      const leaderProjects = activeProjects.filter(p => p.projectLeaderId === leader.id);
      if (leaderProjects.length > 0) {
        groups.push({ leader: { id: leader.id, name: leader.name }, projects: leaderProjects });
      }
    });
    
    // Unassigned projects (no project leader)
    const unassignedProjects = activeProjects.filter(p => !p.projectLeaderId);
    if (unassignedProjects.length > 0) {
      groups.push({ leader: null, projects: unassignedProjects });
    }
    
    return groups;
  }, [activeProjects, projectLeaders]);

  const totalOrdrereserve = getTotalOrdrereserve();

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId, editField]);

  // Calculate project status (worked days / planned days)
  const projectStatus = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const statusMap = new Map<string, { workedDays: number; plannedDays: number; percentage: number }>();
    
    activeProjects.forEach(project => {
      const projectAssignments = assignments.filter(a => a.projectId === project.id);
      
      let totalWorkedDays = 0;
      let totalPlannedDays = 0;
      
      projectAssignments.forEach(assignment => {
        const startDate = parseISO(assignment.startDate);
        const endDate = parseISO(assignment.endDate);
        
        // Planned days = all working days in the assignment
        const plannedDays = countWorkingDays(startDate, endDate);
        totalPlannedDays += plannedDays;
        
        // Worked days = working days from start to today (or end date if already passed)
        const effectiveEnd = today < endDate ? today : endDate;
        if (startDate <= effectiveEnd) {
          const workedDays = countWorkingDays(startDate, effectiveEnd);
          totalWorkedDays += workedDays;
        }
      });
      
      const percentage = totalPlannedDays > 0 ? Math.round((totalWorkedDays / totalPlannedDays) * 100) : 0;
      statusMap.set(project.id, { workedDays: totalWorkedDays, plannedDays: totalPlannedDays, percentage });
    });
    
    return statusMap;
  }, [activeProjects, assignments]);

  const handleEdit = (projectId: string, field: 'akonto' | 'amount', currentValue: number) => {
    setEditingId(projectId);
    setEditField(field);
    setEditValue(currentValue === 0 ? '' : currentValue.toString());
  };

  const handleSave = (projectId: string) => {
    const numValue = editValue === '' ? 0 : Number(editValue);
    if (editField === 'akonto') {
      updateProject(projectId, { aKontoPercent: Math.min(100, Math.max(0, numValue)) });
    } else if (editField === 'amount') {
      updateProject(projectId, { amount: Math.max(0, numValue) });
    }
    setEditingId(null);
    setEditField(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, projectId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(projectId);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleCreateProject = async () => {
    if (newProject.name.trim()) {
      await addProject({
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        color: newProject.color,
        amount: newProject.amount === '' ? 0 : Number(newProject.amount),
        aKontoPercent: 0,
        status: 'active',
        projectType: 'regular',
        isSystem: false,
        projectLeaderId: newProject.projectLeaderId || undefined,
      });
      setNewProject({
        name: '',
        description: '',
        color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
        amount: '',
        projectLeaderId: '',
      });
      setShowCreateModal(false);
    }
  };

  const handleAssignLeader = (projectId: string, leaderId: string) => {
    updateProject(projectId, { projectLeaderId: leaderId });
    setAssigningLeaderId(null);
  };

  // Render a project row
  const renderProjectRow = (project: Project, showLeaderColumn: boolean) => {
    const { fakturert, ordrereserve } = getProjectFinance(project.id);
    const isEditingAmount = editingId === project.id && editField === 'amount';
    const isEditingAkonto = editingId === project.id && editField === 'akonto';
    const status = projectStatus.get(project.id);
    const leader = workers.find(w => w.id === project.projectLeaderId);
    const isAssigning = assigningLeaderId === project.id;

    return (
      <tr key={project.id} className="hover:bg-gray-50">
        {showLeaderColumn && (
          <td className="px-4 py-4 relative">
            {isAssigning ? (
              <div className="absolute z-10 top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]">
                {projectLeaders.map(l => (
                  <button
                    key={l.id}
                    onClick={() => handleAssignLeader(project.id, l.id)}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
                  >
                    <User size={14} className="text-gray-400" />
                    {l.name}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              onClick={() => setAssigningLeaderId(isAssigning ? null : project.id)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded"
            >
              <User size={14} />
              <span>{leader?.name || 'Velg...'}</span>
              <ChevronDown size={14} />
            </button>
          </td>
        )}
        <td className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <div className="font-medium text-gray-900">{project.name}</div>
              {project.description && (
                <div className="text-sm text-gray-500 truncate max-w-xs">
                  {project.description}
                </div>
              )}
            </div>
          </div>
        </td>
        
        <td 
          className={clsx(
            "px-4 py-4 text-right",
            !isEditingAmount && "cursor-pointer hover:bg-blue-50"
          )}
          onClick={() => !isEditingAmount && handleEdit(project.id, 'amount', project.amount)}
        >
          {isEditingAmount ? (
            <div className="flex items-center justify-end gap-2">
              <input
                ref={inputRef}
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, project.id)}
                onFocus={(e) => e.target.select()}
                min={0}
                className="w-28 px-2 py-1 border border-blue-500 rounded text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0"
              />
              <button
                onClick={(e) => { e.stopPropagation(); handleSave(project.id); }}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
              >
                <Check size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <span className="font-medium text-gray-900">{formatCurrency(project.amount)}</span>
          )}
        </td>
        
        <td 
          className={clsx(
            "px-4 py-4 text-right",
            !isEditingAkonto && "cursor-pointer hover:bg-blue-50"
          )}
          onClick={() => !isEditingAkonto && handleEdit(project.id, 'akonto', project.aKontoPercent)}
        >
          {isEditingAkonto ? (
            <div className="flex items-center justify-end gap-2">
              <input
                ref={inputRef}
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, project.id)}
                onFocus={(e) => e.target.select()}
                min={0}
                max={100}
                className="w-16 px-2 py-1 border border-blue-500 rounded text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0"
              />
              <span>%</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleSave(project.id); }}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
              >
                <Check size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                className="p-1 text-gray-400 hover:bg-gray-100 rounded"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <span className="font-medium">{project.aKontoPercent}%</span>
          )}
        </td>
        
        <td className="px-4 py-4 text-right font-medium text-green-600">
          {formatCurrency(fakturert)}
        </td>
        <td className="px-4 py-4 text-right font-medium text-orange-600">
          {formatCurrency(ordrereserve)}
        </td>
        <td className="px-4 py-4">
          {(!status || status.plannedDays === 0) ? (
            <span className="text-gray-400 text-sm text-center block">-</span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={clsx(
                    'h-full rounded-full transition-all',
                    status.percentage >= 100 ? 'bg-green-500' : 
                    status.percentage >= 75 ? 'bg-blue-500' :
                    status.percentage >= 50 ? 'bg-yellow-500' : 'bg-gray-400'
                  )}
                  style={{ width: `${Math.min(100, status.percentage)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {status.percentage}%
              </span>
            </div>
          )}
        </td>
        <td className="px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => updateProject(project.id, { status: 'completed' })}
              className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full hover:bg-green-100 hover:text-green-700 transition-colors"
            >
              Fullført
            </button>
            <button
              onClick={() => {
                if (confirm('Er du sikker på at du vil slette dette prosjektet?')) {
                  deleteProject(project.id);
                }
              }}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Slett prosjekt"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full pb-24 md:pb-6">
      <div className="max-w-7xl mx-auto">
        {/* Summary Card - Only Ordrereserve */}
        <div className="mb-8 flex items-center justify-between">
          <div className="bg-white rounded-xl border border-gray-200 p-6 inline-block">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="text-orange-600" size={24} />
              </div>
              <span className="text-sm font-medium text-gray-500">Ordrereserve</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalOrdrereserve)}
            </div>
          </div>
          
          {/* Create Project Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nytt prosjekt
          </button>
        </div>

        {/* Active Projects Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Aktive prosjekter</h2>
          </div>
          
          {activeProjects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <DollarSign size={48} className="mx-auto mb-4 opacity-50" />
              <p>Ingen aktive prosjekter.</p>
              <p className="text-sm">Klikk &quot;Nytt prosjekt&quot; for å opprette et prosjekt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Prosjektleder</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Prosjekt</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Beløp</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">A konto %</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Fakturert</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Ordrereserve</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Fremdrift</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedProjects.map((group, groupIndex) => (
                    <React.Fragment key={group.leader?.id || 'unassigned'}>
                      {/* Group header for project leader */}
                      {group.leader ? (
                        <tr className={clsx(groupIndex > 0 && 'border-t-4 border-gray-100')}>
                          <td 
                            colSpan={8} 
                            className="px-4 py-3 bg-blue-50"
                          >
                            <div className="flex items-center gap-2">
                              <User size={16} className="text-blue-600" />
                              <span className="font-semibold text-blue-800">{group.leader.name}</span>
                              <span className="text-sm text-blue-600">({group.projects.length} prosjekter)</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr className={clsx(groupIndex > 0 && 'border-t-4 border-gray-100')}>
                          <td 
                            colSpan={8} 
                            className="px-4 py-3 bg-gray-100"
                          >
                            <div className="flex items-center gap-2">
                              <User size={16} className="text-gray-500" />
                              <span className="font-semibold text-gray-600">Ikke tildelt prosjektleder</span>
                              <span className="text-sm text-gray-500">({group.projects.length} prosjekter)</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* Project rows */}
                      {group.projects.map(project => (
                        <tr key={project.id} className="hover:bg-gray-50 border-t border-gray-100">
                          <td className="px-4 py-4 relative">
                            {assigningLeaderId === project.id && (
                              <div className="absolute z-10 top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]">
                                {projectLeaders.map(l => (
                                  <button
                                    key={l.id}
                                    onClick={() => handleAssignLeader(project.id, l.id)}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
                                  >
                                    <User size={14} className="text-gray-400" />
                                    {l.name}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => setAssigningLeaderId(assigningLeaderId === project.id ? null : project.id)}
                              className={clsx(
                                "flex items-center gap-1 text-sm px-2 py-1 rounded",
                                group.leader 
                                  ? "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                  : "text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium"
                              )}
                            >
                              {group.leader ? (
                                <>
                                  <span className="text-gray-400">Endre</span>
                                  <ChevronDown size={14} />
                                </>
                              ) : (
                                <>
                                  <User size={14} />
                                  <span>Velg...</span>
                                  <ChevronDown size={14} />
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              <div>
                                <div className="font-medium text-gray-900">{project.name}</div>
                                {project.description && (
                                  <div className="text-sm text-gray-500 truncate max-w-xs">
                                    {project.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          
                          <td 
                            className={clsx(
                              "px-4 py-4 text-right",
                              !(editingId === project.id && editField === 'amount') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => !(editingId === project.id && editField === 'amount') && handleEdit(project.id, 'amount', project.amount)}
                          >
                            {(editingId === project.id && editField === 'amount') ? (
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  ref={inputRef}
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, project.id)}
                                  onFocus={(e) => e.target.select()}
                                  min={0}
                                  className="w-28 px-2 py-1 border border-blue-500 rounded text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                  placeholder="0"
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSave(project.id); }}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <span className="font-medium text-gray-900">{formatCurrency(project.amount)}</span>
                            )}
                          </td>
                          
                          <td 
                            className={clsx(
                              "px-4 py-4 text-right",
                              !(editingId === project.id && editField === 'akonto') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => !(editingId === project.id && editField === 'akonto') && handleEdit(project.id, 'akonto', project.aKontoPercent)}
                          >
                            {(editingId === project.id && editField === 'akonto') ? (
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  ref={inputRef}
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, project.id)}
                                  onFocus={(e) => e.target.select()}
                                  min={0}
                                  max={100}
                                  className="w-16 px-2 py-1 border border-blue-500 rounded text-right focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                  placeholder="0"
                                />
                                <span>%</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSave(project.id); }}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                  className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <span className="font-medium">{project.aKontoPercent}%</span>
                            )}
                          </td>
                          
                          <td className="px-4 py-4 text-right font-medium text-green-600">
                            {formatCurrency(getProjectFinance(project.id).fakturert)}
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-orange-600">
                            {formatCurrency(getProjectFinance(project.id).ordrereserve)}
                          </td>
                          <td className="px-4 py-4">
                            {(() => {
                              const status = projectStatus.get(project.id);
                              if (!status || status.plannedDays === 0) {
                                return <span className="text-gray-400 text-sm text-center block">-</span>;
                              }
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={clsx(
                                        'h-full rounded-full transition-all',
                                        status.percentage >= 100 ? 'bg-green-500' : 
                                        status.percentage >= 75 ? 'bg-blue-500' :
                                        status.percentage >= 50 ? 'bg-yellow-500' : 'bg-gray-400'
                                      )}
                                      style={{ width: `${Math.min(100, status.percentage)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {status.percentage}%
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => updateProject(project.id, { status: 'completed' })}
                                className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full hover:bg-green-100 hover:text-green-700 transition-colors"
                              >
                                Fullført
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Er du sikker på at du vil slette dette prosjektet?')) {
                                    deleteProject(project.id);
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Slett prosjekt"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Completed Projects */}
        {completedProjects.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-500">Fullførte prosjekter</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Prosjektleder</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Prosjekt</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Beløp</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Fakturert</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {completedProjects.map((project) => {
                    const { fakturert } = getProjectFinance(project.id);
                    const leader = workers.find(w => w.id === project.projectLeaderId);

                    return (
                      <tr key={project.id} className="hover:bg-gray-50 opacity-60">
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-500">
                            {leader?.name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="font-medium text-gray-900">{project.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-gray-900">
                          {formatCurrency(project.amount)}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-green-600">
                          {formatCurrency(fakturert)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => updateProject(project.id, { status: 'active' })}
                            className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
                          >
                            Gjenåpne
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreateModal(false)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nytt prosjekt</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prosjektnavn *
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && newProject.name.trim() && handleCreateProject()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="F.eks. Klokkerjordet 16"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prosjektleder
                </label>
                <select
                  value={newProject.projectLeaderId}
                  onChange={(e) => setNewProject({ ...newProject, projectLeaderId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Velg prosjektleder (valgfritt)</option>
                  {projectLeaders.map(leader => (
                    <option key={leader.id} value={leader.id}>
                      {leader.name}
                    </option>
                  ))}
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
                  value={newProject.amount}
                  onChange={(e) => setNewProject({ ...newProject, amount: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => e.key === 'Enter' && newProject.name.trim() && handleCreateProject()}
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

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowCreateModal(false)}
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
                Opprett prosjekt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {assigningLeaderId && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setAssigningLeaderId(null)}
        />
      )}
    </div>
  );
}
