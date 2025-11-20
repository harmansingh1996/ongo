-- =====================================================
-- FIX: Chat Notification Trigger for conversation_messages table
-- =====================================================
-- This migration fixes the notification trigger to work with the
-- correct database schema: conversations + conversation_messages
--
-- Root Cause:
-- - Old trigger was listening to 'messages' table (doesn't exist)
-- - Actual table is 'conversation_messages' 
-- - Field names don't match (message → message_text, etc.)
-- - Need to look up receiver_id from conversations table
--
-- Fix:
-- 1. Update trigger to listen to conversation_messages table
-- 2. Map correct field names (message_text, is_read, etc.)
-- 3. Query conversations table to find receiver_id
-- 4. Handle cases where conversation doesn't have ride_id
-- =====================================================

-- Drop old trigger and function if they exist
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON messages;
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON conversation_messages;
DROP FUNCTION IF EXISTS notify_new_chat_message();

CREATE OR REPLACE FUNCTION notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_conversation RECORD;
  v_ride_request_id UUID;
BEGIN
  -- Get conversation details to find the recipient
  SELECT 
    driver_id, 
    passenger_id, 
    ride_request_id
  INTO v_conversation
  FROM conversations
  WHERE id = NEW.conversation_id;
  
  -- If conversation not found, can't create notification
  IF NOT FOUND THEN
    RAISE WARNING 'Conversation not found for message: %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Determine recipient (the person who is NOT the sender)
  IF NEW.sender_id = v_conversation.driver_id THEN
    v_recipient_id := v_conversation.passenger_id;
  ELSIF NEW.sender_id = v_conversation.passenger_id THEN
    v_recipient_id := v_conversation.driver_id;
  ELSE
    -- Sender is neither driver nor passenger - skip notification
    RAISE WARNING 'Sender % is not part of conversation %', NEW.sender_id, NEW.conversation_id;
    RETURN NEW;
  END IF;
  
  -- Don't create notification if recipient is the sender (shouldn't happen)
  IF v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;
  
  -- Get sender name from profiles
  SELECT COALESCE(name, email, 'Someone')
  INTO v_sender_name
  FROM profiles
  WHERE id = NEW.sender_id;
  
  -- Default sender name if not found
  IF v_sender_name IS NULL THEN
    v_sender_name := 'Someone';
  END IF;
  
  -- Get ride_request_id for the notification
  v_ride_request_id := v_conversation.ride_request_id;
  
  -- Create notification
  PERFORM create_notification(
    p_user_id := v_recipient_id,
    p_type := 'chat_message',
    p_title := 'New Message',
    p_message := v_sender_name || ': ' || LEFT(NEW.message_text, 50),
    p_conversation_id := NEW.conversation_id,
    p_sender_id := NEW.sender_id,
    p_ride_id := v_ride_request_id,
    p_action_url := '/chat/' || NEW.conversation_id::text
  );
  
  RETURN NEW;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the message insert
    RAISE WARNING 'Failed to create chat notification: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Create the trigger on the CORRECT table: conversation_messages
CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_chat_message();

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify trigger exists and is active
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.triggers 
    WHERE trigger_name = 'trigger_notify_chat_message'
      AND event_object_table = 'conversation_messages'
  ) THEN
    RAISE NOTICE '✅ SUCCESS: Trigger trigger_notify_chat_message is active on conversation_messages table';
  ELSE
    RAISE WARNING '❌ FAILED: Trigger trigger_notify_chat_message not found on conversation_messages';
  END IF;
END $$;

-- Verify function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'notify_new_chat_message'
  ) THEN
    RAISE NOTICE '✅ SUCCESS: Function notify_new_chat_message() exists';
  ELSE
    RAISE WARNING '❌ FAILED: Function notify_new_chat_message() not found';
  END IF;
END $$;

COMMENT ON FUNCTION notify_new_chat_message() IS 
  'Trigger function for conversation_messages table - creates notifications when new chat messages are sent';

-- Test query to see recent messages
-- SELECT 
--   cm.id,
--   cm.message_text,
--   cm.sender_id,
--   c.driver_id,
--   c.passenger_id,
--   cm.created_at
-- FROM conversation_messages cm
-- JOIN conversations c ON c.id = cm.conversation_id
-- ORDER BY cm.created_at DESC
-- LIMIT 10;
