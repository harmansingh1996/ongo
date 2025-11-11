import type { Request, Response } from 'express';
import { Router } from 'express';
import Stripe from 'stripe';
import { stripe } from './stripeClient.js';

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!endpointSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set.');
}

function extractId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

function toPlainMetadata(metadata: Stripe.Metadata | null | undefined): Record<string, string> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata));
}

async function handlePaymentIntentEvent(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  console.info(`[Stripe][PaymentIntent] ${event.type}`, {
    id: paymentIntent.id,
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    amount_capturable: paymentIntent.amount_capturable,
    amount_received: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    customer: extractId(paymentIntent.customer),
    payment_method: extractId(paymentIntent.payment_method),
    latest_charge: extractId(paymentIntent.latest_charge),
    metadata: toPlainMetadata(paymentIntent.metadata),
  });
}

async function handleCustomerEvent(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;

  console.info(`[Stripe][Customer] ${event.type}`, {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    metadata: toPlainMetadata(customer.metadata),
  });
}

async function handlePaymentMethodEvent(event: Stripe.Event) {
  const paymentMethod = event.data.object as Stripe.PaymentMethod;

  console.info(`[Stripe][PaymentMethod] ${event.type}`, {
    id: paymentMethod.id,
    type: paymentMethod.type,
    customer: extractId(paymentMethod.customer),
    metadata: toPlainMetadata(paymentMethod.metadata),
  });
}

async function handleSetupIntentEvent(event: Stripe.Event) {
  const setupIntent = event.data.object as Stripe.SetupIntent;

  console.info(`[Stripe][SetupIntent] ${event.type}`, {
    id: setupIntent.id,
    status: setupIntent.status,
    customer: extractId(setupIntent.customer),
    metadata: toPlainMetadata(setupIntent.metadata),
  });
}

async function handleChargeEvent(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  console.info(`[Stripe][Charge] ${event.type}`, {
    id: charge.id,
    status: charge.status,
    amount: charge.amount,
    currency: charge.currency,
    customer: extractId(charge.customer),
    payment_intent: extractId(charge.payment_intent),
    metadata: toPlainMetadata(charge.metadata),
  });
}

const router: Router = Router();

router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig || Array.isArray(sig)) {
    return res.status(400).json({ error: 'Missing Stripe signature header' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.requires_action':
        await handlePaymentIntentEvent(event);
        break;
      case 'customer.created':
      case 'customer.updated':
      case 'customer.deleted':
        await handleCustomerEvent(event);
        break;
      case 'payment_method.attached':
      case 'payment_method.detached':
        await handlePaymentMethodEvent(event);
        break;
      case 'setup_intent.succeeded':
      case 'setup_intent.setup_failed':
        await handleSetupIntentEvent(event);
        break;
      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.captured':
        await handleChargeEvent(event);
        break;
      default:
        console.debug('[Stripe][Webhook] Unhandled event type', event.type, {
          object: event.data?.object && typeof event.data.object === 'object'
            ? {
                id: extractId((event.data.object as { id?: string }).id),
                metadata: toPlainMetadata((event.data.object as { metadata?: Stripe.Metadata }).metadata),
              }
            : undefined,
        });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export const stripeWebhooksRouter = router;
