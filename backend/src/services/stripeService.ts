import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

/**
 * Get Stripe client instance
 */
export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  stripeClient = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
  });

  return stripeClient;
}

/**
 * Create a payment intent with manual capture
 */
export async function createPaymentIntent(params: {
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  description: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();

  return await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    capture_method: 'manual', // Authorize only, capture later
    metadata: params.metadata,
    description: params.description,
  });
}

/**
 * Capture a payment intent
 */
export async function capturePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  return await stripe.paymentIntents.capture(paymentIntentId);
}

/**
 * Cancel a payment intent
 */
export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  return await stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Retrieve a payment intent
 */
export async function retrievePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeClient();
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Create a refund
 */
export async function createRefund(params: {
  paymentIntentId: string;
  reason?: Stripe.RefundCreateParams.Reason;
}): Promise<Stripe.Refund> {
  const stripe = getStripeClient();

  return await stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    reason: params.reason,
  });
}

/**
 * Create a transfer to driver's connected account
 */
export async function createTransfer(params: {
  amount: number;
  destination: string;
  description: string;
}): Promise<Stripe.Transfer> {
  const stripe = getStripeClient();

  return await stripe.transfers.create({
    amount: params.amount,
    currency: 'cad',
    destination: params.destination,
    description: params.description,
  });
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  const stripe = getStripeClient();

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
