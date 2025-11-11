interface PayPalRouterOptions {
    clientId?: string;
    clientSecret?: string;
    sandboxMode?: boolean;
    locationCategory?: string;
}
export declare function createPayPalRouter(options?: PayPalRouterOptions): import("express-serve-static-core").Router;
export {};
