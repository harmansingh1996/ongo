-- Fix for missing expiry_date column in driver_licenses table
-- Error: Could not find the 'expiry_date' column of 'driver_licenses' in the schema cache

-- Add expiry_date column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN expiry_date DATE NOT NULL DEFAULT CURRENT_DATE;
    RAISE NOTICE 'Added expiry_date column to driver_licenses';
  ELSE
    RAISE NOTICE 'expiry_date column already exists';
  END IF;
END $$;

-- Remove the default after adding the column (so new records require expiry_date)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE driver_licenses ALTER COLUMN expiry_date DROP DEFAULT;
    RAISE NOTICE 'Removed default from expiry_date column';
  END IF;
END $$;

-- Create index on expiry_date if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_driver_licenses_expiry ON driver_licenses(expiry_date);

-- Verification
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'expiry_date'
  ) INTO col_exists;
  
  IF col_exists THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fix applied successfully!';
    RAISE NOTICE 'driver_licenses.expiry_date column exists';
    RAISE NOTICE '========================================';
  ELSE
    RAISE WARNING 'Failed to add expiry_date column';
  END IF;
END $$;
