import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z
    .string()
    .url("Define EXPO_PUBLIC_SUPABASE_URL with your Supabase project URL"),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, "Define EXPO_PUBLIC_SUPABASE_ANON_KEY with your Supabase anon key"),
  STRIPE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "Define EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY with your Stripe publishable key"),
});

const rawEnv = {
  SUPABASE_URL:
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim(),
  SUPABASE_ANON_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim(),
  STRIPE_PUBLISHABLE_KEY:
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim(),
};

const parsedEnv = envSchema.safeParse(rawEnv);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `• ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    [
      "Environment configuration error:\n",
      issues,
      "\nSet these variables in your Expo environment (e.g. app.config.js, app.json extra.expoPublic, or an .env file loaded by Expo CLI).",
    ].join("")
  );
}

export const env = parsedEnv.data;
