# Stripe Webhook Configuration Guide

## Overview

This guide walks you through configuring Stripe webhooks to receive real-time payment event notifications for your OnGoPool ride-sharing application.

## Webhook Endpoint

Your Stripe Edge Function is deployed and ready to receive webhook events at:

```
https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment
```

## Why Use Webhooks?

Webhooks provide real-time notifications about payment events that occur in Stripe, including:

- **Payment Intent Events**: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
- **Charge Events**: `charge.succeeded`, `charge.failed`, `charge.refunded`
- **Dispute Events**: `charge.dispute.created`, `charge.dispute.closed`
- **Payout Events**: `payout.paid`, `payout.failed`
- **Account Events**: `account.updated` (for Stripe Connect drivers)

**Benefits:**
- ✅ Synchronize payment states in real-time
- ✅ Handle asynchronous payment confirmations
- ✅ Detect failed payments and fraud attempts
- ✅ Track refunds and disputes automatically
- ✅ Monitor driver payout status

## Setup Instructions

### Step 1: Log into Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Sign in with your Stripe account
3. **IMPORTANT**: Make sure you're in the correct mode:
   - **Test Mode** (for development): Use test keys and test webhooks
   - **Live Mode** (for production): Use live keys and production webhooks

### Step 2: Navigate to Webhooks

1. Click on **Developers** in the top navigation
2. Select **Webhooks** from the sidebar
3. Click **Add endpoint** button

### Step 3: Configure Endpoint

#### Endpoint URL
```
https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment
```

#### Description (Optional)
```
OnGoPool Payment Events - Supabase Edge Function
```

#### API Version
Select **Latest API version** (currently 2024-12-18.acacia)

### Step 4: Select Events to Listen For

Choose the events your application needs to handle:

#### **Recommended Events for Ride-Sharing Platform:**

**Payment Intent Events** (Essential):
- ✅ `payment_intent.succeeded` - Payment captured successfully
- ✅ `payment_intent.payment_failed` - Payment failed
- ✅ `payment_intent.canceled` - Payment authorization cancelled
- ✅ `payment_intent.amount_capturable_updated` - Authorization amount changed

**Charge Events** (Important):
- ✅ `charge.succeeded` - Charge completed
- ✅ `charge.failed` - Charge failed
- ✅ `charge.refunded` - Refund processed
- ✅ `charge.dispute.created` - Chargeback initiated
- ✅ `charge.dispute.closed` - Chargeback resolved

**Payout Events** (For Driver Earnings):
- ✅ `payout.paid` - Driver payout completed
- ✅ `payout.failed` - Driver payout failed
- ✅ `transfer.created` - Transfer to driver account created
- ✅ `transfer.reversed` - Transfer reversed

**Account Events** (For Stripe Connect Drivers):
- ✅ `account.updated` - Driver Stripe account updated
- ✅ `account.application.deauthorized` - Driver disconnected

#### Quick Selection Options:
- **Option 1**: Click **Select all events** (receives everything)
- **Option 2**: Click **Select events** and choose specific events above

### Step 5: Add Endpoint

1. Click **Add endpoint** button at the bottom
2. Stripe will create the webhook and show you the **Signing secret**
3. **CRITICAL**: Copy the signing secret immediately (starts with `whsec_...`)

### Step 6: Configure Signing Secret in Supabase

The signing secret is used to verify that webhook events actually come from Stripe.

#### Option A: Via Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: **OnGoPool** (fewhwgvlgstmukhebyvz)
3. Navigate to **Edge Functions** → **stripe-payment**
4. Click **Secrets** or **Environment Variables**
5. Add or update:
   - **Key**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: `whsec_your_webhook_signing_secret`
6. Click **Save**

#### Option B: Via Supabase CLI

```bash
# Set the webhook secret
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret

# Verify it's set
supabase secrets list
```

### Step 7: Test the Webhook

Stripe provides built-in testing tools:

1. In the Stripe Dashboard, go to your webhook endpoint
2. Click **Send test webhook** button
3. Select an event type (e.g., `payment_intent.succeeded`)
4. Click **Send test webhook**
5. Check the response:
   - ✅ **200 OK**: Webhook working correctly
   - ❌ **4xx/5xx**: Check Edge Function logs for errors

## Webhook Handler Implementation

The deployed Edge Function already includes webhook verification logic. Here's how it works:

### Edge Function Webhook Verification

```typescript
// In supabase/functions/stripe-payment/index.ts
async function verifyWebhook(stripe: Stripe, body: PaymentRequest) {
  const { payload, signature } = body;

  if (!payload || !signature) {
    return new Response(
      JSON.stringify({ error: "Payload and signature required" }),
      { status: 400, headers: corsHeaders }
    );
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: event.type,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Webhook verification failed" }),
      { status: 400, headers: corsHeaders }
    );
  }
}
```

### Handling Webhook Events (Future Implementation)

To handle specific webhook events, you can extend the Edge Function:

```typescript
// Example: Handle payment_intent.succeeded event
switch (event.type) {
  case 'payment_intent.succeeded':
    const paymentIntent = event.data.object;
    console.log('Payment succeeded:', paymentIntent.id);
    
    // Update ride status to "paid"
    await supabase
      .from('rides')
      .update({ payment_status: 'paid' })
      .eq('stripe_payment_intent_id', paymentIntent.id);
    break;

  case 'payment_intent.payment_failed':
    const failedIntent = event.data.object;
    console.log('Payment failed:', failedIntent.id);
    
    // Notify rider of payment failure
    await supabase
      .from('notifications')
      .insert({
        user_id: failedIntent.metadata.rider_id,
        type: 'payment_failed',
        message: 'Payment failed. Please update your payment method.',
      });
    break;

  case 'charge.refunded':
    const refund = event.data.object;
    console.log('Charge refunded:', refund.id);
    
    // Update booking status
    await supabase
      .from('ride_requests')
      .update({ status: 'refunded' })
      .eq('stripe_charge_id', refund.id);
    break;

  // Add more event handlers as needed
}
```

## Webhook Event Flow

### Typical Payment Flow with Webhooks

```
1. Rider Books Ride
   ↓
2. Frontend: createAndAuthorizePayment()
   ↓
3. Edge Function: Creates PaymentIntent (authorized)
   ↓
4. Webhook: payment_intent.created (optional notification)
   ↓
5. Rider Completes Ride
   ↓
6. Driver Confirms Completion
   ↓
7. Frontend: capturePayment()
   ↓
8. Edge Function: Captures PaymentIntent
   ↓
9. Webhook: payment_intent.succeeded ✅
   ↓
10. Update ride status to "paid"
    ↓
11. Create driver earnings record
    ↓
12. Send confirmation notifications
```

### Cancellation Flow with Webhooks

```
1. Rider Cancels Booking
   ↓
2. Frontend: cancelPayment()
   ↓
3. Edge Function: Cancels PaymentIntent
   ↓
4. Webhook: payment_intent.canceled
   ↓
5. Release authorization
   ↓
6. Update booking status to "cancelled"
   ↓
7. Notify driver of cancellation
```

## Security Best Practices

### ✅ DO:
- **Always verify webhook signatures** using `stripe.webhooks.constructEvent()`
- **Use HTTPS only** for webhook endpoints
- **Store signing secret securely** in Supabase environment variables
- **Implement idempotency** to handle duplicate webhook deliveries
- **Log all webhook events** for debugging and audit trails
- **Return 200 OK quickly** and process events asynchronously if needed

### ❌ DON'T:
- **Never disable signature verification** in production
- **Never log sensitive data** (card numbers, secrets) in webhook handlers
- **Never expose signing secrets** in frontend code
- **Never assume webhooks arrive in order** - handle out-of-order events
- **Never block webhook responses** with long-running operations

## Testing Webhooks

### Local Testing with Stripe CLI

1. **Install Stripe CLI**:
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Windows (Scoop)
   scoop install stripe
   ```

2. **Login to Stripe**:
   ```bash
   stripe login
   ```

3. **Forward webhooks to local Edge Function**:
   ```bash
   stripe listen --forward-to http://localhost:54321/functions/v1/stripe-payment
   ```

4. **Trigger test events**:
   ```bash
   stripe trigger payment_intent.succeeded
   stripe trigger payment_intent.payment_failed
   stripe trigger charge.refunded
   ```

### Production Testing

1. Go to Stripe Dashboard → Webhooks
2. Select your webhook endpoint
3. Click **Send test webhook**
4. Choose event type and send
5. View response and logs in Supabase Dashboard

## Monitoring Webhooks

### Stripe Dashboard Monitoring

1. Go to **Developers** → **Webhooks**
2. Click on your endpoint
3. View:
   - **Recent events**: Last 100 webhook deliveries
   - **Response times**: Endpoint performance
   - **Success rate**: Delivery success percentage
   - **Failed events**: Events that returned errors

### Supabase Edge Function Logs

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions** → **stripe-payment**
3. Click **Logs** tab
4. Filter by:
   - **Time range**: Last hour, day, week
   - **Status**: Success (200), Errors (4xx, 5xx)
   - **Search**: Find specific payment IDs

### Recommended Monitoring Setup

- **Alert on failed webhooks**: Set up email alerts for webhook failures
- **Monitor success rate**: Keep success rate above 99%
- **Track response times**: Ensure responses under 1 second
- **Log critical events**: Log all payment failures and disputes

## Troubleshooting

### Webhook Not Receiving Events

**Check 1: Endpoint Configuration**
- Verify endpoint URL is correct
- Ensure HTTPS is used (not HTTP)
- Check endpoint is active in Stripe Dashboard

**Check 2: Event Selection**
- Verify you've selected the correct events
- Check if events are being sent (view in Stripe Dashboard)

**Check 3: Network/Firewall**
- Ensure Supabase Edge Functions are accessible from internet
- Check if any firewalls are blocking Stripe IPs

### Webhook Verification Failing

**Check 1: Signing Secret**
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Ensure no extra spaces or characters in secret
- Confirm secret matches the one in Stripe Dashboard

**Check 2: Payload Handling**
- Ensure raw request body is used for verification
- Don't parse JSON before verification
- Check for character encoding issues

### Webhook Timeouts

**Issue**: Stripe expects responses within 5 seconds

**Solutions**:
1. Return 200 OK immediately
2. Queue heavy processing for background jobs
3. Use database transactions to speed up operations
4. Optimize database queries

### Duplicate Events

**Issue**: Stripe may send the same event multiple times

**Solution**: Implement idempotency
```typescript
// Check if event already processed
const { data: existingEvent } = await supabase
  .from('webhook_events')
  .select('id')
  .eq('stripe_event_id', event.id)
  .single();

if (existingEvent) {
  return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
    status: 200,
    headers: corsHeaders,
  });
}

// Process event...

// Mark as processed
await supabase
  .from('webhook_events')
  .insert({
    stripe_event_id: event.id,
    event_type: event.type,
    processed_at: new Date().toISOString(),
  });
```

## Webhook Event Reference

### Payment Intent Events

| Event | Description | Action Required |
|-------|-------------|-----------------|
| `payment_intent.created` | PaymentIntent created | Log event |
| `payment_intent.succeeded` | Payment captured successfully | Update ride status, create earnings |
| `payment_intent.payment_failed` | Payment failed | Notify user, cancel booking |
| `payment_intent.canceled` | Authorization cancelled | Update booking status |
| `payment_intent.amount_capturable_updated` | Authorization amount changed | Update payment amount |

### Charge Events

| Event | Description | Action Required |
|-------|-------------|-----------------|
| `charge.succeeded` | Charge completed | Confirm payment |
| `charge.failed` | Charge failed | Handle failure |
| `charge.refunded` | Refund issued | Update booking, notify users |
| `charge.dispute.created` | Chargeback initiated | Alert admin, gather evidence |
| `charge.dispute.closed` | Dispute resolved | Update records |

### Payout Events

| Event | Description | Action Required |
|-------|-------------|-----------------|
| `payout.paid` | Payout sent to driver | Update earnings status |
| `payout.failed` | Payout failed | Notify driver, retry |
| `transfer.created` | Transfer initiated | Log transfer |
| `transfer.reversed` | Transfer reversed | Handle reversal |

## Next Steps

1. ✅ **Configure webhook endpoint** in Stripe Dashboard
2. ✅ **Set STRIPE_WEBHOOK_SECRET** in Supabase
3. ✅ **Test webhook** with Stripe test events
4. ⚠️ **Implement event handlers** for critical events (optional, future enhancement)
5. ⚠️ **Set up monitoring** and alerts for webhook failures
6. ⚠️ **Document event handling** in your codebase

## Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

## Configuration Status

- ✅ **Edge Function Deployed**: stripe-payment function active
- ✅ **Webhook Endpoint URL**: Ready to configure
- ⏳ **Webhook Configuration**: Awaiting Stripe Dashboard setup
- ⏳ **Signing Secret**: Needs to be added to Supabase
- ⏳ **Event Handlers**: Basic verification ready, specific handlers pending

---

**Need Help?**
- Stripe Support: https://support.stripe.com
- Supabase Support: https://supabase.com/support
- Project Documentation: See `STRIPE_EDGE_FUNCTION_DEPLOYMENT_SUCCESS.md`
