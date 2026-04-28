-- Workers table
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('prosjektleder', 'tømrer')),
  project_leader_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying workers by their project leader
CREATE INDEX idx_workers_project_leader ON workers(project_leader_id);

-- Enable RLS
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (you can restrict later with auth)
CREATE POLICY "Allow all operations on workers" ON workers
  FOR ALL USING (true) WITH CHECK (true);;
