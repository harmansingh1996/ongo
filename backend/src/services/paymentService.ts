import { SupabaseClient } from '@supabase/supabase-js';
import * as stripeService from './stripeService';

/**
 * Create payment intent and store in database
 */
export async function createPayment(
  supabase: SupabaseClient,
  userId: string,
  params: {
    rideId: string;
    bookingId?: string;
    driverId: string;
    amountSubtotal: number;
    referralCode?: string;
  }
) {
  const { rideId, bookingId, driverId, amountSubtotal, referralCode } = params;

  // Calculate discount if referral code provided
  let discountAmount = 0;
  let finalReferralCode = referralCode;

  if (referralCode) {
    const { data: referralData, error: referralError } = await supabase
      .from('referral_rewards')
      .select('discount_amount, is_used')
      .eq('code', referralCode)
      .eq('user_id', userId)
      .single();

    if (!referralError && referralData && !referralData.is_used) {
      discountAmount = referralData.discount_amount;
    } else {
      console.log(`Referral code ${referralCode} is invalid or already used`);
      finalReferralCode = undefined;
    }
  }

  const amountTotal = amountSubtotal - discountAmount;

  // Create Stripe PaymentIntent
  const paymentIntent = await stripeService.createPaymentIntent({
    amount: amountTotal,
    currency: 'cad',
    metadata: {
      ride_id: rideId,
      booking_id: bookingId || 'pending',
      rider_id: userId,
      driver_id: driverId,
      referral_code: finalReferralCode || '',
    },
    description: `Ride booking ${bookingId || 'pending'}`,
  });

  // Store payment intent in database
  const { data: savedPaymentIntent, error: insertError } = await supabase
    .from('stripe_payment_intents')
    .insert({
      stripe_payment_intent_id: paymentIntent.id,
      ride_id: rideId,
      booking_id: bookingId,
      rider_id: userId,
      driver_id: driverId,
      amount_subtotal: amountSubtotal,
      discount_amount: discountAmount,
      amount_total: amountTotal,
      referral_code: finalReferralCode,
      status: paymentIntent.status,
      capture_method: 'manual',
      stripe_client_secret: paymentIntent.client_secret,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // Try to cancel the Stripe payment intent if database insert fails
    await stripeService.cancelPaymentIntent(paymentIntent.id);
    throw new Error(`Failed to save payment intent: ${insertError.message}`);
  }

  // Mark referral as used
  if (finalReferralCode) {
    await supabase
      .from('referral_rewards')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('code', finalReferralCode)
      .eq('user_id', userId);
  }

  // Log payment history
  await supabase.from('payment_history').insert({
    user_id: userId,
    ride_id: rideId,
    booking_id: bookingId,
    stripe_payment_intent_id: paymentIntent.id,
    amount: amountTotal,
    status: 'authorized',
    transaction_type: 'ride_payment',
    description: `Payment authorized for ride ${rideId}`,
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  return {
    paymentIntent: savedPaymentIntent,
    clientSecret: paymentIntent.client_secret,
  };
}

/**
 * Capture payment after ride completion
 */
export async function capturePayment(
  supabase: SupabaseClient,
  paymentIntentId: string
) {
  // Get payment intent from database
  const { data: paymentRecord, error: fetchError } = await supabase
    .from('stripe_payment_intents')
    .select('*')
    .eq('id', paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    throw new Error('Payment intent not found');
  }

  // Sync status from Stripe
  const currentStripeIntent = await stripeService.retrievePaymentIntent(
    paymentRecord.stripe_payment_intent_id
  );

  // Map Stripe status to database status
  let dbStatus: string = currentStripeIntent.status;
  if (currentStripeIntent.status === 'requires_capture') {
    dbStatus = 'authorized';
  }

  // Update database if status is out of sync
  if (paymentRecord.status !== dbStatus) {
    console.log(`Syncing payment status from ${paymentRecord.status} to ${dbStatus}`);
    await supabase
      .from('stripe_payment_intents')
      .update({
        status: dbStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentIntentId);

    paymentRecord.status = dbStatus;
  }

  // Validate capturable state
  if (paymentRecord.status !== 'authorized') {
    throw new Error(
      `Cannot capture payment in status: ${paymentRecord.status}. Stripe status: ${currentStripeIntent.status}`
    );
  }

  // Capture payment in Stripe
  const capturedIntent = await stripeService.capturePaymentIntent(
    paymentRecord.stripe_payment_intent_id
  );

  // Update database
  await supabase
    .from('stripe_payment_intents')
    .update({
      status: 'succeeded',
      captured_at: new Date().toISOString(),
    })
    .eq('id', paymentIntentId);

  // Update payment history
  await supabase
    .from('payment_history')
    .update({
      status: 'succeeded',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentRecord.stripe_payment_intent_id);

  // Create payment capture log
  await supabase.from('payment_capture_log').insert({
    payment_intent_id: paymentIntentId,
    stripe_payment_intent_id: paymentRecord.stripe_payment_intent_id,
    amount_captured: paymentRecord.amount_total,
    stripe_charge_id: capturedIntent.latest_charge,
    captured_at: new Date().toISOString(),
    status: 'success',
  });

  // Create driver earnings
  const platformFeePercent = 15;
  const grossEarnings = paymentRecord.amount_total;
  const platformFee = Math.floor((grossEarnings * platformFeePercent) / 100);
  const netEarnings = grossEarnings - platformFee;

  await supabase.from('driver_earnings').insert({
    driver_id: paymentRecord.driver_id,
    ride_id: paymentRecord.ride_id,
    booking_id: paymentRecord.booking_id,
    payment_intent_id: paymentIntentId,
    gross_amount: grossEarnings,
    platform_fee: platformFee,
    net_amount: netEarnings,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  return {
    success: true,
    message: 'Payment captured successfully',
    capturedIntent,
  };
}

/**
 * Cancel payment
 */
export async function cancelPayment(
  supabase: SupabaseClient,
  paymentIntentId: string
) {
  const { data: paymentRecord, error: fetchError } = await supabase
    .from('stripe_payment_intents')
    .select('*')
    .eq('id', paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    throw new Error('Payment intent not found');
  }

  // Cancel in Stripe
  const canceledIntent = await stripeService.cancelPaymentIntent(
    paymentRecord.stripe_payment_intent_id
  );

  // Update database
  await supabase
    .from('stripe_payment_intents')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentIntentId);

  await supabase
    .from('payment_history')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentRecord.stripe_payment_intent_id);

  return {
    success: true,
    message: 'Payment canceled successfully',
    canceledIntent,
  };
}

/**
 * Refund payment
 */
export async function refundPayment(
  supabase: SupabaseClient,
  paymentIntentId: string,
  reason?: string
) {
  const { data: paymentRecord, error: fetchError } = await supabase
    .from('stripe_payment_intents')
    .select('*')
    .eq('id', paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    throw new Error('Payment intent not found');
  }

  if (paymentRecord.status !== 'succeeded') {
    throw new Error('Cannot refund payment that has not been captured');
  }

  // Create refund in Stripe
  const refund = await stripeService.createRefund({
    paymentIntentId: paymentRecord.stripe_payment_intent_id,
    reason: reason as any,
  });

  // Update database
  await supabase
    .from('stripe_payment_intents')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', paymentIntentId);

  await supabase
    .from('payment_history')
    .update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentRecord.stripe_payment_intent_id);

  // Reverse driver earnings
  await supabase
    .from('driver_earnings')
    .update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('payment_intent_id', paymentIntentId);

  return {
    success: true,
    message: 'Payment refunded successfully',
    refund,
  };
}
