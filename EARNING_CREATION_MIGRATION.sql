-- Migration: Add completed_at column to rides table
-- This column tracks when a ride was marked as completed
-- Used for automatic earning creation workflow

-- Add completed_at column to rides table if it doesn't exist
ALTER TABLE rides 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_rides_completed_at ON rides(completed_at);

-- Add comment to document the column
COMMENT ON COLUMN rides.completed_at IS 'Timestamp when the ride was marked as completed. Used to trigger earning creation.';

-- Verify the migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'rides' AND column_name = 'completed_at';
