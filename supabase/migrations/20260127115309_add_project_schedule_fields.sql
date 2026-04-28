-- Add planned start date and duration fields to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS planned_start_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT NULL;

-- Add index for querying by start date
CREATE INDEX IF NOT EXISTS idx_projects_planned_start_date ON projects(planned_start_date);;
