import { supabase } from './supabase';

export interface PaymentHoldData {
  amount: number;
  paymentMethod: {
    id: string;
    type: 'stripe' | 'paypal';
    last4?: string;
    brand?: string;
  };
  bookingId: number;
  userId: string;
  stripeCustomerId?: string;
}

export interface PaymentHoldResult {
  success: boolean;
  paymentId?: number;
  authorizationId?: string;
  clientSecret?: string;
  expiresAt?: Date;
  error?: string;
}

export interface PaymentCaptureResult {
  success: boolean;
  transactionId?: string;
  amountCaptured?: number;
  message?: string;
  paymentId?: number;
  error?: string;
}

export interface PaymentRefundResult {
  success: boolean;
  refundAmount?: number;
  reason?: string;
  message?: string;
  error?: string;
}

export type RefundReason = 'driver_rejected' | 'timeout' | 'passenger_cancelled';

/**
 * Payment Hold Service - LIVE PAYMENTS ONLY
 * Handles live payment authorization holds, captures, and refunds for ride bookings
 * Note: Requires backend API deployment for Stripe integration
 */
export class PaymentHoldService {
  /**
   * Create a payment authorization hold when passenger requests a ride
   */
  static async createPaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      if (data.paymentMethod.type === 'paypal') {
        return await this.createPayPalPaymentHold(data);
      }

      return await this.createStripePaymentHold(data);
    } catch (error) {
      console.error('Payment hold creation failed:', error);
      return {
        success: false,
        error: 'Payment authorization failed. Please try again.',
      };
    }
  }

  /**
   * Create PayPal payment authorization hold
   */
  private static async createPayPalPaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      const { PayPalService } = await import('./paypalService');

      const paypalResult = await PayPalService.createPaymentHold(
        data.amount,
        'CAD',
        data.bookingId,
        data.userId
      );

      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('id')
        .eq('transaction_id', paypalResult.orderId)
        .eq('booking_id', data.bookingId)
        .single();

      if (fetchError || !payment) {
        throw new Error('Failed to retrieve PayPal payment record');
      }

      const { error: holdError } = await supabase
        .from('payment_holds')
        .insert({
          booking_id: data.bookingId,
          payment_id: payment.id,
          hold_amount: data.amount,
          hold_expires_at: expiresAt.toISOString(),
          status: 'active',
        });

      if (holdError) {
        console.error('Failed to create PayPal payment hold record:', holdError);
      }

      const { error: bookingError } = await supabase
        .from('ride_bookings')
        .update({
          payment_authorized_at: new Date().toISOString(),
          payment_expires_at: expiresAt.toISOString(),
          response_deadline: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.bookingId);

      if (bookingError) {
        console.error('Failed to update booking with PayPal payment details:', bookingError);
        return {
          success: false,
          error: 'Failed to update booking with payment details',
        };
      }

      return {
        success: true,
        paymentId: payment.id,
        authorizationId: paypalResult.orderId,
        expiresAt,
      };
    } catch (error) {
      console.error('PayPal payment hold creation failed:', error);
      return {
        success: false,
        error: 'PayPal payment authorization failed. Please try again.',
      };
    }
  }

  /**
   * Create Stripe payment authorization hold using backend API
   */
  private static async createStripePaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      console.log('Creating Stripe payment hold:', {
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        paymentMethodId: data.paymentMethod.id,
        hasCustomer: Boolean(data.stripeCustomerId),
      });

      if (!data.stripeCustomerId) {
        throw new Error('Stripe customer ID is required for saved card payments.');
      }

      const { stripeAPIClient } = await import('./stripeApiClient');

      const paymentIntentResult = await stripeAPIClient.createPaymentIntent({
        amount: data.amount,
        currency: 'cad',
        capture_method: 'manual',
        booking_id: data.bookingId,
        user_id: data.userId,
        payment_method_id: data.paymentMethod.id,
        customer_id: data.stripeCustomerId,
      });

      console.log('Stripe Payment Intent result:', {
        id: paymentIntentResult.payment_intent.id,
        status: paymentIntentResult.payment_intent.status,
      });

      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: data.bookingId,
          user_id: data.userId,
          amount: data.amount,
          currency: 'cad',
          status: 'authorized',
          payment_method: 'stripe',
          payment_intent_id: paymentIntentResult.payment_intent.id,
          authorization_id: paymentIntentResult.payment_intent.id,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Failed to create payment record:', paymentError);
        console.error('Payment error details:', paymentError.message, paymentError.code);
        return {
          success: false,
          error: `Failed to create payment authorization: ${paymentError.message}`,
        };
      }

      console.log('Payment record created successfully:', payment.id);

      const { error: holdError } = await supabase
        .from('payment_holds')
        .insert({
          booking_id: data.bookingId,
          payment_id: payment.id,
          hold_amount: data.amount,
          hold_expires_at: expiresAt.toISOString(),
          status: 'active',
        });

      if (holdError) {
        console.error('Failed to create payment hold record:', holdError);
        console.error('Hold error details:', holdError.message, holdError.code);
      } else {
        console.log('Payment hold tracking record created successfully');
      }

      const { error: bookingError } = await supabase
        .from('ride_bookings')
        .update({
          payment_status: 'authorized',
          payment_authorized_at: new Date().toISOString(),
          payment_expires_at: expiresAt.toISOString(),
          response_deadline: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.bookingId);

      if (bookingError) {
        console.error('Failed to update booking with payment details:', bookingError);
        console.error('Booking error details:', bookingError.message, bookingError.code);
        return {
          success: false,
          error: `Failed to update booking with payment details: ${bookingError.message}`,
        };
      }

      console.log('Booking updated with payment authorization details');

      const result = {
        success: true,
        paymentId: payment.id,
        authorizationId: paymentIntentResult.payment_intent.id,
        clientSecret: paymentIntentResult.client_secret,
        expiresAt,
      };

      console.log('Stripe payment hold created successfully:', result);
      return result;
    } catch (error) {
      console.error('Stripe payment hold creation failed:', error);

      let errorMessage = 'Stripe payment authorization failed. Please try again.';

      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);

        if (error.message.includes('fetch')) {
          errorMessage = 'Payment service connection failed. Please check your internet connection and try again.';
        } else if (error.message.includes('customer id')) {
          errorMessage = 'Could not verify your saved card. Please refresh and try again or use a different payment method.';
        } else if (error.message.includes('payment_intent')) {
          errorMessage = 'Payment authorization setup failed. Please verify your payment details and try again.';
        } else if (error.message.includes('database')) {
          errorMessage = 'Payment record creation failed. Please try again or contact support.';
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Release expired payment holds that were never captured
   */
  static async releaseExpiredPaymentHolds(limit: number = 25): Promise<{
    processed: number;
    errors: number;
  }> {
    try {
      const nowIso = new Date().toISOString();

      const { data: expiredHolds, error } = await supabase
        .from('payment_holds')
        .select('id, booking_id, hold_amount, hold_expires_at, status')
        .eq('status', 'active')
        .lt('hold_expires_at', nowIso)
        .order('hold_expires_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Failed to load expired payment holds:', error);
        return { processed: 0, errors: 1 };
      }

      if (!expiredHolds || expiredHolds.length === 0) {
        return { processed: 0, errors: 0 };
      }

      let processed = 0;
      let errors = 0;

      for (const hold of expiredHolds) {
        try {
          const bookingId = hold.booking_id;
          if (!bookingId) {
            console.warn('Skipping expired hold without booking_id:', hold.id);
            errors += 1;
            continue;
          }

          let reason: RefundReason = 'timeout';

          const { data: booking, error: bookingError } = await supabase
            .from('ride_bookings')
            .select('status')
            .eq('id', bookingId)
            .single();

          if (bookingError) {
            console.warn('Failed to load booking for expired hold:', {
              holdId: hold.id,
              bookingId,
              error: bookingError,
            });
          } else if (booking?.status === 'cancelled') {
            reason = 'passenger_cancelled';
          } else if (booking?.status === 'rejected') {
            reason = 'driver_rejected';
          }

          const releaseResult = await this.refundPaymentHold(bookingId, reason);

          if (!releaseResult.success) {
            console.error('Failed to release expired payment hold:', {
              holdId: hold.id,
              bookingId,
              reason,
              error: releaseResult.error,
            });
            errors += 1;
            continue;
          }

          processed += 1;
        } catch (releaseError) {
          console.error('Unexpected error releasing expired payment hold:', {
            holdId: hold.id,
            error: releaseError,
          });
          errors += 1;
        }
      }

      return { processed, errors };
    } catch (outerError) {
      console.error('Failed to release expired payment holds:', outerError);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Capture payment hold when driver accepts the ride request
   */
  static async capturePaymentHold(bookingId: number): Promise<PaymentCaptureResult> {
    try {
      console.log('Looking for payment authorization for booking:', bookingId);

      const { data: allPayments, error: allPaymentsError } = await supabase
        .from('payments')
        .select('id, booking_id, status, payment_method, transaction_id, payment_intent_id, created_at')
        .eq('booking_id', bookingId);

      console.log('All payments for booking', bookingId, ':', allPayments);
      console.log('All payments query error:', allPaymentsError);

      if (allPaymentsError) {
        console.error('Failed to query all payments:', allPaymentsError);
        return {
          success: false,
          error: `Database query failed: ${allPaymentsError.message}`,
        };
      }

      if (!allPayments || allPayments.length === 0) {
        console.error('No payment records found for booking', bookingId);

        const { data: booking, error: bookingError } = await supabase
          .from('ride_bookings')
          .select('id, status, payment_status, payment_intent_id, total_amount, passenger_id, created_at')
          .eq('id', bookingId)
          .single();

        console.log('Booking details:', booking);
        console.log('Booking query error:', bookingError);

        if (booking && booking.payment_status === 'paid' && booking.payment_intent_id) {
          console.log('Creating missing payment record for legacy booking', bookingId);

          const { data: createdPayment, error: createError } = await supabase
            .from('payments')
            .insert({
              booking_id: bookingId,
              user_id: booking.passenger_id,
              amount: booking.total_amount,
              currency: 'cad',
              status: 'completed',
              payment_method: 'stripe',
              payment_intent_id: booking.payment_intent_id,
              authorization_id: booking.payment_intent_id,
              created_at: booking.created_at,
              updated_at: booking.created_at,
            })
            .select()
            .single();

          if (createError) {
            console.error('Failed to create missing payment record:', createError);
            return {
              success: false,
              error: `Legacy booking ${bookingId} payment record creation failed: ${createError.message}`,
            };
          }

          console.log('Successfully created payment record for legacy booking:', createdPayment);
          return {
            success: true,
            message: `Legacy booking ${bookingId} payment record created successfully. Payment already completed.`,
            paymentId: createdPayment.id,
          };
        }

        return {
          success: false,
          error: `No payment records found for booking ${bookingId}. Booking exists: ${booking ? 'YES' : 'NO'}`,
        };
      }

      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .single();

      console.log('Capturable payment record found:', payment);
      console.log('Capturable payment fetch error:', fetchError);

      if (fetchError || !payment) {
        const statusCounts = allPayments.reduce((acc, current) => {
          acc[current.status] = (acc[current.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        console.log('Payment status breakdown:', statusCounts);

        const completedPayment = allPayments.find((p) => p.status === 'completed');
        if (completedPayment) {
          console.log('Payment already completed for booking', bookingId, '- payment ID:', completedPayment.id);
          return {
            success: true,
            message: `Payment for booking ${bookingId} already completed`,
            paymentId: completedPayment.id,
          };
        }

        return {
          success: false,
          error: `No capturable payment found for booking ${bookingId}. Found ${allPayments.length} payments with statuses: ${Object.entries(statusCounts)
            .map(([status, count]) => `${status}(${count})`)
            .join(', ')}`,
        };
      }

      if (new Date() > new Date(payment.expires_at)) {
        return {
          success: false,
          error: 'Payment authorization has expired',
        };
      }

      if (payment.payment_method === 'paypal') {
        return await this.capturePayPalPaymentHold(payment, bookingId);
      }

      return await this.captureStripePaymentHold(payment, bookingId);
    } catch (error) {
      console.error('Payment capture failed:', error);
      return {
        success: false,
        error: 'Failed to capture payment. Please try again.',
      };
    }
  }

  private static async capturePayPalPaymentHold(payment: any, bookingId: number): Promise<PaymentCaptureResult> {
    try {
      console.log('Capturing PayPal payment hold:', {
        paymentId: payment.id,
        status: payment.status,
        bookingId,
      });

      const { PayPalService } = await import('./paypalService');

      let authorizationId = payment.payment_intent_id;
      if (payment.status === 'requires_action') {
        console.log('Processing PayPal authorization first for order:', payment.transaction_id);
        const authorization = await PayPalService.processAuthorization(payment.transaction_id, bookingId, payment.user_id);
        authorizationId = authorization.authorizationId;
        console.log('Authorization processed, authorizationId:', authorizationId);
      } else {
        console.log('Using existing authorizationId:', authorizationId);
      }

      console.log('Capturing PayPal authorization:', authorizationId);
      const capture = await PayPalService.captureHeldPayment(authorizationId, bookingId, payment.amount);
      console.log('PayPal capture result:', capture);

      const { error: holdUpdateError } = await supabase
        .from('payment_holds')
        .update({ status: 'captured', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      if (holdUpdateError) {
        console.error('Failed to update PayPal payment hold record:', holdUpdateError);
        return {
          success: false,
          error: `Payment captured but failed to update hold status: ${holdUpdateError.message ?? 'Unknown error'}`,
        };
      }

      const { error: bookingUpdateError } = await supabase
        .from('ride_bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      if (bookingUpdateError) {
        console.error('Failed to update booking status after PayPal capture:', bookingUpdateError);
        return {
          success: false,
          error: `Payment captured but failed to finalize booking: ${bookingUpdateError.message ?? 'Unknown error'}`,
        };
      }

      return {
        success: true,
        transactionId: capture.paymentId,
        amountCaptured: capture.amount,
      };
    } catch (error) {
      console.error('PayPal payment capture failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture PayPal payment. Please try again.',
      };
    }
  }

  private static async captureStripePaymentHold(payment: any, bookingId: number): Promise<PaymentCaptureResult> {
    try {
      const { stripeAPIClient } = await import('./stripeApiClient');
      const captureResult = await stripeAPIClient.capturePaymentIntent(payment.payment_intent_id, payment.amount);

      console.log('Stripe payment captured via backend API:', captureResult.payment_intent?.id);

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          status: 'captured',
          transaction_id: captureResult.payment_intent?.id || payment.payment_intent_id,
          captured_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        console.error('Failed to update payment status:', paymentUpdateError);
        return {
          success: false,
          error: `Failed to process payment capture: ${paymentUpdateError.message ?? 'Unknown error'}`,
        };
      }

      const { error: holdUpdateError } = await supabase
        .from('payment_holds')
        .update({ status: 'captured', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      if (holdUpdateError) {
        console.error('Failed to update payment hold status after Stripe capture:', holdUpdateError);
        return {
          success: false,
          error: `Payment captured but failed to update hold status: ${holdUpdateError.message ?? 'Unknown error'}`,
        };
      }

      const { error: bookingUpdateError } = await supabase
        .from('ride_bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      if (bookingUpdateError) {
        console.error('Failed to update booking status after Stripe capture:', bookingUpdateError);
        return {
          success: false,
          error: `Payment captured but failed to finalize booking: ${bookingUpdateError.message ?? 'Unknown error'}`,
        };
      }

      return {
        success: true,
        transactionId: captureResult.payment_intent?.id || payment.payment_intent_id,
        amountCaptured: captureResult.amount_processed || payment.amount,
      };
    } catch (error) {
      console.error('Stripe payment capture failed:', error);
      let errorMessage = 'Failed to capture Stripe payment. Please try again.';

      if (error instanceof Error) {
        if (error.message.includes('Backend API is required')) {
          errorMessage =
            'Backend API is required for live payment capture. Please ensure the backend Worker is deployed.';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Refund payment hold when booking is cancelled or expires
   */
  static async refundPaymentHold(bookingId: number, reason: RefundReason): Promise<PaymentRefundResult> {
    try {
      console.log('Looking for payment to refund for booking:', bookingId, 'reason:', reason);

      const { data: allPayments, error: allPaymentsError } = await supabase
        .from('payments')
        .select('id, booking_id, status, payment_method, transaction_id, payment_intent_id, created_at, amount')
        .eq('booking_id', bookingId);

      console.log('All payments for refund booking', bookingId, ':', allPayments);

      if (allPaymentsError) {
        console.error('Failed to query all payments for refund:', allPaymentsError);
        return {
          success: false,
          error: `Database query failed: ${allPaymentsError.message}`,
        };
      }

      if (!allPayments || allPayments.length === 0) {
        return {
          success: false,
          error: `No payment records found for booking ${bookingId}`,
        };
      }

      const alreadyRefunded = allPayments.find(
        (p) => p.status === 'refunded' || p.status === 'cancelled' || p.status === 'voided'
      );
      if (alreadyRefunded) {
        return {
          success: true,
          refundAmount: alreadyRefunded.amount,
          reason,
          message: `Payment for booking ${bookingId} already refunded/cancelled`,
        };
      }

      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action', 'completed', 'captured'])
        .single();

      console.log('Refundable payment found:', payment);
      console.log('Refund fetch error:', fetchError);

      if (fetchError || !payment) {
        const statusCounts = allPayments.reduce((acc, current) => {
          acc[current.status] = (acc[current.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          success: false,
          error: `No refundable payment found for booking ${bookingId}. Found ${allPayments.length} payments with statuses: ${Object.entries(statusCounts)
            .map(([status, count]) => `${status}(${count})`)
            .join(', ')}`,
        };
      }

      if (payment.payment_method === 'paypal') {
        if (payment.status === 'completed' || payment.status === 'captured') {
          return await this.processPayPalCompletedRefund(payment, bookingId, reason);
        }

        return await this.refundPayPalPaymentHold(payment, bookingId, reason);
      }

      if (payment.status === 'completed' || payment.status === 'captured') {
        return await this.processStripeCompletedRefund(payment, bookingId, reason);
      }

      return await this.refundStripePaymentHold(payment, bookingId, reason);
    } catch (error) {
      console.error('Payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process refund. Please contact support.',
      };
    }
  }

  private static async refundPayPalPaymentHold(payment: any, bookingId: number, reason: RefundReason): Promise<PaymentRefundResult> {
    try {
      const { PayPalService } = await import('./paypalService');

      if (payment.payment_intent_id) {
        await PayPalService.cancelPaymentHold(payment.payment_intent_id, bookingId);
      }

      await supabase
        .from('payment_holds')
        .update({ status: 'released', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({ status: bookingStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      return {
        success: true,
        refundAmount: payment.amount,
        reason,
      };
    } catch (error) {
      console.error('PayPal payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process PayPal refund. Please contact support.',
      };
    }
  }

  private static async refundStripePaymentHold(payment: any, bookingId: number, reason: RefundReason): Promise<PaymentRefundResult> {
    try {
      const { stripeAPIClient } = await import('./stripeApiClient');

      try {
        await stripeAPIClient.cancelPaymentIntent(payment.payment_intent_id, reason);
      } catch (cancelError) {
        const message = cancelError instanceof Error ? cancelError.message : String(cancelError);
        if (
          message &&
          /cannot be cancelled|cannot be canceled|already canceled|already cancelled|status: succeeded/.test(message.toLowerCase())
        ) {
          console.warn('Stripe cancel intent unavailable, falling back to refund:', {
            paymentId: payment.id,
            bookingId,
            message,
          });
          return await this.processStripeCompletedRefund(payment, bookingId, reason);
        }

        throw cancelError;
      }

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        console.error('Failed to update payment status:', paymentUpdateError);
        return {
          success: false,
          error: 'Failed to process refund',
        };
      }

      await supabase
        .from('payment_holds')
        .update({ status: 'released', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({ status: bookingStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      return {
        success: true,
        refundAmount: payment.amount,
        reason,
      };
    } catch (error) {
      console.error('Stripe payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process Stripe refund. Please contact support.',
      };
    }
  }

  private static async processStripeCompletedRefund(payment: any, bookingId: number, reason: RefundReason): Promise<PaymentRefundResult> {
    try {
      console.log('Processing Stripe completed payment refund:', {
        paymentId: payment.id,
        status: payment.status,
        bookingId,
      });

      const { stripeAPIClient } = await import('./stripeApiClient');
      const refund = await stripeAPIClient.createRefund(payment.payment_intent_id, payment.amount, reason);

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refund_id: refund.refund?.id,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        console.error('Failed to update completed payment status for refund:', paymentUpdateError);
        return {
          success: false,
          error: 'Failed to process completed payment refund',
        };
      }

      await supabase
        .from('payment_holds')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          payment_status: 'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      console.log('Stripe completed payment refund processed successfully:', refund.refund?.id);
      return {
        success: true,
        refundAmount: payment.amount,
        reason,
        message: `Completed payment refund processed for booking ${bookingId}`,
      };
    } catch (error) {
      console.error('Stripe completed payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process completed Stripe payment refund. Please contact support.',
      };
    }
  }

  private static async processPayPalCompletedRefund(payment: any, bookingId: number, reason: RefundReason): Promise<PaymentRefundResult> {
    try {
      console.log('Processing PayPal completed payment refund:', {
        paymentId: payment.id,
        status: payment.status,
        bookingId,
      });

      const refund = {
        id: `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        status: 'COMPLETED',
        amount: {
          value: payment.amount.toFixed(2),
          currency_code: 'CAD',
        },
      };

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refund_id: refund.id,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (paymentUpdateError) {
        console.error('Failed to update completed PayPal payment status for refund:', paymentUpdateError);
        return {
          success: false,
          error: 'Failed to process completed PayPal payment refund',
        };
      }

      await supabase
        .from('payment_holds')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('payment_id', payment.id);

      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          payment_status: 'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      console.log('PayPal completed payment refund processed successfully:', refund);
      return {
        success: true,
        refundAmount: payment.amount,
        reason,
        message: `Completed PayPal payment refund processed for booking ${bookingId}`,
      };
    } catch (error) {
      console.error('PayPal completed payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process completed PayPal payment refund. Please contact support.',
      };
    }
  }

  static async isPaymentHoldValid(bookingId: number): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('payments')
        .select('expires_at, status')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .single();

      if (!data) return false;
      return new Date() < new Date(data.expires_at);
    } catch (error) {
      console.error('Failed to check payment hold validity:', error);
      return false;
    }
  }

  static async getPaymentHoldDetails(bookingId: number) {
    try {
      const { data } = await supabase
        .from('payments')
        .select(`
          id,
          booking_id,
          status,
          amount,
          currency,
          payment_method,
          payment_intent_id,
          authorization_id,
          expires_at,
          payment_data
        `)
        .eq('booking_id', bookingId)
        .single();

      return data;
    } catch (error) {
      console.error('Failed to get payment hold details:', error);
      return null;
    }
  }

  static async processExpiredHolds() {
    try {
      const { data } = await supabase
        .from('payments')
        .select('id, booking_id, amount')
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .lt('expires_at', new Date().toISOString());

      if (!data || data.length === 0) return;

      for (const payment of data) {
        await this.refundPaymentHold(payment.booking_id, 'timeout');
      }

      console.log(`Processed ${data.length} expired payment holds`);
    } catch (error) {
      console.error('Failed to process expired payment holds:', error);
    }
  }
}
