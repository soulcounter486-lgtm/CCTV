-- Add employee_name column to kitchen_activity table.
-- Run once in Supabase SQL Editor.

ALTER TABLE kitchen_activity
  ADD COLUMN IF NOT EXISTS employee_name TEXT NOT NULL DEFAULT 'unknown';

-- Optional: index for per-employee queries
CREATE INDEX IF NOT EXISTS idx_kitchen_activity_employee
  ON kitchen_activity (employee_name);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'kitchen_activity'
ORDER BY ordinal_position;
