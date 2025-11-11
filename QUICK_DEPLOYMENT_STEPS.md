# ⚡ OnGoPool - Quick Deployment Steps

## 🚀 Local Deployment (2 Minutes)

### Option 1: Ready-to-Go Folder
```bash
cd ongopool-local
./START.sh
```
**✅ Done!** App runs at `http://localhost:3000`

### Option 2: Build from Source
```bash
npm install --legacy-peer-deps
npm run build
cd dist && python3 -m http.server 3000
```

---

## 🌐 Production Deployment

### Vercel (Easiest)
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Build and deploy
npm run build
vercel --prod

# 3. Set environment variables in Vercel dashboard
```

### Netlify
```bash
# 1. Build
npm run build

# 2. Deploy
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### Custom Server
```bash
# 1. Build
npm run build

# 2. Upload dist folder to server
scp -r dist/ user@server:/var/www/ongopool/

# 3. Configure nginx/apache
```

---

## 🗄️ Database Setup (Supabase)

### 1. Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Get URL and anon key

### 2. Run SQL Schema
Copy and run the complete SQL schema from `DEPLOYMENT_GUIDE_COMPLETE.md` in Supabase SQL editor.

### 3. Enable RLS
Run the RLS policies from the complete guide.

---

## 💳 Payment Setup

### Stripe
1. Create account at [stripe.com](https://stripe.com)
2. Get test/live API keys
3. Add to environment variables

### PayPal
1. Create developer account at [developer.paypal.com](https://developer.paypal.com)
2. Create application
3. Get Client ID and Secret

---

## ⚙️ Environment Variables

### Required Variables
```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_or_live_key
STRIPE_SECRET_KEY=sk_test_or_live_key

# PayPal
VITE_PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
VITE_PAYPAL_SANDBOX_MODE=true  # false for live

# Backend API (optional)
VITE_BACKEND_API_URL=https://your-api.vercel.app/api
```

---

## 🔧 Backend API (Optional - for Live Payments)

### Deploy to Vercel
```bash
# Build functions
npm run build:functions

# Deploy
vercel --prod

# Set environment secrets
vercel env add STRIPE_SECRET_KEY
vercel env add PAYPAL_CLIENT_SECRET
```

---

## 🌍 Domain Setup

### DNS Configuration
```bash
# Point domain to your hosting
@ -> your-app.vercel.app  # or your server IP
www -> your-app.vercel.app
api -> your-api.vercel.app
```

### SSL Certificate
- Most hosting providers (Vercel, Netlify) provide automatic SSL
- For custom servers: Use Let's Encrypt or provider SSL

---

## ✅ Quick Testing Checklist

### Local Testing
- [ ] App loads at localhost:3000
- [ ] User registration works
- [ ] Ride posting works
- [ ] Payment testing with test cards
- [ ] Chat functionality works

### Production Testing
- [ ] Domain resolves correctly
- [ ] HTTPS works
- [ ] All features functional
- [ ] Mobile responsive
- [ ] Payment processing works

---

## 🚨 Common Issues & Quick Fixes

### Build Errors
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

### Payment Not Working
- Verify API keys are correct
- Check backend API is deployed
- Test with Stripe test cards: `4242424242424242`

### Database Connection Issues
- Verify Supabase URL and key
- Check RLS policies are set
- Ensure database schema is created

---

## 📱 Test Payment Cards

### Stripe Test Cards
- **Success**: `4242424242424242`
- **Declined**: `4000000000000002`
- **Requires Auth**: `4000002500003155`

### PayPal Testing
- Use sandbox accounts from PayPal developer dashboard
- Login at `sandbox.paypal.com`

---

## 🎉 You're Live!

Once deployed, your OnGoPool app includes:

✅ Complete user authentication  
✅ Real-time ride posting and booking  
✅ Live chat between users  
✅ Secure payment processing  
✅ Trip management dashboard  
✅ Mobile-responsive design  
✅ Earnings analytics  
✅ Rating system  

**Need detailed instructions?** See `DEPLOYMENT_GUIDE_COMPLETE.md`

**Happy carpooling!** 🚗🎉