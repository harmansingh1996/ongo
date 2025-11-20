import { supabase } from './supabaseClient';

/**
 * Payment Service with Stripe Integration via Supabase Edge Functions
 * Handles Stripe payment authorization, capture, and refund workflows
 * 
 * IMPORTANT: All Stripe operations now route through Supabase Edge Functions
 * Function URL: https://fewhwgvlgstmukhebyvz.supabase.co/functions/v1/stripe-payment
 */

// ============================================================
// EDGE FUNCTION CONFIGURATION
// ============================================================

import { API_ENDPOINTS } from '../config/api';

const PLATFORM_FEE_PERCENTAGE = 0.15; // 15% platform fee

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface PaymentMethod {
  id: string;
  user_id: string;
  type: 'card' | 'paypal' | 'bank';
  last_four: string;
  expiry_date: string;
  card_brand?: string;
  is_default: boolean;
  created_at: string;
}

export interface PaymentHistory {
  id: string;
  user_id: string;
  ride_id: string | null;
  amount: number;
  payment_method: string;
  transaction_id: string;
  status: 'paid' | 'authorized' | 'pending' | 'refunded';
  date: string;
  created_at: string;
}

export interface AddPaymentMethodData {
  type: 'card' | 'paypal' | 'bank';
  last_four: string;
  expiry_date: string;
  card_brand?: string;
  is_default?: boolean;
}

export interface CreatePaymentData {
  ride_id: string | null;
  amount: number;
  payment_method: string;
  transaction_id: string;
  status: 'paid' | 'authorized' | 'pending' | 'refunded';
}

export interface StripePaymentIntent {
  id: string;
  stripe_payment_intent_id: string;
  stripe_customer_id?: string;
  ride_id: string;
  booking_id?: string;
  rider_id: string;
  driver_id: string;
  amount_total: number;
  amount_subtotal: number;
  discount_amount: number;
  referral_code?: string;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 
          'processing' | 'authorized' | 'succeeded' | 'canceled' | 'failed';
  capture_method: 'manual' | 'automatic';
  captured_at?: string;
  canceled_at?: string;
  cancellation_reason?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentIntentData {
  rideId: string;
  bookingId?: string;
  riderId: string;
  driverId: string;
  amountSubtotal: number;
  referralCode?: string;
  discountPercent?: number;
  metadata?: any;
}

export interface CapturePaymentData {
  paymentIntentId: string;
  amountToCapture?: number;
}

export interface CancelPaymentData {
  paymentIntentId: string;
  cancellationReason: string;
}

export interface DriverNoShowData {
  rideId: string;
  bookingId?: string;
  driverId: string;
  riderId: string;
  reportedBy: string;
  noShowReason: string;
  paymentIntentId?: string;
}

// ============================================================
// EDGE FUNCTION HELPER
// ============================================================

/**
 * Call Supabase Edge Function with authentication
 */
async function callEdgeFunction(action: string, payload: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('User not authenticated');
  }

  // Determine endpoint based on action
  const endpoint = API_ENDPOINTS.payment[action as keyof typeof API_ENDPOINTS.payment];
  if (!endpoint) {
    throw new Error(`Unknown action: ${action}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Edge Function call failed: ${response.statusText}`);
  }

  return await response.json();
}

// ============================================================
// PAYMENT AUTHORIZATION (ON BOOKING)
// ============================================================

/**
 * Create and authorize a payment intent when rider books a ride
 * Payment is authorized but NOT captured until ride completion
 * 
 * This calls the Supabase Edge Function which handles Stripe API calls securely
 */
export async function createAndAuthorizePayment(
  data: CreatePaymentIntentData
): Promise<{ success: boolean; paymentIntent?: StripePaymentIntent; error?: string; clientSecret?: string }> {
  try {
    const result = await callEdgeFunction('create', {
      rideId: data.rideId,
      bookingId: data.bookingId,
      riderId: data.riderId,
      driverId: data.driverId,
      amountSubtotal: data.amountSubtotal,
      referralCode: data.referralCode,
    });

    if (result.success) {
      // CRITICAL FIX: Also create payment_history record when payment is authorized
      try {
        const { error: historyError } = await supabase
          .from('payment_history')
          .insert({
            user_id: data.riderId,
            ride_id: data.rideId,
            booking_id: data.bookingId || null,
            amount: result.paymentIntent.amount_total / 100, // Convert cents to dollars
            payment_method: 'stripe',
            transaction_id: result.paymentIntent.stripe_payment_intent_id,
            status: 'authorized',
            payment_type: 'ride',
            date: new Date().toISOString(),
          });

        if (historyError) {
          console.error('Failed to create payment history record:', historyError);
          // Don't fail the whole payment if history creation fails
        } else {
          console.log('✅ Payment history record created for', result.paymentIntent.stripe_payment_intent_id);
        }
      } catch (historyError) {
        console.error('Error creating payment history:', historyError);
        // Don't fail the whole payment
      }

      return {
        success: true,
        paymentIntent: result.paymentIntent,
        clientSecret: result.clientSecret,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Payment authorization failed',
      };
    }
  } catch (error) {
    console.error('Error creating and authorizing payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment authorization failed',
    };
  }
}

// ============================================================
// PAYMENT CAPTURE (AFTER RIDE COMPLETION)
// ============================================================

/**
 * Capture authorized payment after ride is completed
 * This transfers funds from rider to platform (driver gets paid weekly)
 * 
 * Calls the Edge Function to capture payment via Stripe API
 */
export async function capturePayment(
  data: CapturePaymentData
): Promise<{ success: boolean; capturedAmount?: number; driverEarnings?: number; error?: string }> {
  try {
    const result = await callEdgeFunction('capture', {
      paymentIntentId: data.paymentIntentId,
    });

    if (result.success) {
      return {
        success: true,
        capturedAmount: result.capturedAmount,
        driverEarnings: result.driverEarnings,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Payment capture failed',
      };
    }
  } catch (error) {
    console.error('Error capturing payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment capture failed',
    };
  }
}

// ============================================================
// PAYMENT CANCELLATION (IF BOOKING REJECTED/CANCELLED)
// ============================================================

/**
 * Cancel authorized payment if booking is rejected or cancelled
 * This releases the hold on rider's payment method
 * 
 * Calls the Edge Function to cancel payment via Stripe API
 * 
 * NOTE: This function handles simple cancellation (100% release).
 * For policy-based partial refunds, use cancelPaymentWithPolicy()
 */
export async function cancelPayment(
  data: CancelPaymentData
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callEdgeFunction('cancel', {
      paymentIntentId: data.paymentIntentId,
      reason: data.cancellationReason,
    });

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || 'Payment cancellation failed',
      };
    }
  } catch (error) {
    console.error('Error canceling payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment cancellation failed',
    };
  }
}

// ============================================================
// PAYMENT REFUND (ALREADY CAPTURED)
// ============================================================

/**
 * Refund a captured payment
 * 
 * Calls the Edge Function to create refund via Stripe API
 */
export async function refundPayment(
  paymentIntentId: string,
  reason?: string
): Promise<{ success: boolean; refundId?: string; amountRefunded?: number; error?: string }> {
  try {
    const result = await callEdgeFunction('refund', {
      paymentIntentId,
      reason,
    });

    if (result.success) {
      return {
        success: true,
        refundId: result.refundId,
        amountRefunded: result.amountRefunded,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Refund failed',
      };
    }
  } catch (error) {
    console.error('Error refunding payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Refund failed',
    };
  }
}

// ============================================================
// POLICY-BASED CANCELLATION & REFUNDS
// ============================================================

/**
 * Cancel/refund payment with cancellation policy rules
 * Handles both authorized and captured payments with partial refunds
 * 
 * Cancellation Policy:
 * - Driver cancels: 100% refund always
 * - Passenger cancels > 24h: 100% refund
 * - Passenger cancels 12-24h: 50% refund (50% fee)
 * - Passenger cancels < 12h: 0% refund (100% fee)
 */
export async function cancelPaymentWithPolicy(
  paymentIntentId: string,
  rideDepartureTime: Date,
  cancelledByRole: 'driver' | 'passenger',
  cancellationReason: string
): Promise<{
  success: boolean;
  refundAmount: number;
  refundPercentage: number;
  cancellationFee: number;
  error?: string;
}> {
  try {
    // Get payment intent details
    const { data: paymentIntent, error: fetchError } = await supabase
      .from('stripe_payment_intents')
      .select('*')
      .eq('id', paymentIntentId)
      .single();

    if (fetchError || !paymentIntent) {
      throw new Error('Payment intent not found');
    }

    // Calculate refund based on cancellation policy
    const now = new Date();
    const hoursUntilDeparture = (rideDepartureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    let refundPercentage = 0;
    
    if (cancelledByRole === 'driver') {
      refundPercentage = 100;
    } else {
      if (hoursUntilDeparture >= 24) {
        refundPercentage = 100;
      } else if (hoursUntilDeparture >= 12) {
        refundPercentage = 50;
      } else {
        refundPercentage = 0;
      }
    }

    const amountTotal = paymentIntent.amount_total;
    const refundAmount = Math.round((amountTotal * refundPercentage) / 100);
    const cancellationFee = amountTotal - refundAmount;

    // Handle based on payment status and refund percentage
    if (paymentIntent.status === 'authorized') {
      if (refundPercentage === 100) {
        // Full cancellation via Edge Function
        await cancelPayment({
          paymentIntentId,
          cancellationReason: `${cancelledByRole} cancellation: ${cancellationReason}`,
        });
        
        // Update payment_history to show cancellation
        await supabase
          .from('payment_history')
          .update({
            status: 'cancelled',
            amount_refunded: amountTotal,
            refund_reason: `${cancelledByRole} cancellation: ${cancellationReason}`,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      } else if (refundPercentage > 0) {
        // Partial refund: Capture fee amount, then process policy
        await capturePayment({ paymentIntentId });
        
        // Update metadata for partial cancellation
        await supabase
          .from('stripe_payment_intents')
          .update({
            cancellation_reason: `Partial cancellation (${refundPercentage}% refund): ${cancellationReason}`,
            metadata: {
              ...paymentIntent.metadata,
              cancellation_fee: cancellationFee,
              original_amount: amountTotal,
              charged_amount: cancellationFee,
            },
          })
          .eq('id', paymentIntentId);
        
        // Update payment_history to show partial refund
        await supabase
          .from('payment_history')
          .update({
            status: 'partial_refund',
            amount_refunded: refundAmount,
            refund_reason: `Partial cancellation (${refundPercentage}% refund): ${cancellationReason}`,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      } else {
        // No refund - capture full amount
        await capturePayment({ paymentIntentId });
        
        // Update payment_history to show no refund
        await supabase
          .from('payment_history')
          .update({
            status: 'completed_no_refund',
            amount_refunded: 0,
            refund_reason: `No refund - cancelled within 12 hours of departure`,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      }
    } else if (paymentIntent.status === 'succeeded') {
      // Payment already captured - issue refund if applicable
      if (refundAmount > 0) {
        await refundPayment(paymentIntentId, `${cancelledByRole} cancellation (${refundPercentage}% policy)`);
        
        // Update payment_history to show refund
        await supabase
          .from('payment_history')
          .update({
            status: refundPercentage === 100 ? 'refunded' : 'partial_refund',
            amount_refunded: refundAmount,
            refund_reason: `${cancelledByRole} cancellation (${refundPercentage}% policy)`,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      } else {
        // No refund for succeeded payment
        await supabase
          .from('payment_history')
          .update({
            status: 'completed_no_refund',
            amount_refunded: 0,
            refund_reason: `No refund - cancelled within 12 hours of departure`,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      }
    }

    // Mark referral as expired if full refund
    if (refundPercentage === 100 && paymentIntent.referral_code) {
      await supabase
        .from('referral_uses')
        .update({ status: 'expired' })
        .eq('referral_code', paymentIntent.referral_code)
        .eq('referred_user_id', paymentIntent.rider_id);
    }

    return {
      success: true,
      refundAmount,
      refundPercentage,
      cancellationFee,
    };
  } catch (error) {
    console.error('Error processing policy-based cancellation:', error);
    return {
      success: false,
      refundAmount: 0,
      refundPercentage: 0,
      cancellationFee: 0,
      error: error instanceof Error ? error.message : 'Cancellation failed',
    };
  }
}

// ============================================================
// DRIVER NO-SHOW HANDLING
// ============================================================

/**
 * Report driver no-show incident
 * Automatically triggers refund to rider and penalty for driver
 */
export async function reportDriverNoShow(
  data: DriverNoShowData
): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
  try {
    // Create no-show record
    const { data: noShowRecord, error: insertError } = await supabase
      .from('driver_no_shows')
      .insert({
        ride_id: data.rideId,
        booking_id: data.bookingId,
        driver_id: data.driverId,
        rider_id: data.riderId,
        reported_by: data.reportedBy,
        no_show_reason: data.noShowReason,
        payment_intent_id: data.paymentIntentId,
        verification_status: 'pending',
        reported_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // If payment intent exists, process refund
    if (data.paymentIntentId) {
      const { data: paymentIntent } = await supabase
        .from('stripe_payment_intents')
        .select('*')
        .eq('id', data.paymentIntentId)
        .single();

      if (paymentIntent && paymentIntent.status === 'authorized') {
        // Cancel the authorized payment
        await cancelPayment({
          paymentIntentId: data.paymentIntentId,
          cancellationReason: 'Driver no-show',
        });

        await supabase
          .from('driver_no_shows')
          .update({
            refund_issued: true,
            refund_amount: paymentIntent.amount_total,
            verification_status: 'confirmed',
          })
          .eq('id', noShowRecord.id);

        return { success: true, refundAmount: paymentIntent.amount_total };
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment was already captured, issue refund
        const refundResult = await refundPayment(data.paymentIntentId, 'Driver no-show');
        
        if (refundResult.success) {
          await supabase
            .from('driver_no_shows')
            .update({
              refund_issued: true,
              refund_amount: refundResult.amountRefunded,
              penalty_applied: true,
              penalty_amount: refundResult.amountRefunded,
              verification_status: 'confirmed',
            })
            .eq('id', noShowRecord.id);

          return { success: true, refundAmount: refundResult.amountRefunded };
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error reporting driver no-show:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to report no-show' };
  }
}

// ============================================================
// PAYMENT INTENT QUERIES
// ============================================================

/**
 * Get payment intent by ID
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent | null> {
  try {
    const { data, error } = await supabase
      .from('stripe_payment_intents')
      .select('*')
      .eq('id', paymentIntentId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching payment intent:', error);
    return null;
  }
}

/**
 * Get payment intent by ride ID
 */
export async function getPaymentIntentByRideId(rideId: string): Promise<StripePaymentIntent | null> {
  try {
    const { data, error } = await supabase
      .from('stripe_payment_intents')
      .select('*')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching payment intent by ride:', error);
    return null;
  }
}

/**
 * Get payment intent by booking ID
 */
export async function getPaymentIntentByBookingId(bookingId: string): Promise<StripePaymentIntent | null> {
  try {
    const { data, error } = await supabase
      .from('stripe_payment_intents')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching payment intent by booking:', error);
    return null;
  }
}

// ============================================================
// LEGACY PAYMENT METHOD FUNCTIONS (Kept for backward compatibility)
// ============================================================

/**
 * Get all payment methods for a user
 */
export async function getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return [];
  }
}

/**
 * Add a new payment method
 */
export async function addPaymentMethod(
  userId: string,
  methodData: AddPaymentMethodData
): Promise<PaymentMethod | null> {
  try {
    if (methodData.is_default) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data, error } = await supabase
      .from('payment_methods')
      .insert([
        {
          user_id: userId,
          ...methodData,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding payment method:', error);
    return null;
  }
}

/**
 * Set a payment method as default
 */
export async function setDefaultPaymentMethod(
  userId: string,
  methodId: string
): Promise<boolean> {
  try {
    await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('user_id', userId);

    const { error } = await supabase
      .from('payment_methods')
      .update({ is_default: true })
      .eq('id', methodId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error setting default payment method:', error);
    return false;
  }
}

/**
 * Delete a payment method
 */
export async function deletePaymentMethod(
  userId: string,
  methodId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', methodId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return false;
  }
}

/**
 * Get payment history for a user
 */
export async function getPaymentHistory(userId: string): Promise<PaymentHistory[]> {
  try {
    const { data, error } = await supabase
      .from('payment_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return [];
  }
}

/**
 * Create a payment record
 */
export async function createPaymentRecord(
  userId: string,
  paymentData: CreatePaymentData
): Promise<PaymentHistory | null> {
  try {
    const { data, error } = await supabase
      .from('payment_history')
      .insert([
        {
          user_id: userId,
          ...paymentData,
          date: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating payment record:', error);
    return null;
  }
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: 'paid' | 'authorized' | 'pending' | 'refunded'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('payment_history')
      .update({ status })
      .eq('id', paymentId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating payment status:', error);
    return false;
  }
}
