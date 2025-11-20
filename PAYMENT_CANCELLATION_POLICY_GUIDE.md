# Payment + Cancellation Policy Integration Guide

## Overview

This guide explains how the **Stripe payment system** integrates with the **cancellation/refund policy** to handle post-acceptance cancellations.

## Complete Payment-Cancellation Flow

### Timeline Visualization

```
BOOKING → AUTHORIZATION → ACCEPTANCE → [TIME PASSES] → CANCELLATION → REFUND
   |            |              |                              |            |
Rider books  Payment held   Driver accepts             Someone cancels  Policy applied
             NOT captured   Payment stays on hold      System calculates % refund
```

## Cancellation Policy Rules

### Driver Cancels (Anytime)
- **Refund**: 100% to passenger
- **Reason**: Driver broke commitment
- **Payment Action**: Full authorization release or full refund

### Passenger Cancels (Time-Based)

| Time Before Departure | Refund % | Cancellation Fee | Payment Action |
|----------------------|----------|------------------|----------------|
| > 24 hours | 100% | 0% | Full release/refund |
| 12-24 hours | 50% | 50% | Partial charge or partial refund |
| < 12 hours | 0% | 100% | Full charge (driver keeps all) |

## Payment Scenarios

### Scenario 1: Cancellation Before Payment Capture

**Flow:**
1. Rider books → Payment **authorized** (held)
2. Driver **accepts** → Payment still on hold
3. **Cancellation occurs** (before ride completion)
4. System checks policy based on time

**Payment Actions:**

**Case A: 100% Refund (Driver cancels OR >24h passenger cancel)**
```typescript
// Payment is authorized → Full cancellation
stripe.paymentIntents.cancel(paymentIntentId)
// Result: Authorization released, no charge to rider
```

**Case B: 50% Refund (12-24h passenger cancel)**
```typescript
// Payment is authorized → Capture 50% (cancellation fee)
stripe.paymentIntents.capture(paymentIntentId, {
  amount_to_capture: Math.round(amountTotal * 0.5)
})
// Result: Rider charged 50%, driver gets earnings for 50%
```

**Case C: 0% Refund (<12h passenger cancel)**
```typescript
// Payment is authorized → Capture 100%
stripe.paymentIntents.capture(paymentIntentId)
// Result: Rider charged full amount, driver gets full earnings
```

### Scenario 2: Cancellation After Payment Capture

This happens if the ride was already marked complete and payment captured.

**Payment Actions:**

**Case A: 100% Refund**
```typescript
stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: amountTotal // Full refund
})
// Result: Rider gets full refund, driver earnings reversed
```

**Case B: 50% Refund**
```typescript
stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: Math.round(amountTotal * 0.5) // Partial refund
})
// Result: Rider gets 50% back, driver keeps 50% as earnings
```

**Case C: 0% Refund**
```typescript
// No refund issued
// Result: Rider charged full, driver keeps all earnings
```

## Implementation Details

### Function: `cancelPaymentWithPolicy()`

Located in `src/services/paymentService.ts`

**Parameters:**
- `paymentIntentId`: Payment intent ID
- `rideDepartureTime`: Scheduled ride departure timestamp
- `cancelledByRole`: 'driver' or 'passenger'
- `cancellationReason`: Description

**Returns:**
```typescript
{
  success: boolean;
  refundAmount: number; // in cents
  refundPercentage: number; // 0, 50, or 100
  cancellationFee: number; // in cents
  error?: string;
}
```

**Logic Flow:**
1. Fetch payment intent from database
2. Calculate hours until departure
3. Apply policy rules to determine refund %
4. Handle based on payment status:
   - **authorized**: Cancel or partial capture
   - **succeeded**: Issue full or partial refund
5. Update driver earnings accordingly
6. Mark referral as expired if full refund

### Integration with Cancellation Service

Located in `src/services/cancellationService.ts`

When `cancelRide()` is called:
1. Calculate refund based on policy
2. For each booking:
   - Get payment intent
   - Call `cancelPaymentWithPolicy()`
   - Create refund transaction record
   - Send notification to passenger

### Database Records

**ride_cancellations table:**
```sql
INSERT INTO ride_cancellations (
  ride_id,
  cancelled_by,
  cancelled_by_role,
  hours_before_departure,
  refund_percentage,
  refund_amount,
  cancellation_fee,
  status
) VALUES (...);
```

**refund_transactions table:**
```sql
INSERT INTO refund_transactions (
  cancellation_id,
  ride_id,
  user_id,
  refund_amount,
  transaction_status
) VALUES (...);
```

**stripe_payment_intents table:**
```sql
UPDATE stripe_payment_intents
SET status = 'canceled', -- or 'succeeded' for partial
    canceled_at = NOW(),
    cancellation_reason = '...'
WHERE id = payment_intent_id;
```

## Example Scenarios

### Example 1: Driver Cancels 2 Hours Before Ride

**Input:**
- Cancellation time: 2 hours before departure
- Cancelled by: Driver
- Booking amount: $50.00

**Output:**
```
refundPercentage: 100
refundAmount: $50.00
cancellationFee: $0.00
```

**Payment Action:**
- Status: authorized → canceled
- Rider: No charge
- Driver: No earnings (broke commitment)

---

### Example 2: Passenger Cancels 18 Hours Before Ride

**Input:**
- Cancellation time: 18 hours before departure
- Cancelled by: Passenger
- Booking amount: $50.00

**Output:**
```
refundPercentage: 50
refundAmount: $25.00
cancellationFee: $25.00
```

**Payment Action:**
- Status: authorized → succeeded (partial capture $25)
- Rider: Charged $25.00
- Driver: Gets $25.00 (minus 15% platform fee = $21.25 net)

---

### Example 3: Passenger Cancels 6 Hours Before Ride

**Input:**
- Cancellation time: 6 hours before departure
- Cancelled by: Passenger
- Booking amount: $50.00

**Output:**
```
refundPercentage: 0
refundAmount: $0.00
cancellationFee: $50.00
```

**Payment Action:**
- Status: authorized → succeeded (full capture $50)
- Rider: Charged $50.00
- Driver: Gets $50.00 (minus 15% platform fee = $42.50 net)

---

### Example 4: Driver Cancels After Ride Completion (Payment Captured)

**Input:**
- Ride was completed, payment captured
- Now driver cancels (refund scenario)
- Booking amount: $50.00

**Output:**
```
refundPercentage: 100
refundAmount: $50.00
cancellationFee: $0.00
```

**Payment Action:**
- Issue Stripe refund: $50.00
- Rider: Gets full refund
- Driver: Earnings reversed/removed

## User Notifications

After cancellation, users receive notifications:

**Rider Notification:**
```
"Ride Cancelled"
"Driver cancelled your ride. You will receive a 100% refund ($50.00)."
```

or

```
"Ride Cancelled"
"Your ride has been cancelled. Refund: $25.00 (50%)"
```

**Driver Notification:**
```
"Booking Cancelled"
"Passenger cancelled. Cancellation fee: $25.00 credited to your account."
```

## Testing Scenarios

### Test Case 1: Full Refund (Driver Cancel)
```typescript
const result = await cancelPaymentWithPolicy(
  paymentIntentId,
  new Date('2025-12-01T10:00:00Z'), // Departure time
  'driver',
  'Emergency situation'
);
// Expect: refundPercentage = 100
```

### Test Case 2: Partial Refund (Passenger 18h)
```typescript
// Current time: 2025-11-30 16:00 (18h before departure)
const result = await cancelPaymentWithPolicy(
  paymentIntentId,
  new Date('2025-12-01T10:00:00Z'), // Departure time
  'passenger',
  'Changed plans'
);
// Expect: refundPercentage = 50
```

### Test Case 3: No Refund (Passenger 6h)
```typescript
// Current time: 2025-12-01 04:00 (6h before departure)
const result = await cancelPaymentWithPolicy(
  paymentIntentId,
  new Date('2025-12-01T10:00:00Z'), // Departure time
  'passenger',
  'Emergency'
);
// Expect: refundPercentage = 0
```

## Monitoring & Alerts

### Key Metrics

1. **Cancellation Rate by Time Window**
   - Track >24h, 12-24h, <12h cancellations
2. **Refund Amount Distribution**
   - Monitor 0%, 50%, 100% refund frequency
3. **Driver vs Passenger Cancellations**
   - Identify patterns (repeat cancellers)
4. **Failed Refund Transactions**
   - Alert on payment processing failures

### Dashboard Queries

```sql
-- Cancellation breakdown by policy window
SELECT 
  CASE 
    WHEN hours_before_departure >= 24 THEN '>24h'
    WHEN hours_before_departure >= 12 THEN '12-24h'
    ELSE '<12h'
  END as window,
  cancelled_by_role,
  COUNT(*) as count,
  AVG(refund_percentage) as avg_refund_pct,
  SUM(refund_amount) as total_refunds
FROM ride_cancellations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY window, cancelled_by_role;
```

## Troubleshooting

### Issue: Payment not cancelled despite 100% refund policy

**Check:**
1. Verify payment intent status in database
2. Check `cancelPaymentWithPolicy` logs
3. Confirm `hours_before_departure` calculation is correct

**Fix:**
```sql
-- Manual payment cancellation if needed
UPDATE stripe_payment_intents 
SET status = 'canceled', 
    canceled_at = NOW()
WHERE id = 'payment_intent_id';
```

### Issue: Partial refund not creating driver earnings

**Check:**
1. Verify cancellation_fee > 0
2. Check driver_earnings table for record
3. Review payment capture logs

**Fix:**
```sql
-- Manually create earnings if missed
INSERT INTO driver_earnings (
  driver_id, ride_id, booking_id,
  amount, platform_fee, net_amount,
  status, date, payment_intent_id
) VALUES (...);
```

## Best Practices

1. **Always calculate refund server-side** - Never trust client calculations
2. **Log all cancellation decisions** - Audit trail for disputes
3. **Send immediate notifications** - Keep users informed
4. **Handle edge cases** - What if departure time already passed?
5. **Test timezone handling** - UTC consistency critical
6. **Implement retry logic** - Payment operations can fail

## Future Enhancements

1. **Flexible Policy Configuration** - Admin-adjustable percentages
2. **Dispute Resolution** - Challenge cancellation fees
3. **Insurance Options** - Cancellation insurance for riders
4. **Dynamic Pricing** - Surge pricing affects refund amounts
5. **Batch Refund Processing** - Mass cancellation handling
6. **Fraud Detection** - Identify cancellation abuse patterns
