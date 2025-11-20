import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getSupabaseClientWithAuth, getSupabaseServiceClient } from '../utils/supabase';
import * as paymentService from '../services/paymentService';
import { PaymentRequest, ApiResponse } from '../types';

const router = Router();

/**
 * POST /api/payment/create
 * Create a payment intent (requires user auth)
 */
router.post('/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { rideId, bookingId, driverId, amountSubtotal, referralCode } = req.body;

    if (!rideId || !driverId || !amountSubtotal) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: rideId, driverId, amountSubtotal',
      } as ApiResponse);
    }

    const authToken = req.headers.authorization!;
    const supabase = getSupabaseClientWithAuth(authToken);

    const result = await paymentService.createPayment(supabase, req.userId!, {
      rideId,
      bookingId,
      driverId,
      amountSubtotal,
      referralCode,
    });

    return res.json({
      success: true,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Create payment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment',
    } as ApiResponse);
  }
});

/**
 * POST /api/payment/capture
 * Capture a payment intent (service role - no auth required)
 */
router.post('/capture', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID required',
      } as ApiResponse);
    }

    const supabase = getSupabaseServiceClient();

    const result = await paymentService.capturePayment(supabase, paymentIntentId);

    return res.json({
      success: true,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Capture payment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture payment',
    } as ApiResponse);
  }
});

/**
 * POST /api/payment/cancel
 * Cancel a payment intent (service role - no auth required)
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID required',
      } as ApiResponse);
    }

    const supabase = getSupabaseServiceClient();

    const result = await paymentService.cancelPayment(supabase, paymentIntentId);

    return res.json({
      success: true,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Cancel payment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel payment',
    } as ApiResponse);
  }
});

/**
 * POST /api/payment/refund
 * Refund a payment (service role - no auth required)
 */
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId, reason } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID required',
      } as ApiResponse);
    }

    const supabase = getSupabaseServiceClient();

    const result = await paymentService.refundPayment(supabase, paymentIntentId, reason);

    return res.json({
      success: true,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Refund payment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to refund payment',
    } as ApiResponse);
  }
});

export default router;
