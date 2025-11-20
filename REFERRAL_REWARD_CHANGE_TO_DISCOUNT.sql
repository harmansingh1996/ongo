-- ============================================================
-- REFERRAL REWARD SYSTEM UPDATE: CHANGE FROM $5 CREDIT TO 10% DISCOUNT
-- ============================================================
-- This migration changes the referral reward system so that:
-- 1. Referred users (who use referral codes) get 10% discount on first ride
-- 2. Referrers (who share referral codes) ALSO get 10% discount instead of $5 credit
-- ============================================================

-- ============================================================
-- 1. Add referrer discount tracking to referral_uses table
-- ============================================================

-- Add column to track referrer's discount status
ALTER TABLE referral_uses 
ADD COLUMN IF NOT EXISTS referrer_discount_status TEXT DEFAULT 'unavailable' 
CHECK (referrer_discount_status IN ('unavailable', 'pending', 'used', 'expired'));

COMMENT ON COLUMN referral_uses.referrer_discount_status IS 
'Tracks the referrer discount reward: unavailable (new referral), pending (referred user completed first ride, discount ready for referrer), used (referrer used discount), expired';

-- Add column to track when referrer's discount was used
ALTER TABLE referral_uses 
ADD COLUMN IF NOT EXISTS referrer_discount_used_at TIMESTAMPTZ;

COMMENT ON COLUMN referral_uses.referrer_discount_used_at IS 
'Timestamp when referrer used their 10% discount reward';

-- ============================================================
-- 2. Update process_referral_reward function
-- ============================================================
-- Change from crediting $5 to available_balance
-- To setting referrer_discount_status = 'pending'

CREATE OR REPLACE FUNCTION process_referral_reward_discount(
  p_referral_use_id UUID,
  p_reward_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referrer_id UUID;
  v_referred_user_id UUID;
BEGIN
  -- Get referrer and referred user IDs
  SELECT referrer_id, referred_user_id INTO v_referrer_id, v_referred_user_id
  FROM referral_uses
  WHERE id = p_referral_use_id;
  
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral_use_id';
  END IF;
  
  -- Update referral_uses: set referrer_discount_status to 'pending'
  -- This means the referrer now has a 10% discount available for their next ride
  UPDATE referral_uses
  SET 
    referrer_discount_status = 'pending',
    updated_at = NOW()
  WHERE id = p_referral_use_id;
  
  -- Create transaction record for tracking (optional, for analytics)
  INSERT INTO referral_transactions (
    user_id,
    referral_use_id,
    transaction_type,
    amount,
    balance_after,
    description
  ) VALUES (
    v_referrer_id,
    p_referral_use_id,
    'earned',
    0, -- No monetary reward
    0, -- No balance change
    'Earned 10% discount for next ride (referral reward)'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_referral_reward_discount IS 
'Process referral reward by granting referrer a 10% discount instead of $5 credit';

-- ============================================================
-- 3. Update trigger to use new reward function
-- ============================================================

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_process_referral_reward ON referral_uses;

-- Create new trigger using discount-based reward function
CREATE TRIGGER trigger_process_referral_reward
  AFTER UPDATE OF status ON referral_uses
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'used')
  EXECUTE FUNCTION process_referral_reward_discount_trigger();

-- Trigger function wrapper
CREATE OR REPLACE FUNCTION process_referral_reward_discount_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Process the referral reward (10% discount for referrer)
  PERFORM process_referral_reward_discount(NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Migration Notes
-- ============================================================

-- BACKWARD COMPATIBILITY:
-- - Existing referral_uses records will have referrer_discount_status = 'unavailable'
-- - Only new referrals (after this migration) will grant 10% discount to referrers
-- - Old $5 credits in available_balance are NOT affected

-- FUTURE CLEANUP (optional):
-- - You may want to remove or deprecate the balance-related columns in referrals table
-- - Consider adding indexes if performance becomes an issue:
--   CREATE INDEX idx_referral_uses_referrer_discount 
--   ON referral_uses(referrer_id, referrer_discount_status) 
--   WHERE referrer_discount_status = 'pending';

-- ============================================================
-- 5. Testing Queries
-- ============================================================

-- Check pending discounts for a specific referrer
-- SELECT * FROM referral_uses 
-- WHERE referrer_id = 'USER_ID' 
-- AND referrer_discount_status = 'pending';

-- Check if user has any pending referral discount (as referred or referrer)
-- SELECT * FROM referral_uses 
-- WHERE (referred_user_id = 'USER_ID' AND status = 'pending')
--    OR (referrer_id = 'USER_ID' AND referrer_discount_status = 'pending');
