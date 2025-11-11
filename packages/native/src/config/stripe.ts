import { env } from "@/config/env";

export async function loadStripePublishableKey() {
  return env.STRIPE_PUBLISHABLE_KEY;
}
