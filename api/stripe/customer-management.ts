import type { Request, Response, Router } from 'express';
import Stripe from 'stripe';
import { stripe } from './stripeClient.js';

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

export async function createCustomer(request: CreateCustomerRequest): Promise<CustomerResponse> {
  try {
    if (!request.email || !request.user_id) {
      return {
        success: false,
        error: 'Email and user ID are required',
      };
    }

    const existingCustomers = await stripe.customers.list({
      email: request.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const existingCustomer = existingCustomers.data[0];

      if (request.user_id && existingCustomer.metadata.user_id !== request.user_id) {
        const updatedCustomer = await stripe.customers.update(existingCustomer.id, {
          metadata: {
            ...existingCustomer.metadata,
            user_id: request.user_id,
            updated_at: new Date().toISOString(),
          },
        });

        return {
          success: true,
          customer: updatedCustomer,
        };
      }

      return {
        success: true,
        customer: existingCustomer,
      };
    }

    const customerParams: Stripe.CustomerCreateParams = {
      email: request.email,
      name: request.name,
      phone: request.phone,
      metadata: {
        user_id: request.user_id,
        app: 'OnGoPool',
        created_at: new Date().toISOString(),
        ...request.metadata,
      },
    };

    const customer = await stripe.customers.create(customerParams);

    return {
      success: true,
      customer,
    };
  } catch (error) {
    console.error('Error creating customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create customer',
    };
  }
}

export async function getCustomer(customerIdOrEmail: string): Promise<CustomerResponse> {
  try {
    let customer: Stripe.Customer | Stripe.DeletedCustomer;

    if (customerIdOrEmail.includes('@')) {
      const customers = await stripe.customers.list({
        email: customerIdOrEmail,
        limit: 1,
      });

      if (customers.data.length === 0) {
        return {
          success: false,
          error: 'Customer not found',
        };
      }

      customer = customers.data[0];
    } else {
      customer = await stripe.customers.retrieve(customerIdOrEmail);
    }

    return {
      success: true,
      customer,
    };
  } catch (error) {
    console.error('Error retrieving customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve customer',
    };
  }
}

export async function updateCustomer(request: UpdateCustomerRequest): Promise<CustomerResponse> {
  try {
    if (!request.customer_id) {
      return {
        success: false,
        error: 'Customer ID is required',
      };
    }

    const updateParams: Stripe.CustomerUpdateParams = {};

    if (request.email) updateParams.email = request.email;
    if (request.name) updateParams.name = request.name;
    if (request.phone) updateParams.phone = request.phone;

    if (request.metadata) {
      updateParams.metadata = {
        ...request.metadata,
        updated_at: new Date().toISOString(),
      };
    }

    const customer = await stripe.customers.update(request.customer_id, updateParams);

    return {
      success: true,
      customer,
    };
  } catch (error) {
    console.error('Error updating customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update customer',
    };
  }
}

export async function attachPaymentMethod(request: AttachPaymentMethodRequest): Promise<PaymentMethodResponse> {
  try {
    if (!request.customer_id || !request.payment_method_id) {
      return {
        success: false,
        error: 'Customer ID and payment method ID are required',
      };
    }

    const paymentMethod = await stripe.paymentMethods.attach(request.payment_method_id, {
      customer: request.customer_id,
    });

    if (request.set_as_default) {
      await stripe.customers.update(request.customer_id, {
        invoice_settings: {
          default_payment_method: request.payment_method_id,
        },
      });
    }

    return {
      success: true,
      payment_method: paymentMethod,
    };
  } catch (error) {
    console.error('Error attaching payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to attach payment method',
    };
  }
}

export async function detachPaymentMethod(request: DetachPaymentMethodRequest): Promise<PaymentMethodResponse> {
  try {
    if (!request.payment_method_id) {
      return {
        success: false,
        error: 'Payment method ID is required',
      };
    }

    const paymentMethod = (await stripe.paymentMethods.detach(request.payment_method_id)) as Stripe.PaymentMethod;

    return {
      success: true,
      payment_method: paymentMethod,
    };
  } catch (error) {
    console.error('Error detaching payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detach payment method',
    };
  }
}

export async function listCustomerPaymentMethods(
  customerId: string,
  type: Stripe.PaymentMethodListParams.Type = 'card'
): Promise<PaymentMethodResponse> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required',
      };
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type,
    });

    return {
      success: true,
      payment_methods: paymentMethods.data,
    };
  } catch (error) {
    console.error('Error listing payment methods:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list payment methods',
    };
  }
}

export async function getPaymentMethod(paymentMethodId: string): Promise<PaymentMethodResponse> {
  try {
    if (!paymentMethodId) {
      return {
        success: false,
        error: 'Payment method ID is required',
      };
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    return {
      success: true,
      payment_method: paymentMethod,
    };
  } catch (error) {
    console.error('Error retrieving payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment method',
    };
  }
}

export async function createSetupIntent(
  customerId: string,
  paymentMethodTypes: string[] = ['card']
): Promise<{ success: boolean; setup_intent?: Stripe.SetupIntent; client_secret?: string; error?: string }> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required',
      };
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: paymentMethodTypes,
      usage: 'off_session',
      metadata: {
        created_at: new Date().toISOString(),
        app: 'OnGoPool',
      },
    });

    return {
      success: true,
      setup_intent: setupIntent,
      client_secret: setupIntent.client_secret!,
    };
  } catch (error) {
    console.error('Error creating setup intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create setup intent',
    };
  }
}

export async function deleteCustomer(customerId: string): Promise<CustomerResponse> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required',
      };
    }

    const deletedCustomer = (await stripe.customers.del(customerId)) as Stripe.DeletedCustomer;

    return {
      success: true,
      customer: deletedCustomer,
    };
  } catch (error) {
    console.error('Error deleting customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete customer',
    };
  }
}

function sendStripeResponse(res: Response, result: { success: boolean; error?: string }, data?: Record<string, unknown>) {
  res.status(result.success ? 200 : 400).json({
    success: result.success,
    data: result.success ? data : undefined,
    error: result.error,
    timestamp: new Date().toISOString(),
    statusCode: result.success ? 200 : 400,
  });
}

export function registerCustomerRoutes(router: Router) {
  router.post('/customers', async (req: Request, res: Response) => {
    const result = await createCustomer(req.body as CreateCustomerRequest);
    sendStripeResponse(res, result, { customer: result.customer });
  });

  router.post('/setup-intents', async (req: Request, res: Response) => {
    const { customer_id, payment_method_types } = req.body as {
      customer_id: string;
      payment_method_types?: string[];
    };
    const result = await createSetupIntent(customer_id, payment_method_types);
    sendStripeResponse(res, result, {
      setup_intent: result.setup_intent,
      client_secret: result.client_secret,
    });
  });

  router
    .route('/customers/:id')
    .get(async (req: Request, res: Response) => {
      const result = await getCustomer(req.params.id);
      sendStripeResponse(res, result, { customer: result.customer });
    })
    .put(async (req: Request, res: Response) => {
      const result = await updateCustomer({ customer_id: req.params.id, ...req.body });
      sendStripeResponse(res, result, { customer: result.customer });
    })
    .delete(async (req: Request, res: Response) => {
      const result = await deleteCustomer(req.params.id);
      sendStripeResponse(res, result, { customer: result.customer });
    });

  router.post('/customers/:id/payment-methods', async (req: Request, res: Response) => {
    const result = await attachPaymentMethod({ customer_id: req.params.id, ...req.body });
    sendStripeResponse(res, result, { payment_method: result.payment_method });
  });

  router.get('/customers/:id/payment-methods', async (req: Request, res: Response) => {
    const type = (req.query.type as Stripe.PaymentMethodListParams.Type) || 'card';
    const result = await listCustomerPaymentMethods(req.params.id, type);
    sendStripeResponse(res, result, { payment_methods: result.payment_methods });
  });

  router.get('/payment-methods/:id', async (req: Request, res: Response) => {
    const result = await getPaymentMethod(req.params.id);
    sendStripeResponse(res, result, { payment_method: result.payment_method });
  });

  router.delete('/payment-methods/:id', async (req: Request, res: Response) => {
    const result = await detachPaymentMethod({ payment_method_id: req.params.id });
    sendStripeResponse(res, result, { payment_method: result.payment_method });
  });
}
