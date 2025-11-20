# Stripe Payment Integration Guide

This guide documents the complete Stripe payment authorization flow implemented for OnGoPool.

## Overview

The payment flow uses **Stripe.js with Elements** for secure payment method collection and authorization. The system implements a **manual capture** workflow where payments are authorized during booking but only captured after ride completion.

## Implementation Components

### 1. Frontend Components

#### StripePaymentForm Component
**Location**: `src/components/StripePaymentForm.tsx`

A reusable Stripe payment form component that:
- Collects payment method using Stripe Payment Element
- Confirms payment with Stripe
- Handles authorization (manual capture mode)
- Provides real-time validation and error handling

**Key Features**:
- Mobile-optimized UI with clear error messages
- Support for cards, Apple Pay, and Google Pay
- Loading states and disabled button during processing
- Authorization confirmation before callback

#### RidePreviewPage Integration
**Location**: `src/pages/rider/RidePreviewPage.tsx`

**Payment Flow**:
1. User selects seats and agrees to terms
2. System creates payment intent via backend
3. Payment form modal appears with Stripe Elements
4. User enters payment method
5. Payment is authorized (not captured)
6. Booking is created with authorized payment
7. User navigates to trips page

**State Management**:
- `showPaymentForm`: Controls payment modal visibility
- `clientSecret`: Stripe client secret for payment confirmation
- `paymentIntentId`: Tracks payment intent for booking association

### 2. Backend Edge Function

#### Stripe Payment Edge Function
**Location**: `supabase/functions/stripe-payment/index.ts`

**Critical Fix Applied**:
```typescript
// BEFORE (Wrong):
status: "authorized", // Set prematurely before payment confirmation

// AFTER (Correct):
status: paymentIntent.status, // Use actual Stripe status
```

**Status Flow**:
1. **Initial**: `requires_payment_method` - Payment intent created, awaiting payment method
2. **After Confirmation**: `requires_capture` - Payment authorized, ready to capture
3. **After Capture**: `succeeded` - Payment captured, funds transferred

### 3. Configuration

#### yw_manifest.json
```json
{
  "stripe_publishable_key": "pk_test_51SUzmyDINVeK2wmiQQfpN8OZHZckBPRUWQDq4h5k69jtCdXpz0bhmLEwi4wLqxYEF75RzZCCVCYQsRDe8qo2l1rN00mQGQlnLz"
}
```

## Payment Status Lifecycle

### Database Status Tracking

**stripe_payment_intents table**:
- `requires_payment_method` → Payment intent created
- `requires_capture` → Payment authorized
- `succeeded` → Payment captured
- `canceled` → Payment cancelled

### Status Synchronization

The system maintains status consistency between:
1. **Stripe API**: Source of truth for payment status
2. **Database**: Local status cache updated via webhooks
3. **Frontend**: UI state based on database status

## Security Features

1. **Client Secret Management**: 
   - Generated on backend only
   - Single-use tokens
   - Short expiration time

2. **Payment Method Security**:
   - No card details stored locally
   - All sensitive data handled by Stripe
   - PCI DSS compliance via Stripe Elements

3. **Authorization Holds**:
   - Funds authorized but not captured
   - Automatic release if booking cancelled
   - Manual capture only after ride completion

## Testing

### Test Cards

**Successful Authorization**:
```
Card: 4242 4242 4242 4242
Exp: Any future date
CVC: Any 3 digits
```

**Test Scenarios**:
1. Successful payment authorization
2. Insufficient funds (4000 0000 0000 9995)
3. Card declined (4000 0000 0000 0002)
4. Processing error (4000 0000 0000 0119)

## Known Issues & Solutions

### Issue: Payment Stuck in "requires_payment_method"

**Cause**: Payment intent created but payment method never attached/confirmed

**Solution**: Implemented complete payment form with Stripe Elements that:
- Collects payment method from user
- Confirms payment with Stripe
- Only proceeds to booking after successful authorization

### Issue: Database Status Mismatch

**Cause**: Backend was setting status to "authorized" immediately after creating payment intent

**Solution**: 
- Use actual Stripe status when creating database record
- Implement webhook handlers to sync status updates
- Update status only when Stripe confirms authorization

## Next Steps

### Webhook Integration (Future Enhancement)

Create webhook endpoint to handle Stripe events:

```typescript
// Stripe webhook events to handle:
- payment_intent.succeeded → Update status to "authorized"
- payment_intent.payment_failed → Update status to "failed"
- payment_intent.canceled → Update status to "canceled"
- charge.captured → Update status to "succeeded"
```

**Implementation Priority**: Medium (current flow works without webhooks, but webhooks provide better status synchronization)

### Payment Method Management

Future enhancements:
- Save payment methods for future use
- Set default payment method
- Support for multiple payment methods
- Update/delete saved cards

## Troubleshooting

### Payment Not Authorizing

1. Check Stripe publishable key in `yw_manifest.json`
2. Verify client secret is being generated
3. Check browser console for Stripe.js errors
4. Ensure payment form is displayed correctly

### Status Not Updating

1. Check database status matches Stripe dashboard
2. Verify webhook endpoint is configured
3. Review Edge Function logs in Supabase
4. Check payment_history table for records

## Documentation References

- [Stripe Payment Intents Guide](https://stripe.com/docs/payments/payment-intents)
- [Stripe.js Reference](https://stripe.com/docs/js)
- [Stripe Elements](https://stripe.com/docs/payments/elements)
- [Manual Capture](https://stripe.com/docs/payments/capture-later)
