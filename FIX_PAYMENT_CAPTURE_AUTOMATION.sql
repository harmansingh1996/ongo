-- ============================================================
-- FIX: AUTOMATIC PAYMENT CAPTURE WHEN RIDE COMPLETES
-- ============================================================
-- Problem: Rides are marked as completed but payments remain in 'authorized' status
-- Root Cause: No database trigger to automatically capture payments
-- Solution: Create trigger + function to capture payments when ride status changes to 'completed'
-- ============================================================

-- ============================================================
-- STEP 1: Create function to capture payment via Edge Function
-- ============================================================

CREATE OR REPLACE FUNCTION auto_capture_payment_on_ride_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_intent_id UUID;
  v_stripe_pi_id TEXT;
  v_amount_cents INTEGER;
  v_edge_function_url TEXT;
  v_response JSONB;
BEGIN
  -- Only proceed if ride was just completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    RAISE NOTICE '🏁 Ride completed: % - Auto-capturing payments...', NEW.id;
    
    -- Find all authorized payment intents for this ride
    FOR v_payment_intent_id, v_stripe_pi_id, v_amount_cents IN
      SELECT 
        spi.id,
        spi.stripe_payment_intent_id,
        spi.amount_total
      FROM stripe_payment_intents spi
      WHERE spi.ride_id = NEW.id
        AND spi.status = 'authorized'
        AND spi.captured_at IS NULL
    LOOP
      
      RAISE NOTICE '💳 Found uncaptured payment: % (Stripe ID: %, Amount: %)', 
        v_payment_intent_id, v_stripe_pi_id, v_amount_cents;
      
      -- Update payment status to 'processing' to prevent duplicate captures
      UPDATE stripe_payment_intents
      SET 
        status = 'processing',
        updated_at = NOW()
      WHERE id = v_payment_intent_id;
      
      -- NOTE: Actual Stripe API capture must be done via Edge Function
      -- The trigger marks payments as 'processing' and logs the need for capture
      -- Frontend/Backend should poll for 'processing' payments and call Edge Function
      
      -- Insert capture request into a queue table (if exists) or log it
      -- For now, we'll rely on frontend polling or manual capture
      
      RAISE NOTICE '⏳ Payment marked as processing - awaiting Edge Function capture';
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_capture_payment_on_ride_completion IS 
'Automatically marks payments as processing when ride completes. Actual capture must be done via Edge Function.';

-- ============================================================
-- STEP 2: Create trigger on rides table
-- ============================================================

DROP TRIGGER IF EXISTS trigger_auto_capture_payment_on_completion ON rides;

CREATE TRIGGER trigger_auto_capture_payment_on_completion
  AFTER UPDATE OF status ON rides
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
  EXECUTE FUNCTION auto_capture_payment_on_ride_completion();

COMMENT ON TRIGGER trigger_auto_capture_payment_on_completion ON rides IS
'Trigger to automatically initiate payment capture when ride status changes to completed';

-- ============================================================
-- STEP 3: Create payment capture queue table (optional but recommended)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_capture_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES stripe_payment_intents(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_capture_queue_status ON payment_capture_queue(status);
CREATE INDEX idx_payment_capture_queue_created_at ON payment_capture_queue(created_at DESC);

COMMENT ON TABLE payment_capture_queue IS 
'Queue for payment captures that need to be processed via Edge Function. Prevents duplicate captures and provides retry mechanism.';

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_payment_capture_queue_updated_at ON payment_capture_queue;
CREATE TRIGGER update_payment_capture_queue_updated_at
  BEFORE UPDATE ON payment_capture_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 4: Updated trigger function with queue integration
-- ============================================================

CREATE OR REPLACE FUNCTION auto_capture_payment_on_ride_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_intent_id UUID;
  v_stripe_pi_id TEXT;
  v_amount_cents INTEGER;
BEGIN
  -- Only proceed if ride was just completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    RAISE NOTICE '🏁 Ride completed: % - Queueing payments for capture...', NEW.id;
    
    -- Find all authorized payment intents for this ride and add to queue
    FOR v_payment_intent_id, v_stripe_pi_id, v_amount_cents IN
      SELECT 
        spi.id,
        spi.stripe_payment_intent_id,
        spi.amount_total
      FROM stripe_payment_intents spi
      WHERE spi.ride_id = NEW.id
        AND spi.status = 'authorized'
        AND spi.captured_at IS NULL
    LOOP
      
      RAISE NOTICE '💳 Queueing payment for capture: % (Stripe ID: %)', 
        v_payment_intent_id, v_stripe_pi_id;
      
      -- Add to capture queue (with upsert to prevent duplicates)
      INSERT INTO payment_capture_queue (
        payment_intent_id,
        ride_id,
        stripe_payment_intent_id,
        amount_cents,
        status
      ) VALUES (
        v_payment_intent_id,
        NEW.id,
        v_stripe_pi_id,
        v_amount_cents,
        'pending'
      )
      ON CONFLICT (payment_intent_id) DO UPDATE
      SET 
        status = 'pending',
        updated_at = NOW();
      
      RAISE NOTICE '✅ Payment queued for capture';
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint to prevent duplicate queue entries
ALTER TABLE payment_capture_queue 
ADD CONSTRAINT unique_payment_intent_in_queue UNIQUE (payment_intent_id);

-- ============================================================
-- STEP 5: Manual capture script for existing uncaptured payments
-- ============================================================

-- Insert all currently uncaptured payments into the queue
INSERT INTO payment_capture_queue (
  payment_intent_id,
  ride_id,
  stripe_payment_intent_id,
  amount_cents,
  status
)
SELECT 
  spi.id,
  spi.ride_id,
  spi.stripe_payment_intent_id,
  spi.amount_total,
  'pending'
FROM stripe_payment_intents spi
JOIN rides r ON spi.ride_id = r.id
WHERE spi.status = 'authorized'
  AND spi.captured_at IS NULL
  AND r.status = 'completed'
ON CONFLICT (payment_intent_id) DO NOTHING;

-- ============================================================
-- STEP 6: Query to check queued payments
-- ============================================================

-- Check pending captures
SELECT 
  pcq.id,
  pcq.stripe_payment_intent_id,
  pcq.amount_cents / 100.0 as amount_dollars,
  pcq.status,
  pcq.attempts,
  pcq.created_at,
  r.status as ride_status,
  r.completed_at
FROM payment_capture_queue pcq
JOIN rides r ON pcq.ride_id = r.id
WHERE pcq.status = 'pending'
ORDER BY pcq.created_at ASC;

-- ============================================================
-- STEP 7: Edge Function integration notes
-- ============================================================

-- The Edge Function or backend worker should:
-- 1. Poll payment_capture_queue for 'pending' entries
-- 2. Call Stripe API to capture each payment
-- 3. Update queue status to 'completed' or 'failed'
-- 4. Update stripe_payment_intents table with capture results
-- 5. Create driver_earnings and payment_history records

-- Example query for worker to fetch pending captures:
-- SELECT * FROM payment_capture_queue 
-- WHERE status = 'pending' 
-- ORDER BY created_at ASC 
-- LIMIT 10;

-- Example update after successful capture:
-- UPDATE payment_capture_queue 
-- SET status = 'completed', updated_at = NOW() 
-- WHERE id = <queue_id>;

-- UPDATE stripe_payment_intents 
-- SET status = 'succeeded', captured_at = NOW() 
-- WHERE id = <payment_intent_id>;
