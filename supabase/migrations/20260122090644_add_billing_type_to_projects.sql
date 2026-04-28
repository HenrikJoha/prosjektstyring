-- Add billing_type column to projects table
-- 'tilbud' = standard with A konto percentage
-- 'timer_materiell' = manually enter invoiced amount
ALTER TABLE projects 
ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'tilbud' CHECK (billing_type IN ('tilbud', 'timer_materiell'));

-- Add fakturert column for manual entry (used for timer_materiell type)
ALTER TABLE projects 
ADD COLUMN fakturert NUMERIC(12,2) NOT NULL DEFAULT 0;;
