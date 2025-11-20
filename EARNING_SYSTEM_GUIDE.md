# Earning Creation System Guide

## Overview

The earning creation system automatically creates earning records when rides are completed. This ensures drivers receive proper credit for their completed trips.

## How It Works

### Automatic Earning Creation Flow

1. **Ride Completion Detection**: When a ride's estimated arrival time is reached, the system automatically marks it as completed
2. **Earning Record Creation**: For each accepted passenger booking, an earning record is created
3. **Amount Calculation**: 
   - Uses the booking's `price_per_seat` (for segment bookings) or ride's `price_per_seat` (for full route)
   - Multiplies by `requested_seats` to get total amount
   - Platform fee (15%) is automatically calculated in the earnings service

### Key Files

- **`src/services/rideService.ts`**: Contains `completeRide()` function
- **`src/services/earningsService.ts`**: Contains `createEarning()` function
- **`src/pages/driver/RideDetailPage.tsx`**: Triggers ride completion

## Database Schema

### Required Tables

1. **`rides`** table needs:
   - `completed_at` column (TIMESTAMPTZ) - Added by migration
   - `status` column - Values: 'scheduled', 'ongoing', 'completed', 'cancelled'

2. **`driver_earnings`** table needs:
   - `driver_id` - Foreign key to profiles
   - `ride_id` - Foreign key to rides
   - `booking_id` - Foreign key to ride_requests (nullable)
   - `amount` - Gross amount before platform fee
   - `platform_fee` - 15% platform fee (calculated)
   - `net_amount` - Amount driver receives (calculated)
   - `status` - 'pending', 'paid', 'processing'
   - `date` - When earning was created
   - `payout_date` - When earning was paid out (nullable)

### Migration

Run the SQL migration to add the `completed_at` column:

```sql
-- See EARNING_CREATION_MIGRATION.sql
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
```

## Usage

### Automatic Completion (Recommended)

Rides automatically complete when:
- Current time ≥ estimated arrival time
- System checks every minute via `useEffect` interval

### Manual Testing

To test earning creation:

1. Create a ride with estimated arrival time in near future
2. Accept some passenger bookings
3. Wait for arrival time or manually trigger completion
4. Check driver's earnings page

### Earning Details

Each earning record includes:
- **Gross Amount**: Total price paid by passenger(s)
- **Platform Fee**: 15% of gross amount
- **Net Amount**: What driver receives (85% of gross)
- **Status**: Starts as 'pending', changes to 'paid' after payout

## Functions

### `completeRide(rideId: string)`

Main function that handles ride completion workflow.

**Returns:**
```typescript
{
  success: boolean;
  earningsCreated: number;
  error?: string;
}
```

**Process:**
1. Fetches ride details
2. Gets all accepted bookings
3. Updates ride status to 'completed'
4. Creates earning record for each booking
5. Logs results to console

### `createEarning(driverId, rideId, amount, bookingId?)`

Creates a single earning record.

**Parameters:**
- `driverId`: Driver's profile ID
- `rideId`: Ride ID
- `amount`: Gross amount (before platform fee)
- `bookingId`: Optional booking ID for reference

## Monitoring

Check console logs for earning creation:
- `🏁 Starting ride completion for ride ID: ...`
- `📊 Found X accepted bookings`
- `✅ Ride status updated to completed`
- `💰 Created earning for booking X: $XX.XX`
- `✅ Ride completion successful! Created X earnings`

## Troubleshooting

### Earnings Not Created

**Check:**
1. Ride status is 'completed' ✓
2. Bookings have status 'accepted' ✓
3. Console logs show earning creation ✓
4. Database has `completed_at` column ✓

**Common Issues:**
- Database missing `completed_at` column → Run migration
- No accepted bookings → Earnings only created for accepted bookings
- Ride already completed → Prevents duplicate earning creation

### Testing Checklist

- [ ] Migration applied successfully
- [ ] Ride can be created and accepted
- [ ] Bookings can be accepted
- [ ] Ride auto-completes at arrival time
- [ ] Earnings appear on driver's earnings page
- [ ] Platform fee calculated correctly (15%)
- [ ] Net amount is correct (85% of gross)

## Future Enhancements

Potential improvements:
1. **Real Payment Integration**: Connect to Stripe/PayPal for actual payments
2. **Payout Automation**: Automatic weekly/monthly payouts
3. **Email Notifications**: Notify drivers when earnings are created
4. **Earning Analytics**: Dashboard with earning trends and statistics
5. **Supabase Realtime**: Live earning updates via WebSocket

## Supabase MCP Tool (Optional)

The Supabase MCP tool can help with:
- Running migrations directly
- Querying earning records
- Managing database schema
- Generating TypeScript types

**To enable:**
1. Go to project settings
2. Enable Supabase MCP tool
3. Connect to your Supabase project

However, the current implementation works perfectly with the existing Supabase client!
