import { Router, Request, Response } from 'express';
import { getSupabaseServiceClient } from '../utils/supabase';
import { capturePayment } from '../services/paymentService';
import { QueuePayment, CaptureResult, ApiResponse } from '../types';

const router = Router();

/**
 * POST /api/worker/payment-capture
 * Process pending payment captures from queue
 * This endpoint is called by Render's cron scheduler
 */
router.post('/payment-capture', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Payment Capture Worker: Starting execution...');

    const supabase = getSupabaseServiceClient();

    // Get configuration from request or use defaults
    const batchSize = req.body.batchSize || 10;
    const maxAttempts = req.body.maxAttempts || 5;

    console.log(`📋 Configuration: batchSize=${batchSize}, maxAttempts=${maxAttempts}`);

    // Fetch pending payments from queue
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('payment_capture_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', maxAttempts)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log('✅ No pending payments in queue');
      return res.json({
        success: true,
        message: 'No pending payments',
        processed: 0,
      } as ApiResponse);
    }

    console.log(`💳 Found ${pendingPayments.length} pending payments`);

    // Process each payment
    const results: CaptureResult[] = [];
    for (const payment of pendingPayments as QueuePayment[]) {
      const result = await processPayment(supabase, payment);
      results.push(result);

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Summary
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`✅ Worker completed: ${successCount} succeeded, ${failureCount} failed`);

    return res.json({
      success: true,
      processed: results.length,
      succeeded: successCount,
      failed: failureCount,
      results,
    } as ApiResponse);
  } catch (error: any) {
    console.error('❌ Worker error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Worker execution failed',
    } as ApiResponse);
  }
});

/**
 * Process a single payment capture
 */
async function processPayment(
  supabase: any,
  payment: QueuePayment
): Promise<CaptureResult> {
  const paymentId = payment.id;
  const attempts = payment.attempts + 1;

  try {
    console.log(`🔄 Processing payment ${paymentId} (attempt ${attempts}/5)`);

    // Validate payment status before attempting capture
    const { data: paymentIntent, error: piError } = await supabase
      .from('stripe_payment_intents')
      .select('status')
      .eq('id', payment.payment_intent_id)
      .single();

    if (piError) {
      throw new Error(`Failed to check payment status: ${piError.message}`);
    }

    // Only attempt capture if payment is authorized
    if (
      paymentIntent.status !== 'authorized' &&
      paymentIntent.status !== 'requires_capture' &&
      paymentIntent.status !== 'processing'
    ) {
      console.log(
        `⚠️ Payment ${paymentId} has invalid status for capture: ${paymentIntent.status}`
      );

      // Mark as failed permanently
      await supabase
        .from('payment_capture_queue')
        .update({
          status: 'failed',
          error_message: `Invalid payment status: ${paymentIntent.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      return {
        success: false,
        paymentId,
        error: `Invalid payment status: ${paymentIntent.status}`,
      };
    }

    // Mark as processing
    await supabase
      .from('payment_capture_queue')
      .update({
        status: 'processing',
        attempts,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    // Capture payment
    await capturePayment(supabase, payment.payment_intent_id);

    console.log(`✅ Payment ${paymentId} captured successfully`);

    // Mark as completed
    await supabase
      .from('payment_capture_queue')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    return {
      success: true,
      paymentId,
    };
  } catch (error: any) {
    console.error(`❌ Payment ${paymentId} failed:`, error.message);

    // Calculate retry logic
    const shouldRetry = attempts < 5;
    const finalStatus = shouldRetry ? 'pending' : 'failed';

    // Update queue with error
    await supabase
      .from('payment_capture_queue')
      .update({
        status: finalStatus,
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    return {
      success: false,
      paymentId,
      error: error.message,
    };
  }
}

/**
 * GET /api/worker/health
 * Health check endpoint for Render monitoring
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
