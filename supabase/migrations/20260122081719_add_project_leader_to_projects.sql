-- Add project_leader_id column to projects table
ALTER TABLE projects 
ADD COLUMN project_leader_id UUID REFERENCES workers(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_projects_project_leader ON projects(project_leader_id);;
