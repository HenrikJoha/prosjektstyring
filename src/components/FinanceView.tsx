'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { Project, Worker } from '@/types';
import { formatCurrency, parseISO, eachDayOfInterval, formatDateNorwegian } from '@/utils/dates';
import { Check, X, DollarSign, TrendingUp, Trash2, Plus, User, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import EditProjectModal from './EditProjectModal';

// Dropdown component that renders via portal and positions smartly
interface LeaderDropdownProps {
  buttonRef: HTMLButtonElement | null;
  leaders: Worker[];
  onSelect: (leaderId: string) => void;
  onClose: () => void;
}

function LeaderDropdown({ buttonRef, leaders, onSelect, onClose }: LeaderDropdownProps) {
  const [position, setPosition] = useState({ top: 0, left: 0, showAbove: false });
  
  useEffect(() => {
    if (!buttonRef) return;
    
    const updatePosition = () => {
      const rect = buttonRef.getBoundingClientRect();
      const dropdownHeight = Math.min(leaders.length * 40 + 8, 200); // Estimate height
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight + 10;
      
      setPosition({
        top: showAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        showAbove,
      });
    };
    
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [buttonRef, leaders.length]);
  
  if (typeof window === 'undefined') return null;
  
  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />
      {/* Dropdown */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px] max-h-[200px] overflow-y-auto"
        style={{ top: position.top, left: position.left }}
      >
        {leaders.map(l => (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2"
          >
            <User size={14} className="text-gray-400" />
            {l.name}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

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
  const [editField, setEditField] = useState<'akonto' | 'amount' | 'fakturert' | 'startDate' | 'duration' | null>(null);
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
    billingType: 'tilbud' as 'tilbud' | 'timer_materiell',
    plannedStartDate: '',
    durationDays: '',
  });

  // Assign leader dropdown state
  const [assigningLeader, setAssigningLeader] = useState<{ projectId: string; buttonRef: HTMLButtonElement | null } | null>(null);
  
  // Edit project modal state
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Get all project leaders
  const projectLeaders = workers.filter(w => w.role === 'prosjektleder');

  // Only show regular projects in finance (exclude sick_leave and vacation)
  const activeProjects = projects.filter(p => p.status === 'active' && p.projectType === 'regular');
  const completedProjects = projects.filter(p => p.status === 'completed' && p.projectType === 'regular');

  // Separate unassigned projects from assigned ones
  const unassignedProjects = useMemo(() => {
    return activeProjects.filter(p => !p.projectLeaderId);
  }, [activeProjects]);

  // Group active projects by project leader (excluding unassigned)
  const groupedProjects = useMemo(() => {
    const groups: { leader: { id: string; name: string }; projects: Project[] }[] = [];
    
    // Group by each project leader
    projectLeaders.forEach(leader => {
      const leaderProjects = activeProjects.filter(p => p.projectLeaderId === leader.id);
      if (leaderProjects.length > 0) {
        groups.push({ leader: { id: leader.id, name: leader.name }, projects: leaderProjects });
      }
    });
    
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

  const handleEdit = (projectId: string, field: 'akonto' | 'amount' | 'fakturert' | 'startDate' | 'duration', currentValue: number | string) => {
    setEditingId(projectId);
    setEditField(field);
    if (field === 'startDate') {
      setEditValue(currentValue as string || '');
    } else {
      setEditValue((currentValue === 0 || currentValue === '') ? '' : currentValue.toString());
    }
  };

  const handleSave = (projectId: string) => {
    const numValue = editValue === '' ? 0 : Number(editValue);
    const project = projects.find(p => p.id === projectId);
    
    if (editField === 'akonto') {
      updateProject(projectId, { aKontoPercent: Math.min(100, Math.max(0, numValue)) });
    } else if (editField === 'amount') {
      updateProject(projectId, { amount: Math.max(0, numValue) });
    } else if (editField === 'fakturert') {
      // For timer_materiell: if fakturert > amount, auto-set amount to match
      const fakturertValue = Math.max(0, numValue);
      if (project && fakturertValue > project.amount) {
        updateProject(projectId, { fakturert: fakturertValue, amount: fakturertValue });
      } else {
        updateProject(projectId, { fakturert: fakturertValue });
      }
    } else if (editField === 'startDate') {
      updateProject(projectId, { plannedStartDate: editValue || undefined });
    } else if (editField === 'duration') {
      updateProject(projectId, { durationDays: numValue > 0 ? numValue : undefined });
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
        fakturert: 0,
        billingType: newProject.billingType,
        status: 'active',
        projectType: 'regular',
        isSystem: false,
        projectLeaderId: newProject.projectLeaderId || undefined,
        plannedStartDate: newProject.plannedStartDate || undefined,
        durationDays: newProject.durationDays === '' ? undefined : Number(newProject.durationDays),
      });
      setNewProject({
        name: '',
        description: '',
        color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
        amount: '',
        projectLeaderId: '',
        billingType: 'tilbud',
        plannedStartDate: '',
        durationDays: '',
      });
      setShowCreateModal(false);
    }
  };

  const handleAssignLeader = (projectId: string, leaderId: string) => {
    updateProject(projectId, { projectLeaderId: leaderId });
    setAssigningLeader(null);
  };

  const handleOpenLeaderDropdown = (projectId: string, buttonRef: HTMLButtonElement | null) => {
    if (assigningLeader?.projectId === projectId) {
      setAssigningLeader(null);
    } else {
      setAssigningLeader({ projectId, buttonRef });
    }
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full pb-24 md:pb-6">
      <div className="max-w-full md:max-w-[95vw] lg:max-w-[98vw] xl:max-w-[99vw] mx-auto">
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

        {/* Unassigned Projects Section - Separate box at top */}
        {unassignedProjects.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <User size={18} className="text-amber-700" />
                <h2 className="text-lg font-semibold text-amber-900">
                  Prosjekter som ikke er tildelt ({unassignedProjects.length})
                </h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white">
                    <th className="text-left px-4 py-3 text-sm font-medium text-amber-700">Prosjektleder</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-amber-700">Prosjekt</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-amber-700">Beløp</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-amber-700">A konto %</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-amber-700">Fakturert</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-amber-700">Ordrereserve</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-amber-700">Oppstartsdato</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-amber-700">Varighet (dager)</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-amber-700">Fremdrift</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-amber-700">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedProjects.map(project => (
                    <tr key={project.id} className="hover:bg-gray-50 border-t border-gray-100">
                      <td className="px-4 py-4">
                        <button
                          onClick={(e) => handleOpenLeaderDropdown(project.id, e.currentTarget)}
                          className="flex items-center gap-1 text-sm px-2 py-1 rounded text-amber-700 hover:text-amber-800 hover:bg-gray-100 font-medium"
                        >
                          <User size={14} />
                          <span>Velg...</span>
                          <ChevronDown size={14} />
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <div>
                            <button
                              onClick={() => setEditingProject(project)}
                              className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                            >
                              {project.name}
                            </button>
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
                          !(editingId === project.id && editField === 'amount') && "cursor-pointer hover:bg-gray-100"
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
                      
                      {/* A konto % column - only editable for 'tilbud' type */}
                      <td 
                        className={clsx(
                          "px-4 py-4 text-right",
                          project.billingType === 'tilbud' && !(editingId === project.id && editField === 'akonto') && "cursor-pointer hover:bg-gray-100"
                        )}
                        onClick={() => project.billingType === 'tilbud' && !(editingId === project.id && editField === 'akonto') && handleEdit(project.id, 'akonto', project.aKontoPercent)}
                      >
                        {project.billingType === 'timer_materiell' ? (
                          <span className="text-gray-400">-</span>
                        ) : (editingId === project.id && editField === 'akonto') ? (
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
                      
                      {/* Fakturert column - editable for 'timer_materiell' type */}
                      <td 
                        className={clsx(
                          "px-4 py-4 text-right font-medium text-green-600",
                          project.billingType === 'timer_materiell' && !(editingId === project.id && editField === 'fakturert') && "cursor-pointer hover:bg-gray-100"
                        )}
                        onClick={() => project.billingType === 'timer_materiell' && !(editingId === project.id && editField === 'fakturert') && handleEdit(project.id, 'fakturert', project.fakturert)}
                      >
                        {(editingId === project.id && editField === 'fakturert') ? (
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
                          formatCurrency(getProjectFinance(project.id).fakturert)
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-orange-600">
                        {formatCurrency(getProjectFinance(project.id).ordrereserve)}
                      </td>
                      
                      {/* Oppstartsdato column */}
                      <td 
                        className={clsx(
                          "px-4 py-4 text-center",
                          !(editingId === project.id && editField === 'startDate') && "cursor-pointer hover:bg-gray-100"
                        )}
                        onClick={() => !(editingId === project.id && editField === 'startDate') && handleEdit(project.id, 'startDate', project.plannedStartDate || '')}
                      >
                        {(editingId === project.id && editField === 'startDate') ? (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              ref={inputRef}
                              type="date"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, project.id)}
                              className="px-2 py-1 border border-blue-500 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                          <span className="text-sm text-gray-900">
                            {project.plannedStartDate ? formatDateNorwegian(project.plannedStartDate) : '-'}
                          </span>
                        )}
                      </td>
                      
                      {/* Varighet (dager) column */}
                      <td 
                        className={clsx(
                          "px-4 py-4 text-center",
                          !(editingId === project.id && editField === 'duration') && "cursor-pointer hover:bg-gray-100"
                        )}
                        onClick={() => !(editingId === project.id && editField === 'duration') && handleEdit(project.id, 'duration', project.durationDays || 0)}
                      >
                        {(editingId === project.id && editField === 'duration') ? (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              ref={inputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, project.id)}
                              onFocus={(e) => e.target.select()}
                              min={0}
                              className="w-20 px-2 py-1 border border-blue-500 rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                          <span className="text-sm text-gray-900">
                            {project.durationDays ? `${project.durationDays} dager` : '-'}
                          </span>
                        )}
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
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Active Projects Table - Assigned to project leaders */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Aktive prosjekter</h2>
          </div>
          
          {groupedProjects.length === 0 && unassignedProjects.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <DollarSign size={48} className="mx-auto mb-4 opacity-50" />
              <p>Ingen aktive prosjekter.</p>
              <p className="text-sm">Klikk &quot;Nytt prosjekt&quot; for å opprette et prosjekt.</p>
            </div>
          ) : groupedProjects.length > 0 ? (
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
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Oppstartsdato</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Varighet (dager)</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Fremdrift</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedProjects.map((group, groupIndex) => (
                    <React.Fragment key={group.leader.id}>
                      {/* Group header for project leader */}
                      <tr className={clsx(groupIndex > 0 && 'border-t-4 border-gray-100')}>
                        <td 
                          colSpan={10} 
                          className="px-4 py-3 bg-blue-50"
                        >
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-blue-600" />
                            <span className="font-semibold text-blue-800">{group.leader.name}</span>
                            <span className="text-sm text-blue-600">({group.projects.length} prosjekter)</span>
                          </div>
                        </td>
                      </tr>
                      {/* Project rows */}
                      {group.projects.map(project => (
                        <tr key={project.id} className="hover:bg-gray-50 border-t border-gray-100">
                          <td className="px-4 py-4">
                            <button
                              onClick={(e) => handleOpenLeaderDropdown(project.id, e.currentTarget)}
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
                                <button
                                  onClick={() => setEditingProject(project)}
                                  className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                                >
                                  {project.name}
                                </button>
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
                          
                          {/* A konto % column - only editable for 'tilbud' type */}
                          <td 
                            className={clsx(
                              "px-4 py-4 text-right",
                              project.billingType === 'tilbud' && !(editingId === project.id && editField === 'akonto') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => project.billingType === 'tilbud' && !(editingId === project.id && editField === 'akonto') && handleEdit(project.id, 'akonto', project.aKontoPercent)}
                          >
                            {project.billingType === 'timer_materiell' ? (
                              <span className="text-gray-400">-</span>
                            ) : (editingId === project.id && editField === 'akonto') ? (
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
                          
                          {/* Fakturert column - editable for 'timer_materiell' type */}
                          <td 
                            className={clsx(
                              "px-4 py-4 text-right font-medium text-green-600",
                              project.billingType === 'timer_materiell' && !(editingId === project.id && editField === 'fakturert') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => project.billingType === 'timer_materiell' && !(editingId === project.id && editField === 'fakturert') && handleEdit(project.id, 'fakturert', project.fakturert)}
                          >
                            {(editingId === project.id && editField === 'fakturert') ? (
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
                              formatCurrency(getProjectFinance(project.id).fakturert)
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-orange-600">
                            {formatCurrency(getProjectFinance(project.id).ordrereserve)}
                          </td>
                          
                          {/* Oppstartsdato column */}
                          <td 
                            className={clsx(
                              "px-4 py-4 text-center",
                              !(editingId === project.id && editField === 'startDate') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => !(editingId === project.id && editField === 'startDate') && handleEdit(project.id, 'startDate', project.plannedStartDate || '')}
                          >
                            {(editingId === project.id && editField === 'startDate') ? (
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  ref={inputRef}
                                  type="date"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, project.id)}
                                  className="px-2 py-1 border border-blue-500 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                              <span className="text-sm text-gray-900">
                                {project.plannedStartDate ? formatDateNorwegian(project.plannedStartDate) : '-'}
                              </span>
                            )}
                          </td>
                          
                          {/* Varighet (dager) column */}
                          <td 
                            className={clsx(
                              "px-4 py-4 text-center",
                              !(editingId === project.id && editField === 'duration') && "cursor-pointer hover:bg-blue-50"
                            )}
                            onClick={() => !(editingId === project.id && editField === 'duration') && handleEdit(project.id, 'duration', project.durationDays || 0)}
                          >
                            {(editingId === project.id && editField === 'duration') ? (
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  ref={inputRef}
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, project.id)}
                                  onFocus={(e) => e.target.select()}
                                  min={0}
                                  className="w-20 px-2 py-1 border border-blue-500 rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                              <span className="text-sm text-gray-900">
                                {project.durationDays ? `${project.durationDays} dager` : '-'}
                              </span>
                            )}
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
          ) : null}
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
                            <button
                              onClick={() => setEditingProject(project)}
                              className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left"
                            >
                              {project.name}
                            </button>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Oppstartsdato
                </label>
                <input
                  type="date"
                  value={newProject.plannedStartDate}
                  onChange={(e) => setNewProject({ ...newProject, plannedStartDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Varighet (dager)
                </label>
                <input
                  type="number"
                  value={newProject.durationDays}
                  onChange={(e) => setNewProject({ ...newProject, durationDays: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Antall arbeidsdager"
                  min={0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Kun arbeidsdager (helger ekskludert)
                </p>
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

      {/* Leader selection dropdown - rendered via portal */}
      {assigningLeader && (
        <LeaderDropdown
          buttonRef={assigningLeader.buttonRef}
          leaders={projectLeaders}
          onSelect={(leaderId) => handleAssignLeader(assigningLeader.projectId, leaderId)}
          onClose={() => setAssigningLeader(null)}
        />
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  );
}
