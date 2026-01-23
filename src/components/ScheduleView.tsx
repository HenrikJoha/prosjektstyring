'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { generateWeeks, formatDateShort, parseISO, isSameDay, addDays, startOfDay, format } from '@/utils/dates';
import { nb } from 'date-fns/locale';
import { Worker, Project, ProjectAssignment } from '@/types';
import ProjectModal from './ProjectModal';
import AssignmentBar from './AssignmentBar';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const CELL_WIDTH = 40;
const BASE_ROW_HEIGHT = 60;
const WEEKS_TO_SHOW = 12;

// Helper to check if two date ranges overlap
function dateRangesOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  return start1 <= end2 && end1 >= start2;
}

// Helper to check if assignment is visible in current view
function isAssignmentVisible(
  assignment: { startDate: string; endDate: string },
  viewStart: string,
  viewEnd: string
): boolean {
  return dateRangesOverlap(assignment.startDate, assignment.endDate, viewStart, viewEnd);
}

// Calculate lane assignments for overlapping bars
function calculateLanes(
  assignments: { id: string; startDate: string; endDate: string }[],
  viewStart: string,
  viewEnd: string
): Map<string, { lane: number; totalLanes: number }> {
  // Filter to only visible assignments
  const visibleAssignments = assignments.filter(a => 
    isAssignmentVisible(a, viewStart, viewEnd)
  );
  
  if (visibleAssignments.length === 0) {
    return new Map();
  }
  
  // Sort by start date
  const sorted = [...visibleAssignments].sort((a, b) => 
    a.startDate.localeCompare(b.startDate)
  );
  
  // Assign lanes using a greedy algorithm
  const laneEndDates: string[] = []; // Track when each lane becomes free
  const laneAssignments = new Map<string, number>();
  
  for (const assignment of sorted) {
    // Find the first available lane
    let assignedLane = -1;
    for (let i = 0; i < laneEndDates.length; i++) {
      if (laneEndDates[i] < assignment.startDate) {
        assignedLane = i;
        break;
      }
    }
    
    if (assignedLane === -1) {
      // Need a new lane
      assignedLane = laneEndDates.length;
      laneEndDates.push(assignment.endDate);
    } else {
      laneEndDates[assignedLane] = assignment.endDate;
    }
    
    laneAssignments.set(assignment.id, assignedLane);
  }
  
  const totalLanes = laneEndDates.length;
  
  // Create result map with lane info
  const result = new Map<string, { lane: number; totalLanes: number }>();
  for (const assignment of visibleAssignments) {
    result.set(assignment.id, {
      lane: laneAssignments.get(assignment.id) || 0,
      totalLanes
    });
  }
  
  return result;
}

export default function ScheduleView() {
  const { workers, projects, assignments, addAssignment } = useStore();
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ workerId: string; date: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{ workerId: string; startDate: string; endDate: string } | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Long press handling for touch
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; workerId: string; date: string } | null>(null);
  const LONG_PRESS_DURATION = 300; // ms

  const weeks = useMemo(() => generateWeeks(startDate, WEEKS_TO_SHOW), [startDate]);
  const allDays = useMemo(() => weeks.flatMap(w => w.days), [weeks]);
  
  // Calculate month spans for header and track month boundaries
  const { monthSpans, weekMonthBoundary } = useMemo(() => {
    const spans: { month: string; year: number; width: number; key: string }[] = [];
    const boundaries = new Set<number>(); // Week indices that are last week of a month
    let currentMonth = '';
    let currentYear = 0;
    let currentWidth = 0;
    
    weeks.forEach((week, weekIdx) => {
      // Use the first day of the week to determine the month
      const firstDay = week.days[0]?.date;
      if (!firstDay) return;
      
      const monthName = format(firstDay, 'MMMM', { locale: nb });
      const year = firstDay.getFullYear();
      const weekWidth = week.days.length * CELL_WIDTH;
      
      if (monthName === currentMonth && year === currentYear) {
        currentWidth += weekWidth;
      } else {
        if (currentMonth) {
          spans.push({ 
            month: currentMonth, 
            year: currentYear, 
            width: currentWidth,
            key: `${currentMonth}-${currentYear}-${spans.length}`
          });
          // Mark previous week as month boundary
          if (weekIdx > 0) {
            boundaries.add(weekIdx - 1);
          }
        }
        currentMonth = monthName;
        currentYear = year;
        currentWidth = weekWidth;
      }
    });
    
    // Don't forget the last month
    if (currentMonth) {
      spans.push({ 
        month: currentMonth, 
        year: currentYear, 
        width: currentWidth,
        key: `${currentMonth}-${currentYear}-${spans.length}`
      });
    }
    
    return { monthSpans: spans, weekMonthBoundary: boundaries };
  }, [weeks]);
  
  // Get the visible date range
  const viewStartDate = allDays[0]?.dateString || '';
  const viewEndDate = allDays[allDays.length - 1]?.dateString || '';

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

  // Touch handlers for mobile with long press
  const handleTouchStart = useCallback((workerId: string, dateString: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY, workerId, date: dateString };
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressActive(true);
      setIsDragging(true);
      setDragStart({ workerId, date: dateString });
      setDragEnd(dateString);
      // Vibrate to indicate activation
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_DURATION);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // If long press not yet active, check if we should cancel it (user is scrolling)
    if (!isLongPressActive && touchStartPosRef.current && longPressTimerRef.current) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        return;
      }
    }
    
    // If dragging is active, update selection
    if (isDragging && dragStart && isLongPressActive) {
      e.preventDefault(); // Prevent scrolling while dragging
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const dateString = element?.getAttribute('data-date');
      if (dateString) {
        setDragEnd(dateString);
      }
    }
  }, [isDragging, dragStart, isLongPressActive]);

  const handleTouchEnd = useCallback(() => {
    // Clean up long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
    
    // If we were dragging, complete the selection
    if (isDragging && isLongPressActive) {
      handleMouseUp();
    }
    setIsLongPressActive(false);
  }, [isDragging, isLongPressActive, handleMouseUp]);

  // Global mouse up handler
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
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

  // Get assignments for a specific worker (active projects only)
  const getWorkerAssignments = useCallback((workerId: string) => {
    return assignments.filter(a => {
      const project = projects.find(p => p.id === a.projectId);
      return a.workerId === workerId && project?.status === 'active';
    });
  }, [assignments, projects]);

  // Calculate lane info for all workers
  const workerLaneInfo = useMemo(() => {
    const result = new Map<string, Map<string, { lane: number; totalLanes: number }>>();
    
    for (const worker of flatWorkers) {
      const workerAssignments = getWorkerAssignments(worker.id);
      const laneInfo = calculateLanes(workerAssignments, viewStartDate, viewEndDate);
      result.set(worker.id, laneInfo);
    }
    
    return result;
  }, [flatWorkers, getWorkerAssignments, viewStartDate, viewEndDate]);

  // Get row height for a worker based on overlapping assignments
  const getWorkerRowHeight = useCallback((workerId: string) => {
    const laneInfo = workerLaneInfo.get(workerId);
    if (!laneInfo || laneInfo.size === 0) return BASE_ROW_HEIGHT;
    
    // Get max lanes from any assignment
    let maxLanes = 1;
    laneInfo.forEach(info => {
      if (info.totalLanes > maxLanes) maxLanes = info.totalLanes;
    });
    
    if (maxLanes <= 1) return BASE_ROW_HEIGHT;
    
    // Increase height by 40% for each additional lane
    return BASE_ROW_HEIGHT + (maxLanes - 1) * (BASE_ROW_HEIGHT * 0.4);
  }, [workerLaneInfo]);

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
          Gå til &quot;Ansatte&quot;-fanen for å legge til ansatte før du kan planlegge prosjekter.
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
      <div 
        className={clsx(
          "flex-1 overflow-auto",
          isLongPressActive && "long-press-active"
        )} 
        ref={scrollContainerRef}
      >
        <div className="min-w-max pb-24 md:pb-4">
          {/* Header with months, week numbers and days */}
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
            {/* Month row */}
            <div className="flex">
              <div className="w-48 flex-shrink-0 px-4 py-1 bg-blue-600 border-r-4 border-white" />
              <div className="flex">
                {monthSpans.map((span, idx) => (
                  <div
                    key={span.key}
                    className={clsx(
                      'text-center py-1 bg-blue-600 text-white font-semibold text-sm capitalize',
                      idx < monthSpans.length - 1 && 'border-r-4 border-white'
                    )}
                    style={{ width: span.width }}
                  >
                    {span.month} {span.year}
                  </div>
                ))}
              </div>
            </div>
            
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
                  const rowHeight = getWorkerRowHeight(worker.id);
                  const laneInfo = workerLaneInfo.get(worker.id);

                  return (
                    <div
                      key={worker.id}
                      className={clsx(
                        'flex',
                        isFirstInGroup && groupIdx > 0 && 'border-t-2 border-gray-200',
                        isLeader ? 'bg-blue-50/30' : 'bg-white'
                      )}
                      style={{ height: rowHeight }}
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
                                  style={{ width: CELL_WIDTH, height: rowHeight }}
                                  onMouseDown={() => handleMouseDown(worker.id, day.dateString)}
                                  onMouseMove={() => handleMouseMove(day.dateString)}
                                  onTouchStart={(e) => handleTouchStart(worker.id, day.dateString, e)}
                                  onTouchMove={handleTouchMove}
                                  onTouchEnd={handleTouchEnd}
                                />
                              );
                            })}
                          </div>
                        ))}

                        {/* Assignment bars */}
                        {workerAssignments.map(assignment => {
                          const project = projects.find(p => p.id === assignment.projectId);
                          const style = getBarStyle(assignment);
                          const assignmentLaneInfo = laneInfo?.get(assignment.id);
                          
                          if (!project || !style) return null;

                          return (
                            <AssignmentBar
                              key={assignment.id}
                              assignment={assignment}
                              project={project}
                              style={style}
                              allDays={allDays}
                              cellWidth={CELL_WIDTH}
                              rowHeight={rowHeight}
                              lane={assignmentLaneInfo?.lane || 0}
                              totalLanes={assignmentLaneInfo?.totalLanes || 1}
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
