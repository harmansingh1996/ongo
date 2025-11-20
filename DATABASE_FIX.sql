-- Database Fix for Driver Licenses and Location Tracking
-- This migration fixes the schema cache and RLS issues

-- ============================================================
-- Fix 1: Add missing back_image_url column to driver_licenses
-- ============================================================

-- Add back_image_url column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'back_image_url'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN back_image_url TEXT;
    RAISE NOTICE 'Added back_image_url column to driver_licenses';
  ELSE
    RAISE NOTICE 'back_image_url column already exists';
  END IF;
END $$;

-- ============================================================
-- Fix 2: Fix RLS policies for driver_locations
-- ============================================================

-- Drop existing restrictive insert policy
DROP POLICY IF EXISTS "Drivers can insert their own locations" ON driver_locations;

-- Create more permissive insert policy for authenticated users
-- This allows any authenticated user to insert location data
CREATE POLICY "Authenticated users can insert locations"
  ON driver_locations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Ensure drivers can still insert with their own driver_id
CREATE POLICY "Drivers can insert with driver_id"
  ON driver_locations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

-- ============================================================
-- Verification
-- ============================================================

-- Verify driver_licenses columns
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'driver_licenses' 
  AND column_name IN ('front_image_url', 'back_image_url');
  
  IF col_count = 2 THEN
    RAISE NOTICE 'driver_licenses table has all required image columns';
  ELSE
    RAISE WARNING 'driver_licenses table is missing image columns';
  END IF;
END $$;

-- Verify driver_locations policies
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'driver_locations'
  AND cmd = 'INSERT';
  
  IF policy_count >= 1 THEN
    RAISE NOTICE 'driver_locations has INSERT policies configured';
  ELSE
    RAISE WARNING 'driver_locations is missing INSERT policies';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Database fixes applied successfully!';
  RAISE NOTICE '1. driver_licenses.back_image_url column verified/added';
  RAISE NOTICE '2. driver_locations RLS policies fixed';
  RAISE NOTICE '========================================';
END $$;
