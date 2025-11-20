/**
 * API Configuration
 * Central configuration for backend API endpoints
 */

// Backend API Base URL
// Update this when deploying to Render
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://rideshare-backend-api.onrender.com';

// API Endpoints
export const API_ENDPOINTS = {
  // Payment endpoints
  payment: {
    create: `${API_BASE_URL}/api/payment/create`,
    capture: `${API_BASE_URL}/api/payment/capture`,
    cancel: `${API_BASE_URL}/api/payment/cancel`,
    refund: `${API_BASE_URL}/api/payment/refund`,
  },
  
  // Worker endpoints
  worker: {
    paymentCapture: `${API_BASE_URL}/api/worker/payment-capture`,
    health: `${API_BASE_URL}/api/worker/health`,
  },
  
  // Health check
  health: `${API_BASE_URL}/health`,
};

// Legacy Supabase Edge Function URLs (for reference/fallback)
export const LEGACY_ENDPOINTS = {
  stripePayment: 'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment',
  paymentCaptureWorker: 'https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/payment-capture-worker',
};
