-- Create app_users table for simple username/password authentication
-- This is separate from Supabase Auth and handles app-specific user management

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'prosjektleder')),
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  profile_color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for profile icon background
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_worker_id ON app_users(worker_id);

-- Enable RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- RLS policies: Allow all operations for now (will be secured later with proper auth)
CREATE POLICY "Allow all read operations on app_users" ON app_users FOR SELECT USING (true);
CREATE POLICY "Allow all insert operations on app_users" ON app_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update operations on app_users" ON app_users FOR UPDATE USING (true);
CREATE POLICY "Allow all delete operations on app_users" ON app_users FOR DELETE USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_app_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_app_users_updated_at();;
