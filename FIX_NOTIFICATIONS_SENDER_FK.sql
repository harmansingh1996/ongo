-- =====================================================
-- Fix Notifications Sender Foreign Key
-- =====================================================
-- Issue: notifications.sender_id references auth.users
--        but code expects it to reference profiles table
-- Error: PGRST200 - Could not find relationship 
--        'notifications_sender_id_fkey' to 'profiles'
-- =====================================================

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_sender_id_fkey;

-- Step 2: Add the correct foreign key to profiles table
ALTER TABLE notifications
  ADD CONSTRAINT notifications_sender_id_fkey 
  FOREIGN KEY (sender_id) 
  REFERENCES profiles(id) 
  ON DELETE SET NULL;

-- Step 3: Add index for performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id 
  ON notifications(sender_id) 
  WHERE sender_id IS NOT NULL;

-- =====================================================
-- Verification Query (run after migration)
-- =====================================================
-- SELECT 
--   conname as constraint_name,
--   conrelid::regclass as table_name,
--   confrelid::regclass as referenced_table
-- FROM pg_constraint
-- WHERE conname = 'notifications_sender_id_fkey';
-- 
-- Expected result: notifications_sender_id_fkey | notifications | profiles
-- =====================================================
