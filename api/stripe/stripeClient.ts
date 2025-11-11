import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
}

const configuredVersion = process.env.STRIPE_API_VERSION?.trim();
const defaultVersion = '2025-02-24.acacia';
const apiVersion = configuredVersion && configuredVersion.length > 0 ? configuredVersion : defaultVersion;

export const stripe = new Stripe(secretKey, {
  apiVersion: apiVersion as Stripe.StripeConfig['apiVersion'],
});
