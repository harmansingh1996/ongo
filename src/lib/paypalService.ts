import { supabase } from './supabase';

const rawBackendBaseUrl = import.meta.env.VITE_BACKEND_API_URL?.trim();

function normalizePayPalBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl) {
    return '/api/paypal';
  }

  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // Avoid duplicating /api if user already configured it
  if (/\/api(\/|$)/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/api/paypal`;
}

const PAYPAL_API_BASE = normalizePayPalBaseUrl(rawBackendBaseUrl);

interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function requestPayPalBackend<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${PAYPAL_API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (error: any) {
    throw new Error(
      `PayPal backend request failed. Ensure your secure server endpoint is deployed. (${error?.message || String(error)})`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let json: BackendResponse<T> | undefined;

  if (contentType.includes('application/json')) {
    json = (await response.json()) as BackendResponse<T>;
  }

  if (!response.ok) {
    const errorMessage = json?.error || (json ? JSON.stringify(json) : await response.text());
    throw new Error(
      `PayPal backend request failed. Ensure your secure server endpoint is deployed. (${response.status} ${response.statusText}${errorMessage ? ` - ${errorMessage}` : ''})`
    );
  }

  if (!json || typeof json !== 'object') {
    throw new Error('PayPal backend returned a non-JSON response. Ensure your secure server endpoint is deployed.');
  }

  if (!json.success) {
    throw new Error(json.error || 'PayPal backend request failed. Ensure your secure server endpoint is deployed.');
  }

  if (typeof json.data === 'undefined') {
    throw new Error('PayPal backend response did not include a data payload.');
  }

  return json.data;
}

export interface PayPalOrderData {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  purchase_units?: any[];
  links?: any[];
}

export interface PayPalPaymentData {
  orderId: string;
  payerId?: string;
  paymentId?: string;
  authorizationId?: string;
  amount: number;
  currency: string;
  status: 'created' | 'approved' | 'authorized' | 'captured' | 'cancelled' | 'failed';
  payerEmail?: string;
  payerName?: string;
}

export interface PayPalAuthorizationData {
  id: string;
  status: string;
  amount: {
    currency_code: string;
    value: string;
  };
  create_time: string;
  expiration_time: string;
  links?: any[];
}

interface CreateOrderPayload {
  amount: number;
  currency: string;
  intent: 'AUTHORIZE' | 'CAPTURE';
  bookingId?: number;
  userId?: string;
  description?: string;
}

export class PayPalService {
  private static clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  private static get sandboxMode(): boolean {
    return import.meta.env.VITE_PAYPAL_SANDBOX_MODE !== 'false';
  }

  private static get backendBaseUrl(): string {
    return PAYPAL_API_BASE;
  }

  /**
   * Create PayPal order for payment
   */
  static async createOrder(
    amount: number,
    currency: string = 'CAD',
    intent: 'CAPTURE' | 'AUTHORIZE' = 'CAPTURE',
    metadata?: { bookingId?: number; userId?: string; description?: string }
  ): Promise<PayPalOrderData> {
    try {
      const payload: CreateOrderPayload = {
        amount,
        currency,
        intent,
      };

      if (metadata?.bookingId) {
        payload.bookingId = metadata.bookingId;
      }

      if (metadata?.userId) {
        payload.userId = metadata.userId;
      }

      if (metadata?.description) {
        payload.description = metadata.description;
      }

      const order = await requestPayPalBackend<PayPalOrderData>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return order;
    } catch (error) {
      console.error('PayPal order creation failed:', error);
      throw error;
    }
  }

  /**
   * Capture PayPal order after approval
   */
  static async captureOrder(orderId: string): Promise<PayPalOrderData> {
    try {
      const capturedOrder = await requestPayPalBackend<PayPalOrderData>(`/orders/${orderId}/capture`, {
        method: 'POST',
      });

      return capturedOrder;
    } catch (error) {
      console.error('PayPal order capture failed:', error);
      throw error;
    }
  }

  /**
   * Get PayPal order details
   */
  static async getOrderDetails(orderId: string): Promise<PayPalOrderData> {
    try {
      const order = await requestPayPalBackend<PayPalOrderData>(`/orders/${orderId}`, {
        method: 'GET',
      });

      return order;
    } catch (error) {
      console.error('Failed to get PayPal order details:', error);
      throw error;
    }
  }

  /**
   * Process PayPal payment and store in database
   */
  static async processPayment(
    orderId: string,
    bookingId: number,
    userId: string,
    amount: number
  ): Promise<PayPalPaymentData> {
    try {
      // Capture the PayPal order
      const capturedOrder = await this.captureOrder(orderId);

      if (capturedOrder.status !== 'COMPLETED') {
        throw new Error('PayPal payment was not completed successfully');
      }

      // Extract payment information
      const paymentData: PayPalPaymentData = {
        orderId: capturedOrder.id,
        paymentId: capturedOrder.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        amount: amount,
        currency: capturedOrder.purchase_units?.[0]?.amount?.currency_code || 'CAD',
        status: 'captured',
        payerEmail: capturedOrder.payer?.email_address,
        payerName: capturedOrder.payer?.name
          ? `${capturedOrder.payer.name.given_name || ''} ${capturedOrder.payer.name.surname || ''}`.trim()
          : undefined,
      };

      // Store payment record in database
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          user_id: userId,
          amount: amount,
          currency: paymentData.currency.toLowerCase(),
          payment_method: 'paypal',
          payment_intent_id: paymentData.paymentId,
          transaction_id: paymentData.orderId,
          status: 'succeeded',
          payment_data: {
            paypal_order_id: paymentData.orderId,
            paypal_payment_id: paymentData.paymentId,
            payer_email: paymentData.payerEmail,
            payer_name: paymentData.payerName,
          },
        });

      if (paymentError) {
        console.error('Failed to store PayPal payment record:', paymentError);
        throw new Error('Payment succeeded but failed to record transaction');
      }

      return paymentData;
    } catch (error) {
      console.error('PayPal payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Get client configuration for PayPal React SDK
   */
  static getClientConfig() {
    return {
      'client-id': this.clientId,
      currency: 'CAD',
      intent: 'capture',
      'data-client-token': undefined, // Optional: for advanced features
      debug: this.sandboxMode,
    };
  }

  /**
   * Authorize PayPal order after approval
   */
  static async authorizeOrder(orderId: string): Promise<PayPalAuthorizationData> {
    try {
      const authorization = await requestPayPalBackend<PayPalAuthorizationData>(`/orders/${orderId}/authorize`, {
        method: 'POST',
      });

      return authorization;
    } catch (error) {
      console.error('PayPal order authorization failed:', error);
      throw error;
    }
  }

  /**
   * Capture an existing PayPal authorization
   */
  static async captureAuthorization(
    authorizationId: string,
    amount?: number,
    currency: string = 'CAD'
  ): Promise<any> {
    try {
      const capture = await requestPayPalBackend<any>(`/authorizations/${authorizationId}/capture`, {
        method: 'POST',
        body: JSON.stringify({ amount, currency }),
      });

      return capture;
    } catch (error) {
      console.error('PayPal authorization capture failed:', error);
      throw error;
    }
  }

  /**
   * Void (cancel) an existing PayPal authorization
   */
  static async voidAuthorization(authorizationId: string): Promise<void> {
    try {
      await requestPayPalBackend(`/authorizations/${authorizationId}/void`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('PayPal authorization void failed:', error);
      throw error;
    }
  }

  /**
   * Create PayPal payment authorization (hold) for ride requests
   */
  static async createPaymentHold(
    amount: number,
    currency: string = 'CAD',
    bookingId: number,
    userId: string
  ): Promise<PayPalPaymentData> {
    try {
      // Create order with AUTHORIZE intent
      const order = await this.createOrder(amount, currency, 'AUTHORIZE', {
        bookingId,
        userId,
        description: `Booking #${bookingId}`,
      });

      // Store initial payment record with pending status
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          user_id: userId,
          amount: amount,
          currency: currency.toLowerCase(),
          payment_method: 'paypal',
          transaction_id: order.id,
          status: 'requires_action', // Pending user approval
          payment_data: {
            paypal_order_id: order.id,
            intent: 'AUTHORIZE',
            created_at: new Date().toISOString(),
          },
        });

      if (paymentError) {
        console.error('Failed to store PayPal payment hold record:', paymentError);
        throw new Error('Failed to create payment hold record');
      }

      return {
        orderId: order.id,
        amount: amount,
        currency: currency,
        status: 'created',
      };
    } catch (error) {
      console.error('PayPal payment hold creation failed:', error);
      throw error;
    }
  }

  /**
   * Process PayPal authorization after user approval
   */
  static async processAuthorization(
    orderId: string,
    bookingId: number,
    userId: string
  ): Promise<PayPalPaymentData> {
    try {
      // Authorize the PayPal order
      const authorization = await this.authorizeOrder(orderId);

      if (authorization.status !== 'CREATED') {
        throw new Error('PayPal authorization was not created successfully');
      }

      // Update payment record with authorization details
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          payment_intent_id: authorization.id,
          status: 'requires_capture',
          payment_data: {
            paypal_order_id: orderId,
            paypal_authorization_id: authorization.id,
            intent: 'AUTHORIZE',
            authorized_at: new Date().toISOString(),
            expires_at: authorization.expiration_time,
          },
        })
        .eq('transaction_id', orderId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update PayPal authorization record:', updateError);
        throw new Error('Authorization succeeded but failed to update record');
      }

      return {
        orderId: orderId,
        authorizationId: authorization.id,
        amount: parseFloat(authorization.amount.value),
        currency: authorization.amount.currency_code,
        status: 'authorized',
      };
    } catch (error) {
      console.error('PayPal authorization processing failed:', error);
      throw error;
    }
  }

  /**
   * Capture payment from existing authorization
   */
  static async captureHeldPayment(
    authorizationId: string,
    bookingId: number,
    amount?: number
  ): Promise<PayPalPaymentData> {
    try {
      // Get payment record to determine currency
      const { data: paymentRecord, error: fetchError } = await supabase
        .from('payments')
        .select('currency, amount, payment_data')
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId)
        .single();

      if (fetchError || !paymentRecord) {
        throw new Error('Payment authorization record not found');
      }

      const currency = paymentRecord.currency.toUpperCase();
      const captureAmount = amount || paymentRecord.amount;

      // Capture the authorization
      const capture = await this.captureAuthorization(authorizationId, captureAmount, currency);

      if (capture.status !== 'COMPLETED') {
        throw new Error('PayPal capture was not completed successfully');
      }

      // Update payment record with capture details
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'succeeded',
          payment_data: {
            ...paymentRecord.payment_data,
            paypal_capture_id: capture.id,
            captured_at: new Date().toISOString(),
            captured_amount: captureAmount,
          },
        })
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update PayPal capture record:', updateError);
        throw new Error('Capture succeeded but failed to update record');
      }

      return {
        orderId: paymentRecord.payment_data.paypal_order_id,
        authorizationId: authorizationId,
        paymentId: capture.id,
        amount: captureAmount,
        currency: currency,
        status: 'captured',
      };
    } catch (error) {
      console.error('PayPal payment capture failed:', error);
      throw error;
    }
  }

  /**
   * Cancel (void) payment authorization
   */
  static async cancelPaymentHold(
    authorizationId: string,
    bookingId: number
  ): Promise<void> {
    try {
      // Void the PayPal authorization
      await this.voidAuthorization(authorizationId);

      // Update payment record to cancelled status
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          payment_data: {
            voided_at: new Date().toISOString(),
          },
        })
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update cancelled PayPal payment record:', updateError);
        throw new Error('Void succeeded but failed to update record');
      }
    } catch (error) {
      console.error('PayPal payment hold cancellation failed:', error);
      throw error;
    }
  }

  /**
   * Get PayPal SDK options for React PayPal JS
   * LIVE PAYMENTS: Automatically configures for sandbox or production based on environment
   */
  static getSDKOptions(intent: 'capture' | 'authorize' = 'capture') {
    const baseOptions = {
      'client-id': this.clientId,
      currency: 'CAD',
      intent: intent,
      components: 'buttons,messages',
      'enable-funding': 'venmo,paylater',
      'disable-funding': 'credit,card',
      'data-sdk-integration-source': 'button-factory',
    };

    // Add environment-specific options
    if (!this.sandboxMode) {
      console.log('✅ PayPal SDK configured for LIVE/PRODUCTION mode');
      console.log('🔗 Payments will be processed through production PayPal API');
    } else {
      console.log('⚠️ PayPal SDK configured for SANDBOX mode');
      console.log('💡 Set VITE_PAYPAL_SANDBOX_MODE=false for live payments');
    }

    return baseOptions;
  }

  /**
   * Check if PayPal is in live/production mode
   */
  static isLiveMode(): boolean {
    return !this.sandboxMode;
  }

  /**
   * Get current PayPal environment info
   */
  static getEnvironmentInfo() {
    return {
      mode: this.sandboxMode ? 'sandbox' : 'production',
      backendBaseUrl: this.backendBaseUrl,
      clientId: this.clientId,
      isLive: !this.sandboxMode,
    };
  }
}
