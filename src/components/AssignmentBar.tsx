'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/store/useStore';
import { ProjectAssignment, Project } from '@/types';
import { DayData } from '@/utils/dates';
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
  const barRef = useRef<HTMLDivElement>(null);

  // Check if this is the last assignment for this project
  const projectAssignments = assignments.filter(a => a.projectId === project.id);
  const isLastAssignment = projectAssignments.length === 1;
  
  // Mouse/touch tracking refs
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const dragDataRef = useRef<{
    startX: number;
    barLeft: number;
    duration: number;
  } | null>(null);
  const resizeSideRef = useRef<'left' | 'right' | null>(null);
  
  // Touch long press
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_DURATION = 500;

  // Get date from position
  const getDateFromPosition = useCallback((xPosition: number) => {
    const dayIndex = Math.floor(xPosition / cellWidth);
    const clampedIndex = Math.max(0, Math.min(allDays.length - 1, dayIndex));
    return allDays[clampedIndex]?.dateString;
  }, [allDays, cellWidth]);

  const getContainer = useCallback(() => barRef.current?.parentElement, []);

  // ===== MOUSE HANDLERS =====
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();
    mouseDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, []);

  // Global mouse move - check for drag start
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if we should start dragging
      if (mouseDownRef.current && !isDragging && !isResizing) {
        const dx = Math.abs(e.clientX - mouseDownRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownRef.current.y);
        
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          // Start dragging
          const container = getContainer();
          if (container) {
            const startIdx = allDays.findIndex(d => d.dateString === assignment.startDate);
            const endIdx = allDays.findIndex(d => d.dateString === assignment.endDate);
            const duration = endIdx >= 0 && startIdx >= 0 ? endIdx - startIdx + 1 : Math.round(style.width / cellWidth);
            
            dragDataRef.current = {
              startX: mouseDownRef.current.x,
              barLeft: style.left,
              duration,
            };
            
            if (resizeSideRef.current) {
              setIsResizing(resizeSideRef.current);
            } else {
              setIsDragging(true);
            }
          }
          mouseDownRef.current = null;
        }
        return;
      }
      
      // Handle active drag/resize
      if (!isDragging && !isResizing) return;
      if (!dragDataRef.current) return;
      
      const container = getContainer();
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      
      if (isDragging) {
        const mouseDelta = e.clientX - dragDataRef.current.startX;
        const newLeft = dragDataRef.current.barLeft + mouseDelta;
        const newStartDate = getDateFromPosition(newLeft);
        
        if (newStartDate) {
          const startIdx = allDays.findIndex(d => d.dateString === newStartDate);
          const endIdx = startIdx + dragDataRef.current.duration - 1;
          
          if (startIdx >= 0 && endIdx < allDays.length) {
            const endDate = allDays[endIdx]?.dateString;
            if (endDate) {
              updateAssignment(assignment.id, { startDate: newStartDate, endDate });
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

    const handleMouseUp = () => {
      mouseDownRef.current = null;
      dragDataRef.current = null;
      resizeSideRef.current = null;
      setIsDragging(false);
      setIsResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, getContainer, getDateFromPosition, allDays, assignment, updateAssignment, style.left, style.width, cellWidth]);

  // Handle click - only fires if no drag happened
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // If we're dragging, don't show menu
    if (isDragging || isResizing) return;
    setShowMenu(prev => !prev);
  }, [isDragging, isResizing]);

  // Handle right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  }, []);

  // Handle double-click
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (project.isSystem) {
      setShowMenu(true);
    } else {
      setShowEditModal(true);
    }
  }, [project.isSystem]);

  // ===== RESIZE HANDLERS =====
  
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    mouseDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    resizeSideRef.current = side;
  }, []);

  // ===== TOUCH HANDLERS =====
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    mouseDownRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    
    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      setShowMenu(true);
      if (navigator.vibrate) navigator.vibrate(50);
      mouseDownRef.current = null;
    }, LONG_PRESS_DURATION);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!mouseDownRef.current) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - mouseDownRef.current.x);
    const dy = Math.abs(touch.clientY - mouseDownRef.current.y);
    
    // Cancel long press if moved
    if (longPressTimerRef.current && (dx > 10 || dy > 10)) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Start drag if threshold met
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      if (!isDragging && !isResizing) {
        const container = getContainer();
        if (container) {
          const startIdx = allDays.findIndex(d => d.dateString === assignment.startDate);
          const endIdx = allDays.findIndex(d => d.dateString === assignment.endDate);
          const duration = endIdx >= 0 && startIdx >= 0 ? endIdx - startIdx + 1 : Math.round(style.width / cellWidth);
          
          dragDataRef.current = {
            startX: mouseDownRef.current.x,
            barLeft: style.left,
            duration,
          };
          
          if (resizeSideRef.current) {
            setIsResizing(resizeSideRef.current);
          } else {
            setIsDragging(true);
          }
        }
      }
    }
  }, [isDragging, isResizing, getContainer, allDays, assignment, style, cellWidth]);

  // Touch move for active drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragDataRef.current) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const container = getContainer();
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const relativeX = touch.clientX - containerRect.left;
      
      if (isDragging) {
        const mouseDelta = touch.clientX - dragDataRef.current.startX;
        const newLeft = dragDataRef.current.barLeft + mouseDelta;
        const newStartDate = getDateFromPosition(newLeft);
        
        if (newStartDate) {
          const startIdx = allDays.findIndex(d => d.dateString === newStartDate);
          const endIdx = startIdx + dragDataRef.current.duration - 1;
          
          if (startIdx >= 0 && endIdx < allDays.length) {
            const endDate = allDays[endIdx]?.dateString;
            if (endDate) {
              updateAssignment(assignment.id, { startDate: newStartDate, endDate });
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

    const handleTouchEnd = () => {
      mouseDownRef.current = null;
      dragDataRef.current = null;
      resizeSideRef.current = null;
      setIsDragging(false);
      setIsResizing(null);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, isResizing, getContainer, getDateFromPosition, allDays, assignment, updateAssignment]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    mouseDownRef.current = null;
    resizeSideRef.current = null;
  }, []);

  const handleResizeTouchStart = useCallback((e: React.TouchEvent, side: 'left' | 'right') => {
    e.stopPropagation();
    const touch = e.touches[0];
    mouseDownRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    resizeSideRef.current = side;
  }, []);

  // ===== MENU HANDLERS =====
  
  // Close menu when clicking outside - use mousedown to avoid same-click issue
  useEffect(() => {
    if (!showMenu) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside the menu or on the bar itself
      if (!target.closest('.assignment-menu') && !target.closest('.project-bar')) {
        setShowMenu(false);
      }
    };
    
    // Use mousedown instead of click, and add listener on next frame
    // to avoid the opening click from triggering it
    const frameId = requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleClickOutside);
    });
    
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleRemoveAssignment = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLastAssignment && !project.isSystem) {
      setShowMenu(false);
      setShowDeleteConfirm(true);
    } else {
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
    <div
      ref={barRef}
      className={clsx(
        'project-bar absolute rounded-md shadow-sm cursor-pointer overflow-hidden',
        (isDragging || isResizing) && 'opacity-80 shadow-lg z-30 cursor-move'
      )}
      style={{
        left: style.left,
        width: style.width,
        top: barTop,
        height: barHeight,
        backgroundColor: project.color,
        color: textColor,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Resize handle left */}
      <div
        className="resize-handle resize-handle-left"
        onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
        onTouchStart={(e) => handleResizeTouchStart(e, 'left')}
      />

      {/* Content */}
      <div className="flex items-center h-full px-3 gap-1 pointer-events-none">
        <GripVertical size={14} className="flex-shrink-0 opacity-50 hidden sm:block" />
        <span className="text-sm font-medium truncate">{project.name}</span>
      </div>

      {/* Resize handle right */}
      <div
        className="resize-handle resize-handle-right"
        onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
        onTouchStart={(e) => handleResizeTouchStart(e, 'right')}
      />

      {/* Context menu */}
      {showMenu && (
        <div
          className="assignment-menu absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
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

      {/* Edit Project Modal */}
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
