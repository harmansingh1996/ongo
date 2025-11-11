# 💻 OnGoPool - Local Deployment Instructions

## 🎯 Quick Start (30 Seconds)

### Method 1: Use Pre-Built Folder
```bash
cd ongopool-local
./START.sh
```
✅ **Done!** Your app opens at `http://localhost:3000`

### Method 2: One-Command Build
```bash
npm run build && cd dist && python3 -m http.server 3000
```

---

## 📋 Step-by-Step Local Setup

### Prerequisites Check
```bash
# Check if you have required tools
node --version    # Should be 18+
npm --version     # Should be 8+
python3 --version # Should be 3.6+
```

### Step 1: Install Dependencies
```bash
# Install with legacy peer deps (required for React-Leaflet compatibility)
npm install --legacy-peer-deps
```

**If you see errors:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Step 2: Build Application
```bash
npm run build
```

**Expected output:**
- ✅ Build completes without errors
- ✅ `dist/` folder is created
- ✅ Files like `index.html`, `assets/` are present

### Step 3: Run Local Server
Choose your preferred method:

#### Option A: Python (Recommended - Built into macOS)
```bash
cd dist
python3 -m http.server 3000
```

#### Option B: Node.js http-server
```bash
# Install globally (one-time)
npm install -g http-server

# Run server
cd dist
http-server -p 3000 -o
```

#### Option C: Node.js serve
```bash
# Install globally (one-time)
npm install -g serve

# Run server
serve -s dist -p 3000
```

### Step 4: Open Your App
Visit: **http://localhost:3000**

---

## 🔧 Configuration Options

### Change Port
If port 3000 is busy:
```bash
# Use different port
python3 -m http.server 8080
# Then visit: http://localhost:8080
```

### Network Access
Allow access from other devices on your network:
```bash
# Allow external connections
python3 -m http.server 3000 --bind 0.0.0.0
# Then visit: http://YOUR_IP_ADDRESS:3000
```

### Custom Domain (Optional)
```bash
# Add to /etc/hosts
echo "127.0.0.1 ongopool.local" | sudo tee -a /etc/hosts
# Then visit: http://ongopool.local:3000
```

---

## 🏗️ Development Workflow

### Development Server
```bash
# Start development mode (if available)
npm run dev
# Usually runs on http://localhost:5173
```

### Build & Test Cycle
```bash
# Make changes to src/ files
# Then rebuild and test
npm run build
cd dist
python3 -m http.server 3000
```

### Environment Setup
```bash
# Copy test environment
cp .env.test .env.local

# Edit for local development
nano .env.local
```

---

## 💳 Local Payment Testing

### Test Environment Variables
Your app uses these test credentials (safe, no real charges):

```bash
# Stripe Test Keys (Already configured)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51S5wub...
STRIPE_SECRET_KEY=sk_test_51S5wub...

# PayPal Sandbox (Already configured)
VITE_PAYPAL_CLIENT_ID=AbGPQ42SxKv2Ee4e...
VITE_PAYPAL_SANDBOX_MODE=true
```

### Test Payment Cards
```bash
# Stripe Test Cards (No real money charged)
Visa:           4242424242424242
Mastercard:     5555555555554444
Declined:       4000000000000002
Expiry:         Any future date
CVC:            Any 3 digits
```

### PayPal Sandbox Testing
1. Create test accounts at [developer.paypal.com](https://developer.paypal.com/developer/accounts/)
2. Use sandbox accounts to test PayPal payments
3. Login at [sandbox.paypal.com](https://sandbox.paypal.com)

---

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
sudo lsof -t -i tcp:3000 | xargs kill -9

# Or use different port
python3 -m http.server 3001
```

#### Build Errors
```bash
# Clean rebuild
rm -rf node_modules package-lock.json dist
npm install --legacy-peer-deps
npm run build
```

#### Python Not Found
```bash
# macOS: Install Python 3
brew install python3

# Check Python version
python3 --version

# Alternative: Use Python 2
python -m SimpleHTTPServer 3000
```

#### Permission Denied
```bash
# Make startup script executable
chmod +x START.sh

# Or run with bash
bash START.sh
```

#### App Doesn't Load
1. Check console for errors (F12 → Console)
2. Verify files exist in `dist/` folder
3. Try different browser
4. Clear browser cache

### Debug Commands
```bash
# Check if build was successful
ls -la dist/

# Verify server is running
curl http://localhost:3000

# Check network connections
netstat -tuln | grep 3000
```

---

## 📱 Testing Your Local App

### User Registration Test
1. Click "Get Started"
2. Sign up with test email: `test@example.com`
3. Complete profile setup

### Ride Management Test
1. Post a test ride (Toronto → Ottawa)
2. Use different browser/incognito for second user
3. Book the ride with test payment
4. Test real-time chat between users

### Payment Flow Test
1. Book a ride
2. Use Stripe test card: `4242424242424242`
3. Or test PayPal with sandbox account
4. Verify payment processes without real charges

### Mobile Testing
1. Open on phone browser: `http://YOUR_IP:3000`
2. Test touch interactions
3. Verify responsive design

---

## 🔐 Security Notes

### Safe Local Testing
- All payments are in test mode
- No real money will be charged
- Database is live but isolated to your account
- Local server only accessible from your network

### Production Considerations
- Never use test API keys in production
- Always use HTTPS for live deployment
- Implement proper rate limiting
- Set up monitoring and error tracking

---

## 📊 Performance Tips

### Optimize Local Performance
```bash
# Clear browser cache regularly
# Use incognito mode for clean testing
# Close unused browser tabs
# Use SSD for faster build times
```

### Monitor Resource Usage
```bash
# Check memory usage
top | grep python
# Or
htop
```

---

## 🎉 Success Indicators

Your local deployment is working correctly when:

✅ **Landing Page**: Beautiful gradient page loads  
✅ **Registration**: User signup works smoothly  
✅ **Navigation**: All tabs respond correctly  
✅ **Ride Posting**: Can create rides with locations  
✅ **Real-time Chat**: Messages appear instantly  
✅ **Payment Testing**: Test cards process successfully  
✅ **Mobile Responsive**: Works on phone browsers  
✅ **No Console Errors**: Clean browser console  

---

## 📞 Need Help?

### Quick Fixes
- **Build fails**: Try `npm install --legacy-peer-deps`
- **Port busy**: Use different port like 3001
- **App won't load**: Check browser console for errors
- **Payments fail**: Verify test card numbers

### Resources
- Check `PAYMENT_TESTING.md` for payment testing guide
- See `FEATURES.md` for complete feature list
- Review `TROUBLESHOOTING.md` for advanced debugging

---

**Your OnGoPool app is now running locally!** 🚗✨

Perfect for development, testing, and demonstration purposes.