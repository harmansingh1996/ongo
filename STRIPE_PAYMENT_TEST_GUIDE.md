# Stripe Payment Test Suite - Complete Guide

## Overview

A comprehensive Edge Function test suite for testing all Stripe payment scenarios:
- **Create**: Payment intent creation (`requires_payment_method`)
- **Authorize**: Payment authorization (`requires_capture`)
- **Capture**: Payment capture (`succeeded`)
- **Refund**: Payment refund (`refunded`)
- **Cancel**: Payment cancellation (`canceled`)
- **Failed**: Failed payment simulation

## Edge Function Details

- **Function Name**: `stripe-payment-test`
- **Status**: Active (Version 1)
- **Endpoint**: `https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test`

## Test Scenarios

### 1. Create Payment Intent
**Status Flow**: `requires_payment_method`

Creates a payment intent with manual capture enabled.

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "create",
    "amount": 5000
  }'
```

**Expected Result**:
- Creates payment intent in Stripe
- Saves to `stripe_payment_intents` table
- Returns payment ID and client secret

### 2. Authorize Payment
**Status Flow**: `requires_payment_method` → `requires_capture`

Simulates frontend payment confirmation using test card.

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "authorize",
    "paymentIntentId": "PAYMENT_INTENT_ID_FROM_CREATE"
  }'
```

**Expected Result**:
- Confirms payment with Stripe test card
- Updates status to `authorized` in database
- Payment ready for capture

### 3. Capture Payment
**Status Flow**: `requires_capture` → `succeeded`

Captures the authorized payment and creates driver earnings.

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "capture",
    "paymentIntentId": "PAYMENT_INTENT_ID"
  }'
```

**Expected Result**:
- Captures payment in Stripe
- Updates status to `succeeded`
- Creates driver earnings record with platform fee calculation

### 4. Refund Payment
**Status Flow**: `succeeded` → `refunded`

Refunds a captured payment (full or partial).

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "refund",
    "paymentIntentId": "PAYMENT_INTENT_ID",
    "amount": 2500
  }'
```

**Expected Result**:
- Creates refund in Stripe
- Updates payment status
- Creates refund transaction record

### 5. Cancel Payment
**Status Flow**: `requires_capture` → `canceled`

Cancels an authorized but uncaptured payment.

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "cancel",
    "paymentIntentId": "PAYMENT_INTENT_ID"
  }'
```

**Expected Result**:
- Cancels payment in Stripe
- Updates status to `canceled`
- No charge to customer

### 6. Failed Payment
**Status Flow**: `requires_payment_method` (with error)

Simulates a payment failure using declined test card.

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "failed",
    "testCard": "4000000000000002"
  }'
```

**Expected Result**:
- Payment fails with Stripe error
- Status remains `requires_payment_method`
- Error details captured

## Full Test Suite

Run all scenarios sequentially:

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "scenario": "all",
    "amount": 5000
  }'
```

**Test Flow**:
1. Create → Authorize → Capture → Refund
2. Create → Authorize → Cancel (separate payment)
3. Failed payment simulation

**Expected Response**:
```json
{
  "success": true,
  "summary": {
    "total": 7,
    "passed": 7,
    "failed": 0
  },
  "results": [
    {
      "scenario": "create",
      "success": true,
      "paymentIntentId": "uuid",
      "status": "requires_payment_method",
      "amount": 5000
    },
    // ... more results
  ]
}
```

## Stripe Test Cards

Use these test cards for different scenarios:

| Card Number          | Scenario                    |
|---------------------|----------------------------|
| 4242424242424242    | ✅ Success (default)        |
| 4000002500003155    | 🔐 Requires authentication |
| 4000000000009995    | ❌ Declined - Insufficient |
| 4000000000000002    | ❌ Generic decline         |
| 4000000000000341    | ❌ Charge succeeds, CVC fails |

[Full test card list](https://stripe.com/docs/testing#cards)

## Database Verification

After running tests, verify database state:

```sql
-- Check created payment intents
SELECT 
  id,
  stripe_payment_intent_id,
  status,
  amount_total,
  created_at,
  captured_at
FROM stripe_payment_intents
WHERE stripe_payment_intent_id LIKE 'pi_%'
ORDER BY created_at DESC
LIMIT 10;

-- Check driver earnings
SELECT 
  driver_id,
  amount,
  platform_fee,
  net_amount,
  status
FROM driver_earnings
WHERE payment_intent_id IN (
  SELECT id FROM stripe_payment_intents 
  WHERE metadata->>'test' = 'true'
);

-- Check refund transactions
SELECT 
  stripe_refund_id,
  amount,
  reason,
  status
FROM refund_transactions
WHERE payment_intent_id IN (
  SELECT id FROM stripe_payment_intents 
  WHERE metadata->>'test' = 'true'
);
```

## Environment Requirements

**Required Environment Variables**:
- `STRIPE_SECRET_KEY`: Must start with `sk_test_` (test mode)
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations

**Security Check**:
The function validates that `STRIPE_SECRET_KEY` is in test mode to prevent accidental production charges.

## Test Cleanup

Clean up test data after testing:

```sql
-- Delete test payment intents
DELETE FROM stripe_payment_intents 
WHERE metadata->>'test' = 'true';

-- Delete test driver earnings
DELETE FROM driver_earnings 
WHERE payment_intent_id IN (
  SELECT id FROM stripe_payment_intents 
  WHERE metadata->>'test' = 'true'
);

-- Delete test refund transactions
DELETE FROM refund_transactions 
WHERE payment_intent_id IN (
  SELECT id FROM stripe_payment_intents 
  WHERE metadata->>'test' = 'true'
);
```

## Integration with Payment Capture Worker

The test suite integrates with the automated payment capture system:

1. **Create + Authorize** → Adds to `payment_capture_queue`
2. **Worker processes queue** → Captures automatically
3. **Test validation** → Verify worker processed correctly

## Common Issues and Solutions

### Issue: "STRIPE_SECRET_KEY must be a TEST key"
**Solution**: Ensure your Stripe key starts with `sk_test_` not `sk_live_`

### Issue: "Payment intent not found in database"
**Solution**: Check that `paymentIntentId` from create step is used in subsequent tests

### Issue: "Cannot capture payment in status: requires_payment_method"
**Solution**: Run authorize step before capture step

### Issue: Test data accumulation
**Solution**: Run cleanup SQL after each test run

## Next Steps

1. **Automated Testing**: Create a CI/CD pipeline that runs the full test suite
2. **Webhook Testing**: Add webhook event simulation for more realistic testing
3. **Load Testing**: Test payment system under concurrent load
4. **Monitoring**: Add alerts for test failures in staging environment

## Related Documentation

- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Payment Capture Worker](./PAYMENT_WORKER_DEPLOYMENT_GUIDE.md)
- [Stripe Payment Integration](./STRIPE_PAYMENT_INTEGRATION_GUIDE.md)
- [Payment Capture Status Fix](./PAYMENT_CAPTURE_STATUS_FIX.md)
