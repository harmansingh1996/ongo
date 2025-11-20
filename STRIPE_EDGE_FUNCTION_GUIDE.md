# Stripe Edge Function Implementation Guide

## Overview

This guide explains how to use the Supabase Edge Function for secure Stripe payment processing. The Edge Function keeps your Stripe secret key secure on the server-side and handles all payment operations.

## Quick Start

### 1. Deploy the Edge Function

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (find project ref in Supabase Dashboard → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Set Stripe secret key
supabase secrets set STRIPE_SECRET_KEY=sk_test_your_key_here

# Deploy the function
supabase functions deploy stripe-payment

# Get your function URL
# It will be: https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-payment
```

### 2. Update Frontend to Use Edge Function

The Edge Function is already created in `supabase/functions/stripe-payment/`. Now update your frontend payment service:

**File:** `src/services/paymentService.ts`

Replace the simulated Stripe calls with real Edge Function calls:

```typescript
import { supabase } from './supabaseClient';

// Get the Edge Function URL
const STRIPE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-payment`;

/**
 * Create and authorize payment (hold funds)
 * Called when rider books a ride
 */
export const createAndAuthorizePayment = async (params: {
  rideId: string;
  bookingId: string;
  driverId: string;
  amountSubtotal: number; // In cents!
  referralCode?: string;
}) => {
  try {
    // Get current user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }

    // Call Edge Function
    const response = await fetch(STRIPE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        ...params,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Payment authorization failed');
    }

    const result = await response.json();
    
    return {
      success: true,
      paymentIntent: result.paymentIntent,
      clientSecret: result.clientSecret,
    };
  } catch (error) {
    console.error('Payment authorization error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Capture payment (charge rider after ride completion)
 */
export const capturePayment = async (params: {
  paymentIntentId: number;
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(STRIPE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture',
        paymentIntentId: params.paymentIntentId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Payment capture failed');
    }

    const result = await response.json();
    
    return {
      success: true,
      capturedAmount: result.capturedAmount,
      driverEarnings: result.driverEarnings,
    };
  } catch (error) {
    console.error('Payment capture error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Cancel payment (release authorization if booking cancelled)
 */
export const cancelPayment = async (params: {
  paymentIntentId: number;
  reason?: string;
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(STRIPE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'cancel',
        paymentIntentId: params.paymentIntentId,
        reason: params.reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Payment cancellation failed');
    }

    return {
      success: true,
      message: 'Payment authorization released',
    };
  } catch (error) {
    console.error('Payment cancellation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Refund payment (for driver no-shows or disputes)
 */
export const refundPayment = async (params: {
  paymentIntentId: number;
  reason?: string;
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(STRIPE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'refund',
        paymentIntentId: params.paymentIntentId,
        reason: params.reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Refund failed');
    }

    const result = await response.json();
    
    return {
      success: true,
      refundId: result.refundId,
      amountRefunded: result.amountRefunded,
    };
  } catch (error) {
    console.error('Refund error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Report driver no-show (automatic refund)
 */
export const reportDriverNoShow = async (params: {
  bookingId: string;
  paymentIntentId: number;
  reportedBy: string;
  reason?: string;
}) => {
  try {
    // First, issue refund via Edge Function
    const refundResult = await refundPayment({
      paymentIntentId: params.paymentIntentId,
      reason: params.reason || 'Driver no-show',
    });

    if (!refundResult.success) {
      throw new Error(refundResult.error);
    }

    // Then create no-show record in database
    const { error } = await supabase.from('driver_no_shows').insert({
      booking_id: params.bookingId,
      payment_intent_id: params.paymentIntentId,
      reported_by: params.reportedBy,
      reason: params.reason || 'Driver did not show up',
      verification_status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return {
      success: true,
      refundId: refundResult.refundId,
      message: 'No-show reported and refund processed',
    };
  } catch (error) {
    console.error('No-show report error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
```

### 3. Add Environment Variable

Add to your `.env` file (or `.env.local`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Payment Flow Examples

### Example 1: Rider Books Ride

```typescript
// In RidePreviewPage.tsx or BookingFlow component
const handleBookRide = async () => {
  // 1. Create booking in database
  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      ride_id: selectedRide.id,
      rider_id: currentUser.id,
      status: 'pending',
    })
    .select()
    .single();

  // 2. Authorize payment (hold funds)
  const paymentResult = await createAndAuthorizePayment({
    rideId: selectedRide.id,
    bookingId: booking.id,
    driverId: selectedRide.driver_id,
    amountSubtotal: selectedRide.price * 100, // Convert to cents!
    referralCode: userReferralCode, // Optional
  });

  if (!paymentResult.success) {
    alert('Payment authorization failed: ' + paymentResult.error);
    // Delete booking if payment fails
    await supabase.from('bookings').delete().eq('id', booking.id);
    return;
  }

  // 3. Update booking with payment info
  await supabase
    .from('bookings')
    .update({ 
      payment_intent_id: paymentResult.paymentIntent.id,
      status: 'confirmed',
    })
    .eq('id', booking.id);

  alert('Ride booked! Payment authorized.');
};
```

### Example 2: Driver Accepts Booking

```typescript
// In DriverBookingPage.tsx
const handleAcceptBooking = async (bookingId: string) => {
  // Just update booking status - payment stays on hold
  await supabase
    .from('bookings')
    .update({ status: 'accepted' })
    .eq('id', bookingId);

  alert('Booking accepted! Payment will be captured after ride completion.');
};
```

### Example 3: Ride Completes - Capture Payment

```typescript
// In RideCompletionPage.tsx or automatic completion handler
const handleCompleteRide = async (rideId: string) => {
  // 1. Get all accepted bookings for this ride
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, stripe_payment_intents(*)')
    .eq('ride_id', rideId)
    .eq('status', 'accepted');

  // 2. Capture payment for each booking
  for (const booking of bookings) {
    const captureResult = await capturePayment({
      paymentIntentId: booking.stripe_payment_intents.id,
    });

    if (captureResult.success) {
      // Update booking status
      await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', booking.id);
      
      console.log(`Captured $${captureResult.capturedAmount / 100}`);
      console.log(`Driver earns $${captureResult.driverEarnings / 100}`);
    }
  }

  // 3. Mark ride as completed
  await supabase
    .from('rides')
    .update({ 
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', rideId);

  alert('Ride completed and payments captured!');
};
```

### Example 4: Booking Cancelled - Release Funds

```typescript
// In CancellationPage.tsx
const handleCancelBooking = async (bookingId: string, reason: string) => {
  // 1. Get booking with payment info
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, stripe_payment_intents(*)')
    .eq('id', bookingId)
    .single();

  // 2. Cancel payment (release authorization)
  const cancelResult = await cancelPayment({
    paymentIntentId: booking.stripe_payment_intents.id,
    reason: reason,
  });

  if (!cancelResult.success) {
    alert('Payment cancellation failed: ' + cancelResult.error);
    return;
  }

  // 3. Update booking status
  await supabase
    .from('bookings')
    .update({ 
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq('id', bookingId);

  alert('Booking cancelled and funds released!');
};
```

### Example 5: Driver No-Show - Automatic Refund

```typescript
// In NoShowReportPage.tsx
const handleReportNoShow = async (bookingId: string) => {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, stripe_payment_intents(*)')
    .eq('id', bookingId)
    .single();

  const result = await reportDriverNoShow({
    bookingId: booking.id,
    paymentIntentId: booking.stripe_payment_intents.id,
    reportedBy: currentUser.id,
    reason: 'Driver did not show up at pickup location',
  });

  if (result.success) {
    alert('No-show reported! Refund processed automatically.');
  } else {
    alert('Error: ' + result.error);
  }
};
```

## Security Features

✅ **Server-Side Processing** - Stripe secret key never exposed to frontend  
✅ **User Authentication** - All requests require valid Supabase auth token  
✅ **Input Validation** - Parameters validated before Stripe API calls  
✅ **Transaction Safety** - Database records created atomically with Stripe operations  
✅ **Audit Trail** - All operations logged in payment_history table  

## Testing

### Local Testing

1. Start local Supabase:
```bash
supabase start
```

2. Serve Edge Function locally:
```bash
supabase functions serve stripe-payment --env-file ./supabase/.env.local
```

3. Test with Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`

### Production Deployment

1. Get production Stripe keys from https://dashboard.stripe.com/apikeys
2. Set production secrets:
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_your_production_key
```

3. Deploy:
```bash
supabase functions deploy stripe-payment
```

## Monitoring

View logs in Supabase Dashboard:
- Go to Edge Functions → stripe-payment → Logs
- Filter by error/success status
- Track payment operations

Or use CLI:
```bash
supabase functions logs stripe-payment --tail
```

## Common Issues

### "STRIPE_SECRET_KEY not configured"
- Set secret: `supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx`

### "Unauthorized" errors
- User must be logged in
- Check auth token is valid
- Verify RLS policies on database tables

### "Payment intent not found"
- Ensure booking exists in database before creating payment
- Check foreign key references are correct

### Capture fails with "Payment already captured"
- Check payment status before capture
- Handle idempotency (multiple capture attempts)

## Resources

- [Edge Function Code](./supabase/functions/stripe-payment/)
- [Stripe Payment System Guide](./STRIPE_PAYMENT_SYSTEM_GUIDE.md)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Stripe API Docs](https://stripe.com/docs/api/payment_intents)
