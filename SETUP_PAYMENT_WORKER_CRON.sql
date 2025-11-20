-- ============================================================
-- PAYMENT CAPTURE WORKER - AUTOMATED CRON JOB SETUP
-- ============================================================
-- This script sets up a cron job to automatically process queued payment captures
-- Run this in Supabase SQL Editor after replacing YOUR_SERVICE_ROLE_KEY
-- ============================================================

-- Step 1: Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Remove existing job if it exists (for clean reinstall)
SELECT cron.unschedule('process-payment-captures')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-payment-captures'
);

-- Step 3: Schedule payment capture worker to run every 5 minutes
-- ⚠️ IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY_HERE with your actual service role key
-- Find it in: Supabase Dashboard → Settings → API → service_role key
SELECT cron.schedule(
  'process-payment-captures',           -- Job name
  '*/5 * * * *',                        -- Run every 5 minutes (cron expression)
  $$ 
  SELECT net.http_post(
    url := 'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'  -- ⚠️ REPLACE THIS
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check if cron job was created successfully
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname = 'process-payment-captures';

-- Expected output:
-- jobname: process-payment-captures
-- schedule: */5 * * * *
-- active: true

-- ============================================================
-- MONITORING QUERIES
-- ============================================================

-- View recent cron job executions
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-payment-captures')
ORDER BY start_time DESC
LIMIT 10;

-- Check pending payments in queue
SELECT 
  COUNT(*) as pending_count,
  SUM(amount_cents) / 100.0 as total_amount_dollars
FROM payment_capture_queue
WHERE status = 'pending';

-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- If you need to disable the cron job temporarily:
-- UPDATE cron.job SET active = false WHERE jobname = 'process-payment-captures';

-- To re-enable:
-- UPDATE cron.job SET active = true WHERE jobname = 'process-payment-captures';

-- To delete the cron job completely:
-- SELECT cron.unschedule('process-payment-captures');

-- To test the worker manually (run in terminal, not SQL editor):
-- curl -X POST \
--   -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--   -H "Content-Type: application/json" \
--   https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker

-- ============================================================
-- NOTES
-- ============================================================
-- 1. The service role key gives admin access - keep it secure
-- 2. Cron job runs server-side, no browser involved
-- 3. Worker processes max 10 payments per run (configurable)
-- 4. Failed payments retry up to 5 times with backoff
-- 5. Check Edge Function logs for execution details
-- 6. Adjust schedule if needed: '*/1 * * * *' = every minute
