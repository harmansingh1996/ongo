-- Fix for missing licence_class column in driver_licenses table
-- Error: Could not find the 'licence_class' column of 'driver_licenses' in the schema cache

-- Add licence_class column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'licence_class'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN licence_class VARCHAR(50);
    RAISE NOTICE 'Added licence_class column to driver_licenses';
  ELSE
    RAISE NOTICE 'licence_class column already exists';
  END IF;
END $$;

-- Add issuing_country column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'issuing_country'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN issuing_country VARCHAR(100);
    RAISE NOTICE 'Added issuing_country column to driver_licenses';
  ELSE
    RAISE NOTICE 'issuing_country column already exists';
  END IF;
END $$;

-- Add issuing_state column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'issuing_state'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN issuing_state VARCHAR(100);
    RAISE NOTICE 'Added issuing_state column to driver_licenses';
  ELSE
    RAISE NOTICE 'issuing_state column already exists';
  END IF;
END $$;

-- Verification
DO $$
DECLARE
  licence_class_exists BOOLEAN;
  issuing_country_exists BOOLEAN;
  issuing_state_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'licence_class'
  ) INTO licence_class_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'issuing_country'
  ) INTO issuing_country_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'issuing_state'
  ) INTO issuing_state_exists;
  
  IF licence_class_exists AND issuing_country_exists AND issuing_state_exists THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fix applied successfully!';
    RAISE NOTICE 'driver_licenses.licence_class column exists';
    RAISE NOTICE 'driver_licenses.issuing_country column exists';
    RAISE NOTICE 'driver_licenses.issuing_state column exists';
    RAISE NOTICE '========================================';
  ELSE
    RAISE WARNING 'Failed to add one or more columns';
  END IF;
END $$;
