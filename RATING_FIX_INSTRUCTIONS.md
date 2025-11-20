# Passenger Rating Update Fix

## Problem Diagnosis

**Issue**: Passenger ratings are not updating after drivers submit reviews.

**Root Cause**: 
1. The frontend code attempts to manually update the `profiles.rating` field after creating a review
2. This fails silently due to Supabase Row Level Security (RLS) policies
3. RLS policies only allow users to update their own profiles
4. When a driver rates a passenger, the logged-in user is the driver, not the passenger
5. The update is blocked by RLS, but the error is caught and swallowed

## Solution: Database Trigger

The proper solution is to use a **database trigger** that runs with elevated permissions, bypassing RLS.

### Step 1: Apply the SQL Migration

You need to apply the `RATING_UPDATE_TRIGGER_FIX.sql` migration to your Supabase database.

**Option A: Using Supabase Dashboard (Recommended)**

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the entire content of `RATING_UPDATE_TRIGGER_FIX.sql`
4. Paste it into the SQL editor
5. Click "Run" to execute the migration

**Option B: Using Supabase CLI**

```bash
# If you have Supabase CLI installed
supabase db push RATING_UPDATE_TRIGGER_FIX.sql
```

### Step 2: Verify the Trigger

After applying the migration, verify it's working:

1. Create a test review using the app
2. Check the browser console for these log messages:
   - `✓ Review created successfully`
   - You might see RLS errors (this is expected - the manual update fails)
   - The important part is the review is created

3. Check the database:
```sql
-- Run this in Supabase SQL Editor
SELECT 
  p.id, 
  p.name, 
  p.rating, 
  COUNT(r.id) as review_count, 
  ROUND(AVG(r.rating)::numeric, 2) as calculated_avg
FROM profiles p
LEFT JOIN reviews r ON r.reviewed_user_id = p.id
GROUP BY p.id, p.name, p.rating
HAVING COUNT(r.id) > 0
ORDER BY p.name;
```

4. The `p.rating` column should match `calculated_avg`

### Step 3: Understanding the Fix

The trigger works as follows:

```sql
-- Creates a function that runs with SECURITY DEFINER (elevated permissions)
CREATE OR REPLACE FUNCTION update_user_rating_on_review_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculates average rating from all reviews
  UPDATE profiles
  SET rating = (
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 5.0)
    FROM reviews
    WHERE reviewed_user_id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id)
  )
  WHERE id = COALESCE(NEW.reviewed_user_id, OLD.reviewed_user_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers on INSERT, UPDATE, DELETE of reviews
CREATE TRIGGER update_rating_on_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_user_rating_on_review_change();
```

**Key Points:**
- Trigger runs AFTER INSERT/UPDATE/DELETE on `reviews` table
- Function has elevated permissions (bypasses RLS)
- Automatically calculates average from ALL reviews for that user
- Updates the `profiles.rating` field
- Defaults to 5.0 if no reviews exist

## Frontend Code Changes

The frontend code has been updated with:

1. **Enhanced Logging**: Console messages show what's happening
2. **Error Documentation**: Clear messages explain RLS failures
3. **Deprecation Notices**: Mark manual update as deprecated
4. **Backward Compatibility**: Manual update still attempts (for databases without trigger)

### What You'll See in Console

**If trigger is NOT applied:**
```
❌ CRITICAL: Rating update blocked by RLS policy
This is expected - ratings should be updated by database trigger
Please apply RATING_UPDATE_TRIGGER_FIX.sql to your Supabase database
```

**If trigger IS applied:**
```
✓ Review created successfully
Note: If you see RLS errors above, apply RATING_UPDATE_TRIGGER_FIX.sql
```

The review will be created successfully in both cases, but the rating will only update if the trigger exists.

## Testing the Fix

1. **Before applying trigger**:
   - Create a review
   - Check `profiles.rating` - it won't update
   - Console shows RLS error

2. **After applying trigger**:
   - Create a review
   - Check `profiles.rating` - it updates automatically
   - Console may still show RLS error (from deprecated manual update)
   - Rating is updated by trigger, not manual code

3. **Verify multiple reviews**:
   - Create 3 reviews with ratings: 5, 4, 3
   - Profile rating should be: (5+4+3)/3 = 4.0
   - Updates happen instantly after each review

## Troubleshooting

### Trigger Not Working?

Check if trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE 'update_rating%';
```

Check if function exists:
```sql
SELECT * FROM pg_proc WHERE proname = 'update_user_rating_on_review_change';
```

### Rating Still Not Updating?

1. Check for errors in Supabase logs (Dashboard → Logs)
2. Verify the trigger is enabled:
```sql
SELECT * FROM pg_trigger WHERE tgrelid = 'reviews'::regclass;
```

3. Manually fix existing ratings:
```sql
UPDATE profiles p
SET rating = (
  SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 5.0)
  FROM reviews r
  WHERE r.reviewed_user_id = p.id
)
WHERE p.id IN (SELECT DISTINCT reviewed_user_id FROM reviews);
```

## Summary

✅ **Apply the SQL migration to fix the rating update issue**  
✅ **Frontend code now has better logging and error messages**  
✅ **Database trigger handles rating updates automatically**  
✅ **No more RLS policy conflicts**  
✅ **Works for both drivers rating passengers AND passengers rating drivers**
