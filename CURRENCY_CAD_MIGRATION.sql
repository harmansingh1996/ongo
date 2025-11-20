-- Currency Migration: USD to CAD for Canada-based App
-- This script updates all payment-related tables to use Canadian Dollars (CAD)
-- Execute this after deploying the updated Stripe Edge Function

-- =====================================================
-- 1. UPDATE DEFAULT CURRENCY IN DATABASE
-- =====================================================

-- Update stripe_payment_intents table default
ALTER TABLE stripe_payment_intents 
ALTER COLUMN currency SET DEFAULT 'cad';

-- =====================================================
-- 2. MIGRATE EXISTING RECORDS
-- =====================================================

-- Update existing payment intents from USD to CAD
UPDATE stripe_payment_intents
SET currency = 'cad'
WHERE currency = 'usd';

-- Update payment_history records if currency tracking exists
-- (Note: payment_history table doesn't have a currency column, 
--  but amounts should remain the same as they're already in cents)

-- =====================================================
-- 3. VERIFICATION QUERIES
-- =====================================================

-- Check all payment intents now use CAD
SELECT 
  currency,
  COUNT(*) as count,
  MIN(created_at) as first_record,
  MAX(created_at) as last_record
FROM stripe_payment_intents
GROUP BY currency;

-- Verify no USD records remain
SELECT COUNT(*) as usd_records_remaining
FROM stripe_payment_intents
WHERE currency = 'usd';

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================

-- 1. Stripe Edge Function Changes:
--    - Payment creation: currency changed from "usd" to "cad"
--    - Driver payouts: currency changed from "usd" to "cad"

-- 2. Stripe Account Configuration:
--    - Ensure your Stripe account supports CAD currency
--    - Verify Connect accounts (for drivers) are configured for CAD
--    - Update Stripe Dashboard settings if needed

-- 3. Historical Data:
--    - All amounts remain in cents (no conversion needed)
--    - Example: 1650 cents = $16.50 CAD (previously $16.50 USD)
--    - No financial impact as amounts stay identical

-- 4. Testing Checklist:
--    - Create new payment intent → verify currency='cad' in Stripe
--    - Authorize payment → check Stripe Dashboard shows CAD
--    - Cancel/refund → verify CAD amounts in notifications
--    - Driver payout → confirm transfer uses CAD

-- 5. Display Updates:
--    - All dollar amounts displayed in app are already in CAD context
--    - No frontend changes needed for currency display
--    - Stripe payment sheet will automatically show CAD

-- =====================================================
-- ROLLBACK PROCEDURE (if needed)
-- =====================================================

-- To rollback to USD (not recommended):
-- ALTER TABLE stripe_payment_intents ALTER COLUMN currency SET DEFAULT 'usd';
-- UPDATE stripe_payment_intents SET currency = 'usd' WHERE currency = 'cad';
