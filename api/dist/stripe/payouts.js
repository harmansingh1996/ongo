import { stripe } from './stripeClient.js';
import { createClient } from '@supabase/supabase-js';
// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
}
const supabase = createClient(supabaseUrl, supabaseKey);
/**
 * Initiate a payout from platform balance to driver's connected Stripe account
 * Steps:
 * 1. Look up payout request in Supabase
 * 2. Validate status is pending or approved
 * 3. Fetch driver's Stripe Connect account ID
 * 4. Create Stripe payout to the connected account
 * 5. Update payout request status to processing/paid
 */
export async function initiateDriverPayout(request) {
    try {
        // Validate input
        if (!request.payout_request_id || typeof request.payout_request_id !== 'string') {
            return {
                success: false,
                error: 'Invalid payout_request_id provided',
            };
        }
        // Step 1: Look up payout request in Supabase
        const { data: payoutRequest, error: payoutRequestError } = await supabase
            .from('payout_requests')
            .select('id, driver_id, amount, status')
            .eq('id', request.payout_request_id)
            .single();
        if (payoutRequestError || !payoutRequest) {
            return {
                success: false,
                error: 'Payout request not found',
                error_details: payoutRequestError?.message,
            };
        }
        // Step 2: Ensure status is pending or approved
        const validStatuses = ['pending', 'approved'];
        if (!validStatuses.includes(payoutRequest.status)) {
            return {
                success: false,
                error: `Invalid payout request status: ${payoutRequest.status}. Expected 'pending' or 'approved'.`,
            };
        }
        // Step 3: Fetch driver's Stripe Connect account ID
        const { data: driver, error: driverError } = await supabase
            .from('users')
            .select('stripe_connect_account_id')
            .eq('id', payoutRequest.driver_id)
            .single();
        if (driverError || !driver) {
            return {
                success: false,
                error: 'Driver not found',
                error_details: driverError?.message,
            };
        }
        if (!driver.stripe_connect_account_id) {
            return {
                success: false,
                error: 'Driver does not have a Stripe Connect account configured',
            };
        }
        // Step 4: Create Stripe payout to the connected account
        // Amount should be in cents for Stripe
        const amountInCents = Math.round(payoutRequest.amount * 100);
        let stripePayout;
        try {
            stripePayout = await stripe.payouts.create({
                amount: amountInCents,
                currency: 'cad', // Assuming CAD based on codebase
                method: 'instant', // 'instant' for immediate payout or 'standard' for next business day
                description: `Payout for payout request ${payoutRequest.id}`,
                metadata: {
                    payout_request_id: payoutRequest.id,
                    driver_id: payoutRequest.driver_id,
                    platform: 'OnGoPool',
                },
            }, {
                stripeAccount: driver.stripe_connect_account_id,
            });
        }
        catch (stripeError) {
            return {
                success: false,
                error: 'Failed to create Stripe payout',
                error_details: stripeError?.message || String(stripeError),
            };
        }
        // Step 5: Update payout request status to processing and store payout reference
        const { error: updateError } = await supabase
            .from('payout_requests')
            .update({
            status: 'processing',
            payout_id: stripePayout.id,
            processed_at: new Date().toISOString(),
            arrival_date: stripePayout.arrival_date
                ? new Date(stripePayout.arrival_date * 1000).toISOString()
                : null,
        })
            .eq('id', payoutRequest.id);
        if (updateError) {
            console.error('Warning: Failed to update payout request status:', updateError);
            // Don't fail the entire request - payout was created successfully
        }
        // Return success response
        return {
            success: true,
            payout_id: stripePayout.id,
            amount: stripePayout.amount ? stripePayout.amount / 100 : payoutRequest.amount,
            currency: stripePayout.currency?.toUpperCase() || 'CAD',
            arrival_date: stripePayout.arrival_date
                ? new Date(stripePayout.arrival_date * 1000).toISOString()
                : undefined,
        };
    }
    catch (error) {
        console.error('Unexpected error in initiateDriverPayout:', error);
        return {
            success: false,
            error: 'An unexpected error occurred while processing the payout',
            error_details: error?.message || String(error),
        };
    }
}
/**
 * Register payout routes
 */
export function registerPayoutRoutes(router) {
    /**
     * POST /api/stripe/payouts
     * Initiate a driver payout based on payout request ID
     *
     * Request body: { payout_request_id: string }
     * Response: InitiatePayoutResponse
     */
    router.post('/payouts', async (req, res) => {
        try {
            const body = req.body;
            const result = await initiateDriverPayout(body);
            const statusCode = result.success ? 200 : 400;
            res.status(statusCode).json({
                ...result,
                timestamp: new Date().toISOString(),
                statusCode,
            });
        }
        catch (error) {
            console.error('Error in POST /payouts:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                error_details: error?.message || String(error),
                timestamp: new Date().toISOString(),
                statusCode: 500,
            });
        }
    });
}
