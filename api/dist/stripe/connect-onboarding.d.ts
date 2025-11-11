import type { Router } from 'express';
/**
 * Response envelope for all connect onboarding endpoints
 */
export interface ConnectOnboardingResponse {
    success: boolean;
    data?: {
        account_link_url?: string;
        stripe_account_id?: string;
        payouts_enabled?: boolean;
        charges_enabled?: boolean;
        details_submitted?: boolean;
    };
    error?: string;
    statusCode: number;
    timestamp: string;
}
/**
 * Create an account link for onboarding a Stripe Connect account
 * Returns a URL the user visits to complete onboarding
 *
 * @param userId - User ID requesting onboarding
 * @param refreshUrl - URL to return to if user refreshes (pauses onboarding)
 * @param returnUrl - URL to return to after completing onboarding
 */
export declare function createAccountLink(userId: string, refreshUrl: string, returnUrl: string): Promise<{
    url: string;
    stripe_account_id: string;
}>;
/**
 * Get the current account status for a Stripe Connect account
 * Returns capabilities, submission status, and other details
 * Returns safe defaults when user record is missing or Stripe account does not exist
 *
 * @param userId - User ID to fetch account status for
 */
export declare function getAccountStatus(userId: string): Promise<{
    stripe_account_id: string;
    payouts_enabled: boolean;
    charges_enabled: boolean;
    details_submitted: boolean;
    requirements: {
        currently_due: string[];
        past_due: string[];
        eventually_due: string[];
    };
}>;
/**
 * Register Stripe Connect onboarding routes
 */
export declare function registerConnectOnboardingRoutes(router: Router): void;
