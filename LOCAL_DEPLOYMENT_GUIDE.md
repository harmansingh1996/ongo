# OnGoPool - Local Deployment Guide for Mac

## Overview
OnGoPool is a complete carpool application that can be deployed locally on your Mac without needing internet hosting. This guide walks you through running the app locally for personal use or development.

## Prerequisites
- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js
- **Modern browser**: Chrome, Firefox, Safari, or Edge

## Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
npm install --legacy-peer-deps
```
*Note: The `--legacy-peer-deps` flag is required due to React-Leaflet version compatibility.*

### 2. Build the Application
```bash
npm run build
```

### 3. Local Deployment Options

#### Option A: Using a Simple HTTP Server (Recommended)
```bash
# Install a simple HTTP server globally
npm install -g http-server

# Navigate to the built application
cd dist

# Serve the app locally
http-server -p 3000 -o
```

Your app will open automatically at `http://localhost:3000`

#### Option B: Using Python (Built into macOS)
```bash
# Navigate to the built application
cd dist

# Python 3 (recommended)
python3 -m http.server 3000

# Or Python 2 (if Python 3 not available)
python -m SimpleHTTPServer 3000
```

Then open `http://localhost:3000` in your browser.

#### Option C: Using Node.js serve package
```bash
# Install serve globally
npm install -g serve

# Serve the built application
serve -s dist -l 3000
```

## Application Features

Your local OnGoPool deployment includes:

- **User Authentication**: Complete signup/login system
- **Ride Management**: Post and find carpool rides
- **Real-time Chat**: Communication between drivers and passengers
- **Payment System**: Dual payment support (Stripe + PayPal)
- **Trip Dashboard**: Comprehensive ride management
- **Profile Management**: User profiles with license verification
- **Earnings Analytics**: Driver earnings tracking and analytics
- **Live ETA Tracking**: Real-time route tracking and updates

## Configuration Notes

### Database Connection
- **Live Database**: Connected to Supabase cloud database
- **Real-time Features**: All chat and notifications work with live data
- **No Local Database Required**: Everything works through cloud connection

### Payment System
- **Test Mode**: Currently configured with test credentials
- **Stripe**: Test payments (no real charges)
- **PayPal**: Production mode configured but safe for testing
- **Backend API**: Requires deployment for live payment processing

### Environment Variables
The app is pre-configured with:
- Supabase database connection
- Payment processor credentials (test mode)
- All necessary API keys included

## Accessing Your App

1. **Landing Page**: Beautiful gradient landing page with "Get Started" button
2. **Authentication**: Sign up or log in to access full features
3. **Dashboard**: Complete ride management interface
4. **Mobile Responsive**: Works perfectly on phones and tablets

## File Structure
```
dist/                 # Built application (serve this folder)
├── index.html       # Main entry point
├── assets/          # CSS, JS, and other assets
└── *.js, *.css      # Application bundles
```

## Troubleshooting

### Port Already in Use
If port 3000 is busy, use a different port:
```bash
http-server -p 8080 -o
# or
python3 -m http.server 8080
```

### Build Issues
If you encounter build problems:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

### Browser Compatibility
- **Recommended**: Chrome or Firefox for best experience
- **Safari**: Fully supported
- **Mobile**: Responsive design works on all mobile browsers

## Development Mode

For development with hot reloading:
```bash
npm run dev
```
*Note: Development mode runs on `http://localhost:5173`*

## Security Notes

- **Local Access Only**: By default, only accessible from your Mac
- **Network Access**: Add `-a 0.0.0.0` to allow access from other devices on your network
- **Production Deployment**: This setup is perfect for local/personal use

## Support

Your OnGoPool app is now running locally on your Mac! The application includes:
- Complete user authentication
- Real-time database connectivity
- Full payment system integration
- Mobile-responsive design
- All carpool management features

Enjoy your locally deployed carpool application! 🚗✨