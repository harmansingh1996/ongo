import { supabase, handleSupabaseError } from './supabaseClient';
import { createNotification } from './notificationService';
import { cancelPaymentWithPolicy, getPaymentIntentByBookingId } from './paymentService';

/**
 * Cancellation and Refund Service
 * Handles automatic refund calculation and processing based on cancellation policy
 */

export interface CancellationRequest {
  rideId: string;
  cancelledBy: string;
  cancelledByRole: 'driver' | 'passenger';
  reason?: string;
  bookingId?: string; // For segment bookings
}

export interface CancellationResult {
  success: boolean;
  cancellationId?: string;
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount: number;
  cancellationFee: number;
  message: string;
  error?: string;
}

export interface RefundCalculation {
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount: number;
  cancellationFee: number;
  hoursBeforeDeparture: number;
}

/**
 * Calculate refund amount based on cancellation policy
 * 
 * Policy Rules:
 * 
 * DRIVER CANCELS (any time):
 * - Passengers get 100% refund (driver broke commitment)
 * 
 * PASSENGER CANCELS:
 * - More than 24 hours before departure: 100% refund (0% fee)
 * - Between 12-24 hours before departure: 50% refund (50% fee)
 * - Less than 12 hours before departure: No refund (100% fee)
 */
export function calculateRefund(
  rideDepartureTime: Date,
  originalAmount: number,
  cancellationTime: Date = new Date(),
  cancelledByRole: 'driver' | 'passenger' = 'passenger'
): RefundCalculation {
  const timeDiff = rideDepartureTime.getTime() - cancellationTime.getTime();
  const hoursBeforeDeparture = timeDiff / (1000 * 60 * 60);

  let refundEligible = false;
  let refundPercentage = 0;
  let refundAmount = 0;
  let cancellationFee = 0;

  // If driver cancels, passengers always get full refund
  if (cancelledByRole === 'driver') {
    refundEligible = true;
    refundPercentage = 100;
    refundAmount = originalAmount;
    cancellationFee = 0;
  } else {
    // Passenger cancellation - time-based policy
    if (hoursBeforeDeparture >= 24) {
      // Full refund
      refundEligible = true;
      refundPercentage = 100;
      refundAmount = originalAmount;
      cancellationFee = 0;
    } else if (hoursBeforeDeparture >= 12) {
      // 50% refund
      refundEligible = true;
      refundPercentage = 50;
      refundAmount = Math.round(originalAmount * 0.5 * 100) / 100;
      cancellationFee = Math.round(originalAmount * 0.5 * 100) / 100;
    } else {
      // No refund
      refundEligible = false;
      refundPercentage = 0;
      refundAmount = 0;
      cancellationFee = originalAmount;
    }
  }

  return {
    refundEligible,
    refundPercentage,
    refundAmount,
    cancellationFee,
    hoursBeforeDeparture: Math.round(hoursBeforeDeparture * 100) / 100,
  };
}

/**
 * Get ride departure time from ride data
 */
function getRideDepartureTime(ride: any): Date {
  // Combine date and time fields to create departure timestamp
  const dateStr = ride.date;
  const timeStr = ride.time;
  
  if (!dateStr || !timeStr) {
    throw new Error('Ride date or time is missing');
  }

  // Parse date and time
  const departureDateTime = new Date(`${dateStr}T${timeStr}`);
  
  if (isNaN(departureDateTime.getTime())) {
    throw new Error('Invalid ride date or time format');
  }

  return departureDateTime;
}

/**
 * Cancel a ride and process refund calculation
 */
export async function cancelRide(
  request: CancellationRequest
): Promise<CancellationResult> {
  try {
    const { rideId, cancelledBy, cancelledByRole, reason } = request;

    // 1. Fetch ride details
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) {
      return {
        success: false,
        refundEligible: false,
        refundPercentage: 0,
        refundAmount: 0,
        cancellationFee: 0,
        message: 'Ride not found',
        error: rideError?.message,
      };
    }

    // 2. Check if ride is already cancelled or completed
    if (ride.status === 'cancelled') {
      return {
        success: false,
        refundEligible: false,
        refundPercentage: 0,
        refundAmount: 0,
        cancellationFee: 0,
        message: 'Ride is already cancelled',
      };
    }

    if (ride.status === 'completed') {
      return {
        success: false,
        refundEligible: false,
        refundPercentage: 0,
        refundAmount: 0,
        cancellationFee: 0,
        message: 'Cannot cancel a completed ride',
      };
    }

    // 3. Get ride departure time
    const rideDepartureTime = getRideDepartureTime(ride);
    const cancellationTime = new Date();

    // 4. Get booking information to calculate original payment amount
    const { data: bookings, error: bookingsError } = await supabase
      .from('ride_requests')
      .select('*, profiles!ride_requests_passenger_id_fkey(*)')
      .eq('ride_id', rideId)
      .eq('status', 'accepted');

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
    }

    // Use ride price as base amount (driver cancellation affects all passengers)
    const originalAmount = ride.price_per_seat || 0;

    // 5. Calculate refund based on cancellation policy (role-aware)
    const refundCalc = calculateRefund(
      rideDepartureTime,
      originalAmount,
      cancellationTime,
      cancelledByRole
    );

    // 6. Create cancellation record
    const { data: cancellation, error: cancellationError } = await supabase
      .from('ride_cancellations')
      .insert({
        ride_id: rideId,
        cancelled_by: cancelledBy,
        cancelled_by_role: cancelledByRole,
        cancellation_reason: reason || null,
        cancellation_timestamp: cancellationTime.toISOString(),
        ride_departure_time: rideDepartureTime.toISOString(),
        hours_before_departure: refundCalc.hoursBeforeDeparture,
        refund_eligible: refundCalc.refundEligible,
        refund_percentage: refundCalc.refundPercentage,
        original_amount: originalAmount,
        refund_amount: refundCalc.refundAmount,
        cancellation_fee: refundCalc.cancellationFee,
        status: 'pending',
      })
      .select()
      .single();

    if (cancellationError || !cancellation) {
      return {
        success: false,
        refundEligible: refundCalc.refundEligible,
        refundPercentage: refundCalc.refundPercentage,
        refundAmount: refundCalc.refundAmount,
        cancellationFee: refundCalc.cancellationFee,
        message: 'Failed to create cancellation record',
        error: cancellationError?.message,
      };
    }

    // 7. Update ride status to cancelled
    const { error: updateError } = await supabase
      .from('rides')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', rideId);

    if (updateError) {
      console.error('Error updating ride status:', updateError);
    }

    // 8. Update all associated bookings to cancelled
    if (bookings && bookings.length > 0) {
      const { error: bookingUpdateError } = await supabase
        .from('ride_requests')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .in('status', ['pending', 'accepted']);

      if (bookingUpdateError) {
        console.error('Error updating bookings:', bookingUpdateError);
      }

      // 9. Process payments and create refund transactions for each affected passenger
      // Use individual booking prices for segment bookings
      for (const booking of bookings) {
        // Get segment-specific price for this booking
        const bookingPrice = Number(booking.price_per_seat) || originalAmount;
        const bookingAmount = bookingPrice * (booking.requested_seats || 1);
        
        // Calculate refund for this specific booking
        const bookingRefundCalc = calculateRefund(
          rideDepartureTime,
          bookingPrice,
          cancellationTime,
          cancelledByRole
        );
        
        const passengerRefundAmount = bookingRefundCalc.refundAmount * (booking.requested_seats || 1);
        const passengerCancellationFee = bookingRefundCalc.cancellationFee * (booking.requested_seats || 1);
        
        // Cancel/refund payment with policy
        const paymentIntent = await getPaymentIntentByBookingId(booking.id);
        if (paymentIntent) {
          const paymentResult = await cancelPaymentWithPolicy(
            paymentIntent.id,
            rideDepartureTime,
            cancelledByRole,
            reason || 'Ride cancelled'
          );
          
          if (paymentResult.success) {
            console.log(`✅ Payment ${paymentResult.refundPercentage}% refunded for booking ${booking.id}`);
          } else {
            console.error(`❌ Payment refund failed for booking ${booking.id}:`, paymentResult.error);
          }
        }
        
        // Create refund transaction if eligible
        if (bookingRefundCalc.refundEligible && passengerRefundAmount > 0) {
          await supabase
            .from('refund_transactions')
            .insert({
              cancellation_id: cancellation.id,
              ride_id: rideId,
              user_id: booking.passenger_id,
              refund_amount: passengerRefundAmount,
              refund_method: 'original_payment_method',
              transaction_status: 'pending',
            });
        }

        // Create notification for passenger with correct segment pricing
        await createNotification({
          userId: booking.passenger_id,
          type: 'cancellation',
          title: 'Ride Cancelled',
          message: bookingRefundCalc.refundEligible && passengerRefundAmount > 0
            ? (cancelledByRole === 'driver' 
              ? `Driver cancelled your ride. You will receive a ${bookingRefundCalc.refundPercentage}% refund ($${passengerRefundAmount.toFixed(2)}).`
              : `Your ride has been cancelled. Refund: $${passengerRefundAmount.toFixed(2)} (${bookingRefundCalc.refundPercentage}%)`)
            : (cancelledByRole === 'driver'
              ? 'Driver cancelled your ride. You will receive a full refund.'
              : `Your ride has been cancelled. No refund available (cancelled ${bookingRefundCalc.hoursBeforeDeparture.toFixed(1)} hours before departure).`),
          rideId: rideId,
          senderId: cancelledBy,
          metadata: {
            refund_amount: passengerRefundAmount,
            refund_percentage: bookingRefundCalc.refundPercentage,
            cancellation_fee: passengerCancellationFee,
            booking_amount: bookingAmount,
          },
          actionUrl: '/rider/rides'
        });
      }
    }

    // 10. Create notification for the person who cancelled
    await createCancellationNotification(
      cancellation.id,
      cancelledBy,
      'cancellation_confirmed',
      {
        ride_id: rideId,
        refund_eligible: refundCalc.refundEligible,
        refund_percentage: refundCalc.refundPercentage,
        refund_amount: refundCalc.refundAmount,
        cancellation_fee: refundCalc.cancellationFee,
        hours_before_departure: refundCalc.hoursBeforeDeparture,
        cancelled_by_role: cancelledByRole,
      }
    );

    return {
      success: true,
      cancellationId: cancellation.id,
      refundEligible: refundCalc.refundEligible,
      refundPercentage: refundCalc.refundPercentage,
      refundAmount: refundCalc.refundAmount,
      cancellationFee: refundCalc.cancellationFee,
      message: refundCalc.refundEligible
        ? `Cancellation successful. ${refundCalc.refundPercentage}% refund (${refundCalc.refundAmount.toFixed(2)}) will be processed.`
        : `Cancellation successful. No refund available due to late cancellation.`,
    };
  } catch (error: any) {
    console.error('Error cancelling ride:', error);
    return {
      success: false,
      refundEligible: false,
      refundPercentage: 0,
      refundAmount: 0,
      cancellationFee: 0,
      message: 'Failed to cancel ride',
      error: error.message,
    };
  }
}

/**
 * Create cancellation notification in main notifications table
 */
async function createCancellationNotification(
  cancellationId: string,
  userId: string,
  notificationType: 'cancellation_confirmed' | 'refund_initiated' | 'refund_completed' | 'refund_failed',
  cancellationDetails?: any
): Promise<void> {
  try {
    // Map notification types to user-friendly titles and messages
    const notificationMap: Record<string, { title: string; message: string; type: 'cancellation' | 'refund_processed' }> = {
      cancellation_confirmed: {
        title: 'Ride Cancelled',
        message: cancellationDetails?.refund_eligible 
          ? cancellationDetails.cancelled_by_role === 'driver'
            ? `Ride cancelled by driver. You will receive a full refund ($${cancellationDetails.refund_amount.toFixed(2)}).`
            : `Your ride has been cancelled. ${cancellationDetails.refund_percentage}% refund ($${cancellationDetails.refund_amount.toFixed(2)}) will be processed.`
          : 'Your ride has been cancelled. No refund available due to late cancellation (less than 12 hours notice).',
        type: 'cancellation',
      },
      refund_initiated: {
        title: 'Refund Processing',
        message: 'Your refund is being processed and will be credited to your account soon.',
        type: 'refund_processed',
      },
      refund_completed: {
        title: 'Refund Completed',
        message: 'Your refund has been successfully processed and credited to your account.',
        type: 'refund_processed',
      },
      refund_failed: {
        title: 'Refund Failed',
        message: 'There was an issue processing your refund. Please contact support.',
        type: 'refund_processed',
      },
    };

    const notificationData = notificationMap[notificationType];

    if (!notificationData) {
      console.error('Unknown notification type:', notificationType);
      return;
    }

    // Create notification in main notifications table
    await supabase.from('notifications').insert({
      user_id: userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      ride_id: cancellationDetails?.ride_id || null,
      metadata: {
        cancellation_id: cancellationId,
        notification_subtype: notificationType,
        refund_details: cancellationDetails ? {
          refund_eligible: cancellationDetails.refund_eligible,
          refund_percentage: cancellationDetails.refund_percentage,
          refund_amount: cancellationDetails.refund_amount,
          cancellation_fee: cancellationDetails.cancellation_fee,
          hours_before_departure: cancellationDetails.hours_before_departure,
        } : null,
      },
      is_read: false,
      action_url: cancellationDetails?.ride_id ? `/ride/${cancellationDetails.ride_id}` : null,
    });

    // Also keep the old system for tracking purposes
    await supabase.from('cancellation_notifications').insert({
      cancellation_id: cancellationId,
      user_id: userId,
      notification_type: notificationType,
      notification_channel: 'in_app',
      sent: true,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * Get cancellation history for a user
 */
export async function getUserCancellations(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('ride_cancellations')
      .select(`
        *,
        rides:ride_id (
          from_location,
          to_location,
          date,
          time
        )
      `)
      .or(`cancelled_by.eq.${userId},ride_id.in.(select id from rides where driver_id = '${userId}')`)
      .order('cancellation_timestamp', { ascending: false });

    if (error) {
      handleSupabaseError(error, 'getUserCancellations');
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching user cancellations:', error);
    return [];
  }
}

/**
 * Get refund transactions for a user
 */
export async function getUserRefunds(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('refund_transactions')
      .select(`
        *,
        cancellations:cancellation_id (
          cancellation_reason,
          cancellation_timestamp,
          refund_percentage
        ),
        rides:ride_id (
          from_location,
          to_location,
          date,
          time
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user refunds:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching user refunds:', error);
    return [];
  }
}

/**
 * Process pending refund transactions (mock implementation)
 * In production, this would integrate with payment gateway
 */
export async function processRefundTransaction(
  transactionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Mock refund processing
    // In production, this would call payment gateway API
    
    const { data: transaction, error: fetchError } = await supabase
      .from('refund_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchError || !transaction) {
      return {
        success: false,
        message: 'Transaction not found',
      };
    }

    if (transaction.transaction_status !== 'pending') {
      return {
        success: false,
        message: 'Transaction is not in pending status',
      };
    }

    // Update transaction to processing
    await supabase
      .from('refund_transactions')
      .update({
        transaction_status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock success (90% success rate for simulation)
    const isSuccess = Math.random() > 0.1;

    if (isSuccess) {
      // Update transaction to completed
      await supabase
        .from('refund_transactions')
        .update({
          transaction_status: 'completed',
          processed_at: new Date().toISOString(),
          transaction_reference: `REF-${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      // Create success notification
      await createNotification({
        userId: transaction.user_id,
        type: 'refund_processed',
        title: 'Refund Completed',
        message: `Your refund of $${transaction.refund_amount.toFixed(2)} has been processed successfully.`,
        rideId: transaction.ride_id,
        metadata: {
          refund_amount: transaction.refund_amount,
          transaction_reference: `REF-${Date.now()}`,
        },
        actionUrl: '/rider/payment-history'
      });

      return {
        success: true,
        message: 'Refund processed successfully',
      };
    } else {
      // Update transaction to failed
      await supabase
        .from('refund_transactions')
        .update({
          transaction_status: 'failed',
          error_message: 'Payment gateway error (mock)',
          retry_count: (transaction.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      // Create failure notification
      await createNotification({
        userId: transaction.user_id,
        type: 'refund_processed',
        title: 'Refund Failed',
        message: `There was an issue processing your refund of $${transaction.refund_amount.toFixed(2)}. Please contact support.`,
        rideId: transaction.ride_id,
        metadata: {
          refund_amount: transaction.refund_amount,
          error: 'Payment gateway error',
        },
        actionUrl: '/support'
      });

      return {
        success: false,
        message: 'Refund processing failed',
      };
    }
  } catch (error: any) {
    console.error('Error processing refund:', error);
    return {
      success: false,
      message: error.message || 'Unknown error',
    };
  }
}

/**
 * Get refund estimate before cancelling
 */
export async function getRefundEstimate(
  rideId: string,
  cancelledByRole: 'driver' | 'passenger' = 'passenger',
  bookingId?: string
): Promise<RefundCalculation | null> {
  try {
    // Fetch ride details for timing
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('date, time, price_per_seat')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) {
      console.error('Error fetching ride for refund estimate:', rideError);
      return null;
    }

    let originalAmount = ride.price_per_seat || 0;

    // If bookingId is provided, use segment booking price instead
    if (bookingId) {
      const { data: booking, error: bookingError } = await supabase
        .from('ride_requests')
        .select('price_per_seat, requested_seats')
        .eq('id', bookingId)
        .single();

      if (!bookingError && booking && booking.price_per_seat) {
        // Use segment price directly from ride_requests.price_per_seat
        originalAmount = Number(booking.price_per_seat);
        console.log('[getRefundEstimate] Using segment price:', originalAmount, 'for booking:', bookingId);
      } else {
        console.warn('[getRefundEstimate] Could not fetch booking price, using ride price:', originalAmount);
        if (bookingError) {
          console.error('[getRefundEstimate] Booking fetch error:', bookingError);
        }
      }
    }

    const rideDepartureTime = getRideDepartureTime(ride);
    return calculateRefund(rideDepartureTime, originalAmount, new Date(), cancelledByRole);
  } catch (error) {
    console.error('Error calculating refund estimate:', error);
    return null;
  }
}
