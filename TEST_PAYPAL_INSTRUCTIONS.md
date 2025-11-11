# PayPal Live Payment Configuration Guide

## Overview
OnGoPool now supports both sandbox (test) and live (production) PayPal payments with automatic environment detection and switching.

## Quick Setup for Live Payments

### 1. Environment Configuration
Update your `.env` file with the following variables:

```bash
# PayPal Configuration for Live Payments
# FOR LIVE PAYMENTS: Replace with your production PayPal app credentials
VITE_PAYPAL_CLIENT_ID=your_production_client_id_here
PAYPAL_CLIENT_SECRET=your_production_client_secret_here

# PayPal Environment Configuration
# Set to 'false' for live/production payments, 'true' or omit for sandbox
VITE_PAYPAL_SANDBOX_MODE=false
```

### 2. PayPal Developer Account Setup

#### For Live Payments:
1. **Create PayPal Business Account**: Go to [PayPal Business](https://www.paypal.com/ca/business)
2. **Access Developer Dashboard**: Visit [PayPal Developer](https://developer.paypal.com/)
3. **Create Production App**:
   - Log in to your PayPal Developer account
   - Go to "My Apps & Credentials"
   - Switch to "Live" tab
   - Click "Create App"
   - Fill in app details:
     - App Name: "OnGoPool Production"
     - Merchant: Select your business account
     - Features: Check "Accept Payments"
   - Click "Create App"
4. **Get Production Credentials**:
   - Copy the "Client ID" → use as `VITE_PAYPAL_CLIENT_ID`
   - Copy the "Client Secret" → use as `PAYPAL_CLIENT_SECRET`

#### For Testing (Sandbox):
1. Use existing sandbox credentials
2. Set `VITE_PAYPAL_SANDBOX_MODE=true` (or omit the variable)

## Environment Detection

The application automatically detects the PayPal environment based on the `VITE_PAYPAL_SANDBOX_MODE` variable:

- **`VITE_PAYPAL_SANDBOX_MODE=false`**: Production mode (live payments)
- **`VITE_PAYPAL_SANDBOX_MODE=true`** or **omitted**: Sandbox mode (test payments)

## Console Logging

The application provides clear console logging to show the current PayPal environment:

### App Startup:
```
🚀 PayPal initialized in PRODUCTION mode
✅ PRODUCTION PayPal payments enabled - real money will be processed
```

### Payment Creation:
```
🔄 Creating PayPal order in PRODUCTION mode
Amount: 25.50 CAD, Intent: authorize
✅ LIVE PayPal payment - will process real money
```

## PayPal Service API

### Environment Detection Methods

```typescript
// Check if PayPal is in live/production mode
const isLive = PayPalService.isLiveMode();

// Get current PayPal environment info
const envInfo = PayPalService.getEnvironmentInfo();
console.log({
  mode: envInfo.mode,        // 'sandbox' or 'production'
  baseUrl: envInfo.baseUrl,  // API endpoint URL
  clientId: envInfo.clientId, // Current client ID
  isLive: envInfo.isLive     // boolean
});
```

### Payment Processing

All payment methods automatically use the correct environment:

```typescript
// Create payment order (uses current environment)
const order = await PayPalService.createOrder(amount, currency);

// Process payment hold (environment-aware)
const result = await PayPalService.createPaymentHold(amount, currency, bookingId, userId);

// Capture authorized payment (uses correct API endpoint)
const capture = await PayPalService.captureHeldPayment(authorizationId, amount);
```

## Testing vs Live Payment Flow

### Sandbox Mode (Testing):
- Uses `https://api-m.sandbox.paypal.com`
- Test accounts and fake money
- Safe for development and testing
- Console shows "SANDBOX" indicators

### Production Mode (Live):
- Uses `https://api-m.paypal.com`
- Real PayPal accounts and actual money
- Live payment processing
- Console shows "PRODUCTION" indicators

## Security & Best Practices

1. **Environment Variables**: Never commit production credentials to version control
2. **Client ID**: Safe to expose in frontend (public key)
3. **Client Secret**: Keep secure, only use in backend/server-side operations
4. **Testing**: Always test thoroughly in sandbox before switching to production
5. **Monitoring**: Monitor console logs to ensure correct environment is active

## Deployment Checklist

### Before Going Live:
- [ ] PayPal Business account created and verified
- [ ] Production PayPal app created in developer dashboard
- [ ] Production credentials obtained and configured
- [ ] `VITE_PAYPAL_SANDBOX_MODE=false` set in production environment
- [ ] Tested payment flow in sandbox mode
- [ ] Verified console logging shows "PRODUCTION" mode
- [ ] Confirmed real payments process correctly
- [ ] Payment webhooks configured (if using backend)

### Rollback to Sandbox:
If issues occur, quickly rollback by setting:
```bash
VITE_PAYPAL_SANDBOX_MODE=true
```

## Troubleshooting

### Common Issues:

1. **Wrong Environment**: Check console logs for environment indicators
2. **Invalid Credentials**: Verify Client ID and Secret match the selected environment
3. **Sandbox in Production**: Ensure `VITE_PAYPAL_SANDBOX_MODE=false` for live payments
4. **Payment Failures**: Check PayPal Developer dashboard for transaction logs

### Debug Information:

```typescript
// Log current PayPal configuration
console.log('PayPal Environment:', PayPalService.getEnvironmentInfo());
```

This will show:
- Current mode (sandbox/production)
- API base URL being used
- Client ID in use
- Live mode status

## Support

For PayPal-specific issues:
- [PayPal Developer Documentation](https://developer.paypal.com/docs/)
- [PayPal Developer Community](https://developer.paypal.com/community/)
- [PayPal Merchant Support](https://www.paypal.com/merchantsupport)

For OnGoPool integration issues:
- Check console logs for environment detection
- Verify `.env` configuration
- Test in sandbox before production deployment