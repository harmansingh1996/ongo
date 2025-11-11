# 🌐 OnGoPool - Production Deployment Guide

## 🎯 Production Deployment Overview

This guide covers deploying OnGoPool to production with live payment processing, custom domain, and full monitoring.

---

## 📋 Pre-Deployment Checklist

### Requirements
- [ ] Domain name purchased
- [ ] Stripe live account verified
- [ ] PayPal business account approved
- [ ] Supabase production project created
- [ ] SSL certificate ready (automatic with most hosts)

### Code Preparation
- [ ] All features tested locally
- [ ] Environment variables configured
- [ ] Database schema deployed
- [ ] Payment system tested
- [ ] Mobile responsiveness verified

---

## 🚀 Hosting Platform Deployment

### Vercel (Recommended)

#### 1. Prepare for Deployment
```bash
# Build and test locally first
npm run build
cd dist && python3 -m http.server 3000
# Verify everything works at http://localhost:3000
```

#### 2. Deploy to Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy to production
netlify deploy --prod --dir=dist

# Follow prompts to configure project
```

#### 3. Configure Domain
1. In Netlify dashboard, go to your site
2. Click "Domain management"
3. Add your custom domain: `yourdomain.com`
4. Add www subdomain: `www.yourdomain.com`
5. Vercel provides automatic SSL certificates

#### 4. Set Environment Variables
In Vercel dashboard → Settings → Environment Variables:

```bash
# Production Supabase
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key

# Production Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
STRIPE_SECRET_KEY=sk_live_your_live_secret

# Production PayPal
VITE_PAYPAL_CLIENT_ID=your_live_paypal_client_id
PAYPAL_CLIENT_SECRET=your_live_paypal_secret
VITE_PAYPAL_SANDBOX_MODE=false

# Backend API
VITE_BACKEND_API_URL=https://ongopool.onrender.com/api
```

### Netlify Alternative

#### 1. Build and Deploy
```bash
# Build for production
npm run build

# Install Netlify CLI
npm install -g netlify-cli

# Login and deploy
netlify login
netlify deploy --prod --dir=dist
```

#### 2. Configure Domain
1. In Netlify dashboard → Domain settings
2. Add custom domain
3. Configure DNS records
4. SSL automatically provided

### Custom Server Deployment

#### 1. Server Setup (Ubuntu/Debian)
```bash
# Update server
sudo apt update && sudo apt upgrade -y

# Install nginx
sudo apt install nginx -y

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

#### 2. Deploy Application
```bash
# Build locally
npm run build

# Upload to server
scp -r dist/ user@yourserver.com:/var/www/ongopool/

# Set permissions
sudo chown -R www-data:www-data /var/www/ongopool/
sudo chmod -R 755 /var/www/ongopool/
```

#### 3. Nginx Configuration
```nginx
# /etc/nginx/sites-available/ongopool
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/ongopool;
    index index.html index.htm;

    # Handle React routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        application/javascript
        application/json
        text/css
        text/javascript
        text/plain;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 4. Enable Site and SSL
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ongopool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🗄️ Production Database Setup

### Supabase Production

#### 1. Create Production Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project (separate from development)
3. Choose production-ready region
4. Note URL and keys

#### 2. Deploy Database Schema
Run the complete schema from `DEPLOYMENT_GUIDE_COMPLETE.md`:

```sql
-- Copy and run all tables, RLS policies, and storage buckets
-- This includes: users, rides, bookings, messages, payments, etc.
```

#### 3. Configure RLS Policies
```sql
-- Enable Row Level Security on all tables
-- Deploy all security policies
-- Test with production data access patterns
```

#### 4. Set up Storage
```sql
-- Create storage buckets for production
INSERT INTO storage.buckets (id, name, public) VALUES 
('profile-pictures', 'profile-pictures', true),
('driver-licenses', 'driver-licenses', false);

-- Apply storage security policies
```

#### 5. Environment Variables
Update your hosting platform with production Supabase credentials:
```bash
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key
```

---

## 💳 Production Payment Setup

### Stripe Production

#### 1. Business Verification
1. Complete Stripe business verification
2. Verify bank account
3. Set up tax information
4. Configure webhook endpoints

#### 2. Get Live API Keys
1. In Stripe dashboard → Developers → API Keys
2. Copy live publishable key
3. Copy live secret key
4. **Never expose secret key in frontend**

#### 3. Configure Webhooks
```bash
# Set up webhook endpoint
Endpoint URL: https://yourdomain.com/api/stripe/webhooks
Events to send:
- payment_intent.succeeded
- payment_intent.payment_failed
- customer.created
- invoice.payment_succeeded
```

#### 4. Production Environment
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51...
STRIPE_SECRET_KEY=sk_live_51...
```

### PayPal Production

#### 1. Business Account Setup
1. Upgrade to PayPal Business account
2. Complete business verification
3. Set up payment receiving

#### 2. Create Live Application
1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Create live application
3. Get live Client ID and Secret

#### 3. Production Configuration
```bash
VITE_PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_secret
VITE_PAYPAL_SANDBOX_MODE=false
```

---

## 🔧 Backend API Production

### Deploy Payment Processing API

#### 1. Prepare API Code
```bash
# Build functions for production
npm run build:functions

# Test locally
npm run dev
```

#### 2. Deploy to Render (example)
```bash
# Build API bundle
npm run build:functions

# Render start command
node api/dist/server.js

# Configure domain in Render dashboard
```

#### 3. Set Production Secrets (Render)
```bash
# Configure in Render dashboard
STRIPE_SECRET_KEY=...
PAYPAL_CLIENT_SECRET=...
SUPABASE_SERVICE_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

#### 4. Test API Endpoints
```bash
# Health check
curl https://api.yourdomain.com/health

# Test payment intent creation
curl -X POST https://api.yourdomain.com/stripe/payment-intents \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "currency": "cad"}'
```

---

## 🌍 DNS & Domain Configuration

### DNS Records Setup

#### A Records (for custom server)
```bash
Type: A
Name: @
Value: YOUR_SERVER_IP
TTL: 300

Type: A  
Name: www
Value: YOUR_SERVER_IP
TTL: 300
```

#### CNAME Records (for hosting platforms)
```bash
Type: CNAME
Name: @
Value: ongopool.netlify.app
TTL: 300

Type: CNAME
Name: www
Value: ongopool.netlify.app
TTL: 300

Type: CNAME
Name: api
Value: ongopool.onrender.com
TTL: 300
```

### SSL Certificate Verification
```bash
# Check SSL certificate
curl -I https://yourdomain.com
# Should return 200 OK with SSL info

# Test SSL rating
# Visit: https://www.ssllabs.com/ssltest/
```

---

## 📊 Production Monitoring

### Error Tracking with Sentry

#### 1. Setup Sentry
```bash
npm install @sentry/react @sentry/tracing
```

#### 2. Configure Sentry
```javascript
// Add to src/main.tsx
import * as Sentry from "@sentry/react";
import { Integrations } from "@sentry/tracing";

Sentry.init({
  dsn: "https://your-sentry-dsn@sentry.io/project-id",
  integrations: [
    new Integrations.BrowserTracing(),
  ],
  tracesSampleRate: 1.0,
  environment: "production",
});
```

### Analytics Setup

#### Google Analytics 4
```bash
# Add to environment variables
VITE_GA_TRACKING_ID=G-XXXXXXXXXX
```

```javascript
// Add to src/main.tsx
import { gtag } from 'ga-gtag';

gtag('config', process.env.VITE_GA_TRACKING_ID);
```

### Uptime Monitoring
1. **UptimeRobot**: Free monitoring service
2. **Pingdom**: Advanced monitoring
3. **StatusPage**: Status page for users

```bash
# Monitor these endpoints
https://yourdomain.com              # Main app
https://api.yourdomain.com/health   # API health
https://yourdomain.com/api/stripe   # Payment API
```

---

## 🔐 Production Security

### Security Headers
```nginx
# Add to nginx configuration
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' *.paypal.com *.stripe.com; connect-src 'self' *.supabase.co *.stripe.com *.paypal.com" always;
```

### Rate Limiting
```javascript
// Implement in backend API
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
```

### Environment Security
```bash
# Never commit these to git
.env.production
.env.local

# Use platform-specific secret management
# Vercel: Environment Variables
# AWS: Parameter Store / Secrets Manager
# Azure: Key Vault
```

---

## 🧪 Production Testing

### Automated Testing
```bash
# Run tests before deployment
npm test (if available)
npm run e2e (if configured)

# Test payment flows
curl -X POST https://api.yourdomain.com/stripe/payment-intents
```

### Manual Testing Checklist
- [ ] User registration/login works
- [ ] Ride posting functions correctly
- [ ] Payment processing completes
- [ ] Real-time chat operates
- [ ] Mobile experience is smooth
- [ ] SSL certificate is valid
- [ ] All pages load under 3 seconds
- [ ] Error pages display properly

### Load Testing
```bash
# Use tools like Apache Bench
ab -n 1000 -c 10 https://yourdomain.com/

# Or Artillery.io
npm install -g artillery
artillery quick --count 10 --num 1000 https://yourdomain.com/
```

---

## 📈 Performance Optimization

### Frontend Optimization
```bash
# Bundle analysis
npm run build -- --analyze

# Optimize images
npm install -g imagemin-cli
imagemin src/assets/*.{jpg,png} --out-dir=dist/assets/

# Enable gzip compression (handled by hosting platform)
```

### Database Optimization
```sql
-- Add database indexes
CREATE INDEX idx_rides_departure_time ON rides(departure_time);
CREATE INDEX idx_messages_booking_id ON messages(booking_id);
CREATE INDEX idx_bookings_passenger_id ON ride_bookings(passenger_id);
```

### CDN Setup
1. **Cloudflare**: Free CDN and security
2. **AWS CloudFront**: Advanced CDN
3. **Vercel**: Built-in CDN

---

## 🚀 Go-Live Process

### Final Pre-Launch Steps
```bash
# 1. Final production build
npm run build

# 2. Deploy to production
netlify deploy --prod --dir=dist

# 3. Update DNS to point to production
# 4. Verify SSL certificate
# 5. Test all critical paths
# 6. Enable monitoring
```

### Launch Day
1. **Monitor error rates** (should be < 1%)
2. **Check payment processing** (test with small amounts)
3. **Verify real-time features** (chat, notifications)
4. **Monitor performance** (page load times)
5. **Watch user feedback** (support channels)

### Post-Launch (First Week)
- Monitor daily active users
- Check payment success rates
- Review error logs daily
- Monitor server resources
- Collect user feedback

---

## 📞 Production Support

### Monitoring Checklist
- [ ] Error tracking active
- [ ] Uptime monitoring configured
- [ ] Performance monitoring enabled
- [ ] Payment alerts set up
- [ ] Database backups verified

### Support Channels
- Error tracking: Sentry dashboard
- User analytics: Google Analytics
- Payment issues: Stripe/PayPal dashboards
- Server issues: Hosting platform monitoring

---

**Your OnGoPool app is now live in production!** 🎉🚗

Monitor closely for the first few days and be ready to respond to any issues quickly.