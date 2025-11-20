-- ============================================================
-- AUTOMATIC CHAT CLEANUP SYSTEM
-- ============================================================
-- This migration implements automatic cleanup of conversations and messages
-- when rides are completed or cancelled, matching the 8-hour cleanup window
-- used in the application's filterCleanupRides() function.
--
-- CLEANUP LOGIC:
-- 1. Conversations linked to completed/cancelled rides older than 8 hours
--    are automatically deleted via periodic cleanup
-- 2. Cascade delete removes all associated messages
-- 3. Frontend also filters out conversations for old completed/cancelled rides
-- ============================================================

-- ============================================================
-- SCHEDULED CLEANUP FUNCTION
-- ============================================================
-- This function cleans up conversations for rides that have been
-- completed or cancelled for more than 8 hours
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  count_deleted INTEGER;
BEGIN
  -- Delete conversations linked to completed/cancelled rides older than 8 hours
  WITH deleted AS (
    DELETE FROM conversations
    WHERE ride_request_id IN (
      SELECT rr.id 
      FROM ride_requests rr
      JOIN rides r ON r.id = rr.ride_id
      WHERE r.status IN ('completed', 'cancelled')
      AND (
        -- Check if ride has been completed/cancelled for more than 8 hours
        (r.completed_at IS NOT NULL AND r.completed_at < NOW() - INTERVAL '8 hours')
        OR
        (r.completed_at IS NULL AND r.updated_at < NOW() - INTERVAL '8 hours')
      )
    )
    RETURNING *
  )
  SELECT COUNT(*)::INTEGER INTO count_deleted FROM deleted;
  
  RAISE NOTICE 'Cleaned up % old conversations', count_deleted;
  RETURN QUERY SELECT count_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- IMMEDIATE CLEANUP
-- ============================================================
-- Run immediate cleanup of existing old conversations
-- ============================================================

DO $$
DECLARE
  cleanup_result INTEGER;
BEGIN
  SELECT * INTO cleanup_result FROM cleanup_old_conversations();
  RAISE NOTICE 'Initial cleanup: Deleted % old conversations', cleanup_result;
END $$;

-- ============================================================
-- USAGE INSTRUCTIONS
-- ============================================================
-- 
-- SCHEDULED CLEANUP (Recommended):
-- Run this function periodically (e.g., daily via cron job or scheduled task)
-- SELECT * FROM cleanup_old_conversations();
--
-- This will:
-- 1. Delete conversations for rides completed/cancelled > 8 hours ago
-- 2. Cascade delete all associated messages
-- 3. Return the number of conversations deleted
--
-- MANUAL CLEANUP (if needed):
-- SELECT * FROM cleanup_old_conversations();
--
-- FRONTEND FILTERING:
-- The frontend already filters out old completed/cancelled rides
-- This cleanup removes the data from the database permanently
-- ============================================================
