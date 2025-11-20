-- Quick Fix for Missing Columns in ride_requests Table
-- Run this in your Supabase SQL Editor to fix the error:
-- "Could not find the 'confirmed_at' column of 'ride_requests'"

-- Add missing columns to ride_requests table
ALTER TABLE ride_requests 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS request_date TIMESTAMPTZ DEFAULT NOW();

-- Update existing rows to have request_date set to created_at if NULL
UPDATE ride_requests 
SET request_date = created_at 
WHERE request_date IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration fix completed successfully!';
  RAISE NOTICE 'Added columns: confirmed_at, request_date';
END $$;
