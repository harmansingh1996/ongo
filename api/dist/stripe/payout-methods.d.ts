import type { Router } from 'express';
type PayoutMethodRecord = {
    id: number;
    user_id: string;
    payout_type: string;
    account_holder_name: string | null;
    institution_number: string | null;
    transit_number: string | null;
    account_number: string | null;
    paypal_email: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
};
declare function serializePayoutMethod(record: PayoutMethodRecord | null | undefined): {
    id: number;
    user_id: string;
    payout_type: string;
    account_holder_name: string | null;
    institution_number: string | null;
    transit_number: string | null;
    account_number: string | null;
    paypal_email: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
} | undefined;
export interface CreatePayoutMethodRequest {
    user_id: string;
    payout_type: string;
    details: Record<string, unknown>;
    make_default?: boolean;
}
export interface PayoutMethodResponse {
    success: boolean;
    payout_method?: ReturnType<typeof serializePayoutMethod>;
    error?: string;
    statusCode: number;
}
export interface DeletePayoutMethodResponse {
    success: boolean;
    error?: string;
    statusCode: number;
}
export interface ListPayoutMethodsResponse {
    success: boolean;
    data?: {
        payout_methods: ReturnType<typeof serializePayoutMethod>[];
    };
    error?: string;
    statusCode: number;
}
export interface SetDefaultPayoutMethodResponse {
    success: boolean;
    data?: {
        payout_method: ReturnType<typeof serializePayoutMethod>;
    };
    error?: string;
    statusCode: number;
}
/**
 * List all payout methods for a user, sorted with default methods first
 */
export declare function listPayoutMethods(userId: string): Promise<PayoutMethodRecord[]>;
/**
 * Set a payout method as the default for a user
 * Demotes any existing default method
 */
export declare function setDefaultPayoutMethod(userId: string, payoutMethodId: string): Promise<PayoutMethodRecord>;
/**
 * Create a new payout method for a user
 * If make_default is true and there's an existing default, demote the existing default
 */
export declare function createPayoutMethod(request: CreatePayoutMethodRequest, bearerToken: string | null): Promise<PayoutMethodResponse>;
/**
 * Delete a payout method
 * Verifies ownership and prevents deletion of default methods
 */
export declare function deletePayoutMethod(payoutMethodId: string, bearerToken: string | null): Promise<DeletePayoutMethodResponse>;
export declare function registerPayoutMethodRoutes(router: Router): void;
export {};
