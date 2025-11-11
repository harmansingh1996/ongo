import fetch from 'node-fetch';
export class PayPalClient {
    constructor(options) {
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.environment = options.environment;
    }
    get baseUrl() {
        return this.environment === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';
    }
    async getAccessToken() {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
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
        const data = (await response.json());
        this.cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000,
        };
        return data.access_token;
    }
    async post(path, payload) {
        const response = await this.authorizedRequest(path, 'POST', payload);
        return this.parseJsonResponse(response);
    }
    async get(path) {
        const response = await this.authorizedRequest(path, 'GET');
        return this.parseJsonResponse(response);
    }
    async authorizedRequest(path, method, payload) {
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
    async parseJsonResponse(response) {
        if (response.status === 204) {
            return {};
        }
        return (await response.json());
    }
    async safeJson(response) {
        const text = await response.text();
        if (!text)
            return undefined;
        try {
            return JSON.parse(text);
        }
        catch (error) {
            return text;
        }
    }
}
