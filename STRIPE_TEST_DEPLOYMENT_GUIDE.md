# Stripe Payment Test Function - Manual Deployment Guide

## Issue Summary

The automated Edge Function deployment is encountering API limitations. The function code has been corrected locally and needs to be deployed manually via the Supabase Dashboard.

## Fixed Code Location

File: `supabase/functions/stripe-payment-test/index.ts`

## What Was Fixed

1. **Rides Table Schema**: Updated to use correct JSONB format
   - `from_location`: JSONB object with address, lat, lng
   - `to_location`: JSONB object with address, lat, lng
   - Added required fields: `date`, `time`, `available_seats`, `price_per_seat`

2. **Error Handling**: Added explicit error checking for all database operations
   - Profile creation (rider and driver)
   - Ride creation
   - Payment intent insertion

## Manual Deployment Steps

### Method 1: Supabase Dashboard (Recommended)

1. **Navigate to Edge Functions**:
   - Go to https://supabase.com/dashboard/project/fewhwgvlgstmukhebyvz
   - Click on "Edge Functions" in the left sidebar

2. **Select Function**:
   - Find "stripe-payment-test" in the list
   - Click on it to open the function details

3. **Deploy New Version**:
   - Click "Deploy new version" or "Edit function"
   - Copy the entire content from `supabase/functions/stripe-payment-test/index.ts`
   - Paste it into the editor
   - Click "Deploy" or "Save"

4. **Verify Deployment**:
   - Check that the version number incremented (should be v2)
   - Status should show "ACTIVE"

### Method 2: Supabase CLI (If Installed)

If you have Supabase CLI installed on your Mac:

```bash
# Navigate to project root
cd /path/to/your/project

# Deploy the function
supabase functions deploy stripe-payment-test --project-ref fewhwgvlgstmukhebyvz

# If prompted, follow authentication steps
```

### Method 3: Install Supabase CLI First

If Supabase CLI is not installed:

```bash
# Install via Homebrew (macOS)
brew install supabase/tap/supabase

# Login to Supabase
supabase login

# Deploy the function
cd /path/to/your/project
supabase functions deploy stripe-payment-test --project-ref fewhwgvlgstmukhebyvz
```

## After Deployment - Test the Function

Once deployed, run this test command:

```bash
curl -X POST \
  'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment-test' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZld2h3Z3ZsZ3N0bXVraGVieXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDY0NDEsImV4cCI6MjA3ODcyMjQ0MX0.Sgw13uQNKId3j3MsT-L5Ae8_oRnWTNvBw480BfS0e-I' \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "all", "amount": 5000}'
```

## Expected Success Response

```json
{
  "success": true,
  "result": {
    "scenario": "create",
    "success": true,
    "paymentIntentId": "uuid-here",
    "status": "requires_payment_method",
    "amount": 5000,
    "details": {
      "stripe_payment_intent_id": "pi_...",
      "db_id": "uuid-here"
    }
  }
}
```

## Troubleshooting

### If Test Still Fails After Deployment:

1. **Check Function Logs in Supabase Dashboard**:
   - Go to Edge Functions → stripe-payment-test → Logs
   - Look for detailed error messages

2. **Verify Database Migration**:
   - The `ride_id` column should be nullable
   - Verify with: `SELECT is_nullable FROM information_schema.columns WHERE table_name='stripe_payment_intents' AND column_name='ride_id';`
   - Should return: `YES`

3. **Check RLS Policies**:
   - Ensure Service Role Key has permissions for:
     - `profiles` table (INSERT)
     - `rides` table (INSERT)
     - `stripe_payment_intents` table (INSERT)

4. **Environment Variables**:
   - Verify `STRIPE_SECRET_KEY` is set (must start with `sk_test_`)
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

## Additional Notes

- The function uses Stripe TEST mode keys only
- Test data is created with unique UUIDs each run
- All test records are real database entries (not mocked)
- Consider adding cleanup logic later to remove test data

## Files Modified

- `supabase/functions/stripe-payment-test/index.ts` - Corrected schema
- `STRIPE_TEST_FK_FIX.sql` - Database migration documentation
- `STRIPE_TEST_DEPLOYMENT_GUIDE.md` - This deployment guide

## Next Steps After Successful Test

1. Expand test suite to include:
   - Authorize scenario
   - Capture scenario
   - Refund scenario
   - Cancel scenario
   - Failed payment scenario

2. Add cleanup function to remove test data

3. Integrate into CI/CD pipeline for automated testing
