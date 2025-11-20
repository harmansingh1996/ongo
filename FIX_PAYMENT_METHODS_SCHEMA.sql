-- ============================================================
-- FIX: Add missing columns to payment_methods table
-- ============================================================
-- Error: PGRST204 - Could not find 'card_number' column
-- Root Cause: payment_methods table exists but missing required columns
-- Solution: Add missing columns if they don't exist
-- ============================================================

-- Check current table structure and add missing columns
DO $$ 
BEGIN
    -- Add card_number column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_methods' AND column_name = 'card_number'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN card_number TEXT NOT NULL DEFAULT '';
        RAISE NOTICE 'Added card_number column to payment_methods';
    END IF;

    -- Add expiry_date column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_methods' AND column_name = 'expiry_date'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN expiry_date TEXT NOT NULL DEFAULT '';
        RAISE NOTICE 'Added expiry_date column to payment_methods';
    END IF;

    -- Add cardholder_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_methods' AND column_name = 'cardholder_name'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN cardholder_name TEXT NOT NULL DEFAULT '';
        RAISE NOTICE 'Added cardholder_name column to payment_methods';
    END IF;

    -- Add type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_methods' AND column_name = 'type'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN type TEXT NOT NULL DEFAULT 'credit';
        RAISE NOTICE 'Added type column to payment_methods';
    END IF;

    -- Add is_default column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_methods' AND column_name = 'is_default'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN is_default BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_default column to payment_methods';
    END IF;
END $$;

-- Add CHECK constraint on type column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'payment_methods' 
        AND constraint_name = 'payment_methods_type_check'
    ) THEN
        ALTER TABLE payment_methods 
        ADD CONSTRAINT payment_methods_type_check 
        CHECK (type IN ('credit', 'debit', 'paypal'));
        RAISE NOTICE 'Added type CHECK constraint to payment_methods';
    END IF;
END $$;

-- Verify the fix
DO $$
DECLARE
    column_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'payment_methods'
    AND column_name IN ('card_number', 'expiry_date', 'cardholder_name', 'type', 'is_default');
    
    IF column_count = 5 THEN
        RAISE NOTICE '✓ SUCCESS: All required columns exist in payment_methods table';
    ELSE
        RAISE WARNING '⚠ WARNING: Only % of 5 required columns found', column_count;
    END IF;
END $$;

-- Display current table structure for verification
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'payment_methods'
ORDER BY ordinal_position;
