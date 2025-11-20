-- Fix Payment Capture for Completed Ride
-- Issue: Ride completed but payment stuck in 'authorized' status
-- Root Cause: completeRide() was querying wrong table (bookings instead of ride_requests)

-- Ride ID: 00980084-bae2-4443-86f7-d94470d0160e
-- Payment Intent ID: e1a3edf5-28f3-4934-a93d-52061487b3c6
-- Amount: $5.00 CAD (500 cents)
-- Stripe Payment Intent: pi_3SVJnbDINVeK2wmi1huIAUIk

-- STEP 1: Verify current state
SELECT 
  'Current State' as step,
  r.id as ride_id,
  r.status as ride_status,
  r.completed_at,
  spi.stripe_payment_intent_id,
  spi.amount_total as amount_cents,
  spi.status as payment_status,
  spi.captured_at,
  rr.id as ride_request_id,
  rr.passenger_id,
  rr.requested_seats,
  rr.price_per_seat
FROM rides r
JOIN stripe_payment_intents spi ON r.id = spi.ride_id
JOIN ride_requests rr ON r.id = rr.ride_id
WHERE r.id = '00980084-bae2-4443-86f7-d94470d0160e';

-- STEP 2: Manual payment capture required
-- This must be done via Stripe API (cannot be done in SQL)
-- The frontend needs to call capturePayment() function with:
-- {
--   "action": "capture",
--   "paymentIntentId": "e1a3edf5-28f3-4934-a93d-52061487b3c6"
-- }

-- STEP 3: After payment is captured via API, verify:
-- - stripe_payment_intents.status should be 'succeeded'
-- - stripe_payment_intents.captured_at should be set
-- - driver_earnings record should exist
-- - payment_history record should exist

-- Query to verify after fix:
-- SELECT 
--   spi.status as payment_status,
--   spi.captured_at,
--   de.id as earning_id,
--   de.amount as earning_amount,
--   de.status as earning_status,
--   ph.id as payment_history_id,
--   ph.status as payment_history_status
-- FROM stripe_payment_intents spi
-- LEFT JOIN driver_earnings de ON spi.id = de.payment_intent_id
-- LEFT JOIN payment_history ph ON spi.ride_id = ph.ride_id
-- WHERE spi.id = 'e1a3edf5-28f3-4934-a93d-52061487b3c6';
