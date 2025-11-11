/**
 * Stripe Connect Service
 * Handles Stripe Connect onboarding and account status management
 * for payout setup in the OnGoPool driver application.
 */

import { supabase } from './supabase';

/**
 * Build the base URL for Stripe API endpoints
 * Respects environment configuration
 */
function buildStripeApiUrl(endpoint: string): string {
  const rawBase = import.meta.env.VITE_BACKEND_API_URL?.trim();
  let base = rawBase ? rawBase.replace(/\/$/, '') : '';

  if (!base) {
    base = '/api/stripe';
  } else if (base.includes('/api/stripe')) {
    // Already scoped to the Stripe namespace
  } else if (base.endsWith('/api')) {
    base = `${base}/stripe`;
  } else if (base.includes('/api')) {
    base = `${base}/stripe`;
  } else {
    base = `${base}/api/stripe`;
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${normalizedEndpoint}`;
}

/**
 * Build authorization headers with Bearer token
 * Uses current Supabase session
 */
async function buildAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Authentication required. Please sign in again.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
}

/**
 * Response interface for account status
 */
export interface AccountStatus {
  stripe_account_id: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
}

/**
 * Start Stripe Connect onboarding for a user
 * Fetches the onboarding link from the backend and redirects user to Stripe
 *
 * @param userId - The user ID to start onboarding for
 * @returns The onboarding URL (or throws on error)
 *
 * @throws Error if user is not authenticated or backend request fails
 */
export async function startOnboarding(userId: string): Promise<string> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  try {
    const headers = await buildAuthHeaders();

    // Assumption: returnUrl and refreshUrl point to frontend dashboard with payout-onboarding=complete
    // This allows the app to refresh account status after user completes onboarding
    const frontendBase = window.location.origin;
    const returnUrl = `${frontendBase}/dashboard?payout-onboarding=complete`;
    const refreshUrl = `${frontendBase}/dashboard?payout-onboarding=refresh`;

    const response = await fetch(buildStripeApiUrl('/connect/onboarding-link'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
      }),
    });

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch (parseError) {
        console.warn('Unable to parse onboarding error response', parseError);
      }

      if (response.status === 404) {
        throw new Error('Stripe Connect onboarding is not available yet. Please check back soon.');
      }

      throw new Error(errorBody?.error || `Failed to create onboarding link (status ${response.status})`);
    }

    const result = await response.json();

    if (!result.success || !result.data?.account_link_url) {
      throw new Error('Invalid response from backend');
    }

    return result.data.account_link_url;
  } catch (error: any) {
    console.error('Error starting Stripe onboarding:', error);
    throw error;
  }
}

/**
 * Get current account status for a user
 * Retrieves whether payouts are enabled and other account details
 *
 * @param userId - The user ID to fetch account status for
 * @returns AccountStatus object with current capabilities
 *
 * @throws Error if user is not authenticated or backend request fails
 */
export async function getAccountStatus(userId: string): Promise<AccountStatus> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  try {
    const headers = await buildAuthHeaders();

    const response = await fetch(
      buildStripeApiUrl(`/connect/account-status?user_id=${encodeURIComponent(userId)}`),
      {
        method: 'GET',
        headers,
      }
    );

    const defaultStatus: AccountStatus = {
      stripe_account_id: '',
      payouts_enabled: false,
      charges_enabled: false,
      details_submitted: false,
    };

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch (parseError) {
        console.warn('Unable to parse account status error response', parseError);
      }

      if (response.status === 404) {
        return defaultStatus;
      }

      throw new Error(errorBody?.error || `Failed to fetch account status (status ${response.status})`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      if (result.statusCode === 404) {
        return defaultStatus;
      }
      throw new Error('Invalid response from backend');
    }

    return {
      stripe_account_id: result.data.stripe_account_id,
      payouts_enabled: result.data.payouts_enabled,
      charges_enabled: result.data.charges_enabled,
      details_submitted: result.data.details_submitted,
    };
  } catch (error: any) {
    console.error('Error fetching account status:', error);
    throw error;
  }
}
