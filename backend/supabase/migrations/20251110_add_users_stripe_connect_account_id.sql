-- Migration: Add stripe_connect_account_id column to users table
-- Purpose: Enable persistence of Stripe Connect account IDs for onboarding flow
-- Created: 2025-11-10

-- Add the stripe_connect_account_id column
ALTER TABLE public.users
ADD COLUMN stripe_connect_account_id TEXT UNIQUE;

-- Add a comment describing the column
COMMENT ON COLUMN public.users.stripe_connect_account_id IS 'Stripe Connect account ID for this user. Set during Stripe account onboarding.';

-- Create a unique partial index to allow multiple NULL values
-- (only one non-NULL value per user since column is UNIQUE)
CREATE UNIQUE INDEX idx_users_stripe_connect_account_id_unique
  ON public.users (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Rollback: DROP INDEX IF EXISTS public.idx_users_stripe_connect_account_id_unique;
-- Rollback: ALTER TABLE public.users DROP COLUMN stripe_connect_account_id;
