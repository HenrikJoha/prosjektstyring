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
}

export default function AssignmentBar({
  assignment,
  project,
  style,
  allDays,
  cellWidth,
  rowHeight,
}: AssignmentBarProps) {
  const { updateAssignment, deleteAssignment } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  
  // Store initial positions when drag starts
  const dragStartRef = useRef<{
    mouseX: number;
    barLeft: number;
    containerLeft: number;
    duration: number;
  } | null>(null);

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

  // Handle bar drag (move)
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const container = getContainer();
    if (!container) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
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

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    
    const container = getContainer();
    if (!container) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const containerRect = container.getBoundingClientRect();
    
    dragStartRef.current = {
      mouseX: clientX,
      barLeft: style.left,
      containerLeft: containerRect.left,
      duration: 0,
    };
    
    setIsResizing(side);
  }, [getContainer, style.left]);

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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteAssignment(assignment.id);
    setShowMenu(false);
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
        top: 8,
        height: rowHeight - 16,
        backgroundColor: project.color,
        color: textColor,
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {/* Resize handle left */}
      <div
        className="resize-handle resize-handle-left bg-black/20 hover:bg-black/40"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
        onTouchStart={(e) => handleResizeStart(e, 'left')}
      />

      {/* Content */}
      <div className="flex items-center h-full px-2 gap-1">
        <GripVertical size={14} className="flex-shrink-0 opacity-50" />
        <span className="text-sm font-medium truncate">{project.name}</span>
      </div>

      {/* Resize handle right */}
      <div
        className="resize-handle resize-handle-right bg-black/20 hover:bg-black/40"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
        onTouchStart={(e) => handleResizeStart(e, 'right')}
      />

      {/* Context menu */}
      {showMenu && (
        <div
          className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          onClick={(e) => e.stopPropagation()}
        >
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
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
          >
            <Trash2 size={16} />
            Fjern fra kalender
          </button>
        </div>
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
