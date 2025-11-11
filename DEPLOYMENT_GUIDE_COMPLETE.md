# 🚀 OnGoPool - Complete Deployment Guide

## Table of Contents
1. [Quick Local Deployment](#quick-local-deployment)
2. [Development Environment Setup](#development-environment-setup)
3. [Production Deployment](#production-deployment)
4. [Database Setup](#database-setup)
5. [Payment System Configuration](#payment-system-configuration)
6. [Environment Variables](#environment-variables)
7. [Backend API Deployment](#backend-api-deployment)
8. [Domain & DNS Setup](#domain--dns-setup)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Local Deployment

### Option 1: Using the Pre-Built Local Folder
```bash
# Use the ready-to-go ongopool-local folder
cd ongopool-local
./START.sh
# Your app opens at http://localhost:3000
```

### Option 2: Build from Source
```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Build the application
npm run build

# 3. Serve locally
cd dist
python3 -m http.server 3000
# Visit http://localhost:3000
```

---

## 💻 Development Environment Setup

### Prerequisites
- **Node.js 18+**
- **npm or yarn**
- **Git**
- **Modern browser**

### Step-by-Step Setup

#### 1. Clone and Install
```bash
# Clone repository (if needed)
git clone [your-repo-url]
cd ongopool

# Install dependencies
npm install --legacy-peer-deps
```

#### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

#### 3. Development Commands
```bash
# Start development server (if available)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Build backend functions
npm run build:functions

# Deploy backend functions
npm run deploy:functions
```

---

## 🌐 Production Deployment

### Static Site Hosting (Recommended)

#### Netlify Deployment
```bash
# 1. Build application
npm run build

# 2. Install Netlify CLI
npm install -g netlify-cli

# 3. Deploy
netlify deploy --prod --dir=dist
```
```bash
# 1. Build application
npm run build

# 2. Install Netlify CLI
npm install -g netlify-cli

# 3. Deploy
netlify deploy --prod --dir=dist
```

#### Custom Server Deployment
```bash
# 1. Build application
npm run build

# 2. Copy dist folder to server
scp -r dist/ user@server:/var/www/ongopool/

# 3. Configure web server (nginx/apache)
# See nginx configuration below
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/ongopool;
    index index.html;

    # Handle React routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

---

## 🗄️ Database Setup

### Supabase Configuration

#### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note your project URL and anon key

#### 2. Database Schema Setup
Run the following SQL in Supabase SQL editor:

```sql
-- Users table (main user profiles)
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  photo_url TEXT,
  car_model TEXT,
  car_plate TEXT,
  license_verification_status TEXT DEFAULT 'unverified',
  license_document_url TEXT,
  license_expiration_date DATE,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Rides table
CREATE TABLE rides (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID REFERENCES users(id),
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  from_coordinates POINT,
  to_coordinates POINT,
  departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
  arrival_time TIMESTAMP WITH TIME ZONE,
  available_seats INTEGER NOT NULL,
  price_per_seat DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ride bookings table
CREATE TABLE ride_bookings (
  id BIGSERIAL PRIMARY KEY,
  ride_id BIGINT REFERENCES rides(id),
  passenger_id UUID REFERENCES users(id),
  seats_booked INTEGER NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  payment_intent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Messages table for chat
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES ride_bookings(id),
  ride_id BIGINT REFERENCES rides(id),
  sender_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Conversations table
CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES ride_bookings(id) UNIQUE,
  driver_id UUID REFERENCES users(id),
  passenger_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Payments table
CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT REFERENCES ride_bookings(id),
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'cad',
  payment_intent_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Earnings table
CREATE TABLE earnings (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID REFERENCES users(id),
  ride_id BIGINT REFERENCES rides(id),
  booking_id BIGINT REFERENCES ride_bookings(id),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  payout_request_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ratings table
CREATE TABLE ratings (
  id BIGSERIAL PRIMARY KEY,
  ride_id BIGINT REFERENCES rides(id),
  booking_id BIGINT REFERENCES ride_bookings(id),
  rater_id UUID REFERENCES users(id),
  rated_user_id UUID REFERENCES users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  rating_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

#### 3. Row Level Security (RLS)
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (add more as needed)
CREATE POLICY "Users can view their own profile" ON users
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Anyone can view active rides" ON rides
FOR SELECT USING (status = 'active');

CREATE POLICY "Drivers can manage their own rides" ON rides
FOR ALL USING (auth.uid() = driver_id);
```

#### 4. Storage Buckets
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
('profile-pictures', 'profile-pictures', true),
('driver-licenses', 'driver-licenses', false);

-- Storage policies
CREATE POLICY "Users can upload their own profile pictures" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own license documents" ON storage.objects
FOR SELECT USING (bucket_id = 'driver-licenses' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 💳 Payment System Configuration

### Stripe Setup

#### 1. Stripe Account Setup
1. Create account at [stripe.com](https://stripe.com)
2. Complete business verification
3. Get API keys from dashboard

#### 2. Test vs Production Keys
```bash
# Test keys (safe for development)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Production keys (live payments)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

### PayPal Setup

#### 1. PayPal Developer Account
1. Create account at [developer.paypal.com](https://developer.paypal.com)
2. Create application
3. Get Client ID and Secret

#### 2. Environment Configuration
```bash
# Sandbox (test mode)
VITE_PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
VITE_PAYPAL_SANDBOX_MODE=true

# Production (live payments)
VITE_PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_secret
VITE_PAYPAL_SANDBOX_MODE=false
```

---

## ⚙️ Environment Variables

### Complete .env Configuration
```bash
# PayPal Configuration
VITE_PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
VITE_PAYPAL_SANDBOX_MODE=true

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API
VITE_BACKEND_API_URL=https://ongopool.onrender.com/api

# Optional: Analytics
VITE_GA_TRACKING_ID=GA_MEASUREMENT_ID
VITE_HOTJAR_ID=your_hotjar_id
```

### Environment-Specific Files
```bash
# Development
.env.development

# Production
.env.production

# Local testing
.env.local
```

---

## 🔧 Backend API Deployment

### Render Deployment (Serverless API)
```bash
# Build API functions
npm run build:functions

# Render build command (configure in dashboard)
npm install --legacy-peer-deps && npm run build:functions

# Render start command
node api/dist/server.js
```

### Alternative: Railway Deployment
```bash
railway login
railway link
railway up
```
```

---

## 🌍 Domain & DNS Setup

### Domain Configuration

#### 1. Purchase Domain
- Use providers like Namecheap, GoDaddy, or Cloudflare
- Choose a memorable domain like `ongopool.com`

#### 2. DNS Configuration
```bash
# A Records
@ -> your_server_ip
www -> your_server_ip

# DNS Records (example)
@ -> ongopool.netlify.app
www -> ongopool.netlify.app
api -> ongopool.onrender.com
```

#### 3. SSL Certificate
```bash
# Let's Encrypt (free)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Or use hosting provider's SSL
```

### Subdomain Setup
```bash
# API subdomain
api.yourdomain.com -> backend API
app.yourdomain.com -> main application
admin.yourdomain.com -> admin panel (if needed)
```

---

## 📊 Monitoring & Maintenance

### Performance Monitoring
```bash
# Add to your app
npm install @sentry/react

# Google Analytics
VITE_GA_TRACKING_ID=your_ga_id
```

### Error Tracking
```javascript
// Add to main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your_sentry_dsn",
  environment: process.env.NODE_ENV,
});
```

### Backup Strategy
```bash
# Database backups (daily)
# Supabase provides automatic backups

# Code backups
git push --all origin
git push --tags origin
```

---

## 🔧 Troubleshooting

### Common Issues

#### Build Errors
```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

#### Payment Issues
```bash
# Check API keys
echo $STRIPE_SECRET_KEY
echo $VITE_PAYPAL_CLIENT_ID

# Verify backend deployment
curl https://ongopool.onrender.com/api/health
```

#### Database Connection Issues
```bash
# Check Supabase connection
curl https://your-project.supabase.co/rest/v1/
```

#### Performance Issues
```bash
# Optimize build
npm run build -- --analyze

# Check bundle size
npx source-map-explorer dist/assets/*.js
```

### Debug Commands
```bash
# View build logs
npm run build > build.log 2>&1

# Check environment variables
printenv | grep VITE_

# Test API endpoints
curl -X POST https://ongopool.onrender.com/api/stripe/payment-intents \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "currency": "cad"}'
```

---

## 📋 Pre-Launch Checklist

### Security
- [ ] All API keys stored securely
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Database RLS policies configured
- [ ] CORS properly configured
- [ ] Rate limiting implemented

### Performance
- [ ] Images optimized and compressed
- [ ] Code splitting implemented
- [ ] CDN configured for static assets
- [ ] Database queries optimized
- [ ] Caching headers set

### Functionality
- [ ] User registration/login works
- [ ] Ride posting and booking works
- [ ] Payment processing tested
- [ ] Real-time chat functional
- [ ] Email notifications working
- [ ] Mobile responsive design

### Monitoring
- [ ] Error tracking configured
- [ ] Analytics implemented
- [ ] Performance monitoring active
- [ ] Uptime monitoring setup
- [ ] Backup procedures tested

---

## 🎉 Go Live Steps

### Final Deployment
```bash
# 1. Final build and test
npm run build
npm run test (if available)

# 2. Deploy to production
netlify deploy --prod --dir=dist

# 3. Update DNS records
# Point domain to production

# 4. Enable monitoring
# Start analytics and error tracking

# 5. Announce launch
# Notify users and stakeholders
```

### Post-Launch
1. Monitor error rates and performance
2. Check payment processing
3. Verify real-time features
4. Test mobile experience
5. Monitor user feedback

---

**Your OnGoPool carpool application is now ready for production deployment!** 🚗🎉

For support or issues, check the troubleshooting section or create an issue in your repository.