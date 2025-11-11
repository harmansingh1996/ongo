import { Router } from 'express';
import { registerPaymentIntentRoutes } from './payment-intents.js';
import { registerCustomerRoutes } from './customer-management.js';
import { stripeWebhooksRouter } from './webhooks.js';
import { registerPayoutRoutes } from './payouts.js';
import { registerPayoutMethodRoutes } from './payout-methods.js';
import { registerConnectOnboardingRoutes } from './connect-onboarding.js';
export function createStripeRouter() {
    const router = Router();
    registerPaymentIntentRoutes(router);
    registerCustomerRoutes(router);
    registerPayoutRoutes(router);
    registerPayoutMethodRoutes(router);
    registerConnectOnboardingRoutes(router);
    router.use('/webhooks', stripeWebhooksRouter);
    router.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'API endpoint not found',
            timestamp: new Date().toISOString(),
            statusCode: 404,
        });
    });
    return router;
}
