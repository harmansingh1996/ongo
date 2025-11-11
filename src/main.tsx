import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import "./index.css";
import App from "./App.tsx";
import { PayPalService } from './lib/paypalService';

// Initialize Stripe once at the app entrypoint so every component shares the same instance
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.error("⚠️ Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable. Stripe Elements will not load.");
}
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

// PayPal configuration - automatically detects sandbox vs production mode
const paypalOptions = PayPalService.getSDKOptions();

// Log PayPal environment info on app startup
const envInfo = PayPalService.getEnvironmentInfo();
console.log(`🚀 PayPal initialized in ${envInfo.mode.toUpperCase()} mode`);
if (envInfo.isLive) {
  console.log('✅ PRODUCTION PayPal payments enabled - real money will be processed');
} else {
  console.log('⚠️ SANDBOX PayPal payments - test mode only');
  console.log('💡 Set VITE_PAYPAL_SANDBOX_MODE=false in .env for live payments');
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

// Apply safe-area friendly styles in case index.html was modified
rootElement.classList.add(
  "w-full",
  "min-h-screen",
  "bg-gradient-to-b",
  "from-[#F6F4F1]",
  "to-white"
);
rootElement.setAttribute(
  "style",
  [
    rootElement.getAttribute("style") ?? "",
    "padding-top: env(safe-area-inset-top);",
    "padding-bottom: env(safe-area-inset-bottom);"
  ].join(" ").trim()
);

createRoot(rootElement).render(
  <StrictMode>
    <PayPalScriptProvider options={paypalOptions}>
      {stripePromise ? (
        <Elements stripe={stripePromise}>
          <App />
        </Elements>
      ) : (
        <App />
      )}
    </PayPalScriptProvider>
  </StrictMode>
);