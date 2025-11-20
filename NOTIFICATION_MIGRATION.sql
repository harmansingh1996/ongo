-- =====================================================
-- Notification System Migration (Adapted for Existing Schema)
-- =====================================================
-- Purpose: Create comprehensive in-app notification system
-- Features: Ride posts, chat, ride requests, bookings, payments
-- Adapted to work with existing conversations/messages structure
-- =====================================================

-- =====================================================
-- 1. CREATE NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification Type and Content
  type TEXT NOT NULL CHECK (type IN (
    'ride_post',           -- New ride matching user preferences
    'chat_message',        -- New chat message
    'ride_request',        -- Rider requests to join ride
    'booking_confirmed',   -- Driver accepted ride request
    'booking_rejected',    -- Driver rejected ride request
    'ride_started',        -- Driver started the ride
    'ride_completed',      -- Ride finished
    'payment_received',    -- Payment confirmation
    'cancellation',        -- Ride cancelled
    'rating_reminder',     -- Reminder to rate
    'refund_processed'     -- Refund completed
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Related Entity References (adapted to existing schema)
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,  -- Changed from chat_id
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Additional Data (JSON for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Status and Actions
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,  -- Deep link to relevant screen
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  
  -- Indexes for performance
  CONSTRAINT valid_read_status CHECK (
    (is_read = false AND read_at IS NULL) OR
    (is_read = true AND read_at IS NOT NULL)
  )
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Related entity lookups
CREATE INDEX IF NOT EXISTS idx_notifications_ride_id ON notifications(ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_booking_id ON notifications(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id ON notifications(conversation_id) WHERE conversation_id IS NOT NULL;

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- System can create notifications for any user
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can delete their own notifications (optional)
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- 4. NOTIFICATION PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification Type Preferences
  ride_post_enabled BOOLEAN DEFAULT true,
  chat_message_enabled BOOLEAN DEFAULT true,
  ride_request_enabled BOOLEAN DEFAULT true,
  booking_enabled BOOLEAN DEFAULT true,
  payment_enabled BOOLEAN DEFAULT true,
  rating_enabled BOOLEAN DEFAULT true,
  
  -- Delivery Preferences (future: push, email)
  in_app_enabled BOOLEAN DEFAULT true,
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON notification_preferences;

CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to create notification with automatic preference check
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_ride_id UUID DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,  -- Changed from p_chat_id
  p_sender_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_action_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_preferences RECORD;
BEGIN
  -- Get user preferences (create default if not exists)
  INSERT INTO notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT * INTO v_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id;
  
  -- Check if notification type is enabled
  IF NOT v_preferences.in_app_enabled THEN
    RETURN NULL;
  END IF;
  
  -- Type-specific checks
  IF (p_type = 'ride_post' AND NOT v_preferences.ride_post_enabled) OR
     (p_type = 'chat_message' AND NOT v_preferences.chat_message_enabled) OR
     (p_type = 'ride_request' AND NOT v_preferences.ride_request_enabled) OR
     (p_type IN ('booking_confirmed', 'booking_rejected') AND NOT v_preferences.booking_enabled) OR
     (p_type IN ('payment_received', 'refund_processed') AND NOT v_preferences.payment_enabled) OR
     (p_type = 'rating_reminder' AND NOT v_preferences.rating_enabled) THEN
    RETURN NULL;
  END IF;
  
  -- Create notification
  INSERT INTO notifications (
    user_id, type, title, message,
    ride_id, booking_id, conversation_id, sender_id,
    metadata, action_url
  )
  VALUES (
    p_user_id, p_type, p_title, p_message,
    p_ride_id, p_booking_id, p_conversation_id, p_sender_id,
    p_metadata, p_action_url
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
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

-- Function to get unread count
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

-- =====================================================
-- 6. AUTOMATIC NOTIFICATION TRIGGERS (ADAPTED)
-- =====================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON messages;
DROP TRIGGER IF EXISTS trigger_notify_ride_request ON bookings;
DROP TRIGGER IF EXISTS trigger_notify_booking_status ON bookings;

-- Trigger for new chat messages (adapted to existing messages table)
CREATE OR REPLACE FUNCTION notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_conversation_record RECORD;
BEGIN
  -- Recipient is stored directly in messages.receiver_id
  v_recipient_id := NEW.receiver_id;
  
  -- Don't notify sender (though this shouldn't happen with receiver_id)
  IF v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;
  
  -- Get sender name from profiles
  SELECT COALESCE(name, email)
  INTO v_sender_name
  FROM profiles
  WHERE id = NEW.sender_id;
  
  -- Try to get conversation_id from conversations table
  -- Match based on sender/receiver and ride_id
  SELECT id INTO v_conversation_record
  FROM conversations
  WHERE ride_id = NEW.ride_id
    AND (
      (driver_id = NEW.sender_id AND passenger_id = NEW.receiver_id) OR
      (driver_id = NEW.receiver_id AND passenger_id = NEW.sender_id)
    )
  LIMIT 1;
  
  -- Create notification
  PERFORM create_notification(
    p_user_id := v_recipient_id,
    p_type := 'chat_message',
    p_title := 'New Message',
    p_message := v_sender_name || ': ' || LEFT(NEW.message, 50),
    p_conversation_id := v_conversation_record,
    p_sender_id := NEW.sender_id,
    p_ride_id := NEW.ride_id,
    p_action_url := '/chat/' || NEW.ride_id
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_chat_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_chat_message();

-- Trigger for new ride requests (bookings)
CREATE OR REPLACE FUNCTION notify_new_ride_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_driver_id UUID;
  v_rider_name TEXT;
  v_ride_details TEXT;
BEGIN
  -- Only notify on new pending bookings
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;
  
  -- Get driver ID from ride
  SELECT driver_id INTO v_driver_id
  FROM rides
  WHERE id = NEW.ride_id;
  
  -- Get rider name
  SELECT COALESCE(name, email)
  INTO v_rider_name
  FROM profiles
  WHERE id = NEW.rider_id;
  
  -- Get ride details (using JSONB fields)
  SELECT 
    COALESCE((from_location->>'address')::text, 'Unknown') || ' → ' || 
    COALESCE((to_location->>'address')::text, 'Unknown')
  INTO v_ride_details
  FROM rides
  WHERE id = NEW.ride_id;
  
  -- Create notification for driver
  PERFORM create_notification(
    p_user_id := v_driver_id,
    p_type := 'ride_request',
    p_title := 'New Ride Request',
    p_message := v_rider_name || ' wants to join your ride: ' || v_ride_details,
    p_ride_id := NEW.ride_id,
    p_booking_id := NEW.id,
    p_sender_id := NEW.rider_id,
    p_action_url := '/driver/ride/' || NEW.ride_id
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_ride_request
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_ride_request();

-- Trigger for booking status changes
CREATE OR REPLACE FUNCTION notify_booking_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rider_name TEXT;
  v_driver_name TEXT;
  v_ride_details TEXT;
BEGIN
  -- Only notify on status changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  
  -- Get names
  SELECT COALESCE(name, email) INTO v_rider_name
  FROM profiles WHERE id = NEW.rider_id;
  
  SELECT COALESCE(p.name, p.email) INTO v_driver_name
  FROM profiles p
  JOIN rides r ON r.driver_id = p.id
  WHERE r.id = NEW.ride_id;
  
  -- Get ride details (using JSONB fields)
  SELECT 
    COALESCE((from_location->>'address')::text, 'Unknown') || ' → ' || 
    COALESCE((to_location->>'address')::text, 'Unknown')
  INTO v_ride_details
  FROM rides
  WHERE id = NEW.ride_id;
  
  -- Handle confirmed bookings (pending -> accepted/confirmed)
  IF NEW.status IN ('accepted', 'confirmed') AND OLD.status = 'pending' THEN
    PERFORM create_notification(
      p_user_id := NEW.rider_id,
      p_type := 'booking_confirmed',
      p_title := 'Booking Confirmed!',
      p_message := v_driver_name || ' accepted your ride request: ' || v_ride_details,
      p_ride_id := NEW.ride_id,
      p_booking_id := NEW.id,
      p_action_url := '/rider/ride-detail/' || NEW.id
    );
  END IF;
  
  -- Handle rejected bookings
  IF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    PERFORM create_notification(
      p_user_id := NEW.rider_id,
      p_type := 'booking_rejected',
      p_title := 'Booking Not Available',
      p_message := 'Your request for ' || v_ride_details || ' was not accepted',
      p_ride_id := NEW.ride_id,
      p_booking_id := NEW.id,
      p_action_url := '/rider/find-ride'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_booking_status
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_status_change();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE notifications IS 'In-app notification system for ride-sharing platform (adapted to existing schema)';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification types and delivery';
COMMENT ON COLUMN notifications.conversation_id IS 'Reference to conversations table (replaces chat_id from generic schema)';
