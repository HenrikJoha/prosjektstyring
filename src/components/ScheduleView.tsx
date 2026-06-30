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
/** Space between prosjektleder blocks. */
const LEADER_BLOCK_GAP_CLASS = 'mb-6';
/**
 * Today column — light tint of month header blue (bg-blue-600), same hue family.
 */
const TODAY_COLUMN_CLASSES = 'bg-blue-200 border-b border-gray-200 border-r border-blue-300';
/** Grid lines inside each prosjektleder block (must contrast with bg-gray-100 / bg-gray-50 rows). */
const GRID_CELL_BORDER_CLASSES = 'border-b border-r border-gray-200';
/** Vertical day separators in the sticky day header row (aligns with grid columns). */
const DAY_HEADER_DAY_BORDER_CLASSES = 'border-r border-gray-200';
/** Stronger line after the last weekday column in each week (Fri | Mon) — matches page canvas. */
const WEEK_COLUMN_SEPARATOR_CLASSES = 'border-r-[3px] border-r-gray-300';

/** Light gray background for every prosjektleder block (leader + team). */
function getLeaderBlockRowBackground(canEdit: boolean): string {
  return canEdit ? 'bg-gray-100' : 'bg-gray-50';
}

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

/** Build segments per worker: one bar per assignment; lane logic stacks around system bars. */
function getWorkerSegments(
  workerId: string,
  assignments: ProjectAssignment[],
  projects: Project[]
): AssignmentSegment[] {
  const workerAssignments = assignments.filter((a) => a.workerId === workerId);

  const segments: AssignmentSegment[] = [];
  for (const a of workerAssignments) {
    const project = projects.find((p) => p.id === a.projectId);
    if (!project || project.status !== 'active') continue;

    segments.push({
      assignment: a,
      project,
      startDate: a.startDate,
      endDate: a.endDate,
      otherSegmentsFromSameAssignment: [],
    });
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

export function getAssignmentSegmentKey(s: AssignmentSegment, index: number): string {
  return `${s.assignment.id}-${s.startDate}-${s.endDate}-${index}`;
}

function getEffectiveSegmentDates(
  s: AssignmentSegment,
  index: number,
  previews?: ReadonlyMap<string, { startDate: string; endDate: string }>
): { startDate: string; endDate: string } {
  const preview = previews?.get(getAssignmentSegmentKey(s, index));
  return preview ?? { startDate: s.startDate, endDate: s.endDate };
}

function overlapsAnySystemRange(
  startDate: string,
  endDate: string,
  systemRanges: { startDate: string; endDate: string }[]
): boolean {
  return systemRanges.some((sys) =>
    dateRangesOverlap(sys.startDate, sys.endDate, startDate, endDate)
  );
}

/**
 * Calculate lane assignments. System bars (sykemelding/ferie) use lane 0.
 * Project bars that overlap system dates in time are stacked below on lane 1+.
 */
function calculateSegmentLanes(
  segments: AssignmentSegment[],
  viewStart: string,
  viewEnd: string,
  previews?: ReadonlyMap<string, { startDate: string; endDate: string }>
): Map<string, SegmentLaneInfo> {
  const result = new Map<string, SegmentLaneInfo>();

  const systemRanges: { startDate: string; endDate: string }[] = [];
  segments.forEach((s, i) => {
    if (!s.project.isSystem) return;
    const { startDate, endDate } = getEffectiveSegmentDates(s, i, previews);
    if (!isAssignmentVisible({ startDate, endDate }, viewStart, viewEnd)) return;
    systemRanges.push({ startDate, endDate });
  });

  const groupRanges = new Map<string, { startDate: string; endDate: string }>();
  segments.forEach((s, i) => {
    if (s.project.isSystem) return;
    const { startDate, endDate } = getEffectiveSegmentDates(s, i, previews);
    if (!isAssignmentVisible({ startDate, endDate }, viewStart, viewEnd)) return;
    const existing = groupRanges.get(s.assignment.id);
    const start = existing
      ? (existing.startDate <= startDate ? existing.startDate : startDate)
      : startDate;
    const end = existing
      ? (existing.endDate >= endDate ? existing.endDate : endDate)
      : endDate;
    groupRanges.set(s.assignment.id, { startDate: start, endDate: end });
  });

  const groups = Array.from(groupRanges.entries()).map(([assignmentId, range]) => ({
    assignmentId,
    ...range,
  }));
  groups.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const laneEndDates: string[] = [];
  const groupLane = new Map<string, number>();
  for (const g of groups) {
    const overlapsSystem = overlapsAnySystemRange(g.startDate, g.endDate, systemRanges);
    const minLane = overlapsSystem ? 1 : 0;
    let assignedLane = -1;
    for (let i = minLane; i < laneEndDates.length; i++) {
      if (laneEndDates[i] < g.startDate) {
        assignedLane = i;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = Math.max(minLane, laneEndDates.length);
    }
    while (laneEndDates.length <= assignedLane) {
      laneEndDates.push('0000-01-01');
    }
    laneEndDates[assignedLane] = g.endDate;
    groupLane.set(g.assignmentId, assignedLane);
  }

  let totalLanes = Math.max(1, laneEndDates.length);
  if (
    systemRanges.length > 0 &&
    groups.some((g) => overlapsAnySystemRange(g.startDate, g.endDate, systemRanges))
  ) {
    totalLanes = Math.max(totalLanes, 2);
  }

  segments.forEach((s, i) => {
    const key = getAssignmentSegmentKey(s, i);
    if (s.project.isSystem) {
      result.set(key, {
        lane: 0,
        totalLanes,
        isSystemBar: true,
        systemBarLaneStart: 0,
        systemBarLaneCount: 1,
      });
    } else {
      const lane = groupLane.get(s.assignment.id) ?? 0;
      result.set(key, { lane, totalLanes, isSystemBar: false });
    }
  });

  return result;
}

export default function ScheduleView() {
  const { workers, projects, assignments, addAssignment, editableWorkerIds } = useStore();
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ workerId: string; date: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<{ workerId: string; startDate: string; endDate: string } | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const [segmentPreviews, setSegmentPreviews] = useState<
    Map<string, { startDate: string; endDate: string }>
  >(() => new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Long press handling for touch
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; workerId: string; date: string } | null>(null);
  const LONG_PRESS_DURATION = 300; // ms

  const weeks = useMemo(() => generateWeeks(startDate, WEEKS_TO_SHOW), [startDate]);
  const allDays = useMemo(() => weeks.flatMap(w => w.days), [weeks]);
  const editableWorkerIdSet = useMemo(() => new Set(editableWorkerIds), [editableWorkerIds]);
  
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
    if (!editableWorkerIdSet.has(workerId)) return;
    setIsDragging(true);
    setDragStart({ workerId, date: dateString });
    setDragEnd(dateString);
  }, [editableWorkerIdSet]);

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
    if (!editableWorkerIdSet.has(workerId)) return;
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
  }, [editableWorkerIdSet]);

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

  const handleSegmentPreviewChange = useCallback(
    (segmentKey: string, dates: { startDate: string; endDate: string } | null) => {
      setSegmentPreviews((prev) => {
        const next = new Map(prev);
        if (dates) {
          next.set(segmentKey, dates);
        } else {
          next.delete(segmentKey);
        }
        return next;
      });
    },
    []
  );

  // Calculate lane info per worker (split segments share lane by assignment.id; system bars full height)
  const workerLaneInfo = useMemo(() => {
    const result = new Map<string, Map<string, SegmentLaneInfo>>();
    for (const worker of flatWorkers) {
      const segs = getWorkerSegmentsForWorker(worker.id);
      const laneInfo = calculateSegmentLanes(segs, viewStartDate, viewEndDate, segmentPreviews);
      result.set(worker.id, laneInfo);
    }
    return result;
  }, [flatWorkers, getWorkerSegmentsForWorker, viewStartDate, viewEndDate, segmentPreviews]);

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
      <div className="flex items-center gap-4 px-4 py-3 bg-gray-300 border-b border-gray-300">
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
          <div className="sticky top-0 z-20 border-b border-gray-300">
            {/* Month row */}
            <div className="flex">
              <div className="w-48 flex-shrink-0 rounded-tl-lg bg-blue-600 px-4 py-1 border-r-4 border-white" />
              <div className="flex">
                {monthSpans.map((span, idx) => (
                  <div
                    key={span.key}
                    className={clsx(
                      'bg-blue-600 py-1 text-center text-sm font-semibold capitalize text-white',
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
              <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                Ansatt
              </div>
              <div className="flex">
                {weeks.map((week, weekIdx) => (
                  <div
                    key={`week-${week.weekNumber}-${week.year}`}
                    className={clsx(
                      'bg-gray-50 py-2 text-center text-sm font-medium text-gray-600',
                      weekIdx < weeks.length - 1 && WEEK_COLUMN_SEPARATOR_CLASSES
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
              <div className="w-48 flex-shrink-0 rounded-bl-lg border-r border-gray-200 bg-gray-300 px-4 py-1" />
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
                            'py-1 text-center text-xs',
                            isToday && !day.isHoliday && TODAY_COLUMN_CLASSES,
                            !isToday && day.isHoliday && clsx('bg-red-200 text-red-800', DAY_HEADER_DAY_BORDER_CLASSES),
                            !isToday && !day.isHoliday && clsx('bg-gray-50', DAY_HEADER_DAY_BORDER_CLASSES),
                            isLastDayOfWeek && weekIdx < weeks.length - 1 && WEEK_COLUMN_SEPARATOR_CLASSES
                          )}
                          style={{ width: CELL_WIDTH }}
                          title={day.holidayName || undefined}
                        >
                          <div className="font-medium">{['Ma', 'Ti', 'On', 'To', 'Fr'][day.dayOfWeek]}</div>
                          <div
                            className={clsx(
                              'text-gray-500',
                              isToday && 'font-bold text-blue-800',
                              day.isHoliday && 'font-semibold text-red-800'
                            )}
                          >
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

          {/* Worker rows — grouped by prosjektleder with uniform light gray block background */}
          <div className="no-select">
            {groupedWorkers.map((group, blockIndex) => (
              <div
                key={group.leader?.id ?? 'unassigned'}
                className={clsx(
                  blockIndex < groupedWorkers.length - 1 && LEADER_BLOCK_GAP_CLASS
                )}
              >
                {group.members.map((worker, memberIdx) => {
              const workerSegments = getWorkerSegmentsForWorker(worker.id);
              const isLeader = worker.role === 'prosjektleder';
              const canEditWorker = editableWorkerIdSet.has(worker.id);
              const rowHeight = getWorkerRowHeight(worker.id);
              const laneInfo = workerLaneInfo.get(worker.id);
              const rowBackground = getLeaderBlockRowBackground(canEditWorker);
              const isFirstInBlock = memberIdx === 0;
              const isLastInBlock = memberIdx === group.members.length - 1;

              return (
                <div
                  key={worker.id}
                  className="flex"
                  style={{ height: rowHeight }}
                >
                      {/* Worker name column — rounded on visible left corners of each block */}
                      <div
                        className={clsx(
                          'w-48 flex-shrink-0 px-4 flex items-center gap-2 border-r border-gray-200',
                          rowBackground,
                          isFirstInBlock && 'rounded-tl-lg',
                          isLastInBlock && 'rounded-bl-lg'
                        )}
                      >
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0',
                          canEditWorker
                            ? isLeader
                              ? 'bg-blue-600'
                              : 'bg-gray-500'
                            : 'bg-slate-400'
                        )}>
                          {worker.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex flex-col items-start">
                          <span className="font-medium text-sm text-gray-900 truncate">{worker.name}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {isLeader ? 'Prosjektleder' : 'Tømrer'}
                          </span>
                        </div>
                      </div>

                      {/* Calendar cells */}
                      <div className={clsx('flex relative flex-1 min-w-0', rowBackground)}>
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
                                    'calendar-cell',
                                    canEditWorker ? 'cursor-crosshair' : 'cursor-default',
                                    // Today cells: light blue column
                                    isToday && !isSelected && !day.isHoliday && TODAY_COLUMN_CLASSES,
                                    // Regular cells: visible grid on block background
                                    !isToday && !isSelected && !day.isHoliday && GRID_CELL_BORDER_CLASSES,
                                    // Selected cells
                                    isSelected && clsx('bg-blue-200', GRID_CELL_BORDER_CLASSES),
                                    // Holiday cells
                                    day.isHoliday && !isSelected && clsx('bg-red-100', GRID_CELL_BORDER_CLASSES),
                                    // Week separator
                                    isLastDayOfWeek && weekIdx < weeks.length - 1 && WEEK_COLUMN_SEPARATOR_CLASSES
                                  )}
                                  style={{ width: CELL_WIDTH, height: rowHeight }}
                                  onMouseDown={() => canEditWorker && handleMouseDown(worker.id, day.dateString)}
                                  onMouseMove={() => canEditWorker && handleMouseMove(day.dateString)}
                                  onTouchStart={(e) => canEditWorker && handleTouchStart(worker.id, day.dateString, e)}
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
                          const segmentKey = getAssignmentSegmentKey(segment, segIdx);
                          const segmentLaneInfo = laneInfo?.get(segmentKey);
                          
                          if (!style) return null;

                          return (
                            <AssignmentBar
                              key={segmentKey}
                              assignment={segment.assignment}
                              project={segment.project}
                              segmentKey={segmentKey}
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
                              canEditAssignment={canEditWorker}
                              onPreviewChange={handleSegmentPreviewChange}
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
