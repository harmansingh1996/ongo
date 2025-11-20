# Stripe Edge Function Deployment Checklist

Use this checklist to deploy the Stripe payment Edge Function to your Supabase project.

## Prerequisites

- [ ] Supabase account created
- [ ] Supabase project created
- [ ] Stripe account created (test mode for development)
- [ ] Stripe API keys obtained from https://dashboard.stripe.com/test/apikeys

## Installation Steps

### 1. Install Supabase CLI

Choose your platform:

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Windows (using Scoop):**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Linux:**
```bash
# Download latest release
curl -LO https://github.com/supabase/cli/releases/download/v1.0.0/supabase_linux_amd64.tar.gz
tar -xzf supabase_linux_amd64.tar.gz
sudo mv supabase /usr/local/bin/
```

- [ ] Supabase CLI installed
- [ ] Verify: Run `supabase --version`

### 2. Login to Supabase

```bash
supabase login
```

This will open your browser to authenticate.

- [ ] Successfully logged in

### 3. Link Your Project

Find your project reference ID:
1. Go to Supabase Dashboard → https://app.supabase.com
2. Select your project
3. Go to Settings → General
4. Copy "Reference ID"

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

- [ ] Project linked
- [ ] Project ref saved: _______________

### 4. Configure Environment Variables

**Option A: Using .env.local (Recommended)**

Create `supabase/.env.local`:
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

Then set secrets:
```bash
cd supabase
supabase secrets set --env-file .env.local
```

**Option B: Set individually**
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

- [ ] Stripe secret key set
- [ ] Webhook secret set (optional for now)

### 5. Deploy the Edge Function

**Using deployment script (easier):**
```bash
cd supabase
./deploy.sh
```

**Manual deployment:**
```bash
supabase functions deploy stripe-payment
```

- [ ] Edge Function deployed successfully
- [ ] Function URL obtained: _______________

### 6. Test the Deployment

**Get your function URL:**
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-payment
```

**Test with curl:**
```bash
curl -i --location --request POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-payment' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "action": "create",
    "rideId": "test-ride-123",
    "bookingId": "test-booking-456",
    "driverId": "test-driver-789",
    "amountSubtotal": 5000
  }'
```

- [ ] Function responds (even with auth error is OK for now)
- [ ] No deployment errors

### 7. Update Frontend Configuration

Add to `.env` or `.env.local`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] Environment variables added
- [ ] Application rebuilt: `npm run build`

### 8. Verify Database Schema

Ensure these tables exist in your Supabase database:

- [ ] `stripe_payment_intents` - Payment records
- [ ] `payment_history` - Transaction log
- [ ] `payment_capture_log` - Capture attempts
- [ ] `driver_earnings` - Driver payouts
- [ ] `referrals` - Referral codes
- [ ] `bookings` - Booking records
- [ ] `rides` - Ride records
- [ ] `profiles` - User profiles

Check in Supabase Dashboard → Table Editor

- [ ] All tables exist
- [ ] RLS policies configured

### 9. Test Payment Flow

**Test with Stripe test cards:**

| Card Number | Behavior |
|------------|----------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |
| 4000 0000 0000 9995 | Insufficient funds |

**Test scenarios:**
- [ ] Create payment intent (authorize)
- [ ] Capture payment (after ride complete)
- [ ] Cancel payment (booking cancelled)
- [ ] Refund payment (driver no-show)

### 10. Monitor and Debug

**View logs in Supabase Dashboard:**
1. Go to Edge Functions → stripe-payment
2. Click "Logs" tab
3. Monitor requests and errors

**Or use CLI:**
```bash
supabase functions logs stripe-payment --tail
```

- [ ] Logs accessible
- [ ] No critical errors

## Production Deployment

### Before Going Live:

- [ ] Switch to Stripe live keys (from https://dashboard.stripe.com/apikeys)
- [ ] Update secrets with live keys:
  ```bash
  supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
  ```
- [ ] Test with real bank cards in test mode first
- [ ] Set up Stripe webhooks (optional but recommended)
- [ ] Configure Stripe Connect for driver payouts
- [ ] Enable Stripe production mode
- [ ] Monitor first transactions closely

### Security Checklist:

- [ ] Stripe secret keys never exposed in frontend code
- [ ] All Edge Function requests require authentication
- [ ] RLS policies protect database tables
- [ ] Payment amounts validated on server-side
- [ ] Error messages don't leak sensitive info
- [ ] HTTPS only (enforced by Supabase)

## Troubleshooting

### "Supabase CLI not found"
- Install CLI following step 1 above
- Restart terminal after installation

### "Not logged in"
- Run `supabase login`
- Complete browser authentication

### "Project not linked"
- Run `supabase link --project-ref YOUR_PROJECT_REF`
- Find project ref in Supabase Dashboard → Settings

### "STRIPE_SECRET_KEY not configured"
- Set secret: `supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx`
- Verify: `supabase secrets list`

### "Function deployment failed"
- Check function syntax: `deno check supabase/functions/stripe-payment/index.ts`
- Verify all imports are valid
- Check logs: `supabase functions logs stripe-payment`

### "Unauthorized" errors in production
- User must be logged in to Supabase
- Check auth token is valid
- Verify RLS policies allow access

### Payment creation fails
- Check booking exists in database first
- Verify all required fields provided
- Check Stripe dashboard for error details

## Support Resources

- **Edge Function Code:** `supabase/functions/stripe-payment/`
- **Integration Guide:** `STRIPE_EDGE_FUNCTION_GUIDE.md`
- **Payment System Guide:** `STRIPE_PAYMENT_SYSTEM_GUIDE.md`
- **Supabase Docs:** https://supabase.com/docs/guides/functions
- **Stripe API Docs:** https://stripe.com/docs/api
- **Stripe Testing:** https://stripe.com/docs/testing

## Quick Reference Commands

```bash
# Deploy function
supabase functions deploy stripe-payment

# View logs
supabase functions logs stripe-payment

# Set secret
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx

# List secrets
supabase secrets list

# Test locally
supabase functions serve stripe-payment --env-file .env.local
```

---

## Completion Checklist

- [ ] Edge Function deployed
- [ ] Secrets configured
- [ ] Frontend updated
- [ ] Database schema verified
- [ ] Payment flow tested
- [ ] Logs monitored
- [ ] Documentation reviewed

**Deployment Status:** _______________  
**Deployed By:** _______________  
**Date:** _______________  
**Function URL:** _______________
