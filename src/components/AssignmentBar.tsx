'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { ProjectAssignment, Project } from '@/types';
import { DayData } from '@/utils/dates';
import { GripVertical } from 'lucide-react';
import clsx from 'clsx';
import EditProjectModal from './EditProjectModal';

interface AssignmentBarProps {
  assignment: ProjectAssignment;
  project: Project;
  style: { left: number; width: number };
  allDays: DayData[];
  cellWidth: number;
  rowHeight: number;
  lane: number;
  totalLanes: number;
}

const DRAG_THRESHOLD = 5;
const TOUCH_HOLD_DELAY = 500; // 500ms hold before drag activates on mobile

export default function AssignmentBar({
  assignment,
  project,
  style,
  allDays,
  cellWidth,
  rowHeight,
  lane,
  totalLanes,
}: AssignmentBarProps) {
  const { updateAssignment } = useStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [touchHoldActive, setTouchHoldActive] = useState(false);

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

  // Get date from X position
  const getDateFromPosition = useCallback((xPosition: number) => {
    const dayIndex = Math.floor(xPosition / cellWidth);
    const clampedIndex = Math.max(0, Math.min(allDays.length - 1, dayIndex));
    return allDays[clampedIndex]?.dateString;
  }, [allDays, cellWidth]);

  // Get container element
  const getContainer = useCallback(() => barRef.current?.parentElement, []);

  // Calculate bar duration
  const getBarDuration = useCallback(() => {
    const startIdx = allDays.findIndex(d => d.dateString === assignment.startDate);
    const endIdx = allDays.findIndex(d => d.dateString === assignment.endDate);
    return endIdx >= 0 && startIdx >= 0 ? endIdx - startIdx + 1 : Math.round(style.width / cellWidth);
  }, [allDays, assignment, style.width, cellWidth]);

  // Handle move/resize logic
  const handleDragMove = useCallback((clientX: number) => {
    if (!dragStateRef.current) return;

    const container = getContainer();
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;

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
            updateAssignment(assignment.id, { startDate: newStartDate, endDate });
          }
        }
      }
    } else if (dragStateRef.current.type === 'resize-left') {
      const newStartDate = getDateFromPosition(relativeX);
      if (newStartDate && newStartDate <= assignment.endDate) {
        updateAssignment(assignment.id, { startDate: newStartDate });
      }
    } else if (dragStateRef.current.type === 'resize-right') {
      const newEndDate = getDateFromPosition(relativeX);
      if (newEndDate && newEndDate >= assignment.startDate) {
        updateAssignment(assignment.id, { endDate: newEndDate });
      }
    }
  }, [getContainer, getDateFromPosition, allDays, assignment, updateAssignment]);

  // Clear all drag state
  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
    setIsResizing(null);
    setTouchHoldActive(false);
    isTouchRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // ===== MOUSE HANDLERS (Desktop) =====

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'drag' | 'resize-left' | 'resize-right' = 'drag') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    isTouchRef.current = false;
    
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
  }, [style.left, getBarDuration]);

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
      return;
    }

    // For drag, require 500ms hold
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

    // Start hold timer
    holdTimerRef.current = setTimeout(() => {
      // After 500ms, activate drag mode
      setTouchHoldActive(true);
      setIsDragging(true);
      // Vibrate to give feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }, TOUCH_HOLD_DELAY);
  }, [style.left, getBarDuration]);

  // Global touch move/end handlers
  useEffect(() => {
    if (!isTouchRef.current) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      
      // If hold timer is still running, check if user moved too much (cancels hold)
      if (holdTimerRef.current && !touchHoldActive) {
        if (dragStateRef.current) {
          const dx = Math.abs(touch.clientX - dragStateRef.current.startX);
          const dy = Math.abs(touch.clientY - dragStateRef.current.startY);
          if (dx > 10 || dy > 10) {
            // User moved before hold completed - cancel
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
            dragStateRef.current = null;
            isTouchRef.current = false;
            return;
          }
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
  }, [isDragging, isResizing, touchHoldActive, handleDragMove, clearDragState]);

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

  const textColor = getContrastColor(project.color);

  const padding = 4;
  const availableHeight = rowHeight - (padding * 2);
  const barHeight = totalLanes > 1
    ? (availableHeight / totalLanes) - 2
    : availableHeight - 8;
  const barTop = padding + (lane * (availableHeight / totalLanes)) + (totalLanes > 1 ? 1 : 4);

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
          left: style.left,
          width: style.width,
          top: barTop,
          height: barHeight,
          backgroundColor: project.color,
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
    </>
  );
}
