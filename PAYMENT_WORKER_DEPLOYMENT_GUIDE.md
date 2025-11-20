# Payment Capture Worker - Deployment Guide

## ✅ Deployment Status

**Edge Function**: `payment-capture-worker` ✅ **DEPLOYED**
- **Project**: OnGoPool (fewhwgvlgstmukhebyvz)
- **URL**: `https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker`
- **Status**: ACTIVE
- **Version**: 1

## 🔧 Required Configuration

### Step 1: Set Environment Variables

You need to configure these environment variables in Supabase Dashboard:

1. Go to: **Supabase Dashboard** → **Edge Functions** → **payment-capture-worker** → **Settings**

2. Add the following secrets:

```bash
# Supabase Configuration
SUPABASE_URL=https://fewhwgvlgstmukhebyvz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ANON_KEY=<your-anon-key>

# Stripe Edge Function URL
STRIPE_EDGE_FUNCTION_URL=https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment
```

**How to find your keys:**
- Go to **Supabase Dashboard** → **Settings** → **API**
- Copy **anon/public** key → Use for `SUPABASE_ANON_KEY`
- Copy **service_role** key → Use for `SUPABASE_SERVICE_ROLE_KEY`

**⚠️ CRITICAL**: Use the **Service Role Key** (not anon key) for `SUPABASE_SERVICE_ROLE_KEY`. This gives the worker admin access to the database.

### Step 2: Schedule Automatic Execution

Choose one of these methods to run the worker automatically:

#### Option A: Supabase pg_cron (Recommended)

Run this SQL in Supabase SQL Editor:

```sql
-- Schedule worker to run every 5 minutes
SELECT cron.schedule(
  'process-payment-captures',
  '*/5 * * * *', -- Every 5 minutes
  $$ 
  SELECT net.http_post(
    url := 'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check scheduled jobs
SELECT * FROM cron.job;

-- Check job execution logs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

**Replace `YOUR_SERVICE_ROLE_KEY_HERE`** with your actual service role key.

#### Option B: Manual Trigger (For Testing)

Test the worker manually:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker
```

#### Option C: GitHub Actions (Alternative)

Create `.github/workflows/payment-worker.yml`:

```yaml
name: Payment Capture Worker
on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
  workflow_dispatch: # Allow manual trigger

jobs:
  run-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Payment Worker
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -H "Content-Type: application/json" \
            https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker
```

Add `SUPABASE_SERVICE_KEY` to GitHub Secrets.

## 🧪 Testing

### Test 1: Manual Execution

```bash
# Trigger worker manually
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker

# Expected response:
{
  "success": true,
  "processed": 10,
  "succeeded": 10,
  "failed": 0,
  "results": [...]
}
```

### Test 2: Check Worker Logs

1. Go to **Supabase Dashboard** → **Edge Functions** → **payment-capture-worker** → **Logs**
2. Look for these messages:
   - ✅ `"Payment Capture Worker: Starting execution..."`
   - ✅ `"Found X pending payments"`
   - ✅ `"Payment <id> captured successfully"`
   - ✅ `"Worker completed: X succeeded, Y failed"`

### Test 3: Verify Queue Processing

```sql
-- Check pending payments (should decrease after worker runs)
SELECT COUNT(*) as pending_count 
FROM payment_capture_queue 
WHERE status = 'pending';

-- Check completed payments (should increase after worker runs)
SELECT COUNT(*) as completed_count 
FROM payment_capture_queue 
WHERE status = 'completed';

-- View recent captures
SELECT 
  id,
  stripe_payment_intent_id,
  amount_cents / 100.0 as amount_dollars,
  status,
  attempts,
  created_at,
  updated_at
FROM payment_capture_queue
WHERE status IN ('completed', 'processing')
ORDER BY updated_at DESC
LIMIT 10;
```

### Test 4: Verify Stripe Captures

Check Stripe Dashboard:
1. Go to **Stripe Dashboard** → **Payments**
2. Filter by **Status: Succeeded**
3. Confirm recent captures match queue entries

## 📊 Monitoring

### Queue Health Check

```sql
-- Summary of queue status
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount_cents) / 100.0 as total_amount_dollars
FROM payment_capture_queue
GROUP BY status
ORDER BY status;
```

### Failed Payment Analysis

```sql
-- View failed payments with error messages
SELECT 
  pcq.id,
  pcq.stripe_payment_intent_id,
  pcq.amount_cents / 100.0 as amount_dollars,
  pcq.attempts,
  pcq.error_message,
  pcq.last_attempt_at,
  r.status as ride_status,
  r.completed_at
FROM payment_capture_queue pcq
JOIN rides r ON pcq.ride_id = r.id
WHERE pcq.status = 'failed'
ORDER BY pcq.last_attempt_at DESC;
```

### Worker Performance Metrics

```sql
-- Average processing time per payment
SELECT 
  AVG(updated_at - created_at) as avg_processing_time,
  COUNT(*) as total_processed
FROM payment_capture_queue
WHERE status = 'completed';
```

## 🔧 Troubleshooting

### Issue 1: "No pending payments"

**Cause**: Queue is empty or trigger isn't creating entries.

**Solution**:
```sql
-- Check if trigger is creating queue entries
SELECT * FROM payment_capture_queue ORDER BY created_at DESC LIMIT 5;

-- If empty, verify trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_capture_payment_on_completion';

-- Test trigger manually by completing a ride
UPDATE rides SET status = 'completed' WHERE id = 'some-ride-id';
```

### Issue 2: "STRIPE_EDGE_FUNCTION_URL not configured"

**Cause**: Environment variable missing.

**Solution**: Add `STRIPE_EDGE_FUNCTION_URL` in Edge Function settings.

### Issue 3: Payments stuck in "processing"

**Cause**: Worker crashed mid-execution.

**Solution**: Reset stuck payments:
```sql
-- Reset payments stuck in processing for >10 minutes
UPDATE payment_capture_queue 
SET status = 'pending' 
WHERE status = 'processing' 
  AND last_attempt_at < NOW() - INTERVAL '10 minutes';
```

### Issue 4: All captures failing

**Cause**: Stripe API key issue or Edge Function error.

**Solution**:
1. Check `stripe-payment` Edge Function is deployed
2. Verify Stripe API keys in `stripe-payment` settings
3. Check worker logs for specific error messages

### Issue 5: Worker not running automatically

**Cause**: Cron job not scheduled or service key expired.

**Solution**:
```sql
-- Check if cron job exists
SELECT * FROM cron.job WHERE jobname = 'process-payment-captures';

-- Delete old job and recreate if needed
SELECT cron.unschedule('process-payment-captures');
-- Then run the schedule command again
```

## 🔒 Security Best Practices

1. **Service Role Key**: Keep it secret, never commit to code
2. **CORS**: Worker is server-side only, no browser access needed
3. **Rate Limiting**: Built-in 500ms delay between captures
4. **Idempotency**: Safe to retry failed payments
5. **Audit Logs**: All attempts tracked in queue table

## 📈 Performance Optimization

### Current Configuration
- **Batch Size**: 10 payments per run
- **Run Frequency**: Every 5 minutes (recommended)
- **Max Attempts**: 5 retries per payment
- **Retry Delay**: 500ms between captures

### Scaling Guidelines

**For higher volumes (>100 captures/hour):**
```bash
# Increase batch size
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 50, "maxAttempts": 3}' \
  https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker
```

**For real-time processing:**
- Reduce cron interval to `*/1 * * * *` (every minute)
- Or implement database webhook trigger

## 📝 Maintenance Tasks

### Weekly Cleanup

```sql
-- Archive completed payments older than 30 days
DELETE FROM payment_capture_queue 
WHERE status = 'completed' 
  AND updated_at < NOW() - INTERVAL '30 days';
```

### Retry Failed Payments

```sql
-- Reset all failed payments for retry
UPDATE payment_capture_queue 
SET status = 'pending', attempts = 0, error_message = NULL 
WHERE status = 'failed';
```

### Manual Capture (Emergency)

If worker fails, use the existing `manual-payment-capture.html` tool:
1. Open `manual-payment-capture.html` in browser
2. Enter Supabase credentials
3. Click "Load Authorized Payments"
4. Capture individually or in batch

## 🎯 Success Criteria

✅ Worker deployed and accessible
✅ Environment variables configured
✅ Cron job scheduled (every 5 minutes)
✅ 10 existing payments queued
✅ Test execution successful
✅ Logs showing successful captures
✅ Queue status: pending → completed
✅ Stripe shows captured payments

## 📚 Additional Resources

- **Worker Code**: `supabase/functions/payment-capture-worker/index.ts`
- **Detailed README**: `supabase/functions/payment-capture-worker/README.md`
- **Database Migration**: `FIX_PAYMENT_CAPTURE_AUTOMATION.sql`
- **Stripe Edge Function**: `supabase/functions/stripe-payment/index.ts`

## 🚀 Next Steps

1. ✅ Deploy Edge Function (DONE)
2. ⏳ **Set environment variables** (You need to do this in Supabase Dashboard)
3. ⏳ **Schedule cron job** (Run the SQL command above)
4. ⏳ **Test worker execution** (Run manual trigger command)
5. ⏳ **Monitor first captures** (Check logs and queue status)

**Once configured, the worker will automatically process all queued payments every 5 minutes!**
