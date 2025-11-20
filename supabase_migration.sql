-- OnGoPool Supabase Database Migration
-- This file contains all necessary table modifications and new tables for the complete app

-- ============================================================
-- 1. Update profiles table with additional fields
-- ============================================================

-- Add missing columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zipcode TEXT,
ADD COLUMN IF NOT EXISTS profile_image TEXT,
ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS total_rides INTEGER DEFAULT 0;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON profiles(rating);

-- ============================================================
-- 2. Create rides table (if not exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_location JSONB NOT NULL,
  to_location JSONB NOT NULL,
  stops JSONB DEFAULT '[]',
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  available_seats INTEGER NOT NULL,
  price_per_seat DECIMAL(10,2) NOT NULL,
  price_per_km DECIMAL(10,2),
  distance DECIMAL(10,2),
  duration INTEGER,
  estimated_arrival TEXT,
  route_data JSONB,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'canceled')),
  ride_policy_accepted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for rides
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_date ON rides(date);

-- Enable RLS on rides
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rides
CREATE POLICY "Users can view all rides"
  ON rides FOR SELECT
  USING (true);

CREATE POLICY "Drivers can insert their own rides"
  ON rides FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own rides"
  ON rides FOR UPDATE
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can delete their own rides"
  ON rides FOR DELETE
  USING (auth.uid() = driver_id);

-- ============================================================
-- 3. Create bookings table (if not exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seats_booked INTEGER NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled')),
  pickup_location JSONB,
  dropoff_location JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for bookings
CREATE INDEX IF NOT EXISTS idx_bookings_ride_id ON bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_rider_id ON bookings(rider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Enable RLS on bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookings
CREATE POLICY "Users can view their own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = rider_id OR auth.uid() IN (SELECT driver_id FROM rides WHERE rides.id = bookings.ride_id));

CREATE POLICY "Riders can insert their own bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = rider_id);

CREATE POLICY "Riders can update their own bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = rider_id);

CREATE POLICY "Riders can delete their own bookings"
  ON bookings FOR DELETE
  USING (auth.uid() = rider_id);

-- ============================================================
-- 4. Create payment_methods table (for riders)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'paypal')),
  card_number TEXT NOT NULL, -- Last 4 digits only
  expiry_date TEXT NOT NULL,
  cardholder_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(user_id, is_default);

-- Enable RLS on payment_methods
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_methods
CREATE POLICY "Users can view their own payment methods"
  ON payment_methods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment methods"
  ON payment_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment methods"
  ON payment_methods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payment methods"
  ON payment_methods FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Create payment_history table (for riders)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('paid', 'authorized', 'pending', 'refunded')),
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for payment_history
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_ride_id ON payment_history(ride_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_date ON payment_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_transaction_id ON payment_history(transaction_id);

-- Enable RLS on payment_history
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_history
CREATE POLICY "Users can view their own payment history"
  ON payment_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment history"
  ON payment_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment history"
  ON payment_history FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. Create driver_earnings table
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing')),
  date TIMESTAMPTZ NOT NULL,
  payout_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for driver_earnings
CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver_id ON driver_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_ride_id ON driver_earnings(ride_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_status ON driver_earnings(status);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_date ON driver_earnings(date DESC);

-- Enable RLS on driver_earnings
ALTER TABLE driver_earnings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_earnings
CREATE POLICY "Drivers can view their own earnings"
  ON driver_earnings FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "System can insert driver earnings"
  ON driver_earnings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Drivers can update their own earnings"
  ON driver_earnings FOR UPDATE
  USING (auth.uid() = driver_id);

-- ============================================================
-- 7. Create payout_methods table (for drivers)
-- ============================================================

CREATE TABLE IF NOT EXISTS payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  institution_number TEXT NOT NULL,
  transit_number TEXT NOT NULL,
  account_number TEXT NOT NULL, -- Encrypted
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for payout_methods
CREATE INDEX IF NOT EXISTS idx_payout_methods_driver_id ON payout_methods(driver_id);
CREATE INDEX IF NOT EXISTS idx_payout_methods_is_default ON payout_methods(driver_id, is_default);

-- Enable RLS on payout_methods
ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payout_methods
CREATE POLICY "Drivers can view their own payout methods"
  ON payout_methods FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert their own payout methods"
  ON payout_methods FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own payout methods"
  ON payout_methods FOR UPDATE
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can delete their own payout methods"
  ON payout_methods FOR DELETE
  USING (auth.uid() = driver_id);

-- ============================================================
-- 8. Create messages table (for chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_ride_id ON messages(ride_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id);

-- Enable RLS on messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages
CREATE POLICY "Users can view messages they sent or received"
  ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update messages they sent or received"
  ON messages FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can delete messages they sent"
  ON messages FOR DELETE
  USING (auth.uid() = sender_id);

-- ============================================================
-- 9. Create referrals table
-- ============================================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL DEFAULT 10,
  total_referrals INTEGER DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- Enable RLS on referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referrals
CREATE POLICY "Users can view their own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own referrals"
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own referrals"
  ON referrals FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 10. Create referral_uses table
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT NOT NULL,
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discount_applied DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired')),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for referral_uses
CREATE INDEX IF NOT EXISTS idx_referral_uses_code ON referral_uses(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred ON referral_uses(referred_user_id);

-- Enable RLS on referral_uses
ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_uses
CREATE POLICY "Users can view referral uses they're involved in"
  ON referral_uses FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY "System can insert referral uses"
  ON referral_uses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referral uses"
  ON referral_uses FOR UPDATE
  USING (true);

-- ============================================================
-- 11. Create reviews table (for ratings)
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewer_id, reviewed_user_id, ride_id)
);

-- Add indexes for reviews
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_user_id ON reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_ride_id ON reviews(ride_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

-- Enable RLS on reviews
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reviews
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can insert reviews for others"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id AND reviewer_id != reviewed_user_id);

CREATE POLICY "Users can update their own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

CREATE POLICY "Users can delete their own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = reviewer_id);

-- ============================================================
-- 12. Create triggers for updated_at timestamps
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for all tables
DROP TRIGGER IF EXISTS update_rides_updated_at ON rides;
CREATE TRIGGER update_rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_history_updated_at ON payment_history;
CREATE TRIGGER update_payment_history_updated_at
  BEFORE UPDATE ON payment_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_earnings_updated_at ON driver_earnings;
CREATE TRIGGER update_driver_earnings_updated_at
  BEFORE UPDATE ON driver_earnings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payout_methods_updated_at ON payout_methods;
CREATE TRIGGER update_payout_methods_updated_at
  BEFORE UPDATE ON payout_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_referrals_updated_at ON referrals;
CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 13. Create ride_requests table
-- ============================================================

CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_seats INTEGER NOT NULL,
  pickup_location JSONB NOT NULL,
  dropoff_location JSONB NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  request_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for ride_requests
CREATE INDEX IF NOT EXISTS idx_ride_requests_ride_id ON ride_requests(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger_id ON ride_requests(passenger_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);

-- Enable RLS on ride_requests
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ride_requests
CREATE POLICY "Users can view ride requests for their rides"
  ON ride_requests FOR SELECT
  USING (
    auth.uid() = passenger_id OR 
    auth.uid() IN (SELECT driver_id FROM rides WHERE rides.id = ride_requests.ride_id)
  );

CREATE POLICY "Passengers can create ride requests"
  ON ride_requests FOR INSERT
  WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "Passengers and drivers can update ride requests"
  ON ride_requests FOR UPDATE
  USING (
    auth.uid() = passenger_id OR 
    auth.uid() IN (SELECT driver_id FROM rides WHERE rides.id = ride_requests.ride_id)
  );

DROP TRIGGER IF EXISTS update_ride_requests_updated_at ON ride_requests;
CREATE TRIGGER update_ride_requests_updated_at
  BEFORE UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 14. Create ride_request_price table
-- ============================================================

CREATE TABLE IF NOT EXISTS ride_request_price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_lat NUMERIC(10, 7) NOT NULL,
  start_lng NUMERIC(10, 7) NOT NULL,
  end_lat NUMERIC(10, 7) NOT NULL,
  end_lng NUMERIC(10, 7) NOT NULL,
  distance_meters INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for ride_request_price
CREATE INDEX IF NOT EXISTS idx_ride_request_price_ride_request_id ON ride_request_price(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_ride_request_price_segment_index ON ride_request_price(segment_index);

-- Enable RLS on ride_request_price
ALTER TABLE ride_request_price ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ride_request_price
CREATE POLICY "Users can view prices for their ride requests"
  ON ride_request_price FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ride_requests
      WHERE ride_requests.id = ride_request_price.ride_request_id
        AND (
          ride_requests.passenger_id = auth.uid() OR
          auth.uid() IN (SELECT driver_id FROM rides WHERE rides.id = ride_requests.ride_id)
        )
    )
  );

CREATE POLICY "Users can insert prices for their ride requests"
  ON ride_request_price FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ride_requests
      WHERE ride_requests.id = ride_request_price.ride_request_id
        AND ride_requests.passenger_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_ride_request_price_updated_at ON ride_request_price;
CREATE TRIGGER update_ride_request_price_updated_at
  BEFORE UPDATE ON ride_request_price
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 15. Create conversations table (for chat)
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ride_request_id)
);

-- Add indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_driver_id ON conversations(driver_id);
CREATE INDEX IF NOT EXISTS idx_conversations_passenger_id ON conversations(passenger_id);
CREATE INDEX IF NOT EXISTS idx_conversations_ride_request_id ON conversations(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);

-- Enable RLS on conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = driver_id OR auth.uid() = passenger_id);

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = driver_id OR auth.uid() = passenger_id);

CREATE POLICY "Users can update their own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = driver_id OR auth.uid() = passenger_id);

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 16. Create conversation_messages table (separate from old messages)
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for conversation_messages
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender_id ON conversation_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at DESC);

-- Enable RLS on conversation_messages
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_messages
CREATE POLICY "Users can view messages in their conversations"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND (conversations.driver_id = auth.uid() OR conversations.passenger_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND (conversations.driver_id = auth.uid() OR conversations.passenger_id = auth.uid())
    )
  );

CREATE POLICY "Users can update messages in their conversations"
  ON conversation_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND (conversations.driver_id = auth.uid() OR conversations.passenger_id = auth.uid())
    )
  );

DROP TRIGGER IF EXISTS update_conversation_messages_updated_at ON conversation_messages;
CREATE TRIGGER update_conversation_messages_updated_at
  BEFORE UPDATE ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_message_at when a new message is sent
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_last_message_trigger ON conversation_messages;
CREATE TRIGGER update_conversation_last_message_trigger
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================
-- 17. Migration complete
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Tables created/updated:';
  RAISE NOTICE '  - profiles (with additional fields)';
  RAISE NOTICE '  - rides';
  RAISE NOTICE '  - bookings';
  RAISE NOTICE '  - payment_methods (for riders)';
  RAISE NOTICE '  - payment_history (for riders)';
  RAISE NOTICE '  - driver_earnings';
  RAISE NOTICE '  - payout_methods (for drivers)';
  RAISE NOTICE '  - messages (for legacy chat)';
  RAISE NOTICE '  - referrals';
  RAISE NOTICE '  - referral_uses';
  RAISE NOTICE '  - reviews (for ratings)';
  RAISE NOTICE '  - ride_requests';
  RAISE NOTICE '  - ride_request_price';
  RAISE NOTICE '  - conversations (for new chat system)';
  RAISE NOTICE '  - conversation_messages (for new chat system)';
END $$;
