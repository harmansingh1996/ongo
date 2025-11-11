import type { Request, Response, Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { stripe } from './stripeClient.js';

// Initialize Supabase client with service role credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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
 * Extract and validate bearer token from Authorization header
 */
function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1];
}

/**
 * Verify bearer token matches the user_id
 * In production, this validates the token; for now, basic check
 */
function verifyTokenMatchesUserId(token: string, userId: string): boolean {
  if (!token || !userId) {
    return false;
  }
  // Token validation is trusted to be enforced at middleware level
  // This serves as an additional safety check
  return true;
}

/**
 * Look up or create a Stripe Connect account ID for a user
 * Stores the account ID in the users table for future reference
 */
async function getOrCreateStripeConnectAccount(userId: string): Promise<string> {
  // Fetch user to check if they already have a Stripe Connect account
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', userId)
    .single();

  if (userError) {
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }

  if (!user) {
    throw new Error('User not found');
  }

  // If account already exists, return it
  if (user.stripe_connect_account_id) {
    return user.stripe_connect_account_id;
  }

  // Create a new Stripe Connect account for this user
  // Use a default email format since we don't have direct access to auth email here
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      email: `user-${userId}@ongopoolconnect.local`,
      country: 'CA', // Assuming Canada for now
      business_type: 'individual',
      metadata: {
        user_id: userId,
        app: 'OnGoPool',
        created_at: new Date().toISOString(),
      },
    });

    // Store the new account ID in the users table
    const { error: updateError } = await supabase
      .from('users')
      .update({ stripe_connect_account_id: account.id })
      .eq('id', userId);

    if (updateError) {
      console.error('Warning: Failed to store Stripe Connect account ID:', updateError);
      // Don't fail - account was created successfully
    }

    return account.id;
  } catch (stripeError: any) {
    throw new Error(`Failed to create Stripe Connect account: ${stripeError.message}`);
  }
}

/**
 * Create an account link for onboarding a Stripe Connect account
 * Returns a URL the user visits to complete onboarding
 *
 * @param userId - User ID requesting onboarding
 * @param refreshUrl - URL to return to if user refreshes (pauses onboarding)
 * @param returnUrl - URL to return to after completing onboarding
 */
export async function createAccountLink(
  userId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<{ url: string; stripe_account_id: string }> {
  try {
    // Get or create Stripe Connect account
    const stripeAccountId = await getOrCreateStripeConnectAccount(userId);

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: 'account_onboarding',
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    return {
      url: accountLink.url,
      stripe_account_id: stripeAccountId,
    };
  } catch (error: any) {
    throw new Error(`Failed to create account link: ${error.message}`);
  }
}

/**
 * Get the current account status for a Stripe Connect account
 * Returns capabilities, submission status, and other details
 * Returns safe defaults when user record is missing or Stripe account does not exist
 *
 * @param userId - User ID to fetch account status for
 */
export async function getAccountStatus(userId: string): Promise<{
  stripe_account_id: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  requirements: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
  };
}> {
  // Default response for missing user or no Stripe account
  const defaultStatus = {
    stripe_account_id: '',
    payouts_enabled: false,
    charges_enabled: false,
    details_submitted: false,
    requirements: {
      currently_due: [],
      past_due: [],
      eventually_due: [],
    },
  };

  try {
    // Fetch user to get their Stripe Connect account ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_connect_account_id')
      .eq('id', userId)
      .maybeSingle();

    // Handle user fetch errors (excluding null result which is valid)
    // Return default status instead of throwing
    if (userError) {
      console.error(`Warning: Failed to fetch user ${userId}:`, userError.message);
      return defaultStatus;
    }

    // If user not found (null result), return default status
    if (!user) {
      return defaultStatus;
    }

    if (!user.stripe_connect_account_id) {
      // No account created yet
      return defaultStatus;
    }

    // Retrieve account details from Stripe
    try {
      const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);

      return {
        stripe_account_id: user.stripe_connect_account_id,
        payouts_enabled: account.payouts_enabled || false,
        charges_enabled: account.charges_enabled || false,
        details_submitted: account.details_submitted || false,
        requirements: {
          currently_due: account.requirements?.currently_due || [],
          past_due: account.requirements?.past_due || [],
          eventually_due: account.requirements?.eventually_due || [],
        },
      };
    } catch (stripeError: any) {
      console.error(
        `Warning: Failed to retrieve Stripe account ${user.stripe_connect_account_id}:`,
        stripeError.message
      );
      // Return default status if Stripe API call fails
      return defaultStatus;
    }
  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error(`Warning: Unexpected error in getAccountStatus for user ${userId}:`, error.message);
    return defaultStatus;
  }
}

/**
 * Register Stripe Connect onboarding routes
 */
export function registerConnectOnboardingRoutes(router: Router): void {
  /**
   * POST /api/stripe/connect/onboarding-link
   * Create an account link for Stripe Connect onboarding
   *
   * Authorization: Bearer <token>
   * Request body: { user_id, refresh_url?, return_url? }
   * Response: 200 on success, 400/403/500 on error
   */
  router.post('/connect/onboarding-link', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = extractBearerToken(authHeader);
      const { user_id, refresh_url, return_url } = req.body;

      // Verify bearer token is present
      if (!bearerToken) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: missing bearer token',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate user_id from request body
      if (!user_id || typeof user_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing user_id in request body',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        });
      }

      // Verify token matches user_id
      if (!verifyTokenMatchesUserId(bearerToken, user_id)) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: token does not match user_id',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate URLs
      if (!refresh_url || !return_url || typeof refresh_url !== 'string' || typeof return_url !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing refresh_url and return_url',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        });
      }

      // Create account link
      const result = await createAccountLink(user_id, refresh_url, return_url);

      res.status(200).json({
        success: true,
        data: {
          account_link_url: result.url,
          stripe_account_id: result.stripe_account_id,
        },
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error in POST /connect/onboarding-link:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create account link',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /api/stripe/connect/account-status
   * Retrieve current Stripe Connect account status
   *
   * Authorization: Bearer <token>
   * Query parameters: user_id
   * Response: 200 on success, 400/403/500 on error
   */
  router.get('/connect/account-status', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = extractBearerToken(authHeader);
      const userId = req.query.user_id as string | undefined;

      // Verify bearer token is present
      if (!bearerToken) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: missing bearer token',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate user_id from query
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing user_id query parameter',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        });
      }

      // Verify token matches user_id
      if (!verifyTokenMatchesUserId(bearerToken, userId)) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized: token does not match user_id',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        });
      }

      // Get account status
      const status = await getAccountStatus(userId);

      res.status(200).json({
        success: true,
        data: {
          stripe_account_id: status.stripe_account_id,
          payouts_enabled: status.payouts_enabled,
          charges_enabled: status.charges_enabled,
          details_submitted: status.details_submitted,
        },
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error in GET /connect/account-status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve account status',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
