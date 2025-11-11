export class PayPalService {
    async createOrder(client, params) {
        const formattedAmount = params.amount.toFixed(2);
        const payload = {
            intent: params.intent,
            purchase_units: [
                {
                    amount: {
                        currency_code: params.currency,
                        value: formattedAmount,
                    },
                },
            ],
            application_context: {
                shipping_preference: 'NO_SHIPPING',
                user_action: params.intent === 'AUTHORIZE' ? 'CONTINUE' : 'PAY_NOW',
            },
            custom_id: params.bookingId ? String(params.bookingId) : undefined,
            payer: params.userId
                ? {
                    payer_id: params.userId,
                }
                : undefined,
        };
        return client.post('/v2/checkout/orders', payload);
    }
    async getOrderDetails(client, orderId) {
        return client.get(`/v2/checkout/orders/${orderId}`);
    }
    async captureOrder(client, orderId) {
        return client.post(`/v2/checkout/orders/${orderId}/capture`);
    }
    async authorizeOrder(client, orderId) {
        return client.post(`/v2/checkout/orders/${orderId}/authorize`);
    }
    async captureAuthorization(client, authorizationId, amount, currency = 'CAD') {
        const payload = amount
            ? {
                amount: {
                    currency_code: currency,
                    value: amount.toFixed(2),
                },
            }
            : undefined;
        return client.post(`/v2/payments/authorizations/${authorizationId}/capture`, payload);
    }
    async voidAuthorization(client, authorizationId) {
        return client.post(`/v2/payments/authorizations/${authorizationId}/void`);
    }
}
