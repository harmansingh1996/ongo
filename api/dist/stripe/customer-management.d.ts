import type { Router } from 'express';
import Stripe from 'stripe';
export interface CreateCustomerRequest {
    email: string;
    name?: string;
    phone?: string;
    user_id: string;
    metadata?: Record<string, string>;
}
export interface AttachPaymentMethodRequest {
    customer_id: string;
    payment_method_id: string;
    set_as_default?: boolean;
}
export interface DetachPaymentMethodRequest {
    payment_method_id: string;
}
export interface UpdateCustomerRequest {
    customer_id: string;
    email?: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, string>;
}
export interface CustomerResponse {
    success: boolean;
    customer?: Stripe.Customer | Stripe.DeletedCustomer;
    error?: string;
}
export interface PaymentMethodResponse {
    success: boolean;
    payment_method?: Stripe.PaymentMethod;
    payment_methods?: Stripe.PaymentMethod[];
    error?: string;
}
export declare function createCustomer(request: CreateCustomerRequest): Promise<CustomerResponse>;
export declare function getCustomer(customerIdOrEmail: string): Promise<CustomerResponse>;
export declare function updateCustomer(request: UpdateCustomerRequest): Promise<CustomerResponse>;
export declare function attachPaymentMethod(request: AttachPaymentMethodRequest): Promise<PaymentMethodResponse>;
export declare function detachPaymentMethod(request: DetachPaymentMethodRequest): Promise<PaymentMethodResponse>;
export declare function listCustomerPaymentMethods(customerId: string, type?: Stripe.PaymentMethodListParams.Type): Promise<PaymentMethodResponse>;
export declare function getPaymentMethod(paymentMethodId: string): Promise<PaymentMethodResponse>;
export declare function createSetupIntent(customerId: string, paymentMethodTypes?: string[]): Promise<{
    success: boolean;
    setup_intent?: Stripe.SetupIntent;
    client_secret?: string;
    error?: string;
}>;
export declare function deleteCustomer(customerId: string): Promise<CustomerResponse>;
export declare function registerCustomerRoutes(router: Router): void;
