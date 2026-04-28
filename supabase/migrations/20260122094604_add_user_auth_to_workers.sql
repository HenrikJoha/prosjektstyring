-- Add user_id column to workers table to link Supabase auth users
-- This allows project leaders to log in using their email
ALTER TABLE workers 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_workers_user_id ON workers(user_id);

-- Add admin role flag (optional, for future use)
-- We'll identify admin by checking if user_id exists in a separate admin table or by email
-- For now, we'll use a simple approach: if user_id is NULL or if email matches admin pattern;
