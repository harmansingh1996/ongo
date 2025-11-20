# Driver Review System - Complete Guide

## Overview

The driver review system allows passengers to rate and review drivers after completing a ride. The system is fully integrated with Supabase for real-time data synchronization and automatic rating updates.

---

## System Architecture

### Database Schema

**reviews table:**
```sql
- id (uuid) - Primary key
- reviewer_id (uuid) - Passenger who left the review
- reviewed_user_id (uuid) - Driver being reviewed
- ride_id (uuid) - Related ride
- rating (integer) - Star rating (1-5)
- comment (text) - Optional review comment
- created_at (timestamp) - Review creation time
- updated_at (timestamp) - Last update time
```

**profiles table (relevant fields):**
```sql
- id (uuid)
- rating (numeric) - Average rating (auto-calculated)
- total_trips (integer) - Total completed trips
```

### Components

**1. RatingModal Component** (`src/components/rating/RatingModal.tsx`)
- Interactive star rating interface
- Comment input field
- Haptic feedback on interactions
- Mobile-optimized design with safe area support

**2. RatingBadge Component** (`src/components/rating/RatingBadge.tsx`)
- Displays user rating with star icon
- Shows review count
- Used in profile cards and lists

**3. Rating Service** (`src/services/ratingService.ts`)
- Supabase integration for CRUD operations
- Automatic rating calculation and profile updates
- Review validation and duplicate prevention

---

## Review Flow

### 1. Ride Completion Detection

When a ride is completed:
```typescript
// In RiderTrips.tsx
const checkForUnratedRides = async (userId: string, bookingsData: any[]) => {
  // Find completed accepted rides
  const completedRides = bookingsData.filter(
    (b) => b.status === 'accepted' && b.ride?.status === 'completed'
  );

  // Check each ride for existing review
  for (const booking of completedRides) {
    const alreadyReviewed = await hasUserReviewedForRide(
      userId,
      booking.ride.driver_id,
      booking.ride_id
    );

    if (!alreadyReviewed) {
      // Show rating modal for first unrated ride
      setRatingBooking(booking);
      setShowRatingModal(true);
      break;
    }
  }
};
```

### 2. Rating Modal Display

The modal shows automatically:
- **Trigger**: User navigates to "My Trips" page after ride completion
- **Display**: Modal appears over the trip list
- **Content**: Driver info, star rating, comment field
- **Actions**: Submit or skip

```typescript
<RatingModal
  isOpen={showRatingModal}
  onClose={() => setShowRatingModal(false)}
  onSubmit={handleSubmitRating}
  userName={ratingBooking?.ride?.driver?.name || 'Driver'}
  userImage={ratingBooking?.ride?.driver?.profile_image}
  userType="driver"
/>
```

### 3. Review Submission

When user submits:
```typescript
const handleSubmitRating = async (rating: number, comment: string) => {
  const success = await createReview(user.id, {
    reviewed_user_id: ratingBooking.ride.driver_id,
    ride_id: ratingBooking.ride_id,
    rating,
    comment,
  });

  if (success) {
    // Check for more unrated rides
    await checkForUnratedRides(user.id, bookings);
  }
};
```

### 4. Database Updates

The review service performs:

**a) Insert Review:**
```sql
INSERT INTO reviews (
  reviewer_id,
  reviewed_user_id,
  ride_id,
  rating,
  comment
) VALUES (...)
```

**b) Calculate New Average:**
```sql
SELECT AVG(rating) 
FROM reviews 
WHERE reviewed_user_id = ?
```

**c) Update Driver Profile:**
```sql
UPDATE profiles 
SET rating = ? 
WHERE id = ?
```

---

## API Functions

### `createReview(reviewerId, reviewData)`
Creates a new review and updates driver rating.

**Parameters:**
```typescript
{
  reviewed_user_id: string,  // Driver ID
  ride_id: string | null,     // Ride ID
  rating: number,             // 1-5 stars
  comment?: string            // Optional comment
}
```

**Returns:** `Review | null`

**Example:**
```typescript
const review = await createReview(passengerId, {
  reviewed_user_id: driverId,
  ride_id: rideId,
  rating: 5,
  comment: 'Great driver, very friendly!',
});
```

---

### `getReviewsForUser(userId)`
Fetches all reviews received by a user.

**Returns:** `Review[]` with reviewer information

**Example:**
```typescript
const driverReviews = await getReviewsForUser(driverId);
// Returns reviews with nested reviewer profile data
```

---

### `getReviewsByUser(userId)`
Fetches all reviews written by a user.

**Returns:** `Review[]` with reviewed user information

---

### `getUserAverageRating(userId)`
Calculates average rating for a user.

**Returns:** `number` (0.00 - 5.00)

**Default:** Returns 5.0 if no reviews exist

---

### `hasUserReviewedForRide(reviewerId, reviewedUserId, rideId)`
Checks if a review already exists for a specific ride.

**Returns:** `boolean`

**Usage:** Prevent duplicate reviews

---

### `updateReview(reviewId, reviewerId, updateData)`
Updates an existing review.

**Parameters:**
```typescript
{
  rating?: number,
  comment?: string
}
```

**Returns:** `boolean` (success)

---

### `deleteReview(reviewId, reviewerId)`
Deletes a review and recalculates driver rating.

**Returns:** `boolean` (success)

---

## User Experience Flow

### For Passengers:

1. **After Ride Completion:**
   - Navigate to "My Trips" page
   - Rating modal appears automatically for unrated rides
   - Can skip and rate later

2. **Rating Process:**
   - Tap stars to select rating (1-5)
   - See feedback text (Excellent, Great, Good, etc.)
   - Optionally add written comment (up to 500 characters)
   - Submit or skip

3. **Multiple Unrated Rides:**
   - System shows one modal at a time
   - After submitting, next unrated ride appears
   - Can skip all and rate later from trip history

4. **Viewing Reviews:**
   - See own submitted reviews in profile
   - View driver reviews on driver profile page
   - See rating badge on driver cards

### For Drivers:

1. **Receiving Reviews:**
   - Rating automatically updated in profile
   - New average displayed on profile badge
   - Review count incremented

2. **Viewing Reviews:**
   - Access "Ratings & Reviews" page
   - See all received reviews
   - View ratings with comments and reviewer info

---

## Mobile Optimizations

### Touch Interactions:
- **44px minimum touch targets** for stars
- **Haptic feedback** on star selection
- **Active states** instead of hover effects

### Safe Area Compliance:
```typescript
<div 
  style={{ 
    paddingBottom: 'env(safe-area-inset-bottom)' 
  }}
>
```

### Performance:
- **Lazy loading** of review data
- **Optimistic updates** for better UX
- **Batch rating calculations** for efficiency

---

## Testing Scenarios

### 1. Complete Ride Flow:
```
1. Passenger books ride
2. Driver accepts
3. Ride starts
4. Ride completes
5. Passenger opens "My Trips"
6. Rating modal appears automatically
7. Passenger submits 5-star review
8. Driver's rating updates immediately
```

### 2. Multiple Unrated Rides:
```
1. Passenger has 3 completed, unrated rides
2. Opens "My Trips"
3. First modal appears
4. Submits review
5. Second modal appears immediately
6. Can skip remaining
```

### 3. Already Reviewed:
```
1. Passenger already reviewed a driver
2. Taps completed ride card
3. NO modal appears
4. Navigates to ride detail instead
```

### 4. Skip and Return:
```
1. Passenger skips rating
2. Returns to "My Trips" later
3. Modal appears again for unrated ride
```

---

## Database Queries

### Get Driver's Average Rating:
```sql
SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
FROM reviews
WHERE reviewed_user_id = 'driver-uuid';
```

### Get Recent Reviews for Driver:
```sql
SELECT r.*, p.name, p.profile_image
FROM reviews r
JOIN profiles p ON r.reviewer_id = p.id
WHERE r.reviewed_user_id = 'driver-uuid'
ORDER BY r.created_at DESC
LIMIT 10;
```

### Check for Duplicate Review:
```sql
SELECT COUNT(*) 
FROM reviews 
WHERE reviewer_id = 'passenger-uuid'
  AND reviewed_user_id = 'driver-uuid'
  AND ride_id = 'ride-uuid';
```

---

## RLS (Row Level Security) Policies

The reviews table has the following RLS policies:

**1. Users can create reviews:**
```sql
CREATE POLICY "Users can create reviews"
ON reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reviewer_id);
```

**2. Users can view reviews:**
```sql
CREATE POLICY "Users can view reviews"
ON reviews FOR SELECT
TO authenticated
USING (
  auth.uid() = reviewer_id 
  OR auth.uid() = reviewed_user_id
);
```

**3. Users can update own reviews:**
```sql
CREATE POLICY "Users can update own reviews"
ON reviews FOR UPDATE
TO authenticated
USING (auth.uid() = reviewer_id);
```

**4. Users can delete own reviews:**
```sql
CREATE POLICY "Users can delete own reviews"
ON reviews FOR DELETE
TO authenticated
USING (auth.uid() = reviewer_id);
```

---

## Automatic Rating Updates

### Database Trigger:
```sql
CREATE OR REPLACE FUNCTION update_user_rating_on_review_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate new average
  UPDATE profiles
  SET rating = (
    SELECT COALESCE(AVG(rating), 5.0)
    FROM reviews
    WHERE reviewed_user_id = 
      CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.reviewed_user_id
        ELSE NEW.reviewed_user_id
      END
  )
  WHERE id = 
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.reviewed_user_id
      ELSE NEW.reviewed_user_id
    END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_review
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_user_rating_on_review_change();
```

---

## Error Handling

### Common Errors:

**1. User Not Authenticated:**
```typescript
Error: "User not authenticated"
Solution: Ensure user is logged in before allowing review submission
```

**2. Duplicate Review:**
```typescript
Error: "Review already exists for this ride"
Solution: Check hasUserReviewedForRide() before showing modal
```

**3. Invalid Rating:**
```typescript
Error: "Rating must be between 1 and 5"
Solution: Validate rating range in UI before submission
```

**4. Database Connection:**
```typescript
Error: "Failed to create review"
Solution: Check Supabase connection and RLS policies
```

---

## Future Enhancements

### Planned Features:
1. **Response to Reviews**: Drivers can respond to reviews
2. **Review Moderation**: Flag inappropriate reviews
3. **Review Categories**: Rate multiple aspects (Safety, Cleanliness, etc.)
4. **Review Analytics**: Driver performance dashboard
5. **Review Reminders**: Push notifications for unrated rides
6. **Photo Reviews**: Attach photos to reviews
7. **Review Sorting**: Filter by rating, date, verified rides

---

## Troubleshooting

### Modal Not Appearing:
```typescript
// Check conditions:
1. Ride status is 'completed'
2. Booking status is 'accepted'
3. Review doesn't already exist
4. User is logged in
```

### Rating Not Updating:
```typescript
// Verify:
1. Review successfully created in database
2. updateUserRating() function executed
3. Database trigger is active
4. RLS policies allow update
```

### Supabase Connection Issues:
```typescript
// Check:
1. VITE_SUPABASE_URL is correct
2. VITE_SUPABASE_ANON_KEY is valid
3. User has valid session token
4. Network connectivity
```

---

## Resources

- **Rating Modal Component**: `src/components/rating/RatingModal.tsx`
- **Rating Service**: `src/services/ratingService.ts`
- **Rider Trips Page**: `src/pages/rider/RiderTrips.tsx`
- **Database Schema**: Supabase Dashboard → Table Editor
- **RLS Policies**: Supabase Dashboard → Authentication → Policies
- **Supabase Docs**: https://supabase.com/docs

---

## Summary

✅ **Fully Functional**: Review system is connected to live Supabase data  
✅ **Automatic**: Modal appears after ride completion  
✅ **Real-time**: Driver ratings update immediately  
✅ **Secure**: Protected by RLS policies  
✅ **Mobile-Optimized**: Touch-friendly with haptic feedback  
✅ **Production-Ready**: Build successful, no errors  

The driver review system is complete and ready for production use!
