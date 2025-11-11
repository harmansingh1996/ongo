-- Migration: Add stripe_connect_account_id column to users table
-- Date: 2025-11-10

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_connect_account_id_idx
  ON public.users(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMIT;
