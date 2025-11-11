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
      authorizations?: Array<{ id: string; status: string; amount?: { currency_code?: string; value?: string } }>;
      captures?: Array<{ id: string; status: string; amount?: { currency_code?: string; value?: string } }>;
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
  links?: Array<{ rel: string; href: string; method: string }>;
}

export class PayPalService {
  async createOrder(client: PayPalClient, params: CreateOrderParams): Promise<PayPalOrderResponse> {
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

    return client.post<PayPalOrderResponse>('/v2/checkout/orders', payload);
  }

  async getOrderDetails(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse> {
    return client.get<PayPalOrderResponse>(`/v2/checkout/orders/${orderId}`);
  }

  async captureOrder(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse> {
    return client.post<PayPalOrderResponse>(`/v2/checkout/orders/${orderId}/capture`);
  }

  async authorizeOrder(client: PayPalClient, orderId: string): Promise<PayPalOrderResponse> {
    return client.post<PayPalOrderResponse>(`/v2/checkout/orders/${orderId}/authorize`);
  }

  async captureAuthorization(
    client: PayPalClient,
    authorizationId: string,
    amount?: number,
    currency = 'CAD'
  ) {
    const payload = amount
      ? {
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        }
      : undefined;

    return client.post<any>(`/v2/payments/authorizations/${authorizationId}/capture`, payload);
  }

  async voidAuthorization(client: PayPalClient, authorizationId: string) {
    return client.post<any>(`/v2/payments/authorizations/${authorizationId}/void`);
  }
}
