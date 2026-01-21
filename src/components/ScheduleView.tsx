'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { generateWeeks, formatDateShort, parseISO, isSameDay, addDays, startOfDay, format } from '@/utils/dates';
import { Worker, Project, ProjectAssignment } from '@/types';
import ProjectModal from './ProjectModal';
import AssignmentBar from './AssignmentBar';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const CELL_WIDTH = 40;
const ROW_HEIGHT = 60;
const WEEKS_TO_SHOW = 12;

export default function ScheduleView() {
  const { workers, projects, assignments, addAssignment } = useStore();
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ workerId: string; date: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{ workerId: string; startDate: string; endDate: string } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => generateWeeks(startDate, WEEKS_TO_SHOW), [startDate]);
  const allDays = useMemo(() => weeks.flatMap(w => w.days), [weeks]);

  // Group workers by project leader
  const projectLeaders = workers.filter(w => w.role === 'prosjektleder');
  const groupedWorkers = useMemo(() => {
    const groups: { leader: Worker | null; members: Worker[] }[] = [];
    
    projectLeaders.forEach(leader => {
      const members = workers.filter(w => w.role === 'tømrer' && w.projectLeaderId === leader.id);
      groups.push({ leader, members: [leader, ...members] });
    });
    
    // Add unassigned carpenters
    const unassignedCarpenters = workers.filter(
      w => w.role === 'tømrer' && (!w.projectLeaderId || !workers.find(pl => pl.id === w.projectLeaderId))
    );
    if (unassignedCarpenters.length > 0) {
      groups.push({ leader: null, members: unassignedCarpenters });
    }
    
    return groups;
  }, [workers, projectLeaders]);

  const flatWorkers = useMemo(() => groupedWorkers.flatMap(g => g.members), [groupedWorkers]);

  // Navigate weeks
  const navigateWeeks = (direction: number) => {
    setStartDate(prev => addDays(prev, direction * 7));
  };

  const goToToday = () => {
    setStartDate(startOfDay(new Date()));
  };

  // Handle drag selection for creating assignments
  const handleMouseDown = useCallback((workerId: string, dateString: string) => {
    setIsDragging(true);
    setDragStart({ workerId, date: dateString });
    setDragEnd(dateString);
  }, []);

  const handleMouseMove = useCallback((dateString: string) => {
    if (isDragging && dragStart) {
      setDragEnd(dateString);
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      const start = parseISO(dragStart.date);
      const end = parseISO(dragEnd);
      const sortedStart = start <= end ? dragStart.date : dragEnd;
      const sortedEnd = start <= end ? dragEnd : dragStart.date;
      
      setModalData({
        workerId: dragStart.workerId,
        startDate: sortedStart,
        endDate: sortedEnd,
      });
      setShowModal(true);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((workerId: string, dateString: string) => {
    setIsDragging(true);
    setDragStart({ workerId, date: dateString });
    setDragEnd(dateString);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent, workerId: string) => {
    if (!isDragging || !dragStart || dragStart.workerId !== workerId) return;
    
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const dateString = element?.getAttribute('data-date');
    if (dateString) {
      setDragEnd(dateString);
    }
  }, [isDragging, dragStart]);

  // Global mouse up handler
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    const handleGlobalTouchEnd = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging, handleMouseUp]);

  // Check if a cell is in the drag selection
  const isInSelection = (workerId: string, dateString: string) => {
    if (!isDragging || !dragStart || !dragEnd || dragStart.workerId !== workerId) return false;
    
    const date = parseISO(dateString);
    const start = parseISO(dragStart.date);
    const end = parseISO(dragEnd);
    const minDate = start <= end ? start : end;
    const maxDate = start <= end ? end : start;
    
    return date >= minDate && date <= maxDate;
  };

  // Get assignments for a specific worker
  const getWorkerAssignments = (workerId: string) => {
    return assignments.filter(a => {
      const project = projects.find(p => p.id === a.projectId);
      return a.workerId === workerId && project?.status === 'active';
    });
  };

  // Calculate bar position and width
  const getBarStyle = (assignment: ProjectAssignment) => {
    const startIdx = allDays.findIndex(d => d.dateString === assignment.startDate);
    const endIdx = allDays.findIndex(d => d.dateString === assignment.endDate);
    
    if (startIdx === -1 && endIdx === -1) return null;
    
    const effectiveStartIdx = Math.max(0, startIdx);
    const effectiveEndIdx = endIdx === -1 ? allDays.length - 1 : Math.min(allDays.length - 1, endIdx);
    
    if (effectiveStartIdx > allDays.length - 1 || effectiveEndIdx < 0) return null;
    
    const left = effectiveStartIdx * CELL_WIDTH;
    const width = (effectiveEndIdx - effectiveStartIdx + 1) * CELL_WIDTH;
    
    return { left, width };
  };

  const handleModalClose = () => {
    setShowModal(false);
    setModalData(null);
  };

  const handleCreateAssignment = (projectId: string) => {
    if (modalData) {
      addAssignment({
        projectId,
        workerId: modalData.workerId,
        startDate: modalData.startDate,
        endDate: modalData.endDate,
      });
    }
    handleModalClose();
  };

  if (workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <Users size={64} className="mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2">Ingen ansatte</h2>
        <p className="text-center">
          Gå til "Ansatte"-fanen for å legge til ansatte før du kan planlegge prosjekter.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Navigation Controls */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeeks(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            I dag
          </button>
          <button
            onClick={() => navigateWeeks(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {format(startDate, 'MMMM yyyy', { locale: undefined })} - {format(addDays(startDate, WEEKS_TO_SHOW * 7 - 1), 'MMMM yyyy', { locale: undefined })}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="min-w-max">
          {/* Header with week numbers and days */}
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
            {/* Week numbers row */}
            <div className="flex">
              <div className="w-48 flex-shrink-0 px-4 py-2 bg-gray-50 border-r border-gray-200 font-medium text-sm text-gray-600">
                Ansatt
              </div>
              <div className="flex">
                {weeks.map((week, weekIdx) => (
                  <div
                    key={`week-${week.weekNumber}-${week.year}`}
                    className={clsx(
                      'text-center py-2 bg-gray-50 font-medium text-sm text-gray-600',
                      weekIdx < weeks.length - 1 && 'border-r-2 border-gray-300'
                    )}
                    style={{ width: week.days.length * CELL_WIDTH }}
                  >
                    Uke {week.weekNumber}
                  </div>
                ))}
              </div>
            </div>

            {/* Day headers row */}
            <div className="flex">
              <div className="w-48 flex-shrink-0 px-4 py-1 bg-white border-r border-gray-200" />
              <div className="flex">
                {weeks.map((week, weekIdx) => (
                  <div key={`days-${week.weekNumber}-${week.year}`} className="flex">
                    {week.days.map((day, dayIdx) => {
                      const isToday = isSameDay(day.date, new Date());
                      const isLastDayOfWeek = dayIdx === week.days.length - 1;
                      
                      return (
                        <div
                          key={day.dateString}
                          className={clsx(
                            'text-center py-1 text-xs',
                            isToday && 'bg-blue-100',
                            day.isHoliday && 'bg-red-50 text-red-600',
                            isLastDayOfWeek && weekIdx < weeks.length - 1 && 'border-r-2 border-gray-300'
                          )}
                          style={{ width: CELL_WIDTH }}
                          title={day.holidayName || undefined}
                        >
                          <div className="font-medium">{['Ma', 'Ti', 'On', 'To', 'Fr'][day.dayOfWeek]}</div>
                          <div className={clsx(
                            'text-gray-500',
                            isToday && 'text-blue-600 font-bold',
                            day.isHoliday && 'text-red-600'
                          )}>
                            {formatDateShort(day.date)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Worker rows */}
          <div className="no-select">
            {groupedWorkers.map((group, groupIdx) => (
              <div key={group.leader?.id || 'unassigned'}>
                {group.members.map((worker, memberIdx) => {
                  const workerAssignments = getWorkerAssignments(worker.id);
                  const isLeader = worker.role === 'prosjektleder';
                  const isFirstInGroup = memberIdx === 0;

                  return (
                    <div
                      key={worker.id}
                      className={clsx(
                        'flex',
                        isFirstInGroup && groupIdx > 0 && 'border-t-2 border-gray-200',
                        isLeader ? 'bg-blue-50/30' : 'bg-white'
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {/* Worker name column */}
                      <div className={clsx(
                        'w-48 flex-shrink-0 px-4 flex items-center gap-2 border-r border-gray-200',
                        !isLeader && 'pl-8'
                      )}>
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0',
                          isLeader ? 'bg-blue-600' : 'bg-gray-500'
                        )}>
                          {worker.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="font-medium text-sm text-gray-900 truncate">{worker.name}</div>
                          <div className="text-xs text-gray-500">
                            {isLeader ? 'Prosjektleder' : 'Tømrer'}
                          </div>
                        </div>
                      </div>

                      {/* Calendar cells */}
                      <div className="flex relative">
                        {weeks.map((week, weekIdx) => (
                          <div key={`${worker.id}-week-${week.weekNumber}`} className="flex">
                            {week.days.map((day, dayIdx) => {
                              const isSelected = isInSelection(worker.id, day.dateString);
                              const isToday = isSameDay(day.date, new Date());
                              const isLastDayOfWeek = dayIdx === week.days.length - 1;

                              return (
                                <div
                                  key={day.dateString}
                                  data-date={day.dateString}
                                  className={clsx(
                                    'calendar-cell border-b border-r border-gray-100 cursor-crosshair',
                                    isSelected && 'bg-blue-200',
                                    isToday && !isSelected && 'bg-blue-50',
                                    day.isHoliday && !isSelected && 'bg-red-50/50',
                                    isLastDayOfWeek && weekIdx < weeks.length - 1 && 'border-r-2 border-r-gray-300'
                                  )}
                                  style={{ width: CELL_WIDTH, height: ROW_HEIGHT }}
                                  onMouseDown={() => handleMouseDown(worker.id, day.dateString)}
                                  onMouseMove={() => handleMouseMove(day.dateString)}
                                  onTouchStart={() => handleTouchStart(worker.id, day.dateString)}
                                  onTouchMove={(e) => handleTouchMove(e, worker.id)}
                                />
                              );
                            })}
                          </div>
                        ))}

                        {/* Assignment bars */}
                        {workerAssignments.map(assignment => {
                          const project = projects.find(p => p.id === assignment.projectId);
                          const style = getBarStyle(assignment);
                          
                          if (!project || !style) return null;

                          return (
                            <AssignmentBar
                              key={assignment.id}
                              assignment={assignment}
                              project={project}
                              style={style}
                              allDays={allDays}
                              cellWidth={CELL_WIDTH}
                              rowHeight={ROW_HEIGHT}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project Modal */}
      {showModal && modalData && (
        <ProjectModal
          workerId={modalData.workerId}
          startDate={modalData.startDate}
          endDate={modalData.endDate}
          onClose={handleModalClose}
          onSelect={handleCreateAssignment}
        />
      )}
    </div>
  );
}
