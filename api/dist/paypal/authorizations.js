export function registerAuthorizationRoutes(router, client, service) {
    router.post('/authorizations/:authorizationId/capture', async (req, res) => {
        try {
            const { authorizationId } = req.params;
            const { amount, currency = 'CAD' } = req.body ?? {};
            if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
                return res.status(400).json({ success: false, error: 'amount must be a positive number' });
            }
            const capture = await service.captureAuthorization(client, authorizationId, amount, currency);
            return res.json({ success: true, data: capture });
        }
        catch (error) {
            console.error('PayPal capture authorization failed:', error);
            return res.status(500).json({ success: false, error: 'Failed to capture PayPal authorization' });
        }
    });
    router.post('/authorizations/:authorizationId/void', async (req, res) => {
        try {
            const { authorizationId } = req.params;
            await service.voidAuthorization(client, authorizationId);
            return res.json({ success: true, data: { voided: true } });
        }
        catch (error) {
            console.error('PayPal void authorization failed:', error);
            return res.status(500).json({ success: false, error: 'Failed to void PayPal authorization' });
        }
    });
}
