# Supabase Setup Instructions

This guide explains how to set up the database tables for OnGoPool's profile and payment features.

## Prerequisites

- Active Supabase project
- Supabase project URL and anon key configured in `.env`
- Access to Supabase SQL Editor

## Database Setup Steps

### 1. Run the Migration SQL

1. Open your Supabase Dashboard
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase_migration.sql` file
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter` (Windows/Linux) or `Cmd+Return` (Mac)

### 2. Verify Tables Created

After running the migration, verify the following tables exist in your **Table Editor**:

- ✅ `profiles` - Updated with additional fields (phone, address, city, zipCode, rating, total_rides)
- ✅ `payment_methods` - New table for storing user payment methods
- ✅ `payment_history` - New table for payment transaction records

### 3. Check Row Level Security (RLS)

Ensure RLS is enabled on the new tables:

1. Go to **Authentication** → **Policies**
2. Check that policies exist for:
   - `payment_methods` (4 policies: SELECT, INSERT, UPDATE, DELETE)
   - `payment_history` (3 policies: SELECT, INSERT, UPDATE)

## Table Schemas

### profiles (Updated)

New fields added:
- `phone` - User phone number
- `address` - Street address
- `city` - City name
- `state` - State/Province
- `zipCode` - Postal/ZIP code
- `profile_image` - URL to profile picture
- `rating` - User rating (default: 5.0)
- `total_rides` - Total completed rides (default: 0)

### payment_methods

Stores user payment information:
- `id` - UUID primary key
- `user_id` - Reference to profiles table
- `type` - Payment type: 'credit', 'debit', or 'paypal'
- `card_number` - Last 4 digits only (security)
- `expiry_date` - Card expiration date
- `cardholder_name` - Name on card
- `is_default` - Whether this is the default payment method
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### payment_history

Tracks all payment transactions:
- `id` - UUID primary key
- `user_id` - Reference to profiles table
- `ride_id` - Reference to rides table (nullable)
- `amount` - Payment amount
- `payment_method` - Description of payment method used
- `transaction_id` - Unique transaction identifier
- `status` - Payment status: 'paid', 'authorized', 'pending', or 'refunded'
- `date` - Transaction date
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Security Features

### Row Level Security (RLS)

All tables have RLS enabled to ensure users can only access their own data:

**payment_methods policies:**
- Users can only view their own payment methods
- Users can only add payment methods for themselves
- Users can only update their own payment methods
- Users can only delete their own payment methods

**payment_history policies:**
- Users can only view their own payment history
- Users can only create payment records for themselves
- Users can only update their own payment records

### Data Security

- **Card numbers**: Only last 4 digits are stored
- **Encryption**: Supabase handles encryption at rest
- **Authentication**: All operations require valid auth token
- **Validation**: CHECK constraints ensure data integrity

## Testing the Setup

After running the migration, test the setup:

1. **Profile Page**: Should load and display user information
2. **Payment Methods Page**: Should allow adding/removing payment methods
3. **Payment History Page**: Should display transaction history

## Quick Fixes for Common Issues

### Fix 1: Missing licence_class Column ⚠️ NEEDS TO BE APPLIED

**Issue:** Error when upserting driver licence: "Could not find the 'licence_class' column of 'driver_licenses' in the schema cache"

**Solution:**
1. Open Supabase SQL Editor
2. Run the contents of `FIX_LICENCE_CLASS_COLUMN.sql` file
3. This will add the missing `licence_class`, `issuing_country`, and `issuing_state` columns

**Quick Fix Command:**
```sql
-- Run this in Supabase SQL Editor
ALTER TABLE driver_licenses ADD COLUMN IF NOT EXISTS licence_class VARCHAR(50);
ALTER TABLE driver_licenses ADD COLUMN IF NOT EXISTS issuing_country VARCHAR(100);
ALTER TABLE driver_licenses ADD COLUMN IF NOT EXISTS issuing_state VARCHAR(100);
```

### Fix 2: Missing driver_locations Table ✅ APPLIED

**Status:** Migration applied successfully on 2025-11-16 using Supabase MCP tool.

This table is now part of the database schema and supports:
- Driver location tracking functionality
- Real-time GPS updates during rides (every 5 seconds)
- Location history for rides
- Live tracking for riders

**Table Details:**
- Columns: id, ride_id, driver_id, lat, lng, heading, speed, accuracy, timestamp, created_at
- RLS Policies: SELECT (public), INSERT/UPDATE (driver-only)
- Indexes: ride_id, driver_id, timestamp (DESC)

If you need to reapply this migration to a new database instance:
1. Open Supabase SQL Editor
2. Run the contents of `add_driver_locations_table.sql` file

### Fix 3: Missing Columns in ride_requests

If you encounter the error: **"Could not find the 'confirmed_at' column"**, run the quick fix:

1. Open Supabase SQL Editor
2. Run the contents of `MIGRATION_FIX.sql` file
3. This will add the missing `confirmed_at` and `request_date` columns

Or run this command directly:
```sql
ALTER TABLE ride_requests 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS request_date TIMESTAMPTZ DEFAULT NOW();
```

## Troubleshooting

### Error: "relation already exists"
- Tables already exist, migration is safe to re-run (uses `IF NOT EXISTS`)

### Error: "permission denied"
- Check that you're logged in as the project owner
- Verify RLS policies are correctly set up

### Payment methods not showing
- Check browser console for errors
- Verify user is authenticated
- Check RLS policies in Supabase dashboard

## Next Steps

After database setup is complete:

1. Test profile editing functionality
2. Add a payment method
3. Verify payment history displays correctly
4. Check that RLS policies work (try accessing another user's data - it should fail)

## Important Notes

⚠️ **Security Warning**: Never store full card numbers or CVV codes in the database. Only store last 4 digits for reference.

⚠️ **Production Consideration**: For real payment processing, integrate with payment providers like Stripe or PayPal instead of storing card details directly.
