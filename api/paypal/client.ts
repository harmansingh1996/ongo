import fetch, { Response } from 'node-fetch';

export type PayPalEnvironment = 'sandbox' | 'live';

export interface PayPalClientOptions {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
}

export interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export class PayPalClient {
  private clientId: string;
  private clientSecret: string;
  private environment: PayPalEnvironment;
  private cachedToken?: {
    token: string;
    expiresAt: number;
  };

  constructor(options: PayPalClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.environment = options.environment;
  }

  private get baseUrl(): string {
    return this.environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.token;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const body = await this.safeJson(response);
      throw new Error(`Failed to obtain PayPal access token: ${response.status} ${response.statusText}${body ? ` - ${JSON.stringify(body)}` : ''}`);
    }

    const data = (await response.json()) as PayPalAccessTokenResponse;

    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  }

  async post<TResponse>(path: string, payload?: unknown): Promise<TResponse> {
    const response = await this.authorizedRequest(path, 'POST', payload);
    return this.parseJsonResponse<TResponse>(response);
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    const response = await this.authorizedRequest(path, 'GET');
    return this.parseJsonResponse<TResponse>(response);
  }

  private async authorizedRequest(path: string, method: 'GET' | 'POST', payload?: unknown): Promise<Response> {
    const accessToken = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const errorBody = await this.safeJson(response);
      throw new Error(`PayPal API request failed: ${response.status} ${response.statusText}${errorBody ? ` - ${JSON.stringify(errorBody)}` : ''}`);
    }

    return response;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private async safeJson(response: Response): Promise<any | undefined> {
    const text = await response.text();
    if (!text) return undefined;

    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  }
}
