# Ride-Sharing Backend API

Express.js backend service deployed on Render, migrated from Supabase Edge Functions.

## Architecture

- **Framework**: Express.js + TypeScript
- **Database**: Supabase PostgreSQL (via service role key)
- **Payment**: Stripe API integration
- **Hosting**: Render (Docker deployment)
- **Cron Jobs**: Render cron for payment capture worker

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Main Express server
│   ├── routes/               # API route handlers
│   │   ├── payment.ts        # Payment endpoints
│   │   └── worker.ts         # Worker/cron endpoints
│   ├── services/             # Business logic
│   │   ├── stripeService.ts  # Stripe operations
│   │   └── paymentService.ts # Payment workflows
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts           # Auth verification
│   │   └── cors.ts           # CORS configuration
│   ├── utils/                # Utility functions
│   │   └── supabase.ts       # Supabase client setup
│   └── types/                # TypeScript interfaces
│       └── index.ts
├── Dockerfile                # Docker container config
├── render.yaml               # Render deployment config
├── package.json              # Node dependencies
├── tsconfig.json             # TypeScript config
└── .env.example              # Environment variables template

```

## API Endpoints

### Payment Endpoints (User-Authenticated)

**POST /api/payment/create**
- Create payment intent with Stripe
- Requires: `Authorization: Bearer <jwt>`
- Body: `{ rideId, bookingId, driverId, amountSubtotal, referralCode? }`

### Payment Endpoints (Service Role)

**POST /api/payment/capture**
- Capture authorized payment
- No auth required (service-to-service)
- Body: `{ paymentIntentId }`

**POST /api/payment/cancel**
- Cancel payment intent
- No auth required
- Body: `{ paymentIntentId }`

**POST /api/payment/refund**
- Refund captured payment
- No auth required
- Body: `{ paymentIntentId, reason? }`

### Worker Endpoints

**POST /api/worker/payment-capture**
- Process payment capture queue
- Called by Render cron every 5 minutes
- Body: `{ batchSize?, maxAttempts? }`

**GET /api/worker/health**
- Health check endpoint
- Returns: `{ success, status, timestamp }`

## Environment Variables

Required environment variables (set in Render dashboard):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
STRIPE_SECRET_KEY=sk_live_or_test_key
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

## Development

### Local Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

3. Run development server:
```bash
npm run dev
```

4. Build TypeScript:
```bash
npm run build
```

5. Run production build:
```bash
npm start
```

### Testing Locally

```bash
# Health check
curl http://localhost:3000/health

# Test payment creation (requires auth token)
curl -X POST http://localhost:3000/api/payment/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rideId":"123","driverId":"456","amountSubtotal":2000}'

# Test payment capture
curl -X POST http://localhost:3000/api/payment/capture \
  -H "Content-Type: application/json" \
  -d '{"paymentIntentId":"abc123"}'
```

## Render Deployment

### Option 1: Manual Deployment via Render Dashboard

1. **Create New Web Service**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Set root directory to `backend/`
   - Environment: Docker
   - Dockerfile path: `./Dockerfile`

2. **Configure Environment Variables**:
   Add all required variables in the "Environment" tab

3. **Deploy**:
   Click "Create Web Service"

### Option 2: Automated Deployment via render.yaml

1. **Push code to repository**:
```bash
git add backend/
git commit -m "Add Render backend deployment"
git push
```

2. **Create Blueprint in Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Blueprint"
   - Connect repository
   - Render will detect `render.yaml` and create both services

3. **Configure Secrets**:
   Set sensitive environment variables in the dashboard

### Cron Job Configuration

The payment capture worker runs every 5 minutes via Render cron:
- Schedule: `*/5 * * * *`
- Calls: `POST /api/worker/payment-capture`
- Processes up to 10 pending payments per run

## Migration from Supabase Edge Functions

### Authentication Changes

**Before (Supabase Edge Functions)**:
```typescript
// Automatic user context from Supabase Auth
const { data: { user } } = await supabaseClient.auth.getUser();
```

**After (Render with Express)**:
```typescript
// Manual JWT verification via middleware
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  const userId = req.userId; // Extracted by middleware
});
```

### Service Role Operations

Payment capture/cancel/refund operations now use service role key directly:
```typescript
const supabase = getSupabaseServiceClient(); // Uses SUPABASE_SERVICE_ROLE_KEY
```

### Frontend Integration

Update frontend API calls to point to Render URL:

**Before**:
```typescript
const url = 'https://project.supabase.co/functions/v1/stripe-payment';
```

**After**:
```typescript
const url = 'https://rideshare-backend-api.onrender.com/api/payment/create';
```

## Monitoring

- **Health Check**: `GET /health` - Returns server status
- **Render Logs**: View logs in Render dashboard
- **Error Tracking**: Console logs captured by Render

## Security Notes

- Service role key stored as Render secret
- CORS configured for specific frontend origins
- Helmet middleware for security headers
- JWT verification for user-authenticated endpoints
- Rate limiting recommended for production

## Troubleshooting

### Container Fails to Start
- Check environment variables are set correctly
- Verify Dockerfile builds locally: `docker build -t backend .`
- Check Render logs for specific errors

### Database Connection Issues
- Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- Check Supabase project is active
- Test connection locally first

### Payment Capture Not Working
- Check cron job is running in Render dashboard
- Verify worker endpoint is accessible
- Check payment_capture_queue table has pending items

## Production Checklist

- [ ] Set all environment variables in Render
- [ ] Update ALLOWED_ORIGINS with production frontend URL
- [ ] Use Stripe live keys (not test keys)
- [ ] Enable Render health checks
- [ ] Configure proper error monitoring
- [ ] Set up database backups
- [ ] Test all endpoints in production
- [ ] Verify cron job executes successfully
- [ ] Update frontend to use Render API URLs
