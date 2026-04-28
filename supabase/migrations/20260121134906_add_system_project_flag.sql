-- Add is_system flag to prevent deletion of sick leave/vacation projects
ALTER TABLE projects ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT false;

-- Mark existing sick leave and vacation projects as system projects
UPDATE projects SET is_system = true WHERE project_type IN ('sick_leave', 'vacation');;
