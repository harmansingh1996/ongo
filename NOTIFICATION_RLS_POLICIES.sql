-- Notification RLS (Row Level Security) Policies
-- Apply comprehensive security policies to ensure users can only access their own notifications

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Enable RLS on notification_preferences table
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON notification_preferences;

-- =============================================
-- NOTIFICATIONS TABLE POLICIES
-- =============================================

-- Policy: Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
ON notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can only update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Policy: System can create notifications for any user
-- This allows database triggers and server-side code to create notifications
CREATE POLICY "System can create notifications"
ON notifications
FOR INSERT
WITH CHECK (true);

-- =============================================
-- NOTIFICATION_PREFERENCES TABLE POLICIES
-- =============================================

-- Policy: Users can only view their own preferences
CREATE POLICY "Users can view own preferences"
ON notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can only update their own preferences
CREATE POLICY "Users can update own preferences"
ON notification_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can insert their own preferences (first time)
CREATE POLICY "Users can insert own preferences"
ON notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- =============================================
-- ADDITIONAL SECURITY MEASURES
-- =============================================

-- Ensure notification indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'notifications' 
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on notifications table';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'notification_preferences' 
    AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on notification_preferences table';
  END IF;
END $$;

-- Verification query (uncomment to test)
-- SELECT 
--   schemaname,
--   tablename,
--   policyname,
--   permissive,
--   roles,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies 
-- WHERE tablename IN ('notifications', 'notification_preferences')
-- ORDER BY tablename, policyname;
