# Render Deployment Guide

Complete guide to deploying the ride-sharing backend on Render.

## Prerequisites

1. **Render Account**: Sign up at https://render.com
2. **Git Repository**: Code pushed to GitHub/GitLab/Bitbucket
3. **Supabase Project**: Active Supabase project with database
4. **Stripe Account**: Stripe API keys (test or live)

## Deployment Steps

### Step 1: Prepare Environment Variables

Collect these values before deployment:

```bash
# Supabase (from https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_... or sk_live_...

# App Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
NODE_ENV=production
PORT=3000
```

### Step 2: Deploy to Render

#### Option A: Blueprint Deployment (Recommended)

1. **Push code to repository**:
```bash
git add backend/
git commit -m "Add Render backend"
git push origin main
```

2. **Create Blueprint in Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Blueprint"
   - Connect your repository
   - Render detects `backend/render.yaml`
   - Click "Apply"

3. **Configure Environment Variables**:
   - For **rideshare-backend-api** service:
     - Go to service → Environment tab
     - Add all variables from Step 1
     - Mark sensitive keys as "Secret"

   - For **rideshare-payment-capture-cron**:
     - Same environment variables
     - Update `startCommand` with deployed API URL:
       ```
       curl -X POST https://rideshare-backend-api.onrender.com/api/worker/payment-capture -H "Content-Type: application/json" -d "{}"
       ```

4. **Deploy**:
   - Services auto-deploy on first push
   - Monitor logs for successful startup

#### Option B: Manual Web Service Deployment

1. **Create Web Service**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect repository
   - Configure:
     - **Name**: `rideshare-backend-api`
     - **Root Directory**: `backend`
     - **Environment**: Docker
     - **Dockerfile Path**: `./Dockerfile`
     - **Region**: Choose closest to users
     - **Instance Type**: Starter (or paid)

2. **Set Environment Variables**:
   - Add all variables from Step 1

3. **Advanced Settings**:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: Yes

4. **Create Service**: Click "Create Web Service"

5. **Create Cron Job**:
   - Click "New +" → "Cron Job"
   - Name: `rideshare-payment-capture-cron`
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Command:
     ```bash
     curl -X POST https://rideshare-backend-api.onrender.com/api/worker/payment-capture -H "Content-Type: application/json" -d "{}"
     ```

### Step 3: Verify Deployment

1. **Check Health Endpoint**:
```bash
curl https://rideshare-backend-api.onrender.com/health
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-20T19:48:00.000Z",
  "environment": "production"
}
```

2. **Test Payment Endpoint** (requires user JWT):
```bash
curl -X POST https://rideshare-backend-api.onrender.com/api/payment/create \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "rideId": "test-ride-123",
    "driverId": "test-driver-456",
    "amountSubtotal": 2000
  }'
```

3. **Test Worker Endpoint**:
```bash
curl -X POST https://rideshare-backend-api.onrender.com/api/worker/payment-capture \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 5}'
```

4. **Check Logs**:
   - Go to Render dashboard
   - Click on service
   - View "Logs" tab
   - Look for: `🚀 Server running on port 3000`

### Step 4: Update Frontend

Update your frontend to use the new Render API URL.

**File**: `src/services/paymentService.ts` (or similar)

**Before**:
```typescript
const STRIPE_PAYMENT_URL = 'https://YOUR_PROJECT.supabase.co/functions/v1/stripe-payment';
```

**After**:
```typescript
const STRIPE_PAYMENT_URL = 'https://rideshare-backend-api.onrender.com/api/payment';
```

**Update API calls**:
```typescript
// Create payment
const response = await fetch(`${STRIPE_PAYMENT_URL}/create`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userJWT}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    rideId,
    driverId,
    amountSubtotal,
    referralCode,
  }),
});
```

### Step 5: Configure CORS

Update `ALLOWED_ORIGINS` environment variable in Render:

```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

For development:
```
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

## Post-Deployment

### Monitor Cron Jobs

1. Go to Render dashboard → Cron Jobs
2. Click on `rideshare-payment-capture-cron`
3. View execution history
4. Check logs for successful runs:
   ```
   ✅ Worker completed: 5 succeeded, 0 failed
   ```

### Database Verification

Check payment capture queue:
```sql
SELECT 
  status,
  COUNT(*) as count
FROM payment_capture_queue
GROUP BY status;
```

Expected: `pending` count decreases as cron runs.

### Scaling

**Free Tier Limitations**:
- Service sleeps after 15 min inactivity
- 750 hours/month compute time
- Cold starts on first request

**Upgrade to Paid Plan**:
- No sleep mode
- Faster instances
- More concurrent requests
- Better for production

## Troubleshooting

### Service Won't Start

**Check Logs**:
- Look for errors in Render dashboard logs
- Common issues:
  - Missing environment variables
  - Invalid Supabase credentials
  - Stripe key format errors

**Fix**:
```bash
# Verify environment variables are set
# Check Dockerfile builds locally:
cd backend
docker build -t test-backend .
docker run -p 3000:3000 --env-file .env test-backend
```

### Health Check Failing

**Symptoms**: Red status indicator in Render

**Fix**:
1. Verify `/health` endpoint works:
   ```bash
   curl https://your-service.onrender.com/health
   ```

2. Check health check path in Render settings
3. Increase health check timeout if needed

### Payment Capture Not Working

**Check**:
1. Cron job is active in Render
2. Cron schedule is correct (`*/5 * * * *`)
3. Worker endpoint URL is correct
4. Payments are in `payment_capture_queue` with status `pending`

**Debug**:
```bash
# Manual trigger
curl -X POST https://your-service.onrender.com/api/worker/payment-capture \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 1}'
```

### CORS Errors

**Symptoms**: Frontend gets CORS errors

**Fix**:
1. Add frontend URL to `ALLOWED_ORIGINS`
2. Verify CORS middleware is active
3. Check browser console for actual error

### Database Connection Timeouts

**Symptoms**: `Failed to connect to Supabase`

**Fix**:
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Check Supabase project is active (not paused)
3. Test connection locally first
4. Verify service role key has correct permissions

## Rollback

If deployment fails, rollback to Supabase Edge Functions:

1. **Revert frontend changes**:
   ```typescript
   const STRIPE_PAYMENT_URL = 'https://YOUR_PROJECT.supabase.co/functions/v1/stripe-payment';
   ```

2. **Keep Render service** for testing while reverting
3. **Or delete Render services** to avoid charges

## Cost Optimization

### Free Tier Strategy
- Use Render free tier for testing
- Web service: $0/month (with sleep mode)
- Cron job: $0/month (limited runs)

### Production Strategy
- Upgrade web service to Starter ($7/month)
- Keep cron on free tier if sufficient
- Monitor usage in Render dashboard

## Security Checklist

- [ ] All secrets stored as environment variables (not in code)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` marked as secret
- [ ] `STRIPE_SECRET_KEY` marked as secret
- [ ] CORS restricted to known origins
- [ ] Using Stripe live keys in production
- [ ] Health check endpoint public (no sensitive data)
- [ ] API endpoints properly authenticated
- [ ] Logs don't contain sensitive information

## Next Steps

1. **Test thoroughly** in Render environment
2. **Monitor performance** and error rates
3. **Set up alerts** for failed cron jobs
4. **Configure proper logging** (e.g., LogTail, Sentry)
5. **Document API** for frontend team
6. **Plan for scaling** as traffic grows

## Support

- **Render Docs**: https://render.com/docs
- **Render Community**: https://community.render.com
- **Supabase Docs**: https://supabase.com/docs

## Maintenance

### Updating Code

```bash
git add backend/
git commit -m "Update backend"
git push origin main
# Render auto-deploys new version
```

### Environment Variable Changes

1. Update in Render dashboard
2. Service automatically restarts
3. Verify health check passes

### Database Migrations

Run migrations manually:
```bash
# Connect to Supabase and run SQL migrations
# No changes needed in Render deployment
```
