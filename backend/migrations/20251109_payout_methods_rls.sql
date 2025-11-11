-- Migration: Enable row-level security for payout_methods
-- Date: 2025-11-09
-- Note: Table already exists. This migration enables RLS and defines
-- per-user access policies so riders and drivers can manage their own
-- payout methods via the Supabase client.

BEGIN;

-- Ensure row level security is enabled
ALTER TABLE public.payout_methods ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy policies so this migration is idempotent
DROP POLICY IF EXISTS "Users can read own payout methods" ON public.payout_methods;
DROP POLICY IF EXISTS "Users can insert own payout methods" ON public.payout_methods;
DROP POLICY IF EXISTS "Users can update own payout methods" ON public.payout_methods;
DROP POLICY IF EXISTS "Users can delete own payout methods" ON public.payout_methods;

-- Allow authenticated users to read only their own payout methods
CREATE POLICY "Users can read own payout methods"
  ON public.payout_methods
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated users to insert payout methods tied to themselves
CREATE POLICY "Users can insert own payout methods"
  ON public.payout_methods
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update only their own payout methods
CREATE POLICY "Users can update own payout methods"
  ON public.payout_methods
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete only their own payout methods
CREATE POLICY "Users can delete own payout methods"
  ON public.payout_methods
  FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;
