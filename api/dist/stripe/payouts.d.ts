import type { Router } from 'express';
export interface InitiatePayoutRequest {
    payout_request_id: string;
}
export interface InitiatePayoutResponse {
    success: boolean;
    payout_id?: string;
    amount?: number;
    currency?: string;
    arrival_date?: string;
    error?: string;
    error_details?: string;
}
/**
 * Initiate a payout from platform balance to driver's connected Stripe account
 * Steps:
 * 1. Look up payout request in Supabase
 * 2. Validate status is pending or approved
 * 3. Fetch driver's Stripe Connect account ID
 * 4. Create Stripe payout to the connected account
 * 5. Update payout request status to processing/paid
 */
export declare function initiateDriverPayout(request: InitiatePayoutRequest): Promise<InitiatePayoutResponse>;
/**
 * Register payout routes
 */
export declare function registerPayoutRoutes(router: Router): void;
