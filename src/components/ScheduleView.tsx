'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { generateWeeks, formatDateShort, parseISO, isSameDay, addDays, startOfDay, format, subtractDateRanges } from '@/utils/dates';
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

// Helper to check if assignment/segment is visible in current view
function isAssignmentVisible(
  assignment: { startDate: string; endDate: string },
  viewStart: string,
  viewEnd: string
): boolean {
  return dateRangesOverlap(assignment.startDate, assignment.endDate, viewStart, viewEnd);
}

/** Segment for display: assignment bar split by system project (holiday/sick) ranges. */
export interface AssignmentSegment {
  assignment: ProjectAssignment;
  project: Project;
  startDate: string;
  endDate: string;
  otherSegmentsFromSameAssignment: { startDate: string; endDate: string }[];
}

/** Build segments per worker: system assignments as-is; regular assignments split by system ranges. */
function getWorkerSegments(
  workerId: string,
  assignments: ProjectAssignment[],
  projects: Project[]
): AssignmentSegment[] {
  const workerAssignments = assignments.filter((a) => a.workerId === workerId);
  const systemRanges = workerAssignments
    .map((a) => {
      const proj = projects.find((p) => p.id === a.projectId);
      return proj?.isSystem ? { start: a.startDate, end: a.endDate } : null;
    })
    .filter((r): r is { start: string; end: string } => r != null);

  const segments: AssignmentSegment[] = [];
  for (const a of workerAssignments) {
    const project = projects.find((p) => p.id === a.projectId);
    if (!project || project.status !== 'active') continue;

    if (project.isSystem) {
      segments.push({
        assignment: a,
        project,
        startDate: a.startDate,
        endDate: a.endDate,
        otherSegmentsFromSameAssignment: [],
      });
    } else {
      const parts = subtractDateRanges(a.startDate, a.endDate, systemRanges);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const otherSegmentsFromSameAssignment = parts
          .filter((_, j) => j !== i)
          .map((p) => ({ startDate: p.start, endDate: p.end }));
        segments.push({
          assignment: a,
          project,
          startDate: part.start,
          endDate: part.end,
          otherSegmentsFromSameAssignment,
        });
      }
    }
  }
  return segments;
}

/** Lane info for one segment: lane index, total lanes, system bar flag, and system bar lane span. */
export interface SegmentLaneInfo {
  lane: number;
  totalLanes: number;
  isSystemBar: boolean;
  /** When isSystemBar: first lane (0-based) of the project bars being split / next to it. */
  systemBarLaneStart?: number;
  /** When isSystemBar: number of lanes to span (same as project bars next to it). */
  systemBarLaneCount?: number;
}

/**
 * Calculate lane assignments so that segments from the same assignment (split by holiday/sick)
 * stay on the same line. System bars get height = number of overlapping project bars (not full row).
 */
function calculateSegmentLanes(
  segments: AssignmentSegment[],
  viewStart: string,
  viewEnd: string
): Map<string, SegmentLaneInfo> {
  const result = new Map<string, SegmentLaneInfo>();
  const nonSystemSegments = segments.filter((s) => !s.project.isSystem);
  const systemSegments = segments.filter((s) => s.project.isSystem);

  // Assign lanes only for non-system segments; group by assignment.id so split parts share one lane
  const groupRanges = new Map<string, { startDate: string; endDate: string }>();
  for (const s of nonSystemSegments) {
    if (!isAssignmentVisible({ startDate: s.startDate, endDate: s.endDate }, viewStart, viewEnd))
      continue;
    const existing = groupRanges.get(s.assignment.id);
    const start = existing
      ? (existing.startDate <= s.startDate ? existing.startDate : s.startDate)
      : s.startDate;
    const end = existing
      ? (existing.endDate >= s.endDate ? existing.endDate : s.endDate)
      : s.endDate;
    groupRanges.set(s.assignment.id, { startDate: start, endDate: end });
  }

  const groups = Array.from(groupRanges.entries()).map(([assignmentId, range]) => ({
    assignmentId,
    ...range,
  }));
  groups.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const laneEndDates: string[] = [];
  const groupLane = new Map<string, number>();
  for (const g of groups) {
    let assignedLane = -1;
    for (let i = 0; i < laneEndDates.length; i++) {
      if (laneEndDates[i] < g.startDate) {
        assignedLane = i;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = laneEndDates.length;
      laneEndDates.push(g.endDate);
    } else {
      laneEndDates[assignedLane] = g.endDate;
    }
    groupLane.set(g.assignmentId, assignedLane);
  }
  const totalLanes = Math.max(1, laneEndDates.length);

  // System bar: draw on the same line(s) as the project bars that overlap or are adjacent
  const systemBarLaneSpan = (sysStart: string, sysEnd: string): { start: number; count: number } => {
    const dayBeforeStart = format(addDays(parseISO(sysStart), -1), 'yyyy-MM-dd');
    const dayAfterEnd = format(addDays(parseISO(sysEnd), 1), 'yyyy-MM-dd');
    const assignmentIds = new Set<string>();
    for (const s of nonSystemSegments) {
      const overlaps = dateRangesOverlap(sysStart, sysEnd, s.startDate, s.endDate);
      const adjacentBefore = s.endDate === dayBeforeStart;
      const adjacentAfter = s.startDate === dayAfterEnd;
      if (overlaps || adjacentBefore || adjacentAfter) {
        assignmentIds.add(s.assignment.id);
      }
    }
    if (assignmentIds.size === 0) return { start: 0, count: 1 };
    const lanes = Array.from(assignmentIds).map((id) => groupLane.get(id) ?? 0);
    const minLane = Math.min(...lanes);
    const maxLane = Math.max(...lanes);
    return { start: minLane, count: maxLane - minLane + 1 };
  };

  const segmentKey = (s: AssignmentSegment, i: number) =>
    `${s.assignment.id}-${s.startDate}-${s.endDate}-${i}`;

  segments.forEach((s, i) => {
    const key = segmentKey(s, i);
    if (s.project.isSystem) {
      const span = systemBarLaneSpan(s.startDate, s.endDate);
      result.set(key, {
        lane: 0,
        totalLanes,
        isSystemBar: true,
        systemBarLaneStart: span.start,
        systemBarLaneCount: span.count,
      });
    } else {
      const lane = groupLane.get(s.assignment.id) ?? 0;
      result.set(key, { lane, totalLanes, isSystemBar: false });
    }
  });

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

  // Get display segments for a worker (assignments split by system project ranges)
  const getWorkerSegmentsForWorker = useCallback(
    (workerId: string) => getWorkerSegments(workerId, assignments, projects),
    [assignments, projects]
  );

  // Calculate lane info per worker (split segments share lane by assignment.id; system bars full height)
  const workerLaneInfo = useMemo(() => {
    const result = new Map<string, Map<string, SegmentLaneInfo>>();
    for (const worker of flatWorkers) {
      const segs = getWorkerSegmentsForWorker(worker.id);
      const laneInfo = calculateSegmentLanes(segs, viewStartDate, viewEndDate);
      result.set(worker.id, laneInfo);
    }
    return result;
  }, [flatWorkers, getWorkerSegmentsForWorker, viewStartDate, viewEndDate]);

  // Get row height for a worker (based on non-system lanes; system bar uses full height)
  const getWorkerRowHeight = useCallback((workerId: string) => {
    const laneInfo = workerLaneInfo.get(workerId);
    if (!laneInfo || laneInfo.size === 0) return BASE_ROW_HEIGHT;
    let maxLanes = 1;
    laneInfo.forEach((info) => {
      if (!info.isSystemBar && info.totalLanes > maxLanes) maxLanes = info.totalLanes;
    });
    if (maxLanes <= 1) return BASE_ROW_HEIGHT;
    return BASE_ROW_HEIGHT + (maxLanes - 1) * (BASE_ROW_HEIGHT * 0.4);
  }, [workerLaneInfo]);

  // Calculate bar position and width from segment dates
  const getBarStyleFromSegment = (segment: AssignmentSegment) => {
    const startIdx = allDays.findIndex(d => d.dateString === segment.startDate);
    const endIdx = allDays.findIndex(d => d.dateString === segment.endDate);
    
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
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-200 border-b border-gray-200">
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
          <div className="sticky top-0 z-20 bg-gray-200 border-b border-gray-200">
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
              <div className="w-48 flex-shrink-0 px-4 py-1 bg-gray-200 border-r border-gray-200" />
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
                            isToday && 'bg-gray-300',
                            day.isHoliday && 'bg-red-200 text-red-800',
                            isLastDayOfWeek && weekIdx < weeks.length - 1 && 'border-r-2 border-gray-300'
                          )}
                          style={{ width: CELL_WIDTH }}
                          title={day.holidayName || undefined}
                        >
                          <div className="font-medium">{['Ma', 'Ti', 'On', 'To', 'Fr'][day.dayOfWeek]}</div>
                          <div className={clsx(
                            'text-gray-500',
                            isToday && 'text-blue-600 font-bold',
                            day.isHoliday && 'text-red-800 font-semibold'
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
                  const workerSegments = getWorkerSegmentsForWorker(worker.id);
                  const isLeader = worker.role === 'prosjektleder';
                  const rowHeight = getWorkerRowHeight(worker.id);
                  const laneInfo = workerLaneInfo.get(worker.id);

                  return (
                    <div
                      key={worker.id}
                      className={clsx(
                        'flex',
                        isLeader ? 'bg-blue-50/30' : 'bg-gray-200'
                      )}
                      style={{ height: rowHeight }}
                    >
                      {/* Worker name column */}
                      <div className="w-48 flex-shrink-0 px-4 flex items-center gap-2 border-r border-gray-200">
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0',
                          isLeader ? 'bg-blue-600' : 'bg-gray-500'
                        )}>
                          {worker.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-medium text-sm text-gray-900 truncate">{worker.name}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {isLeader ? 'Prosjektleder' : 'Tømrer'}
                          </span>
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
                                    'calendar-cell cursor-crosshair',
                                    // Today cells: seamless column
                                    isToday && !isSelected && 'bg-gray-300 border-r border-gray-300',
                                    // Regular cells: normal borders
                                    !isToday && !isSelected && !day.isHoliday && 'border-b border-r border-gray-100',
                                    // Selected cells
                                    isSelected && 'bg-blue-200 border-b border-r border-gray-100',
                                    // Holiday cells
                                    day.isHoliday && !isSelected && 'bg-red-100 border-b border-r border-gray-100',
                                    // Week separator
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

                        {/* Assignment bars (one per segment; regular projects split by system ranges) */}
                        {workerSegments.map((segment, segIdx) => {
                          const style = getBarStyleFromSegment(segment);
                          const segmentKey = `${segment.assignment.id}-${segment.startDate}-${segment.endDate}-${segIdx}`;
                          const segmentLaneInfo = laneInfo?.get(segmentKey);
                          
                          if (!style) return null;

                          return (
                            <AssignmentBar
                              key={segmentKey}
                              assignment={segment.assignment}
                              project={segment.project}
                              segmentStartDate={segment.startDate}
                              segmentEndDate={segment.endDate}
                              otherSegmentsFromSameAssignment={segment.otherSegmentsFromSameAssignment}
                              style={style}
                              allDays={allDays}
                              cellWidth={CELL_WIDTH}
                              rowHeight={rowHeight}
                              lane={segmentLaneInfo?.lane ?? 0}
                              totalLanes={segmentLaneInfo?.totalLanes ?? 1}
                              isSystemBar={segmentLaneInfo?.isSystemBar ?? false}
                              systemBarLaneStart={segmentLaneInfo?.systemBarLaneStart ?? 0}
                              systemBarLaneCount={segmentLaneInfo?.systemBarLaneCount ?? 1}
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
