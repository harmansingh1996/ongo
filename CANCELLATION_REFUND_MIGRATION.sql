-- Migration: Create cancellation and refund system tables
-- This migration implements automatic refund calculation and processing

-- Create ride_cancellations table to track all cancellation requests
CREATE TABLE IF NOT EXISTS ride_cancellations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  cancelled_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cancelled_by_role VARCHAR(20) NOT NULL CHECK (cancelled_by_role IN ('driver', 'passenger')),
  cancellation_reason TEXT,
  cancellation_timestamp TIMESTAMPTZ DEFAULT NOW(),
  ride_departure_time TIMESTAMPTZ NOT NULL,
  hours_before_departure DECIMAL(10, 2) NOT NULL,
  refund_eligible BOOLEAN NOT NULL DEFAULT false,
  refund_percentage INTEGER NOT NULL DEFAULT 0 CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
  original_amount DECIMAL(10, 2) NOT NULL,
  refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cancellation_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create refund_transactions table to track refund processing
CREATE TABLE IF NOT EXISTS refund_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cancellation_id UUID NOT NULL REFERENCES ride_cancellations(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_payment_id UUID, -- Reference to original payment (if exists)
  refund_amount DECIMAL(10, 2) NOT NULL,
  refund_method VARCHAR(50) NOT NULL DEFAULT 'original_payment_method',
  transaction_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (transaction_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  transaction_reference VARCHAR(255), -- External payment processor reference
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cancellation_notifications table to track notification delivery
CREATE TABLE IF NOT EXISTS cancellation_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cancellation_id UUID NOT NULL REFERENCES ride_cancellations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('cancellation_confirmed', 'refund_initiated', 'refund_completed', 'refund_failed')),
  notification_channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (notification_channel IN ('in_app', 'email', 'sms', 'push')),
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_ride_cancellations_ride ON ride_cancellations(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_cancellations_user ON ride_cancellations(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_ride_cancellations_status ON ride_cancellations(status);
CREATE INDEX IF NOT EXISTS idx_ride_cancellations_timestamp ON ride_cancellations(cancellation_timestamp);

CREATE INDEX IF NOT EXISTS idx_refund_transactions_cancellation ON refund_transactions(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_ride ON refund_transactions(ride_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_user ON refund_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_status ON refund_transactions(transaction_status);

CREATE INDEX IF NOT EXISTS idx_cancellation_notifications_cancellation ON cancellation_notifications(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_notifications_user ON cancellation_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_notifications_sent ON cancellation_notifications(sent);

-- Enable Row Level Security
ALTER TABLE ride_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ride_cancellations
CREATE POLICY "Users can view their own cancellations"
  ON ride_cancellations
  FOR SELECT
  USING (
    cancelled_by = auth.uid() OR
    ride_id IN (SELECT id FROM rides WHERE driver_id = auth.uid() OR id IN (SELECT ride_id FROM bookings WHERE rider_id = auth.uid()))
  );

CREATE POLICY "Users can create their own cancellations"
  ON ride_cancellations
  FOR INSERT
  WITH CHECK (cancelled_by = auth.uid());

CREATE POLICY "System can update cancellation status"
  ON ride_cancellations
  FOR UPDATE
  USING (true); -- System updates, can be restricted to service role

-- RLS Policies for refund_transactions
CREATE POLICY "Users can view their own refund transactions"
  ON refund_transactions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can manage refund transactions"
  ON refund_transactions
  FOR ALL
  USING (true); -- System managed, restrict to service role

-- RLS Policies for cancellation_notifications
CREATE POLICY "Users can view their own notifications"
  ON cancellation_notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can manage notifications"
  ON cancellation_notifications
  FOR ALL
  USING (true); -- System managed, restrict to service role

-- Create function to automatically calculate refund amount based on cancellation policy
CREATE OR REPLACE FUNCTION calculate_refund_amount(
  p_hours_before_departure DECIMAL,
  p_original_amount DECIMAL
)
RETURNS TABLE (
  refund_eligible BOOLEAN,
  refund_percentage INTEGER,
  refund_amount DECIMAL,
  cancellation_fee DECIMAL
) AS $$
BEGIN
  -- Cancellation Policy:
  -- More than 24 hours before departure: 100% refund (0% fee)
  -- Between 12-24 hours before departure: 50% refund (50% fee)
  -- Less than 12 hours before departure: No refund (100% fee)
  
  IF p_hours_before_departure >= 24 THEN
    -- Full refund
    RETURN QUERY SELECT 
      true::BOOLEAN,
      100::INTEGER,
      p_original_amount,
      0.00::DECIMAL;
  ELSIF p_hours_before_departure >= 12 THEN
    -- 50% refund
    RETURN QUERY SELECT 
      true::BOOLEAN,
      50::INTEGER,
      ROUND(p_original_amount * 0.5, 2),
      ROUND(p_original_amount * 0.5, 2);
  ELSE
    -- No refund
    RETURN QUERY SELECT 
      false::BOOLEAN,
      0::INTEGER,
      0.00::DECIMAL,
      p_original_amount;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ride_cancellations_updated_at
  BEFORE UPDATE ON ride_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refund_transactions_updated_at
  BEFORE UPDATE ON refund_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE ride_cancellations IS 'Tracks all ride cancellation requests with refund calculation';
COMMENT ON TABLE refund_transactions IS 'Manages refund processing and transaction status';
COMMENT ON TABLE cancellation_notifications IS 'Tracks notification delivery for cancellation events';
COMMENT ON FUNCTION calculate_refund_amount IS 'Calculates refund amount based on cancellation policy rules';
