import { Router } from 'express';
import { PayPalClient } from './client.js';
import { PayPalService } from './service.js';
import { registerOrderRoutes } from './orders.js';
import { registerAuthorizationRoutes } from './authorizations.js';
function parseBooleanFlag(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (["true", "1", "yes", "on", "sandbox"].includes(normalized)) {
        return true;
    }
    if (["false", "0", "no", "off", "live", "production", "prod"].includes(normalized)) {
        return false;
    }
    return undefined;
}
function resolveEnvironment(options) {
    const sandboxPreference = options.sandboxMode ??
        parseBooleanFlag(process.env.PAYPAL_SANDBOX_MODE) ??
        parseBooleanFlag(process.env.VITE_PAYPAL_SANDBOX_MODE);
    return sandboxPreference === undefined || sandboxPreference ? 'sandbox' : 'live';
}
function resolveClientId(options) {
    return (options.clientId ||
        process.env.PAYPAL_CLIENT_ID ||
        process.env.VITE_PAYPAL_CLIENT_ID ||
        undefined);
}
function resolveClientSecret(options) {
    return options.clientSecret || process.env.PAYPAL_CLIENT_SECRET || undefined;
}
function createPayPalClient(options) {
    const clientId = resolveClientId(options);
    const clientSecret = resolveClientSecret(options);
    if (!clientId) {
        throw new Error('PayPal client ID is not configured. Set PAYPAL_CLIENT_ID (or provide clientId option).');
    }
    if (!clientSecret) {
        throw new Error('PayPal client secret is not configured. Set PAYPAL_CLIENT_SECRET (or provide clientSecret option).');
    }
    const environment = resolveEnvironment(options);
    console.info(`[PayPal] Initializing client for ${environment.toUpperCase()} environment`);
    return new PayPalClient({
        clientId,
        clientSecret,
        environment,
    });
}
function createErrorHandler() {
    return (error, _req, res, _next) => {
        console.error('Unhandled PayPal router error:', error);
        res.status(500).json({ success: false, error: 'Internal PayPal API error' });
    };
}
export function createPayPalRouter(options = {}) {
    const router = Router();
    let client = null;
    try {
        client = createPayPalClient(options);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[PayPal] Failed to initialize client:', message);
    }
    if (!client) {
        router.use((_req, res) => {
            res.status(503).json({
                success: false,
                error: 'PayPal backend is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables before enabling PayPal payments.',
                timestamp: new Date().toISOString(),
                statusCode: 503,
            });
        });
        return router;
    }
    const service = new PayPalService();
    registerOrderRoutes(router, client, service);
    registerAuthorizationRoutes(router, client, service);
    router.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'PayPal API endpoint not found',
            timestamp: new Date().toISOString(),
            statusCode: 404,
        });
    });
    router.use(createErrorHandler());
    return router;
}
