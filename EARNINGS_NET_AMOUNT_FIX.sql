-- Earnings Net Amount Fix Migration
-- This migration adds platform_fee and net_amount columns to driver_earnings table

-- Step 1: Add missing columns
ALTER TABLE driver_earnings
ADD COLUMN IF NOT EXISTS platform_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC DEFAULT 0;

-- Step 2: Update existing records with calculated values
-- Platform fee is 15% of gross amount
-- Net amount is 85% of gross amount (amount - platform_fee)
UPDATE driver_earnings
SET 
    platform_fee = ROUND(amount * 0.15, 2),
    net_amount = ROUND(amount * 0.85, 2)
WHERE platform_fee = 0 OR net_amount = 0;

-- Step 3: Create trigger to automatically calculate platform_fee and net_amount on insert
CREATE OR REPLACE FUNCTION calculate_earning_breakdown()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate 15% platform fee
  NEW.platform_fee := ROUND(NEW.amount * 0.15, 2);
  -- Calculate net amount (85% of gross)
  NEW.net_amount := ROUND(NEW.amount * 0.85, 2);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS earning_breakdown_trigger ON driver_earnings;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER earning_breakdown_trigger
BEFORE INSERT OR UPDATE ON driver_earnings
FOR EACH ROW
WHEN (NEW.amount IS NOT NULL)
EXECUTE FUNCTION calculate_earning_breakdown();

-- Verification query (run separately)
-- SELECT 
--     id,
--     driver_id,
--     amount as gross_amount,
--     platform_fee,
--     net_amount,
--     ROUND(amount * 0.15, 2) as expected_fee,
--     ROUND(amount * 0.85, 2) as expected_net,
--     status
-- FROM driver_earnings
-- ORDER BY created_at DESC
-- LIMIT 10;
