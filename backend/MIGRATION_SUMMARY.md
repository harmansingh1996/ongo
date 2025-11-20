# Backend Migration Summary: Supabase Edge Functions → Render

## Overview

Successfully migrated ride-sharing backend from Supabase Edge Functions to Render Express.js service.

## What Changed

### Architecture

**Before**: Serverless Edge Functions on Supabase (Deno runtime)  
**After**: Express.js REST API on Render (Node.js runtime, Docker deployment)

### Key Differences

| Aspect | Supabase Edge Functions | Render Express.js |
|--------|------------------------|-------------------|
| Runtime | Deno | Node.js |
| Auth | Automatic user context | Manual JWT verification |
| Database | Direct RLS integration | Service role key required |
| Deployment | `supabase functions deploy` | Docker + Render dashboard |
| Cron Jobs | pg_cron + Edge Function | Render cron + API endpoint |
| Cold Starts | Yes (serverless) | No (always-on with paid plan) |
| Cost | Free tier + usage | $0-$7/month + usage |

## Files Created

### Backend Service (`backend/`)

```
backend/
├── src/
│   ├── index.ts               # Express server entry point
│   ├── routes/
│   │   ├── payment.ts         # /api/payment/* routes
│   │   └── worker.ts          # /api/worker/* routes
│   ├── services/
│   │   ├── stripeService.ts   # Stripe API wrappers
│   │   └── paymentService.ts  # Payment business logic
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification
│   │   └── cors.ts            # CORS configuration
│   ├── utils/
│   │   └── supabase.ts        # Supabase client setup
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── Dockerfile                  # Docker container config
├── render.yaml                 # Render deployment config
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── .env.example                # Environment variables template
├── README.md                   # Backend documentation
├── DEPLOYMENT.md               # Deployment guide
└── MIGRATION_SUMMARY.md        # This file
```

### Frontend Updates

```
src/
├── config/
│   └── api.ts                 # API endpoint configuration (NEW)
└── services/
    └── paymentService.ts      # Updated to use Render API
```

## API Endpoints Mapping

### Before (Supabase Edge Functions)

```
POST https://PROJECT.supabase.co/functions/v1/stripe-payment
Body: { action: "create", rideId, driverId, amountSubtotal }
```

### After (Render Express.js)

```
POST https://rideshare-backend-api.onrender.com/api/payment/create
Body: { rideId, driverId, amountSubtotal }

POST https://rideshare-backend-api.onrender.com/api/payment/capture
POST https://rideshare-backend-api.onrender.com/api/payment/cancel
POST https://rideshare-backend-api.onrender.com/api/payment/refund
```

## Authentication Changes

### Before
```typescript
// Automatic user context in Edge Function
const { data: { user } } = await supabaseClient.auth.getUser();
// RLS automatically applies user's permissions
```

### After
```typescript
// Express middleware verifies JWT
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  const userId = req.userId; // Extracted by middleware
  const supabase = getSupabaseClientWithAuth(req.headers.authorization);
  // Manual permission checks if needed
});

// Service actions use service role key
const supabase = getSupabaseServiceClient(); // Bypasses RLS
```

## Cron Job Migration

### Before (pg_cron)
```sql
-- Scheduled in database
SELECT cron.schedule(
  'payment-capture-worker',
  '*/5 * * * *',
  $$SELECT net.http_post(...)$$
);
```

### After (Render Cron)
```yaml
# render.yaml
- type: cron
  name: rideshare-payment-capture-cron
  schedule: "*/5 * * * *"
  startCommand: >
    curl -X POST https://rideshare-backend-api.onrender.com/api/worker/payment-capture
```

## Environment Variables

### Required in Render

```bash
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUz...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
ALLOWED_ORIGINS=https://yourdomain.com
NODE_ENV=production
PORT=3000
```

### Frontend Environment Variables

```bash
# .env or .env.production
VITE_API_URL=https://rideshare-backend-api.onrender.com
```

## Benefits of Migration

### Pros

1. **Better Control**: Full Express.js middleware stack
2. **Standard Node.js**: Familiar ecosystem, more packages available
3. **Always-On**: No cold starts with paid plan
4. **Easier Debugging**: Standard Node.js debugging tools
5. **Portable**: Can move to any hosting provider (AWS, GCP, etc.)
6. **Cost Predictable**: Fixed monthly cost vs usage-based

### Cons

1. **More Complex**: Need to manage auth manually
2. **RLS Bypass**: Must implement permission checks in code
3. **Two Platforms**: Manage Supabase (DB) + Render (API)
4. **Cold Starts**: On free tier, service sleeps after inactivity
5. **Latency**: Potential increase due to extra network hop

## Rollback Plan

If migration fails, revert to Supabase Edge Functions:

1. **Frontend**: Change API URL back to Supabase
   ```typescript
   const EDGE_FUNCTION_URL = 'https://PROJECT.supabase.co/functions/v1/stripe-payment';
   ```

2. **Deploy**: Re-deploy fixed Edge Function
   ```bash
   supabase functions deploy stripe-payment
   ```

3. **Database**: Re-enable pg_cron job
   ```sql
   SELECT cron.schedule(...);
   ```

## Next Steps

1. **Deploy to Render**: Follow `backend/DEPLOYMENT.md`
2. **Test Endpoints**: Verify all API calls work
3. **Monitor Logs**: Check Render dashboard for errors
4. **Update Frontend**: Deploy frontend with new API URLs
5. **Test Cron**: Verify payment capture runs every 5 minutes
6. **Production**: Switch to Stripe live keys
7. **Scale**: Upgrade to paid plan if needed

## Testing Checklist

- [ ] Health check works (`/health`)
- [ ] Payment creation works (with user auth)
- [ ] Payment capture works (service role)
- [ ] Payment cancel works
- [ ] Payment refund works
- [ ] Cron job runs successfully
- [ ] Frontend can create payments
- [ ] Payments show in Supabase database
- [ ] Driver earnings created correctly
- [ ] CORS works from frontend domain

## Support Resources

- **Render Docs**: https://render.com/docs
- **Backend README**: `backend/README.md`
- **Deployment Guide**: `backend/DEPLOYMENT.md`
- **API Config**: `src/config/api.ts`

## Migration Date

**Completed**: 2025-11-20

## Migration by

YOUWARE Agent (AI-assisted migration)
