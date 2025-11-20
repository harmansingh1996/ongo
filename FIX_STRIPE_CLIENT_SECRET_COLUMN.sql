-- ============================================================
-- Fix Missing stripe_client_secret Column in stripe_payment_intents Table
-- ============================================================
-- This migration adds the missing stripe_client_secret column that is 
-- required by the Stripe Edge Function when creating payment intents.
--
-- Error: "Could not find the 'stripe_client_secret' column of 
-- 'stripe_payment_intents' in the schema cache"
--
-- Root Cause: The Edge Function (supabase/functions/stripe-payment/index.ts:205)
-- attempts to insert stripe_client_secret during payment intent creation,
-- but this column was missing from the table definition.
-- ============================================================

-- Add the missing stripe_client_secret column to stripe_payment_intents table
ALTER TABLE stripe_payment_intents 
ADD COLUMN IF NOT EXISTS stripe_client_secret TEXT;

-- Add index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_stripe_payment_intents_client_secret 
ON stripe_payment_intents(stripe_client_secret);

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'stripe_payment_intents' 
    AND column_name = 'stripe_client_secret'
  ) THEN
    RAISE NOTICE 'SUCCESS: stripe_client_secret column added to stripe_payment_intents table';
  ELSE
    RAISE EXCEPTION 'FAILED: stripe_client_secret column was not added';
  END IF;
END $$;
