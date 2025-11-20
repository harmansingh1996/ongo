# Stripe Payment Edge Function

This Supabase Edge Function handles all Stripe payment operations securely on the server-side.

## Features

- ✅ **Create Payment Intent** - Authorize payment when rider books (hold funds)
- ✅ **Capture Payment** - Charge rider after ride completion
- ✅ **Cancel Payment** - Release authorization if booking cancelled
- ✅ **Refund Payment** - Refund captured payments (driver no-shows)
- ✅ **Driver Payouts** - Transfer earnings to driver bank accounts
- ✅ **Webhook Verification** - Verify Stripe webhook signatures

## Setup

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (using Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or download from: https://github.com/supabase/cli/releases
```

### 2. Link Your Supabase Project

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref <YOUR_PROJECT_REF>
```

Find your project ref in Supabase Dashboard → Settings → General → Reference ID

### 3. Set Environment Variables

Create secrets in Supabase Dashboard → Edge Functions → Manage secrets:

```bash
# Set Stripe secret key
supabase secrets set STRIPE_SECRET_KEY=sk_test_...

# Set webhook secret (optional, for webhook verification)
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Or use CLI:
```bash
supabase secrets set --env-file ./supabase/.env.local
```

Create `supabase/.env.local`:
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### 4. Deploy the Function

```bash
supabase functions deploy stripe-payment
```

### 5. Get Function URL

After deployment, you'll get a URL like:
```
https://<project-ref>.supabase.co/functions/v1/stripe-payment
```

## API Usage

### 1. Create Payment Intent (Authorize)

**Endpoint:** `POST /stripe-payment`

**Headers:**
```json
{
  "Authorization": "Bearer <supabase-user-token>",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "action": "create",
  "rideId": "ride-uuid",
  "bookingId": "booking-uuid",
  "driverId": "driver-uuid",
  "amountSubtotal": 5000,
  "referralCode": "FRIEND10"
}
```

**Response:**
```json
{
  "success": true,
  "paymentIntent": {
    "id": 123,
    "stripe_payment_intent_id": "pi_xxx",
    "amount_total": 4500,
    "status": "authorized"
  },
  "clientSecret": "pi_xxx_secret_yyy"
}
```

### 2. Capture Payment (After Ride Complete)

**Body:**
```json
{
  "action": "capture",
  "paymentIntentId": 123
}
```

**Response:**
```json
{
  "success": true,
  "capturedAmount": 4500,
  "driverEarnings": 3825
}
```

### 3. Cancel Payment (Release Authorization)

**Body:**
```json
{
  "action": "cancel",
  "paymentIntentId": 123,
  "reason": "Booking cancelled by rider"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment authorization released"
}
```

### 4. Refund Payment (Already Captured)

**Body:**
```json
{
  "action": "refund",
  "paymentIntentId": 123,
  "reason": "Driver no-show"
}
```

**Response:**
```json
{
  "success": true,
  "refundId": "re_xxx",
  "amountRefunded": 4500
}
```

### 5. Create Driver Payout

**Body:**
```json
{
  "action": "create_payout",
  "driverId_payout": "driver-uuid",
  "amount": 10000
}
```

**Response:**
```json
{
  "success": true,
  "payoutId": "tr_xxx",
  "amount": 10000
}
```

## Integration with Frontend

Update `src/services/paymentService.ts` to call the Edge Function:

```typescript
import { supabase } from './supabaseClient';

export const createAndAuthorizePayment = async (params: {
  rideId: string;
  bookingId: string;
  driverId: string;
  amountSubtotal: number;
  referralCode?: string;
}) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/stripe-payment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        ...params,
      }),
    }
  );

  return await response.json();
};

export const capturePayment = async (paymentIntentId: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/stripe-payment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'capture',
        paymentIntentId,
      }),
    }
  );

  return await response.json();
};

export const cancelPayment = async (paymentIntentId: number, reason?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/stripe-payment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'cancel',
        paymentIntentId,
        reason,
      }),
    }
  );

  return await response.json();
};

export const refundPayment = async (paymentIntentId: number, reason?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${supabase.supabaseUrl}/functions/v1/stripe-payment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'refund',
        paymentIntentId,
        reason,
      }),
    }
  );

  return await response.json();
};
```

## Testing

### Local Testing

```bash
# Start local Edge Functions
supabase functions serve stripe-payment --env-file ./supabase/.env.local

# Test with curl
curl -i --location --request POST 'http://localhost:54321/functions/v1/stripe-payment' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"action":"create","rideId":"test","bookingId":"test","driverId":"test","amountSubtotal":5000}'
```

### Production Testing

Use Stripe test mode keys:
- Test card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits

## Security Considerations

✅ **Secret Keys Never Exposed** - Stripe secret key stays on server  
✅ **User Authentication** - All requests require valid Supabase auth token  
✅ **CORS Protection** - Only your domain can call the function  
✅ **Input Validation** - All parameters validated before processing  
✅ **Database Transactions** - Atomic operations prevent data inconsistency  

## Database Schema Requirements

The Edge Function expects these tables to exist in your Supabase database:

- `stripe_payment_intents` - Payment records
- `payment_history` - Transaction audit log
- `payment_capture_log` - Capture attempts
- `driver_earnings` - Driver payout records
- `referrals` - Referral discount codes
- `profiles` - User profiles (with `stripe_connect_account_id`)

See `STRIPE_PAYMENT_SYSTEM_GUIDE.md` for full schema.

## Troubleshooting

### Function Not Found
- Verify deployment: `supabase functions list`
- Check project link: `supabase projects list`

### Authentication Errors
- Ensure valid Supabase auth token in Authorization header
- Check token hasn't expired

### Stripe API Errors
- Verify `STRIPE_SECRET_KEY` is set correctly
- Check Stripe Dashboard for API version compatibility
- Ensure you're using test keys in development

### Database Errors
- Verify all required tables exist
- Check RLS policies allow authenticated users to read/write
- Ensure foreign key references are valid

## Monitoring

View function logs in Supabase Dashboard:
1. Go to Edge Functions → stripe-payment
2. Click "Logs" tab
3. Filter by request status or error messages

Or use CLI:
```bash
supabase functions logs stripe-payment
```

## Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe PaymentIntents](https://stripe.com/docs/payments/payment-intents)
- [Stripe Connect Payouts](https://stripe.com/docs/connect/charges)
