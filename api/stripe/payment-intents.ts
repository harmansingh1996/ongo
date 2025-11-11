import type { Request, Response, Router } from 'express';
import Stripe from 'stripe';
import { stripe } from './stripeClient.js';

// Request interfaces
export interface CreatePaymentIntentRequest {
  amount: number; // Amount in dollars (will be converted to cents)
  currency: string;
  capture_method: 'automatic' | 'manual';
  booking_id: number;
  user_id: string;
  customer_id?: string;
  payment_method_id?: string; // Optional saved payment method
}

export interface CapturePaymentIntentRequest {
  payment_intent_id: string;
  amount_to_capture?: number; // Optional partial capture amount in dollars
}

export interface CancelPaymentIntentRequest {
  payment_intent_id: string;
  cancellation_reason?: string;
}

export interface RefundPaymentRequest {
  payment_intent_id: string;
  amount?: number; // Optional partial refund amount in dollars
  reason?: string;
}

// Response interfaces
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
export async function createPaymentIntent(
  request: CreatePaymentIntentRequest
): Promise<PaymentIntentResponse> {
  try {
    if (!request.amount || request.amount <= 0) {
      return {
        success: false,
        error: 'Invalid amount specified',
      };
    }

    if (!request.booking_id || !request.user_id) {
      return {
        success: false,
        error: 'Missing required booking or user information',
      };
    }

    const customerId = request.customer_id?.trim() || undefined;

    if (request.payment_method_id && !customerId) {
      return {
        success: false,
        error: 'customer_id is required when using a saved payment_method_id',
      };
    }

    const amountInCents = Math.round(request.amount * 100);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: request.currency.toLowerCase(),
      capture_method: request.capture_method,
      metadata: {
        booking_id: request.booking_id.toString(),
        user_id: request.user_id,
        app: 'OnGoPool',
        created_at: new Date().toISOString(),
        ...(customerId ? { customer_id: customerId } : {}),
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    };

    if (customerId) {
      paymentIntentParams.customer = customerId;
    }

    if (request.payment_method_id) {
      paymentIntentParams.payment_method = request.payment_method_id;
      paymentIntentParams.confirm = true;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      payment_intent: paymentIntent,
      client_secret: paymentIntent.client_secret!,
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment authorization',
    };
  }
}

/**
 * Capture Payment Intent (Convert Authorization to Charge)
 */
export async function capturePaymentIntent(
  request: CapturePaymentIntentRequest
): Promise<PaymentActionResponse> {
  try {
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required',
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    if (paymentIntent.status !== 'requires_capture') {
      return {
        success: false,
        error: `Payment intent cannot be captured. Current status: ${paymentIntent.status}`,
      };
    }

    let captureAmount = paymentIntent.amount;
    if (request.amount_to_capture) {
      captureAmount = Math.round(request.amount_to_capture * 100);

      if (captureAmount > paymentIntent.amount) {
        return {
          success: false,
          error: 'Capture amount cannot exceed authorized amount',
        };
      }
    }

    const capturedPayment = await stripe.paymentIntents.capture(
      request.payment_intent_id,
      captureAmount < paymentIntent.amount ? { amount_to_capture: captureAmount } : {}
    );

    return {
      success: true,
      payment_intent: capturedPayment,
      amount_processed: captureAmount / 100,
    };
  } catch (error) {
    console.error('Error capturing payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture payment',
    };
  }
}

/**
 * Cancel Payment Intent (Void Authorization)
 */
export async function cancelPaymentIntent(
  request: CancelPaymentIntentRequest
): Promise<PaymentActionResponse> {
  try {
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required',
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    if (!['requires_payment_method', 'requires_capture', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)) {
      return {
        success: false,
        error: `Payment intent cannot be cancelled. Current status: ${paymentIntent.status}`,
      };
    }

    const updateParams: Stripe.PaymentIntentUpdateParams = {};
    if (request.cancellation_reason) {
      updateParams.metadata = {
        ...paymentIntent.metadata,
        cancellation_reason: request.cancellation_reason,
        cancelled_at: new Date().toISOString(),
      };
    }

    if (Object.keys(updateParams).length > 0) {
      await stripe.paymentIntents.update(request.payment_intent_id, updateParams);
    }

    const cancelledPayment = await stripe.paymentIntents.cancel(request.payment_intent_id);

    return {
      success: true,
      payment_intent: cancelledPayment,
      amount_processed: 0,
    };
  } catch (error) {
    console.error('Error cancelling payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel payment authorization',
    };
  }
}

/**
 * Create Refund for Captured Payment
 */
export async function createRefund(
  request: RefundPaymentRequest
): Promise<PaymentActionResponse> {
  try {
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required',
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: `Payment cannot be refunded. Current status: ${paymentIntent.status}`,
      };
    }

    let refundAmount = paymentIntent.amount_received;
    if (request.amount) {
      refundAmount = Math.round(request.amount * 100);

      if (refundAmount > paymentIntent.amount_received) {
        return {
          success: false,
          error: 'Refund amount cannot exceed captured amount',
        };
      }
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: request.payment_intent_id,
      amount: refundAmount,
      metadata: {
        booking_id: paymentIntent.metadata.booking_id || '',
        user_id: paymentIntent.metadata.user_id || '',
        refund_reason: request.reason || 'requested',
        refunded_at: new Date().toISOString(),
      },
    };

    const refund = await stripe.refunds.create(refundParams);

    return {
      success: true,
      refund,
      amount_processed: refundAmount / 100,
    };
  } catch (error) {
    console.error('Error creating refund:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund',
    };
  }
}

/**
 * Get Payment Intent Status
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentResponse> {
  try {
    if (!paymentIntentId) {
      return {
        success: false,
        error: 'Payment intent ID is required',
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      success: true,
      payment_intent: paymentIntent,
    };
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment status',
    };
  }
}

function sendStripeResponse(res: Response, result: { success: boolean; error?: string }, data?: Record<string, unknown>) {
  res.status(result.success ? 200 : 400).json({
    success: result.success,
    data: result.success ? data : undefined,
    error: result.error,
    timestamp: new Date().toISOString(),
    statusCode: result.success ? 200 : 400,
  });
}

export function registerPaymentIntentRoutes(router: Router) {
  router.post('/payment-intents', async (req: Request, res: Response) => {
    const result = await createPaymentIntent(req.body as CreatePaymentIntentRequest);
    sendStripeResponse(res, result, {
      payment_intent: result.payment_intent,
      client_secret: result.client_secret,
    });
  });

  router.post('/payment-intents/capture', async (req: Request, res: Response) => {
    const result = await capturePaymentIntent(req.body as CapturePaymentIntentRequest);
    sendStripeResponse(res, result, {
      payment_intent: result.payment_intent,
      amount_processed: result.amount_processed,
    });
  });

  router.post('/payment-intents/cancel', async (req: Request, res: Response) => {
    const result = await cancelPaymentIntent(req.body as CancelPaymentIntentRequest);
    sendStripeResponse(res, result, {
      payment_intent: result.payment_intent,
      amount_processed: result.amount_processed,
    });
  });

  router.post('/refunds', async (req: Request, res: Response) => {
    const result = await createRefund(req.body as RefundPaymentRequest);
    sendStripeResponse(res, result, {
      refund: result.refund,
      amount_processed: result.amount_processed,
    });
  });

  router.get('/payment-intents/:id', async (req: Request, res: Response) => {
    const result = await getPaymentIntent(req.params.id);
    sendStripeResponse(res, result, {
      payment_intent: result.payment_intent,
    });
  });
}
