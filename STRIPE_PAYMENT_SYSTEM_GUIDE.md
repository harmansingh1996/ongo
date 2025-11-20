# Stripe Payment System - Implementation Guide

## Overview

This document describes the complete Stripe payment integration for the OnGoPool ride-sharing application. The system implements a secure authorization-hold-capture flow with support for referral discounts, weekly driver payouts, and driver no-show handling.

## Architecture

### Payment Flow Diagram

```
RIDER BOOKS RIDE
       ↓
  AUTHORIZE PAYMENT (Hold funds, not captured)
       ↓
DRIVER ACCEPTS → Payment stays authorized
       ↓
RIDE STARTS → Payment still on hold
       ↓
RIDE COMPLETES → CAPTURE PAYMENT + Create Earnings (pending weekly payout)
       ↓
WEEKLY BATCH → Transfer to Driver Bank Account

Alternative Paths:
- DRIVER/SYSTEM CANCELS → Release authorization (refund)
- DRIVER NO-SHOW → Cancel payment + issue refund + apply penalty
```

## Database Schema

### 1. stripe_payment_intents
Tracks Stripe PaymentIntent records with full lifecycle management.

**Key Columns:**
- `stripe_payment_intent_id` - Stripe PI ID (pi_xxx)
- `ride_id`, `booking_id` - Links to ride and booking
- `rider_id`, `driver_id` - Transaction participants
- `amount_total`, `amount_subtotal`, `discount_amount` - All amounts in CENTS
- `referral_code` - Applied discount code
- `status` - Payment state machine
- `capture_method` - Always 'manual' for authorize-then-capture

**Status Flow:**
1. `authorized` - Payment authorized, funds on hold
2. `succeeded` - Payment captured after ride completion
3. `canceled` - Payment released/refunded

### 2. payment_capture_log
Audit trail for all capture attempts.

### 3. driver_no_shows
Records driver no-show incidents with automatic refund processing.

### 4. weekly_payout_batches
Tracks weekly payout batches to drivers.

### 5. driver_payout_records
Individual payout records within each batch.

## Implementation Details

### 1. Payment Authorization (When Rider Books)

**File:** `src/services/paymentService.ts` → `createAndAuthorizePayment()`

**Trigger:** User clicks "Book Ride" in `RidePreviewPage.tsx`

**Process:**
1. Calculate discount if referral code provided
2. Create Stripe PaymentIntent with `capture_method: 'manual'`
3. Store PaymentIntent record in database
4. Mark referral as used
5. Create payment_history record with status 'authorized'

**Important:** Payment is NOT captured at this stage. Funds are held on the rider's payment method.

```typescript
// Simulated flow (actual Stripe integration needed)
const paymentIntent = await createAndAuthorizePayment({
  rideId: ride.id,
  bookingId: bookingId,
  riderId: currentUser.id,
  driverId: ride.driver_id,
  amountSubtotal: totalPriceCents, // In cents!
  referralCode: userReferralCode, // Optional
  metadata: { /* additional info */ }
});
```

### 2. Payment Cancellation (If Booking Rejected/Cancelled)

**File:** `src/services/paymentService.ts` → `cancelPayment()`

**Trigger:** 
- Driver rejects booking
- Rider cancels booking
- System auto-cancels (timeout, etc.)

**Process:**
1. Verify payment is in cancellable state (authorized)
2. Call Stripe API: `stripe.paymentIntents.cancel()`
3. Update payment_history status to 'refunded'
4. Mark referral as expired if applicable

**Result:** Rider's funds are released, no charge occurs.

### 3. Payment Capture (After Ride Completion)

**File:** `src/services/rideService.ts` → `completeRide()`

**Trigger:** Ride reaches completion (automatic or manual)

**Process:**
1. Get all accepted bookings for the ride
2. For each booking:
   - Get associated PaymentIntent
   - Call `capturePayment()` to charge the rider
   - Create driver earnings record (status: pending)
3. Earnings are marked for weekly payout

**Critical Flow:**
```typescript
// In completeRide()
const paymentIntent = await getPaymentIntentByBookingId(booking.id);

if (paymentIntent.status === 'authorized') {
  const captureResult = await capturePayment({
    paymentIntentId: paymentIntent.id
  });
  
  if (captureResult.success) {
    // Earnings created automatically by capturePayment
    // Driver will be paid in next weekly batch
  }
}
```

### 4. Referral Discount Integration

**File:** `src/services/paymentService.ts` → `calculateReferralDiscount()`

**How It Works:**
1. User enters referral code during booking
2. System fetches referral discount percentage from `referrals` table
3. Discount calculated: `discountAmount = (subtotal * discountPercent) / 100`
4. Final amount: `amountTotal = subtotal - discountAmount`
5. All amounts stored in PaymentIntent for transparency

**Example:**
- Subtotal: $50.00 (5000 cents)
- Referral: 10% discount
- Discount: $5.00 (500 cents)
- Total charged: $45.00 (4500 cents)

### 5. Driver No-Show Handling

**File:** `src/services/paymentService.ts` → `reportDriverNoShow()`

**Trigger:** Rider reports driver didn't show up

**Process:**
1. Create driver_no_shows record
2. If payment was authorized: Cancel it (rider gets refund)
3. If payment was captured: Issue refund via Stripe
4. Apply penalty to driver (deducted from next payout)
5. Update no-show verification status

**Financial Impact:**
- Rider: Full refund
- Driver: Penalty amount deducted from earnings
- Platform: Absorbs refund cost (can adjust penalty logic)

### 6. Weekly Driver Payouts

**Status:** Database structure ready, batch processing logic to be implemented

**Tables:**
- `weekly_payout_batches` - Batch metadata
- `driver_payout_records` - Individual driver payouts

**Planned Workflow:**
1. Weekly cron job creates new payout batch
2. Query all pending earnings from the week
3. Calculate: `net_payout = gross_earnings - platform_fee - penalties`
4. Create Stripe payouts/transfers to driver bank accounts
5. Mark earnings as 'paid' and record payout_date

**Platform Fee:** 15% of gross earnings (defined in `earningsService.ts`)

## Integration Requirements

### Stripe API Calls Needed

**IMPORTANT:** Current implementation simulates Stripe API calls. For production, you need to:

1. **Backend API Required:**
   - Frontend cannot directly call Stripe API (security risk)
   - Create backend endpoints for:
     - POST `/api/payments/authorize` - Create PaymentIntent
     - POST `/api/payments/capture/:id` - Capture payment
     - POST `/api/payments/cancel/:id` - Cancel payment
     - POST `/api/payments/refund/:id` - Issue refund

2. **Stripe.js Integration:**
   - Add Stripe.js to frontend: `<script src="https://js.stripe.com/v3/"></script>`
   - Collect payment method securely
   - Confirm PaymentIntent with client_secret

3. **Webhook Handlers:**
   - Listen for `payment_intent.succeeded`
   - Listen for `payment_intent.canceled`
   - Listen for `payment_intent.payment_failed`

### Environment Variables

```bash
# Backend .env
STRIPE_SECRET_KEY=sk_test_... # Or sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_... # Frontend public key
STRIPE_WEBHOOK_SECRET=whsec_... # Webhook signature verification

# Platform configuration
PLATFORM_FEE_PERCENTAGE=0.15 # 15% platform fee
```

## Security Considerations

1. **Never expose Stripe secret keys in frontend**
2. **Always validate amounts server-side**
3. **Use webhook signature verification**
4. **Store only last 4 digits of payment methods**
5. **Implement idempotency keys for payment operations**
6. **Log all payment operations for audit trails**

## Testing

### Test Cards (Stripe Test Mode)

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires Auth: 4000 0025 0000 3155
```

### Test Scenarios

1. **Happy Path:**
   - Book ride → Authorize payment → Accept booking → Complete ride → Capture payment

2. **Cancellation:**
   - Book ride → Authorize payment → Cancel booking → Release authorization

3. **Driver No-Show:**
   - Book ride → Authorize payment → Accept → Report no-show → Refund

4. **Referral Discount:**
   - Apply referral code → Verify discount calculation → Complete payment

## Monitoring & Alerts

### Key Metrics to Track

1. **Authorization Success Rate**
2. **Capture Success Rate**
3. **Refund Volume**
4. **Failed Payment Attempts**
5. **No-Show Incidents**
6. **Weekly Payout Amounts**

### Recommended Alerts

- Alert when capture rate < 95%
- Alert on refund spike (>10% of transactions)
- Alert on failed payout attempts
- Daily reconciliation reports

## Future Enhancements

1. **Partial Captures** - Capture different amounts than authorized
2. **Split Payments** - Multiple riders splitting ride cost
3. **Dynamic Pricing** - Surge pricing integration
4. **Subscription Plans** - Monthly ride passes
5. **Instant Payouts** - Daily driver payouts (Stripe Instant Payouts)
6. **Multi-Currency Support** - International rides
7. **Payment Method Verification** - $1 pre-auth checks

## Support & Troubleshooting

### Common Issues

**1. Payment Stuck in 'authorized' State**
- Check if ride was completed
- Verify capture logic in completeRide()
- Check payment_capture_log for errors

**2. Refund Not Processed**
- Verify PaymentIntent is in 'succeeded' state
- Check Stripe dashboard for refund status
- Review driver_no_shows table

**3. Earnings Not Created**
- Verify booking status is 'accepted' or 'completed'
- Check driver_earnings table
- Review completeRide() logs

### Debug Queries

```sql
-- Check payment status for a booking
SELECT * FROM stripe_payment_intents 
WHERE booking_id = 'xxx';

-- View capture attempts
SELECT * FROM payment_capture_log 
WHERE payment_intent_id = 'xxx';

-- Check driver earnings
SELECT * FROM driver_earnings 
WHERE driver_id = 'xxx' 
AND status = 'pending';

-- No-show incidents
SELECT * FROM driver_no_shows 
WHERE driver_id = 'xxx';
```

## Contact

For implementation questions or support:
- Review this guide
- Check Stripe documentation: https://stripe.com/docs
- Refer to `src/services/paymentService.ts` for code details
