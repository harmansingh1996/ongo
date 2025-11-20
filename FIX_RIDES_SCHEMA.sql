-- =====================================================
-- Fix Rides Schema Issues
-- =====================================================
-- Purpose: Add missing completed_at column to rides table
--          and create missing notification functions
-- Issues Fixed:
--   1. Missing completed_at column in rides table
--   2. Missing get_unread_notification_count() function
-- =====================================================

-- =====================================================
-- 1. ADD COMPLETED_AT COLUMN TO RIDES TABLE
-- =====================================================

-- Add completed_at column if it doesn't exist
ALTER TABLE rides 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add index for completed rides queries
CREATE INDEX IF NOT EXISTS idx_rides_completed_at ON rides(completed_at) WHERE completed_at IS NOT NULL;

-- Update existing completed rides with timestamp
UPDATE rides
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

COMMENT ON COLUMN rides.completed_at IS 'Timestamp when ride was marked as completed';

-- =====================================================
-- 2. CREATE MISSING NOTIFICATION FUNCTIONS
-- =====================================================

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM notifications
  WHERE user_id = auth.uid()
    AND is_read = false;
  
  RETURN v_count;
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET is_read = true,
      read_at = now()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND is_read = false;
  
  RETURN FOUND;
END;
$$;

-- Function to mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET is_read = true,
      read_at = now()
  WHERE user_id = auth.uid()
    AND is_read = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =====================================================
-- 3. VERIFICATION QUERIES
-- =====================================================

-- Verify completed_at column exists
DO $$
DECLARE
  v_column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'rides' 
    AND column_name = 'completed_at'
  ) INTO v_column_exists;
  
  IF v_column_exists THEN
    RAISE NOTICE '✅ Column rides.completed_at exists';
  ELSE
    RAISE EXCEPTION '❌ Column rides.completed_at does not exist';
  END IF;
END $$;

-- Verify notification functions exist
DO $$
DECLARE
  v_function_exists BOOLEAN;
BEGIN
  -- Check get_unread_notification_count
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'get_unread_notification_count'
  ) INTO v_function_exists;
  
  IF v_function_exists THEN
    RAISE NOTICE '✅ Function get_unread_notification_count() exists';
  ELSE
    RAISE EXCEPTION '❌ Function get_unread_notification_count() does not exist';
  END IF;
  
  -- Check mark_notification_read
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'mark_notification_read'
  ) INTO v_function_exists;
  
  IF v_function_exists THEN
    RAISE NOTICE '✅ Function mark_notification_read() exists';
  ELSE
    RAISE EXCEPTION '❌ Function mark_notification_read() does not exist';
  END IF;
  
  -- Check mark_all_notifications_read
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'mark_all_notifications_read'
  ) INTO v_function_exists;
  
  IF v_function_exists THEN
    RAISE NOTICE '✅ Function mark_all_notifications_read() exists';
  ELSE
    RAISE EXCEPTION '❌ Function mark_all_notifications_read() does not exist';
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Rides schema fix completed successfully!';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Added completed_at column to rides table';
  RAISE NOTICE '  2. Created get_unread_notification_count() function';
  RAISE NOTICE '  3. Created mark_notification_read() function';
  RAISE NOTICE '  4. Created mark_all_notifications_read() function';
END $$;
