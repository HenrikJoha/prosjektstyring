CREATE TABLE IF NOT EXISTS project_leader_calendar_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_leader_a_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_leader_b_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_leader_calendar_links_distinct CHECK (
    project_leader_a_id <> project_leader_b_id
  ),
  CONSTRAINT project_leader_calendar_links_unique UNIQUE (
    project_leader_a_id,
    project_leader_b_id
  )
);

CREATE INDEX IF NOT EXISTS idx_project_leader_calendar_links_a
  ON project_leader_calendar_links(project_leader_a_id);

CREATE INDEX IF NOT EXISTS idx_project_leader_calendar_links_b
  ON project_leader_calendar_links(project_leader_b_id);

CREATE OR REPLACE FUNCTION normalize_project_leader_calendar_link()
RETURNS TRIGGER AS $$
DECLARE
  original_a UUID;
BEGIN
  IF NEW.project_leader_a_id = NEW.project_leader_b_id THEN
    RAISE EXCEPTION 'A project leader cannot be linked to itself';
  END IF;

  IF NEW.project_leader_a_id > NEW.project_leader_b_id THEN
    original_a := NEW.project_leader_a_id;
    NEW.project_leader_a_id := NEW.project_leader_b_id;
    NEW.project_leader_b_id := original_a;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_normalize_project_leader_calendar_link
  ON project_leader_calendar_links;

CREATE TRIGGER trigger_normalize_project_leader_calendar_link
  BEFORE INSERT OR UPDATE ON project_leader_calendar_links
  FOR EACH ROW
  EXECUTE FUNCTION normalize_project_leader_calendar_link();

CREATE OR REPLACE FUNCTION ensure_project_leader_calendar_link_roles()
RETURNS TRIGGER AS $$
DECLARE
  leader_a_role TEXT;
  leader_b_role TEXT;
BEGIN
  SELECT role INTO leader_a_role FROM workers WHERE id = NEW.project_leader_a_id;
  SELECT role INTO leader_b_role FROM workers WHERE id = NEW.project_leader_b_id;

  IF leader_a_role IS DISTINCT FROM 'prosjektleder' OR leader_b_role IS DISTINCT FROM 'prosjektleder' THEN
    RAISE EXCEPTION 'Calendar links can only connect project leaders';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_project_leader_calendar_link_roles
  ON project_leader_calendar_links;

CREATE TRIGGER trigger_ensure_project_leader_calendar_link_roles
  BEFORE INSERT OR UPDATE ON project_leader_calendar_links
  FOR EACH ROW
  EXECUTE FUNCTION ensure_project_leader_calendar_link_roles();

ALTER TABLE project_leader_calendar_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on project_leader_calendar_links"
  ON project_leader_calendar_links;

CREATE POLICY "Allow all operations on project_leader_calendar_links"
  ON project_leader_calendar_links
  FOR ALL
  USING (true)
  WITH CHECK (true);
