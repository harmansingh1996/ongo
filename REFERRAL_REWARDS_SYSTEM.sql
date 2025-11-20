-- ============================================================
-- REFERRAL REWARDS AND REDEMPTION SYSTEM
-- ============================================================
-- This migration adds a complete referral rewards and redemption system
-- including:
-- 1. Reward tracking when referrals are used
-- 2. Balance management for earned credits
-- 3. Redemption workflow to convert credits to real money
-- 4. Integration with driver earnings/payout system
-- ============================================================

-- ============================================================
-- 1. Add balance tracking columns to referrals table
-- ============================================================

-- Add columns for tracking earned rewards and available balance
ALTER TABLE referrals 
ADD COLUMN IF NOT EXISTS available_balance NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_redeemed NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(10, 2) DEFAULT 0.00;

COMMENT ON COLUMN referrals.available_balance IS 'Credits available for redemption';
COMMENT ON COLUMN referrals.total_redeemed IS 'Total amount redeemed over lifetime';
COMMENT ON COLUMN referrals.pending_balance IS 'Credits pending from recent referrals (not yet eligible for redemption)';

-- ============================================================
-- 2. Create referral_redemptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  redemption_method TEXT NOT NULL CHECK (redemption_method IN ('bank_transfer', 'wallet', 'ride_credit')),
  
  -- Payment details
  bank_account_info JSONB, -- For bank transfers
  wallet_address TEXT, -- For digital wallet
  
  -- Processing info
  transaction_id TEXT, -- External transaction ID
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_redemption_method_data CHECK (
    (redemption_method = 'bank_transfer' AND bank_account_info IS NOT NULL) OR
    (redemption_method = 'wallet' AND wallet_address IS NOT NULL) OR
    redemption_method = 'ride_credit'
  )
);

CREATE INDEX idx_referral_redemptions_user_id ON referral_redemptions(user_id);
CREATE INDEX idx_referral_redemptions_status ON referral_redemptions(status);
CREATE INDEX idx_referral_redemptions_created_at ON referral_redemptions(created_at DESC);

COMMENT ON TABLE referral_redemptions IS 'Tracks all referral reward redemption requests and their status';

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_referral_redemptions_updated_at ON referral_redemptions;
CREATE TRIGGER update_referral_redemptions_updated_at
  BEFORE UPDATE ON referral_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. Create referral_transactions table for detailed tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_use_id UUID REFERENCES referral_uses(id) ON DELETE SET NULL,
  redemption_id UUID REFERENCES referral_redemptions(id) ON DELETE SET NULL,
  
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'bonus', 'adjustment')),
  amount NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  
  description TEXT NOT NULL,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referral_transactions_user_id ON referral_transactions(user_id);
CREATE INDEX idx_referral_transactions_type ON referral_transactions(transaction_type);
CREATE INDEX idx_referral_transactions_created_at ON referral_transactions(created_at DESC);

COMMENT ON TABLE referral_transactions IS 'Detailed transaction log for all referral reward activities';

-- ============================================================
-- 4. Function to process referral rewards
-- ============================================================

CREATE OR REPLACE FUNCTION process_referral_reward(
  p_referral_use_id UUID,
  p_reward_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referrer_id UUID;
  v_new_balance NUMERIC;
BEGIN
  -- Get referrer ID
  SELECT referrer_id INTO v_referrer_id
  FROM referral_uses
  WHERE id = p_referral_use_id;
  
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral_use_id';
  END IF;
  
  -- Update referral balances
  UPDATE referrals
  SET 
    available_balance = available_balance + p_reward_amount,
    total_earned = total_earned + p_reward_amount,
    updated_at = NOW()
  WHERE user_id = v_referrer_id
  RETURNING available_balance INTO v_new_balance;
  
  -- Create transaction record
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
    p_reward_amount,
    v_new_balance,
    'Reward earned from successful referral'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Function to request redemption
-- ============================================================

CREATE OR REPLACE FUNCTION request_referral_redemption(
  p_user_id UUID,
  p_amount NUMERIC,
  p_redemption_method TEXT,
  p_bank_info JSONB DEFAULT NULL,
  p_wallet_address TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_available_balance NUMERIC;
  v_redemption_id UUID;
  v_new_balance NUMERIC;
BEGIN
  -- Check available balance
  SELECT available_balance INTO v_available_balance
  FROM referrals
  WHERE user_id = p_user_id;
  
  IF v_available_balance IS NULL OR v_available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance for redemption';
  END IF;
  
  -- Create redemption request
  INSERT INTO referral_redemptions (
    user_id,
    amount,
    status,
    redemption_method,
    bank_account_info,
    wallet_address
  ) VALUES (
    p_user_id,
    p_amount,
    'pending',
    p_redemption_method,
    p_bank_info,
    p_wallet_address
  )
  RETURNING id INTO v_redemption_id;
  
  -- Deduct from available balance
  UPDATE referrals
  SET 
    available_balance = available_balance - p_amount,
    pending_balance = pending_balance + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING available_balance INTO v_new_balance;
  
  -- Create transaction record
  INSERT INTO referral_transactions (
    user_id,
    redemption_id,
    transaction_type,
    amount,
    balance_after,
    description
  ) VALUES (
    p_user_id,
    v_redemption_id,
    'redeemed',
    -p_amount,
    v_new_balance,
    'Redemption request created'
  );
  
  RETURN v_redemption_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Function to complete redemption
-- ============================================================

CREATE OR REPLACE FUNCTION complete_referral_redemption(
  p_redemption_id UUID,
  p_transaction_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_amount NUMERIC;
  v_status TEXT;
BEGIN
  -- Get redemption details
  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
  FROM referral_redemptions
  WHERE id = p_redemption_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Redemption not found';
  END IF;
  
  IF v_status != 'pending' AND v_status != 'processing' THEN
    RAISE EXCEPTION 'Redemption already processed or cancelled';
  END IF;
  
  -- Update redemption status
  UPDATE referral_redemptions
  SET 
    status = 'completed',
    transaction_id = p_transaction_id,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_redemption_id;
  
  -- Update referral totals
  UPDATE referrals
  SET 
    pending_balance = pending_balance - v_amount,
    total_redeemed = total_redeemed + v_amount,
    updated_at = NOW()
  WHERE user_id = v_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Function to cancel/refund redemption
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_referral_redemption(
  p_redemption_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_amount NUMERIC;
  v_status TEXT;
  v_new_balance NUMERIC;
BEGIN
  -- Get redemption details
  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
  FROM referral_redemptions
  WHERE id = p_redemption_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Redemption not found';
  END IF;
  
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Cannot cancel completed redemption';
  END IF;
  
  -- Update redemption status
  UPDATE referral_redemptions
  SET 
    status = 'cancelled',
    error_message = p_reason,
    updated_at = NOW()
  WHERE id = p_redemption_id;
  
  -- Refund to available balance
  UPDATE referrals
  SET 
    available_balance = available_balance + v_amount,
    pending_balance = pending_balance - v_amount,
    updated_at = NOW()
  WHERE user_id = v_user_id
  RETURNING available_balance INTO v_new_balance;
  
  -- Create transaction record
  INSERT INTO referral_transactions (
    user_id,
    redemption_id,
    transaction_type,
    amount,
    balance_after,
    description
  ) VALUES (
    v_user_id,
    p_redemption_id,
    'adjustment',
    v_amount,
    v_new_balance,
    COALESCE('Redemption cancelled: ' || p_reason, 'Redemption cancelled')
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. Trigger to automatically reward referrals
-- ============================================================

CREATE OR REPLACE FUNCTION auto_reward_referral()
RETURNS TRIGGER AS $$
DECLARE
  v_reward_amount NUMERIC := 5.00; -- $5 reward per successful referral
BEGIN
  -- Only reward when status changes to 'used'
  IF NEW.status = 'used' AND (OLD.status IS NULL OR OLD.status != 'used') THEN
    -- Process the reward
    PERFORM process_referral_reward(NEW.id, v_reward_amount);
    
    RAISE NOTICE 'Referral reward of $% credited to user %', v_reward_amount, NEW.referrer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_reward_referral ON referral_uses;
CREATE TRIGGER trigger_auto_reward_referral
  AFTER UPDATE ON referral_uses
  FOR EACH ROW
  WHEN (NEW.status = 'used')
  EXECUTE FUNCTION auto_reward_referral();

-- ============================================================
-- 9. RLS Policies
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own redemptions
CREATE POLICY "Users can view their own redemptions"
  ON referral_redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own redemption requests
CREATE POLICY "Users can create redemption requests"
  ON referral_redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
  ON referral_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 10. Helper Views
-- ============================================================

-- View for user's referral summary
CREATE OR REPLACE VIEW v_referral_summary AS
SELECT 
  r.user_id,
  r.referral_code,
  r.total_referrals,
  r.total_earned,
  r.available_balance,
  r.pending_balance,
  r.total_redeemed,
  COUNT(DISTINCT ru.id) FILTER (WHERE ru.status = 'pending') as pending_uses,
  COUNT(DISTINCT ru.id) FILTER (WHERE ru.status = 'used') as completed_uses,
  COUNT(DISTINCT rd.id) FILTER (WHERE rd.status = 'pending') as pending_redemptions
FROM referrals r
LEFT JOIN referral_uses ru ON ru.referrer_id = r.user_id
LEFT JOIN referral_redemptions rd ON rd.user_id = r.user_id AND rd.status = 'pending'
GROUP BY r.user_id, r.referral_code, r.total_referrals, r.total_earned, 
         r.available_balance, r.pending_balance, r.total_redeemed;

-- ============================================================
-- USAGE DOCUMENTATION
-- ============================================================
-- 
-- HOW THE SYSTEM WORKS:
-- 
-- 1. USER SHARES REFERRAL CODE
--    - Each user has a unique referral code (e.g., "HAR20EBEC")
--    - Code is generated automatically when user profile is created
--    - Found in referrals table
--
-- 2. NEW USER USES CODE AT SIGNUP
--    - applyReferralCode() creates entry in referral_uses
--    - Status starts as 'pending'
--    - No reward yet
--
-- 3. NEW USER MAKES FIRST PURCHASE/RIDE
--    - markReferralUsed() updates status to 'used'
--    - AUTO TRIGGER rewards $5 to referrer
--    - Money added to available_balance
--    - Transaction logged
--
-- 4. USER REQUESTS REDEMPTION
--    SELECT request_referral_redemption(
--      'user_id',
--      50.00,  -- amount
--      'bank_transfer',  -- or 'wallet', 'ride_credit'
--      '{"account": "1234", "routing": "5678"}'::jsonb,  -- bank info
--      NULL  -- wallet address
--    );
--
-- 5. ADMIN PROCESSES REDEMPTION
--    -- Complete:
--    SELECT complete_referral_redemption('redemption_id', 'txn_123');
--    
--    -- Or Cancel:
--    SELECT cancel_referral_redemption('redemption_id', 'Invalid account');
--
-- 6. CHECK BALANCE
--    SELECT * FROM v_referral_summary WHERE user_id = 'user_id';
--
-- REDEMPTION METHODS:
-- - bank_transfer: Transfer to bank account
-- - wallet: Send to digital wallet
-- - ride_credit: Convert to ride discounts (applied at checkout)
--
-- MINIMUM REDEMPTION: Can be set in frontend (recommended $10+)
-- REWARD AMOUNT: Currently $5 per successful referral (configurable)
-- ============================================================
