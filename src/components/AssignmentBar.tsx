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
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Mouse/touch tracking refs
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const dragDataRef = useRef<{
    startX: number;
    barLeft: number;
    duration: number;
  } | null>(null);
  const resizeSideRef = useRef<'left' | 'right' | null>(null);
  
  // Drag activation delay (prevents accidental drags)
  const dragActivationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canDragRef = useRef(false);
  
  const DRAG_THRESHOLD = 5;
  const DRAG_ACTIVATION_DELAY = 500; // 500ms hold before dragging can start

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
    canDragRef.current = false;
    
    // Start drag activation timer
    dragActivationTimerRef.current = setTimeout(() => {
      canDragRef.current = true;
    }, DRAG_ACTIVATION_DELAY);
  }, []);

  // Global mouse move - check for drag start
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Check if we should start dragging
      if (mouseDownRef.current && !isDragging && !isResizing) {
        // Only allow drag if activation delay has passed
        if (!canDragRef.current) {
          return;
        }
        
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
          if (dragActivationTimerRef.current) {
            clearTimeout(dragActivationTimerRef.current);
            dragActivationTimerRef.current = null;
          }
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
      canDragRef.current = false;
      if (dragActivationTimerRef.current) {
        clearTimeout(dragActivationTimerRef.current);
        dragActivationTimerRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, getContainer, getDateFromPosition, allDays, assignment, updateAssignment, style.left, style.width, cellWidth]);

  // Handle double-click - open edit modal for ALL projects
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowEditModal(true);
  }, []);

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
    canDragRef.current = false;
    
    // Start drag activation timer (no long-press for edit modal anymore)
    dragActivationTimerRef.current = setTimeout(() => {
      canDragRef.current = true;
    }, DRAG_ACTIVATION_DELAY);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!mouseDownRef.current) return;
    
    // Only allow drag if activation delay has passed
    if (!canDragRef.current) {
      return;
    }
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - mouseDownRef.current.x);
    const dy = Math.abs(touch.clientY - mouseDownRef.current.y);
    
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
        if (dragActivationTimerRef.current) {
          clearTimeout(dragActivationTimerRef.current);
          dragActivationTimerRef.current = null;
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
      canDragRef.current = false;
      if (dragActivationTimerRef.current) {
        clearTimeout(dragActivationTimerRef.current);
        dragActivationTimerRef.current = null;
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
    canDragRef.current = false;
    if (dragActivationTimerRef.current) {
      clearTimeout(dragActivationTimerRef.current);
      dragActivationTimerRef.current = null;
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
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        title="Dobbeltklikk for å redigere"
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
      </div>

      {/* Edit Project Modal - rendered via portal */}
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
