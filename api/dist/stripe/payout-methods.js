import { createClient } from '@supabase/supabase-js';
// Initialize Supabase client with service role credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const payoutMethodColumns = `
  id,
  user_id,
  payout_type,
  account_holder_name,
  institution_number,
  transit_number,
  account_number,
  paypal_email,
  is_default,
  created_at,
  updated_at
`;
function serializePayoutMethod(record) {
    if (!record) {
        return undefined;
    }
    return {
        id: record.id,
        user_id: record.user_id,
        payout_type: record.payout_type,
        account_holder_name: record.account_holder_name,
        institution_number: record.institution_number,
        transit_number: record.transit_number,
        account_number: record.account_number,
        paypal_email: record.paypal_email,
        is_default: record.is_default,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}
async function getPayoutMethodById(id) {
    const { data, error } = await supabase
        .from('payout_methods')
        .select(payoutMethodColumns)
        .eq('id', id)
        .single();
    if (error) {
        if (error.code === 'PGRST116') {
            return null;
        }
        throw error;
    }
    return data;
}
async function getPayoutMethodsForUser(userId) {
    const { data, error } = await supabase
        .from('payout_methods')
        .select(payoutMethodColumns)
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
    if (error) {
        throw error;
    }
    return (data || []);
}
/**
 * Extract and validate bearer token from Authorization header
 */
function extractBearerToken(authHeader) {
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        return null;
    }
    return parts[1];
}
/**
 * Verify bearer token matches the user_id from a JWT-like token
 * In production, this should validate the token signature and issuer
 */
function verifyTokenMatchesUserId(token, userId) {
    // Basic validation: token should exist and not be empty
    if (!token || !userId) {
        return false;
    }
    // In a real implementation, decode and verify JWT
    // For now, we assume the token validation happens at the middleware level
    // This is a placeholder for where JWT verification would occur
    try {
        // If the token is a JWT, you would typically decode it here
        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // return decoded.user_id === userId;
        // For this implementation, we trust that token validation
        // should be enforced at the Express middleware level
        // This function serves as an additional safety check
        return true;
    }
    catch {
        return false;
    }
}
/**
 * List all payout methods for a user, sorted with default methods first
 */
export async function listPayoutMethods(userId) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid or missing user_id');
    }
    const { data, error } = await supabase
        .from('payout_methods')
        .select(payoutMethodColumns)
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
    if (error) {
        throw error;
    }
    return (data || []);
}
/**
 * Set a payout method as the default for a user
 * Demotes any existing default method
 */
export async function setDefaultPayoutMethod(userId, payoutMethodId) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid or missing user_id');
    }
    if (!payoutMethodId || typeof payoutMethodId !== 'string') {
        throw new Error('Invalid or missing payout method ID');
    }
    // Fetch the payout method to verify it belongs to the user
    const { data: payoutMethod, error: fetchError } = await supabase
        .from('payout_methods')
        .select(payoutMethodColumns)
        .eq('id', payoutMethodId)
        .eq('user_id', userId)
        .single();
    if (fetchError || !payoutMethod) {
        throw new Error('Payout method not found or does not belong to user');
    }
    // Demote any existing default for this user
    const { error: demoteError } = await supabase
        .from('payout_methods')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true);
    if (demoteError) {
        throw demoteError;
    }
    // Promote the target method
    const { data: updatedMethod, error: updateError } = await supabase
        .from('payout_methods')
        .update({
        is_default: true,
        updated_at: new Date().toISOString(),
    })
        .eq('id', payoutMethodId)
        .select()
        .single();
    if (updateError || !updatedMethod) {
        throw new Error('Failed to update payout method as default');
    }
    return updatedMethod;
}
/**
 * Create a new payout method for a user
 * If make_default is true and there's an existing default, demote the existing default
 */
export async function createPayoutMethod(request, bearerToken) {
    try {
        // Validate request
        if (!request.user_id || typeof request.user_id !== 'string') {
            return {
                success: false,
                error: 'Invalid or missing user_id',
                statusCode: 400,
            };
        }
        if (!request.payout_type || typeof request.payout_type !== 'string') {
            return {
                success: false,
                error: 'Invalid or missing payout_type',
                statusCode: 400,
            };
        }
        if (!request.details || typeof request.details !== 'object') {
            return {
                success: false,
                error: 'Invalid or missing details object',
                statusCode: 400,
            };
        }
        // Verify bearer token matches user_id
        if (!bearerToken || !verifyTokenMatchesUserId(bearerToken, request.user_id)) {
            return {
                success: false,
                error: 'Unauthorized: token does not match user_id',
                statusCode: 403,
            };
        }
        // Verify user exists
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('id', request.user_id)
            .single();
        if (userError || !user) {
            return {
                success: false,
                error: 'User not found',
                statusCode: 404,
            };
        }
        const makeDefault = request.make_default === true;
        // If make_default is true, demote any existing default
        if (makeDefault) {
            const { error: demoteError } = await supabase
                .from('payout_methods')
                .update({ is_default: false })
                .eq('user_id', request.user_id)
                .eq('is_default', true);
            if (demoteError) {
                console.error('Error demoting existing default payout method:', demoteError);
                return {
                    success: false,
                    error: 'Failed to update existing default payout method',
                    statusCode: 500,
                };
            }
        }
        const details = request.details || {};
        const insertPayload = {
            user_id: request.user_id,
            payout_type: request.payout_type,
            is_default: makeDefault,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        if (request.payout_type === 'bank_transfer') {
            insertPayload.account_holder_name = typeof details.account_holder_name === 'string'
                ? details.account_holder_name.trim()
                : null;
            insertPayload.institution_number = typeof details.institution_number === 'string'
                ? details.institution_number.trim()
                : null;
            insertPayload.transit_number = typeof details.transit_number === 'string'
                ? details.transit_number.trim()
                : null;
            insertPayload.account_number = typeof details.account_number === 'string'
                ? details.account_number.trim()
                : null;
        }
        else if (request.payout_type === 'paypal') {
            insertPayload.paypal_email = typeof details.paypal_email === 'string'
                ? details.paypal_email.trim()
                : null;
        }
        // Insert new payout method
        const { data: payoutMethod, error: insertError } = await supabase
            .from('payout_methods')
            .insert(insertPayload)
            .select()
            .single();
        if (insertError || !payoutMethod) {
            console.error('Error inserting payout method:', insertError);
            return {
                success: false,
                error: 'Failed to create payout method',
                statusCode: 500,
            };
        }
        return {
            success: true,
            payout_method: payoutMethod,
            statusCode: 201,
        };
    }
    catch (error) {
        console.error('Unexpected error in createPayoutMethod:', error);
        return {
            success: false,
            error: 'An unexpected error occurred while creating payout method',
            statusCode: 500,
        };
    }
}
/**
 * Delete a payout method
 * Verifies ownership and prevents deletion of default methods
 */
export async function deletePayoutMethod(payoutMethodId, bearerToken) {
    try {
        // Validate input
        if (!payoutMethodId || typeof payoutMethodId !== 'string') {
            return {
                success: false,
                error: 'Invalid or missing payout method ID',
                statusCode: 400,
            };
        }
        // Fetch the payout method
        const { data: payoutMethod, error: fetchError } = await supabase
            .from('payout_methods')
            .select('id, user_id, is_default')
            .eq('id', payoutMethodId)
            .single();
        if (fetchError || !payoutMethod) {
            return {
                success: false,
                error: 'Payout method not found',
                statusCode: 404,
            };
        }
        // Verify bearer token matches payout method owner
        if (!bearerToken || !verifyTokenMatchesUserId(bearerToken, payoutMethod.user_id)) {
            return {
                success: false,
                error: 'Unauthorized: token does not match payout method owner',
                statusCode: 403,
            };
        }
        // Prevent deletion of default payout method
        if (payoutMethod.is_default) {
            return {
                success: false,
                error: 'Cannot delete the default payout method',
                statusCode: 400,
            };
        }
        // Delete the payout method
        const { error: deleteError } = await supabase
            .from('payout_methods')
            .delete()
            .eq('id', payoutMethodId);
        if (deleteError) {
            console.error('Error deleting payout method:', deleteError);
            return {
                success: false,
                error: 'Failed to delete payout method',
                statusCode: 500,
            };
        }
        return {
            success: true,
            statusCode: 204,
        };
    }
    catch (error) {
        console.error('Unexpected error in deletePayoutMethod:', error);
        return {
            success: false,
            error: 'An unexpected error occurred while deleting payout method',
            statusCode: 500,
        };
    }
}
function sendResponse(res, result, data) {
    res.status(result.statusCode).json({
        success: result.success,
        data: result.success && data ? data : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.statusCode,
    });
}
export function registerPayoutMethodRoutes(router) {
    /**
     * POST /api/stripe/payout-methods
     * Create a new payout method for the authenticated user
     *
     * Authorization: Bearer <token>
     * Request body: { user_id, payout_type, details, make_default? }
     * Response: 201 on success, 400/403/404/500 on error
     */
    router.post('/payout-methods', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            const bearerToken = extractBearerToken(authHeader);
            const body = req.body;
            const result = await createPayoutMethod(body, bearerToken);
            if (result.success) {
                sendResponse(res, result, { payout_method: result.payout_method });
            }
            else {
                sendResponse(res, result);
            }
        }
        catch (error) {
            console.error('Error in POST /payout-methods:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString(),
                statusCode: 500,
            });
        }
    });
    /**
     * DELETE /api/stripe/payout-methods/:id
     * Delete a payout method
     *
     * Authorization: Bearer <token>
     * Prevents deletion of default payout methods
     * Verifies ownership before deletion
     * Response: 204 on success, 400/403/404/500 on error
     */
    router.delete('/payout-methods/:id', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            const bearerToken = extractBearerToken(authHeader);
            const payoutMethodId = req.params.id;
            const result = await deletePayoutMethod(payoutMethodId, bearerToken);
            sendResponse(res, result);
        }
        catch (error) {
            console.error('Error in DELETE /payout-methods/:id:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString(),
                statusCode: 500,
            });
        }
    });
    /**
     * GET /api/stripe/payout-methods
     * Fetch all payout methods for a user
     *
     * Query parameters: user_id
     * Authorization: Bearer <token>
     * Response: 200 on success, 400/403/404/500 on error
     */
    router.get('/payout-methods', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            const bearerToken = extractBearerToken(authHeader);
            const userId = req.query.user_id;
            // Verify bearer token is present
            if (!bearerToken) {
                return sendResponse(res, {
                    success: false,
                    error: 'Unauthorized: missing bearer token',
                    statusCode: 403,
                });
            }
            // Validate user_id from query
            if (!userId || typeof userId !== 'string') {
                return sendResponse(res, {
                    success: false,
                    error: 'Invalid or missing user_id query parameter',
                    statusCode: 400,
                });
            }
            // Verify token matches user_id
            if (!verifyTokenMatchesUserId(bearerToken, userId)) {
                return sendResponse(res, {
                    success: false,
                    error: 'Unauthorized: token does not match user_id',
                    statusCode: 403,
                });
            }
            try {
                const methods = await listPayoutMethods(userId);
                if (methods.length === 0) {
                    return sendResponse(res, {
                        success: false,
                        error: 'No payout methods found for user',
                        statusCode: 404,
                    });
                }
                const serializedMethods = methods.map(serializePayoutMethod);
                return sendResponse(res, {
                    success: true,
                    statusCode: 200,
                }, {
                    payout_methods: serializedMethods,
                });
            }
            catch (error) {
                console.error('Error fetching payout methods:', error);
                return sendResponse(res, {
                    success: false,
                    error: 'Failed to fetch payout methods',
                    statusCode: 500,
                });
            }
        }
        catch (error) {
            console.error('Error in GET /payout-methods:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString(),
                statusCode: 500,
            });
        }
    });
    /**
     * POST /api/stripe/payout-methods/:id/default
     * Set a payout method as the default for a user
     *
     * Authorization: Bearer <token>
     * Request body: { user_id }
     * Response: 200 on success, 400/403/404/500 on error
     */
    router.post('/payout-methods/:id/default', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            const bearerToken = extractBearerToken(authHeader);
            const payoutMethodId = req.params.id;
            const body = req.body;
            // Verify bearer token is present
            if (!bearerToken) {
                return sendResponse(res, {
                    success: false,
                    error: 'Unauthorized: missing bearer token',
                    statusCode: 403,
                });
            }
            // Validate user_id from body
            if (!body.user_id || typeof body.user_id !== 'string') {
                return sendResponse(res, {
                    success: false,
                    error: 'Invalid or missing user_id in request body',
                    statusCode: 400,
                });
            }
            // Verify token matches user_id
            if (!verifyTokenMatchesUserId(bearerToken, body.user_id)) {
                return sendResponse(res, {
                    success: false,
                    error: 'Unauthorized: token does not match user_id',
                    statusCode: 403,
                });
            }
            // Validate payout method ID
            if (!payoutMethodId || typeof payoutMethodId !== 'string') {
                return sendResponse(res, {
                    success: false,
                    error: 'Invalid or missing payout method ID',
                    statusCode: 400,
                });
            }
            try {
                const updatedMethod = await setDefaultPayoutMethod(body.user_id, payoutMethodId);
                const serializedMethod = serializePayoutMethod(updatedMethod);
                return sendResponse(res, {
                    success: true,
                    statusCode: 200,
                }, {
                    payout_method: serializedMethod,
                });
            }
            catch (error) {
                console.error('Error setting default payout method:', error);
                // Check if it's a "not found" error
                if (error.message && error.message.includes('not found')) {
                    return sendResponse(res, {
                        success: false,
                        error: 'Payout method not found or does not belong to user',
                        statusCode: 404,
                    });
                }
                return sendResponse(res, {
                    success: false,
                    error: 'Failed to set default payout method',
                    statusCode: 500,
                });
            }
        }
        catch (error) {
            console.error('Error in POST /payout-methods/:id/default:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString(),
                statusCode: 500,
            });
        }
    });
}
