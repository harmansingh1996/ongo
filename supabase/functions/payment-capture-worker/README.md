# Payment Capture Worker - Automated Payment Processing

## Overview

This Supabase Edge Function automatically processes queued payment captures from the `payment_capture_queue` table. It polls for pending payments and calls the `stripe-payment` Edge Function to capture authorized Stripe payments.

## Features

- **Automatic Queue Processing**: Polls `payment_capture_queue` for pending payments
- **Batch Processing**: Processes multiple payments per execution (configurable)
- **Retry Logic**: Automatic retries with exponential backoff for failed captures
- **Error Tracking**: Logs all failures and tracks attempt counts
- **Idempotent**: Safe to run multiple times without duplicate captures
- **Status Management**: Updates queue status (pending → processing → completed/failed)

## How It Works

### 1. Queue Detection
- Queries `payment_capture_queue` for entries with `status = 'pending'`
- Orders by `created_at` to process oldest first
- Limits batch size (default: 10 payments per run)

### 2. Payment Capture
For each queued payment:
1. Update status to `processing`
2. Call `stripe-payment` Edge Function with `action: "capture"`
3. Update status to `completed` on success
4. Update status to `pending` (retry) or `failed` on error

### 3. Retry Strategy
- **Max Attempts**: 5 attempts per payment
- **Backoff**: Exponential delay between batches (500ms base)
- **Failure Handling**: After 5 failures, marks as `failed` and stops retrying

### 4. Error Tracking
- Stores error messages in `error_message` column
- Tracks `attempts` count for monitoring
- Logs `last_attempt_at` timestamp

## Deployment

### 1. Deploy Edge Function

```bash
cd supabase/functions
supabase functions deploy payment-capture-worker
```

### 2. Set Environment Variables

The worker requires these environment variables:

```bash
# In Supabase Dashboard → Edge Functions → payment-capture-worker → Settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
STRIPE_EDGE_FUNCTION_URL=https://your-project.supabase.co/functions/v1/stripe-payment
```

**Important**: Use the **Service Role Key** (not anon key) for admin database access.

### 3. Schedule Execution (Cron)

#### Option A: Supabase Cron (Recommended)
Create a cron job in Supabase SQL Editor:

```sql
-- Run every 5 minutes
SELECT cron.schedule(
  'process-payment-captures',
  '*/5 * * * *', -- Every 5 minutes
  $$ 
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/payment-capture-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

#### Option B: External Cron Service
Use services like:
- **GitHub Actions**: Scheduled workflow
- **Render**: Background worker
- **Vercel Cron**: Serverless cron job

```yaml
# Example: GitHub Actions (.github/workflows/payment-worker.yml)
name: Payment Capture Worker
on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
jobs:
  run-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Worker
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            https://your-project.supabase.co/functions/v1/payment-capture-worker
```

## Manual Execution

### Trigger via HTTP Request

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  https://your-project.supabase.co/functions/v1/payment-capture-worker
```

### With Custom Configuration

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 20, "maxAttempts": 3}' \
  https://your-project.supabase.co/functions/v1/payment-capture-worker
```

## Monitoring

### Check Queue Status

```sql
-- View pending captures
SELECT 
  id,
  stripe_payment_intent_id,
  amount_cents / 100.0 as amount_dollars,
  status,
  attempts,
  error_message,
  created_at,
  last_attempt_at
FROM payment_capture_queue
WHERE status = 'pending'
ORDER BY created_at ASC;
```

### View Failed Captures

```sql
-- Check failed payments
SELECT 
  pcq.*,
  spi.rider_id,
  r.status as ride_status
FROM payment_capture_queue pcq
JOIN stripe_payment_intents spi ON pcq.payment_intent_id = spi.id
JOIN rides r ON pcq.ride_id = r.id
WHERE pcq.status = 'failed'
ORDER BY pcq.created_at DESC;
```

### Worker Execution Logs

View logs in Supabase Dashboard:
1. Go to **Edge Functions** → **payment-capture-worker**
2. Click **Logs** tab
3. Check for success/error messages

## Response Format

### Success Response

```json
{
  "success": true,
  "processed": 10,
  "succeeded": 9,
  "failed": 1,
  "results": [
    {
      "success": true,
      "paymentId": "uuid-1"
    },
    {
      "success": false,
      "paymentId": "uuid-2",
      "error": "Payment already captured"
    }
  ]
}
```

### Error Response

```json
{
  "success": false,
  "error": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
}
```

## Troubleshooting

### Common Issues

**1. "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"**
- Solution: Set environment variables in Edge Function settings

**2. "STRIPE_EDGE_FUNCTION_URL not configured"**
- Solution: Add `STRIPE_EDGE_FUNCTION_URL` to environment variables

**3. "No pending payments"**
- Check if queue is empty: `SELECT * FROM payment_capture_queue WHERE status = 'pending'`
- Verify trigger is working: Check if new rides create queue entries

**4. Payments stuck in "processing"**
- Reset stuck payments: 
```sql
UPDATE payment_capture_queue 
SET status = 'pending' 
WHERE status = 'processing' 
  AND last_attempt_at < NOW() - INTERVAL '10 minutes';
```

**5. All payments failing**
- Check `stripe-payment` Edge Function is deployed
- Verify Stripe API keys are correct
- Review error messages in queue table

## Security

- **Service Role Key**: Required for admin database access
- **CORS**: Disabled for security (worker is server-side only)
- **Rate Limiting**: Built-in 500ms delay between captures
- **Idempotency**: Safe to retry failed payments

## Performance

- **Batch Size**: Default 10 payments per run (configurable)
- **Execution Time**: ~5-10 seconds per batch
- **Concurrency**: Processes payments sequentially to avoid race conditions
- **Resource Usage**: Minimal (serverless Edge Function)

## Maintenance

### Retry Failed Payments

Reset failed payments for retry:

```sql
-- Reset specific payment
UPDATE payment_capture_queue 
SET status = 'pending', attempts = 0, error_message = NULL 
WHERE id = 'payment-uuid';

-- Reset all failed payments
UPDATE payment_capture_queue 
SET status = 'pending', attempts = 0, error_message = NULL 
WHERE status = 'failed';
```

### Archive Old Completed Payments

```sql
-- Delete completed entries older than 30 days
DELETE FROM payment_capture_queue 
WHERE status = 'completed' 
  AND created_at < NOW() - INTERVAL '30 days';
```

## Future Enhancements

- [ ] Webhook integration for real-time processing
- [ ] Advanced retry strategies (exponential backoff)
- [ ] Email notifications for persistent failures
- [ ] Dashboard for monitoring queue health
- [ ] Metrics and analytics integration
