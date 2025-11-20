-- ============================================================
-- FIX: Add missing booking_id column to payment_history table
-- Issue: PGRST204 - "Could not find the 'booking_id' column"
-- Date: 2025-11-19
-- ============================================================

-- Add booking_id column to payment_history table
ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- Add index for booking_id for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_history_booking_id ON payment_history(booking_id);

-- Add additional columns that may be referenced in the code
ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS amount_refunded DECIMAL(10,2) DEFAULT 0;

ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS refund_reason TEXT;

ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'ride';

-- Update the status check constraint to include new statuses used in paymentService.ts
ALTER TABLE payment_history DROP CONSTRAINT IF EXISTS payment_history_status_check;
ALTER TABLE payment_history ADD CONSTRAINT payment_history_status_check 
  CHECK (status IN ('paid', 'authorized', 'pending', 'refunded', 'cancelled', 'partial_refund', 'completed_no_refund'));

-- Add index for stripe_payment_intent_id for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_payment_intent_id ON payment_history(stripe_payment_intent_id);

-- Verify the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payment_history' 
ORDER BY ordinal_position;
