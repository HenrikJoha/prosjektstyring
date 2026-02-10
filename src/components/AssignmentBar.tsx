'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { ProjectAssignment, Project } from '@/types';
import { DayData, formatDateNorwegian } from '@/utils/dates';
import { GripVertical, Check, X } from 'lucide-react';
import clsx from 'clsx';
import EditProjectModal from './EditProjectModal';

interface AssignmentBarProps {
  assignment: ProjectAssignment;
  project: Project;
  /** Segment range (when bar is split by system project); defaults to assignment dates. */
  segmentStartDate?: string;
  segmentEndDate?: string;
  /** Other segments from same assignment (for split-on-edit). */
  otherSegmentsFromSameAssignment?: { startDate: string; endDate: string }[];
  style: { left: number; width: number };
  allDays: DayData[];
  cellWidth: number;
  rowHeight: number;
  lane: number;
  totalLanes: number;
  /** When true (holiday/sick), bar drawn on same line(s) as project bars being split. */
  isSystemBar?: boolean;
  /** When isSystemBar: first lane (0-based) so bar aligns with project bars. */
  systemBarLaneStart?: number;
  /** When isSystemBar: number of lanes to span. */
  systemBarLaneCount?: number;
}

const DRAG_THRESHOLD = 5;
const TOUCH_HOLD_DELAY = 500; // 500ms hold before drag activates on mobile

export default function AssignmentBar({
  assignment,
  project,
  segmentStartDate,
  segmentEndDate,
  otherSegmentsFromSameAssignment = [],
  style,
  allDays,
  cellWidth,
  rowHeight,
  lane,
  totalLanes,
  isSystemBar = false,
  systemBarLaneStart = 0,
  systemBarLaneCount = 1,
}: AssignmentBarProps) {
  const { updateAssignment, updateAssignmentAndSplit } = useStore();
  const effectiveStart = segmentStartDate ?? assignment.startDate;
  const effectiveEnd = segmentEndDate ?? assignment.endDate;
  const [showEditModal, setShowEditModal] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [touchHoldActive, setTouchHoldActive] = useState(false);
  const [isTouchPending, setIsTouchPending] = useState(false); // Track when waiting for hold to complete

  // Refs for tracking drag data
  const dragStateRef = useRef<{
    type: 'drag' | 'resize-left' | 'resize-right';
    startX: number;
    startY: number;
    barLeft: number;
    duration: number;
  } | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  
  // Store original dates for confirmation/revert
  const originalDatesRef = useRef<{ startDate: string; endDate: string } | null>(null);
  
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingDates, setPendingDates] = useState<{ startDate: string; endDate: string } | null>(null);
  const pendingDatesRef = useRef<{ startDate: string; endDate: string } | null>(null);

  // Local preview during drag/resize - avoids store/DB updates on every move (fixes lag)
  const [previewDates, setPreviewDates] = useState<{ startDate: string; endDate: string } | null>(null);
  const previewDatesRef = useRef<{ startDate: string; endDate: string } | null>(null);

  // Get date from X position
  const getDateFromPosition = useCallback((xPosition: number) => {
    const dayIndex = Math.floor(xPosition / cellWidth);
    const clampedIndex = Math.max(0, Math.min(allDays.length - 1, dayIndex));
    return allDays[clampedIndex]?.dateString;
  }, [allDays, cellWidth]);

  // Get container element
  const getContainer = useCallback(() => barRef.current?.parentElement, []);

  // Calculate bar duration (from segment range)
  const getBarDuration = useCallback(() => {
    const startIdx = allDays.findIndex(d => d.dateString === effectiveStart);
    const endIdx = allDays.findIndex(d => d.dateString === effectiveEnd);
    return endIdx >= 0 && startIdx >= 0 ? endIdx - startIdx + 1 : Math.round(style.width / cellWidth);
  }, [allDays, effectiveStart, effectiveEnd, style.width, cellWidth]);

  // Handle move/resize logic - update local preview only during drag (persist on release to fix lag)
  const handleDragMove = useCallback((clientX: number) => {
    if (!dragStateRef.current) return;

    const container = getContainer();
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;

    let newStart = effectiveStart;
    let newEnd = effectiveEnd;

    if (dragStateRef.current.type === 'drag') {
      const mouseDelta = clientX - dragStateRef.current.startX;
      const newLeft = dragStateRef.current.barLeft + mouseDelta;
      const newStartDate = getDateFromPosition(newLeft);

      if (newStartDate) {
        const startIdx = allDays.findIndex(d => d.dateString === newStartDate);
        const endIdx = startIdx + dragStateRef.current.duration - 1;

        if (startIdx >= 0 && endIdx < allDays.length) {
          const endDate = allDays[endIdx]?.dateString;
          if (endDate) {
            newStart = newStartDate;
            newEnd = endDate;
          }
        }
      }
    } else if (dragStateRef.current.type === 'resize-left') {
      const newStartDate = getDateFromPosition(relativeX);
      if (newStartDate && newStartDate <= effectiveEnd) {
        newStart = newStartDate;
        newEnd = effectiveEnd;
      }
    } else if (dragStateRef.current.type === 'resize-right') {
      const newEndDate = getDateFromPosition(relativeX);
      if (newEndDate && newEndDate >= effectiveStart) {
        newStart = effectiveStart;
        newEnd = newEndDate;
      }
    }

    if (newStart !== effectiveStart || newEnd !== effectiveEnd) {
      const next = { startDate: newStart, endDate: newEnd };
      previewDatesRef.current = next;
      setPreviewDates(next);
    }
  }, [getContainer, getDateFromPosition, allDays, effectiveStart, effectiveEnd]);

  // Clear all drag state; show confirmation modal if dates changed (persist only on confirm)
  const clearDragState = useCallback((skipConfirmation: boolean = false) => {
    const wasActive = isDragging || isResizing;
    const hadOriginalDates = originalDatesRef.current;
    const hadDragState = dragStateRef.current !== null;
    const finalPreview = previewDatesRef.current;

    dragStateRef.current = null;
    touchStartPosRef.current = null;
    setIsDragging(false);
    setIsResizing(null);
    setTouchHoldActive(false);
    setIsTouchPending(false);
    isTouchRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const currentStartDate = finalPreview?.startDate ?? effectiveStart;
    const currentEndDate = finalPreview?.endDate ?? effectiveEnd;
    const datesChanged =
      hadOriginalDates &&
      (hadOriginalDates.startDate !== currentStartDate || hadOriginalDates.endDate !== currentEndDate);

    if (!skipConfirmation && hadOriginalDates && (wasActive || hadDragState) && datesChanged) {
      const next = { startDate: currentStartDate, endDate: currentEndDate };
      pendingDatesRef.current = next;
      setPendingDates(next);
      setShowConfirmModal(true);
      // Keep previewDates so bar stays at new position until user confirms or cancels
    } else {
      originalDatesRef.current = null;
      previewDatesRef.current = null;
      setPreviewDates(null);
    }
  }, [isDragging, isResizing, effectiveStart, effectiveEnd]);
  
  // Handle confirmation - persist and clear preview
  const handleConfirmMove = useCallback(() => {
    const toApply = pendingDatesRef.current;
    if (toApply) {
      if (otherSegmentsFromSameAssignment.length > 0) {
        updateAssignmentAndSplit(assignment.id, toApply.startDate, toApply.endDate, otherSegmentsFromSameAssignment);
      } else {
        updateAssignment(assignment.id, { startDate: toApply.startDate, endDate: toApply.endDate });
      }
    }
    pendingDatesRef.current = null;
    setShowConfirmModal(false);
    setPendingDates(null);
    originalDatesRef.current = null;
    previewDatesRef.current = null;
    setPreviewDates(null);
  }, [otherSegmentsFromSameAssignment, assignment.id, updateAssignment, updateAssignmentAndSplit]);

  // Handle cancel - clear preview so bar snaps back; no persist
  const handleCancelMove = useCallback(() => {
    pendingDatesRef.current = null;
    setShowConfirmModal(false);
    setPendingDates(null);
    originalDatesRef.current = null;
    previewDatesRef.current = null;
    setPreviewDates(null);
  }, []);

  // ===== MOUSE HANDLERS (Desktop) =====

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'drag' | 'resize-left' | 'resize-right' = 'drag') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    isTouchRef.current = false;
    
    // Store original dates for potential revert
    originalDatesRef.current = {
      startDate: effectiveStart,
      endDate: effectiveEnd,
    };
    
    dragStateRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      barLeft: style.left,
      duration: getBarDuration(),
    };

    if (type === 'drag') {
      setIsDragging(true);
    } else {
      setIsResizing(type === 'resize-left' ? 'left' : 'right');
    }
  }, [style.left, getBarDuration, effectiveStart, effectiveEnd]);

  // Global mouse move/up handlers
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    if (isTouchRef.current) return; // Skip if touch is active

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX);
    };

    const handleMouseUp = () => {
      clearDragState();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, handleDragMove, clearDragState]);

  // ===== TOUCH HANDLERS (Mobile) =====

  const handleTouchStart = useCallback((e: React.TouchEvent, type: 'drag' | 'resize-left' | 'resize-right' = 'drag') => {
    e.stopPropagation();
    
    const touch = e.touches[0];
    isTouchRef.current = true;
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    // ALWAYS store original dates immediately when touch starts
    // This ensures confirmation will work even if drag activates unexpectedly
    originalDatesRef.current = {
      startDate: effectiveStart,
      endDate: effectiveEnd,
    };

    // For resize, start immediately
    if (type !== 'drag') {
      dragStateRef.current = {
        type,
        startX: touch.clientX,
        startY: touch.clientY,
        barLeft: style.left,
        duration: getBarDuration(),
      };
      setIsResizing(type === 'resize-left' ? 'left' : 'right');
      setTouchHoldActive(true);
      setIsTouchPending(true); // Trigger listener attachment
      return;
    }

    // For drag, require 500ms hold while staying STILL
    const startX = touch.clientX;
    const startY = touch.clientY;

    // Prepare drag data but don't activate yet
    dragStateRef.current = {
      type: 'drag',
      startX,
      startY,
      barLeft: style.left,
      duration: getBarDuration(),
    };

    // Set pending state to attach the global listener immediately
    setIsTouchPending(true);

    // Start hold timer
    holdTimerRef.current = setTimeout(() => {
      // After 500ms (and user stayed still), activate drag mode
      setTouchHoldActive(true);
      setIsDragging(true);
      // Vibrate to give feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }, TOUCH_HOLD_DELAY);
  }, [style.left, getBarDuration, effectiveStart, effectiveEnd]);

  // Global touch move/end handlers - attach immediately when touch pending or active
  useEffect(() => {
    // Attach listener when touch is pending (waiting for hold) OR when actively dragging/resizing
    if (!isTouchPending && !isDragging && !isResizing) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      
      // If hold timer is still running (waiting for 500ms hold), check if user moved (cancels hold)
      if (holdTimerRef.current && !touchHoldActive && touchStartPosRef.current) {
        const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
        // Use a small threshold (5px) - user must stay STILL
        if (dx > 5 || dy > 5) {
          // User moved before hold completed - cancel and allow normal scrolling
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          dragStateRef.current = null;
          touchStartPosRef.current = null;
          isTouchRef.current = false;
          setIsTouchPending(false);
          return;
        }
        return; // Don't do anything until hold activates
      }

      // If drag/resize is active, prevent scrolling and handle movement
      if ((isDragging || isResizing) && touchHoldActive) {
        e.preventDefault();
        e.stopPropagation();
        handleDragMove(touch.clientX);
      }
    };

    const handleTouchEnd = () => {
      clearDragState();
    };

    // Use passive: false to allow preventDefault
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isTouchPending, isDragging, isResizing, touchHoldActive, handleDragMove, clearDragState]);

  // Cleanup hold timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  // ===== DOUBLE CLICK =====

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowEditModal(true);
  }, []);

  // ===== RENDERING =====

  const getContrastColor = (hexColor: string) => {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  // Red reserved for sick days so they're instantly recognizable
  const barColor = project.projectType === 'sick_leave' ? '#EF4444' : project.color;
  const textColor = getContrastColor(barColor);

  const padding = 4;
  const availableHeight = rowHeight - (padding * 2);
  const singleLaneHeight = totalLanes > 1 ? (availableHeight / totalLanes) - 2 : availableHeight - 8;
  const barHeight = isSystemBar
    ? systemBarLaneCount * singleLaneHeight + (systemBarLaneCount > 1 ? (systemBarLaneCount - 1) * 2 : 0)
    : singleLaneHeight;
  const barTop = isSystemBar
    ? padding + (systemBarLaneStart * (availableHeight / totalLanes)) + (totalLanes > 1 ? 1 : 4)
    : padding + (lane * (availableHeight / totalLanes)) + (totalLanes > 1 ? 1 : 4);

  const displayStart = previewDates?.startDate ?? effectiveStart;
  const displayEnd = previewDates?.endDate ?? effectiveEnd;
  const startIdx = allDays.findIndex((d) => d.dateString === displayStart);
  const endIdx = allDays.findIndex((d) => d.dateString === displayEnd);
  const displayLeft = startIdx >= 0 ? startIdx * cellWidth : style.left;
  const displayWidth = startIdx >= 0 && endIdx >= 0 ? (endIdx - startIdx + 1) * cellWidth : style.width;

  return (
    <>
      <div
        ref={barRef}
        className={clsx(
          'project-bar absolute rounded-md shadow-sm overflow-visible',
          (isDragging || isResizing) && 'opacity-80 shadow-lg z-30',
          touchHoldActive && 'ring-2 ring-blue-400'
        )}
        style={{
          left: displayLeft,
          width: displayWidth,
          top: barTop,
          height: barHeight,
          backgroundColor: barColor,
          color: textColor,
          cursor: isDragging ? 'move' : 'pointer',
          touchAction: touchHoldActive ? 'none' : 'auto',
        }}
        onDoubleClick={handleDoubleClick}
        title="Dobbeltklikk for å redigere"
      >
        {/* Resize handle left */}
        <div
          className="resize-handle resize-handle-left"
          onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
          onTouchStart={(e) => handleTouchStart(e, 'resize-left')}
        />

        {/* Content area - draggable */}
        <div
          className="flex items-center h-full px-3 gap-1 cursor-pointer"
          onMouseDown={(e) => handleMouseDown(e, 'drag')}
          onTouchStart={(e) => handleTouchStart(e, 'drag')}
        >
          <GripVertical size={14} className="flex-shrink-0 opacity-50 hidden sm:block" />
          <span className="text-sm font-medium truncate">{project.name}</span>
        </div>

        {/* Resize handle right */}
        <div
          className="resize-handle resize-handle-right"
          onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
          onTouchStart={(e) => handleTouchStart(e, 'resize-right')}
        />
      </div>

      {/* Edit Project Modal */}
      {showEditModal && createPortal(
        <EditProjectModal
          project={project}
          assignment={assignment}
          onClose={() => setShowEditModal(false)}
        />,
        document.body
      )}
      
      {/* Move Confirmation Modal */}
      {showConfirmModal && pendingDates && createPortal(
        <MoveConfirmationModal
          projectName={project.name}
          startDate={pendingDates.startDate}
          endDate={pendingDates.endDate}
          onConfirm={handleConfirmMove}
          onCancel={handleCancelMove}
        />,
        document.body
      )}
    </>
  );
}

// Move Confirmation Modal Component
interface MoveConfirmationModalProps {
  projectName: string;
  startDate: string;
  endDate: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function MoveConfirmationModal({ 
  projectName, 
  startDate, 
  endDate, 
  onConfirm, 
  onCancel 
}: MoveConfirmationModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  
  // Focus confirm button on mount and handle keyboard
  useEffect(() => {
    confirmButtonRef.current?.focus();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Bekreft flytting
        </h3>
        <p className="text-gray-600 mb-6">
          Ønsker du å flytte prosjektet <span className="font-semibold text-gray-900">&quot;{projectName}&quot;</span> til datoene:
        </p>
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="text-center">
            <span className="text-lg font-medium text-gray-900">
              {formatDateNorwegian(startDate)} — {formatDateNorwegian(endDate)}
            </span>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
          >
            <X size={18} />
            Avbryt
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <Check size={18} />
            OK
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center hidden md:block">
          Trykk Enter for å bekrefte, Esc for å avbryte
        </p>
      </div>
    </div>
  );
}
