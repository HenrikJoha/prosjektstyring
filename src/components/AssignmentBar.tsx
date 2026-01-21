'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { ProjectAssignment, Project } from '@/types';
import { DayData, parseISO, addDays, format } from '@/utils/dates';
import { Trash2, GripVertical, Edit2 } from 'lucide-react';
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
  const { updateAssignment, deleteAssignment, deleteProject, assignments } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Check if this is the last assignment for this project
  const projectAssignments = assignments.filter(a => a.projectId === project.id);
  const isLastAssignment = projectAssignments.length === 1;
  
  // Store initial positions when drag starts
  const dragStartRef = useRef<{
    mouseX: number;
    barLeft: number;
    containerLeft: number;
    duration: number;
  } | null>(null);
  
  // Long press timer for touch
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_DURATION = 300; // ms to wait before activating drag

  // Calculate date from pixel position relative to container
  const getDateFromPosition = useCallback((xPosition: number) => {
    const dayIndex = Math.floor(xPosition / cellWidth);
    const clampedIndex = Math.max(0, Math.min(allDays.length - 1, dayIndex));
    return allDays[clampedIndex]?.dateString;
  }, [allDays, cellWidth]);

  // Find the calendar container
  const getContainer = useCallback(() => {
    return barRef.current?.parentElement;
  }, []);

  // Initialize drag state
  const initializeDrag = useCallback((clientX: number) => {
    const container = getContainer();
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    // Calculate duration in days
    const startIdx = allDays.findIndex(d => d.dateString === assignment.startDate);
    const endIdx = allDays.findIndex(d => d.dateString === assignment.endDate);
    const duration = endIdx >= 0 && startIdx >= 0 ? endIdx - startIdx + 1 : Math.round(style.width / cellWidth);
    
    dragStartRef.current = {
      mouseX: clientX,
      barLeft: style.left,
      containerLeft: containerRect.left,
      duration: duration,
    };
    
    setIsDragging(true);
  }, [getContainer, style.left, style.width, cellWidth, allDays, assignment.startDate, assignment.endDate]);

  // Handle bar drag (move) - mouse
  const handleMouseDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    initializeDrag(e.clientX);
  }, [initializeDrag]);

  // Handle touch start with long press
  const handleTouchDragStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressActive(true);
      initializeDrag(touch.clientX);
      // Vibrate to indicate activation (if supported)
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_DURATION);
  }, [initializeDrag]);

  // Cancel long press if touch moves too much before activation
  const handleTouchMoveCancel = useCallback((e: React.TouchEvent) => {
    if (!isLongPressActive && touchStartPosRef.current && longPressTimerRef.current) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      // If moved more than 10px, cancel long press (user is scrolling)
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, [isLongPressActive]);

  // Clean up long press timer on touch end
  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  }, []);

  // Initialize resize state
  const initializeResize = useCallback((clientX: number, side: 'left' | 'right') => {
    const container = getContainer();
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    dragStartRef.current = {
      mouseX: clientX,
      barLeft: style.left,
      containerLeft: containerRect.left,
      duration: 0,
    };
    
    setIsResizing(side);
  }, [getContainer, style.left]);

  // Handle resize start - mouse
  const handleMouseResizeStart = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    initializeResize(e.clientX, side);
  }, [initializeResize]);

  // Long press refs for resize handles
  const resizeLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resizeTouchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Handle resize touch start with long press
  const handleTouchResizeStart = useCallback((e: React.TouchEvent, side: 'left' | 'right') => {
    e.stopPropagation();
    const touch = e.touches[0];
    resizeTouchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    resizeLongPressTimerRef.current = setTimeout(() => {
      setIsLongPressActive(true);
      initializeResize(touch.clientX, side);
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_DURATION);
  }, [initializeResize]);

  // Cancel resize long press if touch moves
  const handleResizeTouchMoveCancel = useCallback((e: React.TouchEvent) => {
    if (!isLongPressActive && resizeTouchStartPosRef.current && resizeLongPressTimerRef.current) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - resizeTouchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - resizeTouchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(resizeLongPressTimerRef.current);
        resizeLongPressTimerRef.current = null;
      }
    }
  }, [isLongPressActive]);

  // Clean up resize long press timer
  const handleResizeTouchEnd = useCallback(() => {
    if (resizeLongPressTimerRef.current) {
      clearTimeout(resizeLongPressTimerRef.current);
      resizeLongPressTimerRef.current = null;
    }
    resizeTouchStartPosRef.current = null;
  }, []);

  // Handle mouse/touch move for drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    if (!dragStartRef.current) return;

    const handleMove = (clientX: number) => {
      const container = getContainer();
      if (!container || !dragStartRef.current) return;

      const containerRect = container.getBoundingClientRect();
      const relativeX = clientX - containerRect.left;

      if (isDragging) {
        // Calculate how much the mouse moved
        const mouseDelta = clientX - dragStartRef.current.mouseX;
        // Calculate new bar position
        const newLeft = dragStartRef.current.barLeft + mouseDelta;
        
        const newStartDate = getDateFromPosition(newLeft);
        if (newStartDate) {
          // Calculate end date based on original duration
          const startIdx = allDays.findIndex(d => d.dateString === newStartDate);
          const endIdx = startIdx + dragStartRef.current.duration - 1;
          
          if (startIdx >= 0 && endIdx < allDays.length) {
            const endDate = allDays[endIdx]?.dateString;
            if (endDate) {
              updateAssignment(assignment.id, {
                startDate: newStartDate,
                endDate: endDate,
              });
            }
          }
        }
      } else if (isResizing) {
        if (isResizing === 'left') {
          const newStartDate = getDateFromPosition(relativeX);
          if (newStartDate && newStartDate <= assignment.endDate) {
            updateAssignment(assignment.id, { startDate: newStartDate });
          }
        } else {
          const newEndDate = getDateFromPosition(relativeX);
          if (newEndDate && newEndDate >= assignment.startDate) {
            updateAssignment(assignment.id, { endDate: newEndDate });
          }
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    };

    const handleEnd = () => {
      setIsDragging(false);
      setIsResizing(null);
      setIsLongPressActive(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, isResizing, cellWidth, getDateFromPosition, allDays, assignment, updateAssignment, getContainer]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClick = () => setShowMenu(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showMenu]);

  const handleRemoveAssignment = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If this is the last assignment and it's not a system project, ask for confirmation
    if (isLastAssignment && !project.isSystem) {
      setShowMenu(false);
      setShowDeleteConfirm(true);
    } else {
      // Just remove the assignment
      deleteAssignment(assignment.id);
      setShowMenu(false);
    }
  };

  const handleConfirmDeleteProject = () => {
    deleteAssignment(assignment.id);
    deleteProject(project.id);
    setShowDeleteConfirm(false);
  };

  const handleJustRemoveAssignment = () => {
    deleteAssignment(assignment.id);
    setShowDeleteConfirm(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowEditModal(true);
  };

  // Determine text color based on background
  const getContrastColor = (hexColor: string) => {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  };

  const textColor = getContrastColor(project.color);

  // Calculate bar dimensions based on lane
  const padding = 4;
  const availableHeight = rowHeight - (padding * 2);
  const barHeight = totalLanes > 1 
    ? (availableHeight / totalLanes) - 2 // Small gap between lanes
    : availableHeight - 8; // Standard padding when single lane
  const barTop = padding + (lane * (availableHeight / totalLanes)) + (totalLanes > 1 ? 1 : 4);

  return (
    <div
      ref={barRef}
      className={clsx(
        'project-bar absolute rounded-md shadow-sm cursor-move overflow-hidden',
        (isDragging || isResizing) && 'opacity-80 shadow-lg z-30'
      )}
      style={{
        left: style.left,
        width: style.width,
        top: barTop,
        height: barHeight,
        backgroundColor: project.color,
        color: textColor,
      }}
      onMouseDown={handleMouseDragStart}
      onTouchStart={handleTouchDragStart}
      onTouchMove={handleTouchMoveCancel}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {/* Resize handle left - larger touch target on mobile */}
      <div
        className="resize-handle resize-handle-left"
        onMouseDown={(e) => handleMouseResizeStart(e, 'left')}
        onTouchStart={(e) => handleTouchResizeStart(e, 'left')}
        onTouchMove={handleResizeTouchMoveCancel}
        onTouchEnd={handleResizeTouchEnd}
      />

      {/* Content */}
      <div className="flex items-center h-full px-3 gap-1 pointer-events-none">
        <GripVertical size={14} className="flex-shrink-0 opacity-50 hidden sm:block" />
        <span className="text-sm font-medium truncate">{project.name}</span>
      </div>

      {/* Resize handle right - larger touch target on mobile */}
      <div
        className="resize-handle resize-handle-right"
        onMouseDown={(e) => handleMouseResizeStart(e, 'right')}
        onTouchStart={(e) => handleTouchResizeStart(e, 'right')}
        onTouchMove={handleResizeTouchMoveCancel}
        onTouchEnd={handleResizeTouchEnd}
      />

      {/* Context menu */}
      {showMenu && (
        <div
          className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Only show edit for non-system projects */}
          {!project.isSystem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowEditModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
            >
              <Edit2 size={16} />
              Rediger prosjekt
            </button>
          )}
          <button
            onClick={handleRemoveAssignment}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
          >
            <Trash2 size={16} />
            Fjern fra kalender
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Slett prosjekt?
            </h3>
            <p className="text-gray-600 mb-6">
              Dette er den siste tildelingen for &quot;{project.name}&quot;. Vil du også slette hele prosjektet?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirmDeleteProject}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Ja, slett prosjektet
              </button>
              <button
                onClick={handleJustRemoveAssignment}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Nei, bare fjern fra kalender
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Project Modal - rendered via portal to escape overflow:hidden */}
      {showEditModal && createPortal(
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
        />,
        document.body
      )}
    </div>
  );
}
