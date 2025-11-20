-- Add driver_locations table for real-time GPS tracking
-- This migration adds the missing table that locationService.ts requires

-- ============================================================
-- Create driver_locations table
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  heading DECIMAL(5, 2),
  speed DECIMAL(6, 2),
  accuracy DECIMAL(8, 2),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for driver_locations
CREATE INDEX IF NOT EXISTS idx_driver_locations_ride_id ON driver_locations(ride_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_timestamp ON driver_locations(timestamp DESC);

-- Enable RLS on driver_locations
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_locations
-- Allow anyone to view locations (for real-time tracking by riders)
CREATE POLICY "Anyone can view driver locations"
  ON driver_locations FOR SELECT
  USING (true);

-- Allow authenticated users to insert their own locations
CREATE POLICY "Drivers can insert their own locations"
  ON driver_locations FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Allow drivers to update their own locations (optional, for corrections)
CREATE POLICY "Drivers can update their own locations"
  ON driver_locations FOR UPDATE
  USING (auth.uid() = driver_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'driver_locations table created successfully!';
  RAISE NOTICE 'RLS policies applied for location tracking';
END $$;
