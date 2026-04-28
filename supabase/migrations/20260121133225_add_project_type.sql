-- Add project type column
ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'regular' 
  CHECK (project_type IN ('regular', 'sick_leave', 'vacation'));;
