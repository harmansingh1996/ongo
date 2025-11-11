import type { Router } from 'express';
import Stripe from 'stripe';
export interface CreatePaymentIntentRequest {
    amount: number;
    currency: string;
    capture_method: 'automatic' | 'manual';
    booking_id: number;
    user_id: string;
    customer_id?: string;
    payment_method_id?: string;
}
export interface CapturePaymentIntentRequest {
    payment_intent_id: string;
    amount_to_capture?: number;
}
export interface CancelPaymentIntentRequest {
    payment_intent_id: string;
    cancellation_reason?: string;
}
export interface RefundPaymentRequest {
    payment_intent_id: string;
    amount?: number;
    reason?: string;
}
export interface PaymentIntentResponse {
    success: boolean;
    payment_intent?: Stripe.PaymentIntent;
    client_secret?: string;
    error?: string;
}
export interface PaymentActionResponse {
    success: boolean;
    payment_intent?: Stripe.PaymentIntent;
    refund?: Stripe.Refund;
    amount_processed?: number;
    error?: string;
}
/**
 * Create Payment Intent for Authorization Hold
 */
export declare function createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntentResponse>;
/**
 * Capture Payment Intent (Convert Authorization to Charge)
 */
export declare function capturePaymentIntent(request: CapturePaymentIntentRequest): Promise<PaymentActionResponse>;
/**
 * Cancel Payment Intent (Void Authorization)
 */
export declare function cancelPaymentIntent(request: CancelPaymentIntentRequest): Promise<PaymentActionResponse>;
/**
 * Create Refund for Captured Payment
 */
export declare function createRefund(request: RefundPaymentRequest): Promise<PaymentActionResponse>;
/**
 * Get Payment Intent Status
 */
export declare function getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentResponse>;
export declare function registerPaymentIntentRoutes(router: Router): void;
