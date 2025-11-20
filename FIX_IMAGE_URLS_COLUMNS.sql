-- Fix for missing front_image_url and back_image_url columns in driver_licenses table
-- Error: Could not find the 'front_image_url' column of 'driver_licenses' in the schema cache

-- Add front_image_url column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'front_image_url'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN front_image_url TEXT;
    RAISE NOTICE 'Added front_image_url column to driver_licenses';
  ELSE
    RAISE NOTICE 'front_image_url column already exists';
  END IF;
END $$;

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

-- Verification
DO $$
DECLARE
  front_col_exists BOOLEAN;
  back_col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'front_image_url'
  ) INTO front_col_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'back_image_url'
  ) INTO back_col_exists;
  
  IF front_col_exists AND back_col_exists THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fix applied successfully!';
    RAISE NOTICE 'driver_licenses.front_image_url column exists';
    RAISE NOTICE 'driver_licenses.back_image_url column exists';
    RAISE NOTICE '========================================';
  ELSE
    RAISE WARNING 'Failed to add one or both image URL columns';
  END IF;
END $$;
