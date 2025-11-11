import type { PayPalClient } from './client.js';
export interface CreateOrderParams {
    amount: number;
    currency: string;
    intent: 'AUTHORIZE' | 'CAPTURE';
    bookingId?: number;
    userId?: string;
}
export interface PayPalOrderResponse {
    id: string;
    status: string;
    purchase_units?: Array<{
        amount?: {
            currency_code?: string;
            value?: string;
        };
        payments?: {
            authorizations?: Array<{
                id: string;
                status: string;
                amount?: {
                    currency_code?: string;
                    value?: string;
                };
            }>;
            captures?: Array<{
                id: string;
                status: string;
                amount?: {
                    currency_code?: string;
                    value?: string;
                };
            }>;
        };
    }>;
    payer?: {
        email_address?: string;
        payer_id?: string;
        name?: {
            given_name?: string;
            surname?: string;
        };
    };
    links?: Array<{
        rel: string;
        href: string;
        method: string;
    }>;
}
export declare class PayPalService {
    createOrder(client: PayPalClient, params: CreateOrderParams): Promise<PayPalOrderResponse>;
    getOrderDetails(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse>;
    captureOrder(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse>;
    authorizeOrder(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse>;
    captureAuthorization(client: PayPalClient, authorizationId: string, amount?: number, currency?: string): Promise<any>;
    voidAuthorization(client: PayPalClient, authorizationId: string): Promise<any>;
}
