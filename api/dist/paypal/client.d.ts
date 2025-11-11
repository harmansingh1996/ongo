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
export declare class PayPalClient {
    private clientId;
    private clientSecret;
    private environment;
    private cachedToken?;
    constructor(options: PayPalClientOptions);
    private get baseUrl();
    getAccessToken(): Promise<string>;
    post<TResponse>(path: string, payload?: unknown): Promise<TResponse>;
    get<TResponse>(path: string): Promise<TResponse>;
    private authorizedRequest;
    private parseJsonResponse;
    private safeJson;
}
