-- Comprehensive fix for driver_licenses table schema
-- This script ensures all required columns exist for the licence verification system

-- ============================================================
-- Fix: Add ALL missing columns to driver_licenses table
-- ============================================================

DO $$
BEGIN
  -- Add licence_number column (CRITICAL - main error)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'licence_number'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN licence_number VARCHAR(100) NOT NULL DEFAULT 'TEMP-LICENCE';
    RAISE NOTICE 'Added licence_number column to driver_licenses';
  ELSE
    RAISE NOTICE 'licence_number column already exists';
  END IF;

  -- Add expiry_date column
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

  -- Add issue_date column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'issue_date'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN issue_date DATE;
    RAISE NOTICE 'Added issue_date column to driver_licenses';
  ELSE
    RAISE NOTICE 'issue_date column already exists';
  END IF;

  -- Add licence_class column
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

  -- Add issuing_country column
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

  -- Add issuing_state column
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

  -- Add front_image_url column
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

  -- Add back_image_url column
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

  -- Add is_verified column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
    RAISE NOTICE 'Added is_verified column to driver_licenses';
  ELSE
    RAISE NOTICE 'is_verified column already exists';
  END IF;

  -- Add verification_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN verification_status VARCHAR(20) DEFAULT 'pending';
    RAISE NOTICE 'Added verification_status column to driver_licenses';
  ELSE
    RAISE NOTICE 'verification_status column already exists';
  END IF;

  -- Add verification_notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'verification_notes'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN verification_notes TEXT;
    RAISE NOTICE 'Added verification_notes column to driver_licenses';
  ELSE
    RAISE NOTICE 'verification_notes column already exists';
  END IF;

  -- Add verified_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN verified_at TIMESTAMPTZ;
    RAISE NOTICE 'Added verified_at column to driver_licenses';
  ELSE
    RAISE NOTICE 'verified_at column already exists';
  END IF;

  -- Add created_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added created_at column to driver_licenses';
  ELSE
    RAISE NOTICE 'created_at column already exists';
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE driver_licenses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Added updated_at column to driver_licenses';
  ELSE
    RAISE NOTICE 'updated_at column already exists';
  END IF;
END $$;

-- Remove default from temporary columns if they were just added
DO $$
BEGIN
  -- Remove default from licence_number if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'licence_number'
  ) THEN
    ALTER TABLE driver_licenses ALTER COLUMN licence_number DROP DEFAULT;
    RAISE NOTICE 'Removed default from licence_number column';
  END IF;

  -- Remove default from expiry_date if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE driver_licenses ALTER COLUMN expiry_date DROP DEFAULT;
    RAISE NOTICE 'Removed default from expiry_date column';
  END IF;
END $$;

-- Add constraint for verification_status if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'driver_licenses_verification_status_check'
  ) THEN
    ALTER TABLE driver_licenses 
    ADD CONSTRAINT driver_licenses_verification_status_check 
    CHECK (verification_status IN ('pending', 'verified', 'rejected'));
    RAISE NOTICE 'Added verification_status constraint';
  ELSE
    RAISE NOTICE 'verification_status constraint already exists';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_driver_licenses_user_id ON driver_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_licenses_verification ON driver_licenses(verification_status);
CREATE INDEX IF NOT EXISTS idx_driver_licenses_expiry ON driver_licenses(expiry_date);

-- Verification
DO $$
DECLARE
  licence_number_exists BOOLEAN;
  expiry_date_exists BOOLEAN;
  licence_class_exists BOOLEAN;
  issuing_country_exists BOOLEAN;
  issuing_state_exists BOOLEAN;
  front_image_exists BOOLEAN;
  back_image_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'licence_number'
  ) INTO licence_number_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'expiry_date'
  ) INTO expiry_date_exists;

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

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'front_image_url'
  ) INTO front_image_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'driver_licenses' 
    AND column_name = 'back_image_url'
  ) INTO back_image_exists;

  IF licence_number_exists AND expiry_date_exists AND licence_class_exists 
     AND issuing_country_exists AND issuing_state_exists 
     AND front_image_exists AND back_image_exists THEN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fix applied successfully!';
    RAISE NOTICE 'driver_licenses.licence_number column exists ✓';
    RAISE NOTICE 'driver_licenses.expiry_date column exists ✓';
    RAISE NOTICE 'driver_licenses.licence_class column exists ✓';
    RAISE NOTICE 'driver_licenses.issuing_country column exists ✓';
    RAISE NOTICE 'driver_licenses.issuing_state column exists ✓';
    RAISE NOTICE 'driver_licenses.front_image_url column exists ✓';
    RAISE NOTICE 'driver_licenses.back_image_url column exists ✓';
    RAISE NOTICE '========================================';
  ELSE
    RAISE WARNING 'Some columns still missing! Please run this script again.';
  END IF;
END $$;
