-- Driver Licence Management System Migration
-- This creates the database table for storing driver licence information

-- Create driver_licenses table
CREATE TABLE IF NOT EXISTS driver_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  licence_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  issue_date DATE,
  issuing_country VARCHAR(100),
  issuing_state VARCHAR(100),
  licence_class VARCHAR(50),
  front_image_url TEXT,
  back_image_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_notes TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one licence per user
  CONSTRAINT unique_user_licence UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_driver_licenses_user_id ON driver_licenses(user_id);

-- Create index on verification status for admin queries
CREATE INDEX IF NOT EXISTS idx_driver_licenses_verification ON driver_licenses(verification_status);

-- Create index on expiry date for reminder queries
CREATE INDEX IF NOT EXISTS idx_driver_licenses_expiry ON driver_licenses(expiry_date);

-- Enable Row Level Security
ALTER TABLE driver_licenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Drivers can view their own licence
CREATE POLICY "Drivers can view own licence"
  ON driver_licenses FOR SELECT
  USING (auth.uid() = user_id);

-- Drivers can insert their own licence
CREATE POLICY "Drivers can insert own licence"
  ON driver_licenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Drivers can update their own licence
CREATE POLICY "Drivers can update own licence"
  ON driver_licenses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: Verification status changes should be handled by admin functions
-- For now, drivers can update but is_verified should be controlled by backend

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_driver_license_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_driver_license_timestamp
  BEFORE UPDATE ON driver_licenses
  FOR EACH ROW
  EXECUTE FUNCTION update_driver_license_updated_at();

-- Function to set verified_at when verification status changes to verified
CREATE OR REPLACE FUNCTION set_driver_license_verified_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verification_status = 'verified' AND OLD.verification_status != 'verified' THEN
    NEW.verified_at = NOW();
    NEW.is_verified = TRUE;
  ELSIF NEW.verification_status != 'verified' THEN
    NEW.is_verified = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set verified_at
CREATE TRIGGER set_verified_timestamp
  BEFORE UPDATE ON driver_licenses
  FOR EACH ROW
  EXECUTE FUNCTION set_driver_license_verified_at();

COMMENT ON TABLE driver_licenses IS 'Stores driver licence information for verification and compliance';
COMMENT ON COLUMN driver_licenses.user_id IS 'Reference to the driver''s profile';
COMMENT ON COLUMN driver_licenses.licence_number IS 'Driver licence number';
COMMENT ON COLUMN driver_licenses.expiry_date IS 'Licence expiry date for reminder notifications';
COMMENT ON COLUMN driver_licenses.is_verified IS 'Whether the licence has been verified by admin';
COMMENT ON COLUMN driver_licenses.verification_status IS 'Current verification status: pending, verified, rejected';
COMMENT ON COLUMN driver_licenses.front_image_url IS 'URL to front image of licence (Supabase Storage)';
COMMENT ON COLUMN driver_licenses.back_image_url IS 'URL to back image of licence (Supabase Storage)';
