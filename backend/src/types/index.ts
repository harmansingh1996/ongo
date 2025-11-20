export interface PaymentRequest {
  action: 'create' | 'capture' | 'cancel' | 'refund' | 'create_payout' | 'verify_webhook';
  // Create payment intent
  rideId?: string;
  bookingId?: string;
  driverId?: string;
  amountSubtotal?: number; // In cents
  referralCode?: string;
  // Capture/Cancel/Refund
  paymentIntentId?: string;
  // Refund
  reason?: string;
  // Payout
  driverId_payout?: string;
  amount?: number;
  // Webhook
  payload?: string;
  signature?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface QueuePayment {
  id: string;
  payment_intent_id: string;
  ride_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
}

export interface CaptureResult {
  success: boolean;
  paymentId: string;
  error?: string;
}
