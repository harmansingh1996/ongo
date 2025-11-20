-- ========================================
-- Driver Licenses Table Recreation
-- ========================================
-- Date: 2025-11-17
-- Purpose: Drop and recreate driver_licenses table with correct schema
-- WARNING: This will delete all existing data in driver_licenses table
--
-- Schema designed to match src/services/licenceService.ts interface
-- ========================================

-- Step 1: Drop existing table
DROP TABLE IF EXISTS driver_licenses CASCADE;

-- Step 2: Recreate table with correct schema
CREATE TABLE driver_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core licence information (required fields)
  licence_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  
  -- Optional licence details
  issuing_country VARCHAR(100),
  issuing_state VARCHAR(100),
  licence_class VARCHAR(50),
  
  -- Image storage
  front_image_url TEXT,
  back_image_url TEXT,
  
  -- Verification system
  is_verified BOOLEAN DEFAULT FALSE NOT NULL,
  verification_status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_notes TEXT,
  verified_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Step 3: Create indexes for performance
CREATE INDEX idx_driver_licenses_user_id ON driver_licenses(user_id);
CREATE INDEX idx_driver_licenses_verification_status ON driver_licenses(verification_status);
CREATE INDEX idx_driver_licenses_expiry_date ON driver_licenses(expiry_date);

-- Step 4: Add table documentation
COMMENT ON TABLE driver_licenses IS 'Driver license information for verification and compliance';

-- Step 5: Enable Row Level Security
ALTER TABLE driver_licenses ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies
-- Policy: Users can read their own license
CREATE POLICY "Users can read own license" ON driver_licenses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own license
CREATE POLICY "Users can insert own license" ON driver_licenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own license
CREATE POLICY "Users can update own license" ON driver_licenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own license
CREATE POLICY "Users can delete own license" ON driver_licenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- Verification
-- ========================================
-- Check table structure
SELECT 
  column_name, 
  data_type, 
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'driver_licenses' 
ORDER BY ordinal_position;
