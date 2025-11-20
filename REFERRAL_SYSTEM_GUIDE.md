# Referral Rewards and Redemption System Guide

## Overview

The referral system allows users to earn rewards by inviting new users to the platform. This guide explains how the system works, how to use referral codes, and how to redeem earned rewards.

---

## System Architecture

### Database Tables

1. **referrals** - User's referral information and balances
   - `referral_code` - Unique code to share
   - `available_balance` - Credits ready for redemption
   - `pending_balance` - Credits in redemption process
   - `total_earned` - Lifetime earnings
   - `total_redeemed` - Total redeemed amount

2. **referral_uses** - Tracks when codes are used
   - `referrer_id` - User who owns the code
   - `referred_user_id` - New user who used code
   - `status` - 'pending' → 'used'
   - `discount_applied` - Discount given to new user

3. **referral_redemptions** - Redemption requests
   - `amount` - Amount to redeem
   - `redemption_method` - bank_transfer/wallet/ride_credit
   - `status` - pending → processing → completed/failed

4. **referral_transactions** - Transaction history
   - Complete audit trail of all balance changes
   - Types: earned, redeemed, bonus, adjustment

---

## How It Works

### 1. Sharing Referral Codes

**Every user gets a unique referral code automatically:**
```typescript
// Example: "HAR20EBEC" (first 3 letters of name + first 6 of user ID)
const referral = await getUserReferral(userId, userName);
console.log(referral.referral_code); // "HAR20EBEC"
```

**Users can share their code via:**
- Social media
- Direct messaging
- Email invitations
- QR codes (future feature)

### 2. New Users Apply Codes

**During signup, new users can enter a referral code:**
```typescript
const success = await applyReferralCode('HAR20EBEC', newUserId);
// Creates entry in referral_uses with status 'pending'
// New user gets 10% discount on first ride
```

**What happens:**
- ✅ Referral link created (status: pending)
- ✅ New user gets 10% discount
- ⏳ Referrer doesn't get reward yet (waiting for first purchase)

### 3. Earning Rewards (Automatic)

**When referred user makes their first purchase/ride:**
```typescript
await markReferralUsed(referralUseId, discountAmount);
// Status changes to 'used'
// DATABASE TRIGGER automatically credits $5 to referrer
```

**Automatic trigger workflow:**
1. `referral_uses.status` changes to 'used'
2. Database trigger `auto_reward_referral()` fires
3. $5 added to referrer's `available_balance`
4. Transaction logged in `referral_transactions`
5. Referrer notified (future feature)

**Reward amount:** $5 per successful referral (configurable in SQL)

### 4. Checking Balance

**Get current balance and stats:**
```typescript
const balance = await getReferralBalance(userId);
console.log(balance);
/*
{
  availableBalance: 25.00,  // Ready to redeem
  pendingBalance: 10.00,     // In redemption process
  totalEarned: 50.00,        // Lifetime earnings
  totalRedeemed: 15.00       // Already withdrawn
}
*/

const stats = await getReferralStats(userId);
/*
{
  totalReferrals: 10,        // Total referrals made
  totalEarned: 50.00,        // Total earned
  pendingReferrals: 3        // Waiting for first purchase
}
*/
```

### 5. Requesting Redemption

**Three redemption methods available:**

#### Option A: Bank Transfer
```typescript
const result = await requestRedemption(
  userId,
  50.00,  // Amount
  'bank_transfer',
  {
    account_number: '1234567890',
    routing_number: '987654321',
    account_holder_name: 'John Doe',
    bank_name: 'Example Bank'
  }
);
// { success: true, redemptionId: 'uuid-xxx' }
```

#### Option B: Digital Wallet
```typescript
const result = await requestRedemption(
  userId,
  25.00,
  'wallet',
  null,
  'wallet_address_or_email@example.com'
);
```

#### Option C: Ride Credits
```typescript
const result = await requestRedemption(
  userId,
  15.00,
  'ride_credit'  // Applied as discount on future rides
);
// Credits applied immediately
```

**What happens:**
1. Amount deducted from `available_balance`
2. Added to `pending_balance`
3. Redemption request created (status: pending)
4. Admin notified for processing

**Minimum redemption:** $10 (can be configured in frontend)

### 6. Redemption Processing

**Admin processes redemptions:**
```sql
-- Complete redemption (after sending money)
SELECT complete_referral_redemption(
  'redemption-uuid',
  'transaction_id_from_payment_processor'
);

-- Cancel redemption (refund to user balance)
SELECT cancel_referral_redemption(
  'redemption-uuid',
  'Invalid bank account'
);
```

**Status flow:**
- pending → processing → completed ✅
- pending → cancelled (refunded) ⏪

---

## Frontend Implementation

### Referral Dashboard Page

```typescript
// Example referral dashboard component
export default function ReferralDashboard() {
  const [referralCode, setReferralCode] = useState('');
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    const user = await getCurrentUser();
    
    // Get referral code
    const referral = await getUserReferral(user.id, user.name);
    setReferralCode(referral.referral_code);
    
    // Get balance
    const bal = await getReferralBalance(user.id);
    setBalance(bal);
    
    // Get transaction history
    const txns = await getTransactionHistory(user.id);
    setHistory(txns);
  };

  const handleRedeem = async () => {
    const result = await requestRedemption(
      userId,
      balance.availableBalance,
      'bank_transfer',
      bankInfo
    );
    
    if (result.success) {
      alert('Redemption requested! Processing within 3-5 business days.');
    }
  };

  return (
    <div>
      {/* Share Code Section */}
      <div>
        <h2>Your Referral Code: {referralCode}</h2>
        <button onClick={() => shareCode(referralCode)}>
          Share Code
        </button>
      </div>

      {/* Balance Display */}
      <div>
        <h3>Available: ${balance?.availableBalance}</h3>
        <h3>Pending: ${balance?.pendingBalance}</h3>
        <h3>Total Earned: ${balance?.totalEarned}</h3>
      </div>

      {/* Redeem Button */}
      <button 
        onClick={handleRedeem}
        disabled={balance?.availableBalance < 10}
      >
        Redeem Balance
      </button>

      {/* Transaction History */}
      <div>
        {history.map(txn => (
          <div key={txn.id}>
            <span>{txn.transaction_type}</span>
            <span>${txn.amount}</span>
            <span>{txn.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Database Queries

### Check Referral Summary
```sql
SELECT * FROM v_referral_summary 
WHERE user_id = 'user-uuid';
```

Returns:
- referral_code
- total_referrals
- available_balance
- pending_balance
- total_earned
- total_redeemed
- pending_uses count
- completed_uses count

### Manual Reward Adjustment
```sql
-- Add bonus reward
INSERT INTO referral_transactions (
  user_id,
  transaction_type,
  amount,
  balance_after,
  description
) VALUES (
  'user-uuid',
  'bonus',
  10.00,
  (SELECT available_balance + 10.00 FROM referrals WHERE user_id = 'user-uuid'),
  'Special promotion bonus'
);

UPDATE referrals 
SET available_balance = available_balance + 10.00
WHERE user_id = 'user-uuid';
```

---

## Configuration

### Reward Amount

Change default reward in SQL:
```sql
-- In auto_reward_referral() function
DECLARE
  v_reward_amount NUMERIC := 5.00; -- Change this value
```

### Discount Percentage

Change new user discount:
```typescript
// In getUserReferral()
discount_percent: 10,  // Change this value (10 = 10%)
```

### Minimum Redemption

Set in frontend validation:
```typescript
const MIN_REDEMPTION = 10.00; // Minimum $10

if (amount < MIN_REDEMPTION) {
  alert(`Minimum redemption is $${MIN_REDEMPTION}`);
  return;
}
```

---

## Monitoring and Analytics

### Key Metrics to Track

1. **Referral Conversion Rate**
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'used') * 100.0 / COUNT(*) as conversion_rate
FROM referral_uses;
```

2. **Top Referrers**
```sql
SELECT 
  p.name,
  r.referral_code,
  r.total_referrals,
  r.total_earned
FROM referrals r
JOIN profiles p ON p.id = r.user_id
ORDER BY r.total_earned DESC
LIMIT 10;
```

3. **Pending Redemptions**
```sql
SELECT 
  p.name,
  rd.amount,
  rd.redemption_method,
  rd.created_at
FROM referral_redemptions rd
JOIN profiles p ON p.id = rd.user_id
WHERE rd.status = 'pending'
ORDER BY rd.created_at ASC;
```

---

## Troubleshooting

### Issue: Reward not credited

**Check:**
1. Verify referral_use status is 'used'
2. Check referral_transactions for transaction record
3. Verify trigger is enabled:
```sql
SELECT * FROM pg_trigger 
WHERE tgname = 'trigger_auto_reward_referral';
```

### Issue: Can't redeem balance

**Check:**
1. Verify available_balance is sufficient
2. Check for pending redemptions
3. Verify RLS policies allow user access

### Issue: Redemption stuck in pending

**Admin action:**
```sql
-- Check redemption details
SELECT * FROM referral_redemptions WHERE id = 'redemption-uuid';

-- Complete or cancel
SELECT complete_referral_redemption('redemption-uuid', 'txn_123');
-- OR
SELECT cancel_referral_redemption('redemption-uuid', 'reason');
```

---

## Security Considerations

1. **RLS Policies**: All tables have Row Level Security enabled
2. **Balance Validation**: Functions verify sufficient balance before redemption
3. **Idempotency**: Rewards only credited once per referral use
4. **Audit Trail**: Complete transaction history in referral_transactions
5. **Status Validation**: Redemptions can't be completed twice

---

## Future Enhancements

Potential improvements:
1. **Real-time notifications** when rewards are earned
2. **Social sharing** integration (Facebook, Twitter, WhatsApp)
3. **QR code generation** for easy code sharing
4. **Referral tiers** (earn more for more referrals)
5. **Leaderboards** for top referrers
6. **Automated payouts** via Stripe Connect
7. **Email campaigns** for referred users

---

## Summary

✅ **Automatic reward system** - $5 credited when referral makes first purchase
✅ **Multiple redemption methods** - Bank, wallet, or ride credits
✅ **Complete audit trail** - All transactions logged
✅ **Secure and validated** - RLS policies and balance checks
✅ **Admin controls** - Process redemptions manually
✅ **Scalable** - Database functions handle all logic

**Next Steps:**
1. Run `REFERRAL_REWARDS_SYSTEM.sql` migration
2. Implement referral dashboard UI
3. Add redemption request flow
4. Set up admin redemption processing
5. Configure notification system
