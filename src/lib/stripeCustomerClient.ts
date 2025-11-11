import type { User } from '../types';

interface StripeApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  invoice_settings?: {
    default_payment_method?: string | null;
  };
}

interface StripePaymentMethodCard {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export interface StripePaymentMethod {
  id: string;
  type: string;
  card?: StripePaymentMethodCard;
}

interface CreateCustomerPayload {
  email: string;
  name?: string;
  user_id: string;
}

export type PaymentServiceErrorCode =
  | 'PAYMENT_SERVICE_HTTP_ERROR'
  | 'PAYMENT_SERVICE_HTML_RESPONSE'
  | 'PAYMENT_SERVICE_INVALID_CONTENT'
  | 'PAYMENT_SERVICE_JSON_PARSE_ERROR'
  | 'PAYMENT_SERVICE_ERROR';

export interface PaymentServiceErrorDetails {
  status?: number;
  contentType?: string | null;
  url?: string;
  bodySnippet?: string;
}

export class PaymentServiceResponseError extends Error {
  code: PaymentServiceErrorCode;
  details: PaymentServiceErrorDetails;

  constructor(
    code: PaymentServiceErrorCode,
    message: string,
    details: PaymentServiceErrorDetails = {}
  ) {
    super(message);
    this.name = 'PaymentServiceResponseError';
    this.code = code;
    this.details = details;
  }
}

const rawBackendBaseUrl = import.meta.env.VITE_BACKEND_API_URL?.trim();

function normalizeStripeBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl) {
    return '/api/stripe';
  }

  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  if (/\/api(\/|$)/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/api/stripe`;
}

const API_BASE = normalizeStripeBaseUrl(rawBackendBaseUrl);

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const status = response.status;
  const url = response.url;

  if (!response.ok) {
    let bodySnippet: string | undefined;
    try {
      bodySnippet = (await response.clone().text()).slice(0, 200);
    } catch (error) {
      bodySnippet = undefined;
    }

    throw new PaymentServiceResponseError(
      'PAYMENT_SERVICE_HTTP_ERROR',
      `Payment service responded with ${status} ${response.statusText}`,
      {
        status,
        contentType,
        url,
        bodySnippet,
      }
    );
  }

  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    let bodySnippet: string | undefined;
    try {
      bodySnippet = (await response.clone().text()).trim().slice(0, 200);
    } catch (error) {
      bodySnippet = undefined;
    }

    const isHtml =
      (contentType && contentType.toLowerCase().includes('text/html')) ||
      (bodySnippet ? bodySnippet.startsWith('<') : false);

    throw new PaymentServiceResponseError(
      isHtml ? 'PAYMENT_SERVICE_HTML_RESPONSE' : 'PAYMENT_SERVICE_INVALID_CONTENT',
      'Payment service returned a non-JSON response. The backend may be unavailable.',
      {
        status,
        contentType,
        url,
        bodySnippet,
      }
    );
  }

  let json: StripeApiResponse<T>;
  try {
    json = (await response.json()) as StripeApiResponse<T>;
  } catch (error) {
    throw new PaymentServiceResponseError(
      'PAYMENT_SERVICE_JSON_PARSE_ERROR',
      'Payment service returned invalid JSON.',
      {
        status,
        contentType,
        url,
      }
    );
  }

  if (!json.success || typeof json.data === 'undefined') {
    throw new PaymentServiceResponseError(
      'PAYMENT_SERVICE_ERROR',
      json.error || 'Payment service request failed',
      {
        status,
        contentType,
        url,
      }
    );
  }

  return json.data;
}

export async function getStripeCustomer(customerId: string): Promise<StripeCustomer | null> {
  const response = await fetch(`${API_BASE}/customers/${customerId}`);
  if (response.status === 404) {
    return null;
  }

  try {
    const data = await handleResponse<{ customer: StripeCustomer }>(response);
    return data.customer;
  } catch (error) {
    if (error instanceof PaymentServiceResponseError) {
      console.warn('Stripe customer lookup unavailable:', error.message, error.details);
    } else {
      console.error('Failed to fetch Stripe customer:', error);
    }
    return null;
  }
}

export async function createStripeCustomer(payload: CreateCustomerPayload): Promise<StripeCustomer> {
  const response = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await handleResponse<{ customer: StripeCustomer }>(response);
  return data.customer;
}

export async function ensureStripeCustomer(user: User, existingCustomerId?: string | null): Promise<StripeCustomer> {
  if (existingCustomerId) {
    const existing = await getStripeCustomer(existingCustomerId);
    if (existing) {
      return existing;
    }
  }

  if (!user.email) {
    throw new Error('Email is required to create a Stripe customer');
  }

  const customer = await createStripeCustomer({
    email: user.email,
    name: user.display_name,
    user_id: user.id,
  });

  return customer;
}

export async function listStripeCardPaymentMethods(customerId: string): Promise<StripePaymentMethod[]> {
  const response = await fetch(`${API_BASE}/customers/${customerId}/payment-methods?type=card`);
  const data = await handleResponse<{ payment_methods: StripePaymentMethod[] }>(response);
  return data.payment_methods || [];
}

export async function createStripeSetupIntent(customerId: string): Promise<{ client_secret: string }> {
  const response = await fetch(`${API_BASE}/setup-intents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customer_id: customerId }),
  });

  const data = await handleResponse<{ setup_intent: { client_secret: string } }>(response);
  if (!data.setup_intent?.client_secret) {
    throw new Error('Failed to create setup intent');
  }

  return { client_secret: data.setup_intent.client_secret };
}

export async function attachStripePaymentMethod(
  customerId: string,
  paymentMethodId: string,
  setAsDefault?: boolean
): Promise<void> {
  const response = await fetch(`${API_BASE}/customers/${customerId}/payment-methods`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payment_method_id: paymentMethodId,
      set_as_default: Boolean(setAsDefault),
    }),
  });

  if (response.status === 409) {
    // Already attached - optionally update default below
    if (setAsDefault) {
      await updateCustomerDefaultPaymentMethod(customerId, paymentMethodId);
    }
    return;
  }

  await handleResponse(response);
}

export async function updateCustomerDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/customers/${customerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    }),
  });

  await handleResponse(response);
}

export async function retrieveStripePaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod | null> {
  const response = await fetch(`${API_BASE}/payment-methods/${paymentMethodId}`);
  if (response.status === 404) {
    return null;
  }

  try {
    const data = await handleResponse<{ payment_method: StripePaymentMethod }>(response);
    return data.payment_method;
  } catch (error) {
    if (error instanceof PaymentServiceResponseError) {
      console.warn('Stripe payment method retrieval unavailable:', error.message, error.details);
    } else {
      console.error('Failed to retrieve Stripe payment method:', error);
    }
    return null;
  }
}
