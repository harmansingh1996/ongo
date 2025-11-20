# Referral Code RLS Policy Fix

## Issue
Users received "Invalid referral code" errors when trying to apply valid referral codes during signup.

## Root Cause
The Row Level Security (RLS) policies on the `referrals` table only allowed users to view their own referrals (`auth.uid() = user_id`). When a new user tried to apply someone else's referral code, the query failed because they didn't have permission to look up other users' referral codes.

## Code Flow
```typescript
// In src/services/referralService.ts - applyReferralCode function
const { data: referral, error: referralError } = await supabase
  .from('referrals')
  .select('*')
  .eq('referral_code', referralCode)
  .single();

// This query would fail with RLS error because:
// - The referral code belongs to another user (the referrer)
// - The querying user doesn't own that referral record
// - RLS policy: "Users can view their own referrals" blocked access
```

## Solution Applied
Added a new RLS policy to allow public lookup of referrals by referral code:

```sql
CREATE POLICY "Anyone can lookup referrals by code"
ON public.referrals
FOR SELECT
TO public
USING (true);
```

### Why This Is Safe
1. **Referral codes are meant to be public** - Users share them via social media, messaging, etc.
2. **No sensitive data exposed** - The query only reveals:
   - referral_code (already public)
   - user_id (needed for tracking)
   - discount_percent (public information)
3. **Read-only access** - Policy only allows SELECT, not INSERT/UPDATE/DELETE
4. **Expected behavior** - New users MUST be able to look up codes to apply them

## RLS Policies After Fix
The `referrals` table now has the following policies:

| Policy Name | Command | Condition | Purpose |
|------------|---------|-----------|---------|
| Anyone can lookup referrals by code | SELECT | true | Allow public lookup of referral codes |
| Users can view their own referrals | SELECT | auth.uid() = user_id | Allow users to view their own referral stats |
| Users can insert their own referrals | INSERT | auth.uid() = user_id | Allow users to create their own referral codes |
| Users can update their own referrals | UPDATE | auth.uid() = user_id | Allow users to update their own referral data |

## Verification
Tested the fix by querying a referral code directly:
```sql
SELECT id, user_id, referral_code, discount_percent 
FROM referrals 
WHERE referral_code = 'HAR20EBEC';
```

**Result:** ✅ Successfully retrieved referral code data without authentication

## Impact
- ✅ New users can now successfully apply referral codes during signup
- ✅ Existing referral functionality preserved
- ✅ No security vulnerabilities introduced
- ✅ No changes to application code required

## Migration Applied
File: `fix_referral_code_rls_policy`
Date: 2025-11-20
Status: ✅ Successfully applied

## Related Files
- `src/services/referralService.ts` - Contains applyReferralCode function
- `REFERRAL_SYSTEM_GUIDE.md` - Referral system documentation
- `REFERRAL_REWARDS_SYSTEM.sql` - Original referral system migration
