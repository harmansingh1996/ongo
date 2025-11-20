# Supabase Schema Fix Guide

## Problem
The `driver_licenses` table is missing critical columns, causing errors like:
```
Could not find the 'licence_number' column of 'driver_licenses' in the schema cache
```

## Root Cause
The table was either:
1. Not created with the full schema from `LICENCE_MIGRATION.sql`
2. Created partially and missing critical columns
3. Schema drift occurred between code expectations and database reality

## Solution

### Step 1: Run the Comprehensive Fix Script

1. Open your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `FIX_LICENCE_NUMBER_COLUMNS.sql`
4. Click **Run** to execute the script

### Step 2: Verify the Fix

The script includes automatic verification. You should see output messages like:
```
========================================
Fix applied successfully!
driver_licenses.licence_number column exists ✓
driver_licenses.expiry_date column exists ✓
driver_licenses.licence_class column exists ✓
driver_licenses.issuing_country column exists ✓
driver_licenses.issuing_state column exists ✓
driver_licenses.front_image_url column exists ✓
driver_licenses.back_image_url column exists ✓
========================================
```

### Step 3: Test the Application

After applying the fix, test the driver licence upload functionality:
1. Navigate to the driver profile section
2. Try uploading a licence
3. Fill in the licence details
4. Submit the form

The error should no longer appear, and the licence data should be saved successfully.

## What the Fix Does

The `FIX_LICENCE_NUMBER_COLUMNS.sql` script:

1. **Adds ALL missing columns** to `driver_licenses` table:
   - `licence_number` (VARCHAR) - **CRITICAL** 
   - `expiry_date` (DATE) - **REQUIRED**
   - `issue_date` (DATE)
   - `licence_class` (VARCHAR)
   - `issuing_country` (VARCHAR)
   - `issuing_state` (VARCHAR)
   - `front_image_url` (TEXT)
   - `back_image_url` (TEXT)
   - `is_verified` (BOOLEAN)
   - `verification_status` (VARCHAR)
   - `verification_notes` (TEXT)
   - `verified_at` (TIMESTAMPTZ)
   - `created_at` (TIMESTAMPTZ)
   - `updated_at` (TIMESTAMPTZ)

2. **Adds constraints**:
   - Check constraint for `verification_status` values
   - NOT NULL constraints where appropriate

3. **Creates indexes**:
   - `idx_driver_licenses_user_id` - for user lookups
   - `idx_driver_licenses_verification` - for admin verification queries
   - `idx_driver_licenses_expiry` - for expiry date reminders

4. **Safe execution**:
   - Checks if columns exist before adding them
   - Won't fail if run multiple times
   - Provides detailed progress notifications

## Expected Database Schema

After running the fix, your `driver_licenses` table should have:

```sql
CREATE TABLE driver_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  licence_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  issue_date DATE,
  issuing_country VARCHAR(100),
  issuing_state VARCHAR(100),
  licence_class VARCHAR(50),
  front_image_url TEXT,
  back_image_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(20) DEFAULT 'pending',
  verification_notes TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_licence UNIQUE(user_id)
);
```

## Troubleshooting

### If the script fails:
1. Check if the `driver_licenses` table exists at all
2. If not, run `LICENCE_MIGRATION.sql` first
3. Then run `FIX_LICENCE_NUMBER_COLUMNS.sql`

### If errors persist:
1. Check Supabase logs for specific error messages
2. Verify your database permissions
3. Ensure you're running the script in the correct project

### To verify manually:
Run this query in SQL Editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'driver_licenses'
ORDER BY ordinal_position;
```

This will show all columns in the `driver_licenses` table.

## Related Files
- `FIX_LICENCE_NUMBER_COLUMNS.sql` - **Main fix script (run this!)**
- `LICENCE_MIGRATION.sql` - Original migration (for reference)
- `src/services/licenceService.ts` - Frontend service using these columns
- `FIX_LICENCE_CLASS_COLUMN.sql` - Partial fix (superseded)
- `FIX_IMAGE_URLS_COLUMNS.sql` - Partial fix (superseded)
- `FIX_EXPIRY_DATE_COLUMN.sql` - Partial fix (superseded)
