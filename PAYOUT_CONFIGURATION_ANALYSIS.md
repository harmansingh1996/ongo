# Payout Method Configuration Analysis with Stripe

**Date**: 2025-11-19  
**Project**: OnGoPool Rideshare Platform  
**Supabase Project**: fewhwgvlgstmukhebyvz

## Analysis Summary

After examining the database schema and Stripe integration code, I've identified **critical gaps** in the payout method configuration for Stripe Connect.

---

## Current Database Schema

### ✅ `payout_methods` Table Structure
```sql
- id (uuid, PRIMARY KEY)
- driver_id (uuid, NOT NULL, FK to profiles)
- bank_name (text, NOT NULL)
- account_holder_name (text, NOT NULL)
- institution_number (text, NOT NULL)  -- Canadian banking field
- transit_number (text, NOT NULL)       -- Canadian banking field
- account_number (text, NOT NULL)
- is_default (boolean, DEFAULT false)
- is_verified (boolean, DEFAULT false)
- created_at (timestamptz)
- updated_at (timestamptz)
```

**Issue**: This table stores **Canadian bank account details** but is **NOT connected to Stripe**.

### ✅ `driver_payout_records` Table Structure
```sql
- id, batch_id, driver_id
- gross_earnings, platform_fee, penalties, net_payout
- stripe_payout_id (text, nullable)      -- ✅ Exists
- stripe_transfer_id (text, nullable)    -- ✅ Exists
- status (pending/processing/paid/failed)
- payout_method_id (uuid, FK to payout_methods)
- processed_at, error_message
- created_at, updated_at
```

**Issue**: The table has fields for Stripe IDs but lacks the mechanism to connect payout methods to Stripe accounts.

---

## Critical Missing Components

### ❌ Problem 1: No Stripe Connect Account ID in Profiles

**Current `profiles` table**: Does NOT have `stripe_connect_account_id` column.

**Edge Function Code Expects**:
```typescript
const { data: driver } = await supabase
  .from("profiles")
  .select("stripe_connect_account_id")
  .eq("id", driverId_payout)
  .single();

if (!driver || !driver.stripe_connect_account_id) {
  return new Response(
    JSON.stringify({ error: "Driver Stripe account not configured" }),
    { status: 400 }
  );
}
```

**Impact**: The `create_payout` action in the Edge Function **will always fail** because drivers don't have Stripe Connect accounts linked.

---

### ❌ Problem 2: No Stripe Connect Integration

**What's Missing**:
1. **Stripe Connect Onboarding Flow**: Process to create connected accounts for drivers
2. **Account Verification**: KYC (Know Your Customer) verification required by Stripe
3. **Bank Account Linking**: Stripe External Accounts API not utilized
4. **Payout Capability**: No way to send money from platform to drivers

**Current State**: 
- Drivers can add their bank details to `payout_methods` table
- But these details are **never sent to Stripe**
- Stripe has no knowledge of driver bank accounts

---

### ❌ Problem 3: Missing Stripe Connect Account ID Storage

**Required Migration**:
```sql
-- Add Stripe Connect account ID to profiles table
ALTER TABLE profiles 
ADD COLUMN stripe_connect_account_id TEXT NULL,
ADD COLUMN stripe_account_status TEXT DEFAULT 'not_created' 
  CHECK (stripe_account_status IN ('not_created', 'pending', 'active', 'restricted'));

-- Add index for faster lookups
CREATE INDEX idx_profiles_stripe_connect_account 
ON profiles(stripe_connect_account_id);

COMMENT ON COLUMN profiles.stripe_connect_account_id IS 
  'Stripe Connect account ID for driver payouts';
COMMENT ON COLUMN profiles.stripe_account_status IS 
  'Status of Stripe Connect account setup';
```

---

### ❌ Problem 4: No Stripe External Account in Payout Methods

**Required Fields in `payout_methods`**:
```sql
ALTER TABLE payout_methods
ADD COLUMN stripe_external_account_id TEXT NULL,
ADD COLUMN stripe_account_status TEXT DEFAULT 'pending'
  CHECK (stripe_account_status IN ('pending', 'verified', 'verification_failed'));

COMMENT ON COLUMN payout_methods.stripe_external_account_id IS 
  'Stripe external bank account ID linked to driver Connect account';
```

---

## What Needs to Be Implemented

### 1. Stripe Connect Onboarding
Create a driver onboarding flow:
```typescript
// Create Stripe Connect account for driver
const account = await stripe.accounts.create({
  type: 'express', // or 'custom' for more control
  country: 'CA',   // Canada
  email: driver.email,
  capabilities: {
    transfers: { requested: true },
  },
  business_type: 'individual',
});

// Save to database
await supabase.from('profiles').update({
  stripe_connect_account_id: account.id,
  stripe_account_status: 'pending'
}).eq('id', driverId);

// Generate onboarding link
const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: 'https://yourapp.com/driver/stripe-connect/refresh',
  return_url: 'https://yourapp.com/driver/stripe-connect/success',
  type: 'account_onboarding',
});

// Redirect driver to accountLink.url for verification
```

### 2. Bank Account Linking to Stripe
When driver adds bank details:
```typescript
// Create external bank account in Stripe Connect account
const bankAccount = await stripe.accounts.createExternalAccount(
  stripeConnectAccountId,
  {
    external_account: {
      object: 'bank_account',
      country: 'CA',
      currency: 'cad',
      account_holder_name: payoutMethod.account_holder_name,
      account_number: payoutMethod.account_number,
      routing_number: `${payoutMethod.institution_number}-${payoutMethod.transit_number}`,
    },
  }
);

// Save Stripe bank account ID
await supabase.from('payout_methods').update({
  stripe_external_account_id: bankAccount.id,
  stripe_account_status: 'verified'
}).eq('id', payoutMethodId);
```

### 3. Update Payout Edge Function
The existing `createDriverPayout` function needs driver accounts to be properly configured with Stripe first.

---

## Recommended Action Plan

### Phase 1: Database Schema Updates
1. ✅ Add `stripe_connect_account_id` to `profiles` table
2. ✅ Add `stripe_external_account_id` to `payout_methods` table
3. ✅ Add status tracking columns

### Phase 2: Stripe Connect Setup
1. 🔨 Create driver onboarding page/flow
2. 🔨 Implement Stripe Connect account creation
3. 🔨 Build account link generation and redirect handling
4. 🔨 Add webhook handlers for account verification status

### Phase 3: Bank Account Integration
1. 🔨 Update payout method creation to link with Stripe
2. 🔨 Validate bank accounts via Stripe
3. 🔨 Handle verification micro-deposits (if required)

### Phase 4: Payout Processing
1. ✅ Batch payout generation (table exists)
2. 🔨 Automated weekly payout processing
3. 🔨 Error handling and retry logic
4. 🔨 Payout status webhooks

### Phase 5: Driver Dashboard
1. 🔨 Stripe Connect account status page
2. 🔨 Bank account management UI
3. 🔨 Payout history and tracking
4. 🔨 Tax document generation (1099-K for US, T4A for CA)

---

## Security Considerations

1. **Never store sensitive banking data in plain text** - Stripe handles this
2. **Use Stripe Connect Express accounts** for easier compliance
3. **Implement proper webhook signature verification**
4. **Encrypt `stripe_connect_account_id` in database** (optional but recommended)
5. **Restrict RLS policies** on payout_methods and driver_payout_records

---

## Testing Checklist

### Before Production:
- [ ] Stripe Connect account creation tested in sandbox
- [ ] Bank account verification flow tested
- [ ] Micro-deposit verification (if applicable)
- [ ] Payout transfer tested with test amounts
- [ ] Webhook handling for account updates
- [ ] Error cases handled (insufficient balance, account restrictions)
- [ ] Tax reporting requirements validated

---

## Current Status: ⚠️ NOT PRODUCTION-READY

**Reason**: The payout system is **structurally incomplete**. While the database tables exist and the Edge Function has payout code, **Stripe Connect is not integrated**.

**Next Step**: Implement Stripe Connect onboarding and bank account linking before attempting any driver payouts.

---

## Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe External Accounts API](https://stripe.com/docs/connect/bank-accounts)
- [Stripe Connect Express Accounts](https://stripe.com/docs/connect/express-accounts)
- [Canadian Bank Account Requirements](https://stripe.com/docs/connect/payouts#bank-account-requirements)
