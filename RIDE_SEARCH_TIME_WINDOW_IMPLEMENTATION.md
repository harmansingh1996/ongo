# Ride Search Time Window Implementation

## Overview

This document describes the implementation of time-based ride search logic and 12-hour booking window validation for the ride-sharing application.

## Business Requirements

### Scenario Example
Driver posts ride: **Kitchener (1:00 AM)** → **Woodstock (1:45 AM)** → **London (2:30 AM)**

### Search Logic Rules

1. **Segment-Based Search Availability**
   - Each stop is searchable until its scheduled time
   - Kitchener → searchable until 1:00 AM
   - Woodstock → searchable until 1:45 AM  
   - London → searchable until 2:30 AM
   - Ride segments remain searchable even if the ride has started (ongoing)

2. **12-Hour Booking Window**
   - Booking requests must be made within 12 hours before the ride/segment start time
   - Requests made more than 12 hours in advance are automatically rejected
   - Example: For a 1:00 AM ride, bookings accepted from 1:00 PM (previous day) onwards

3. **Combined Time Validation**
   - A segment is bookable if:
     - Current time ≤ segment end time (stop time), OR
     - Request is within 12 hours before segment start time

## Implementation

### 1. Time Utilities (`src/utils/rideTimeUtils.ts`)

Created comprehensive time validation utilities:

**Core Functions:**

```typescript
// Calculate hours until a specific date/time
getHoursUntil(targetDate: string, targetTime: string): number

// Check if within 12-hour booking window
isWithin12HourWindow(targetDate: string, targetTime: string): boolean

// Check if current time is before stop time
isBeforeStopTime(rideDate: string, stopTime: string): boolean

// Validate if segment is available for booking
isSegmentAvailableForBooking(
  rideDate: string,
  segmentStartTime: string,
  segmentEndTime: string
): boolean

// Check if booking should be auto-cancelled
shouldCancelBookingRequest(
  requestDate: Date,
  rideDate: string,
  segmentStartTime: string
): boolean

// Find matching segments with availability check
findMatchingSegments(
  originAddress: string,
  destinationAddress: string,
  fromLocation: object,
  toLocation: object,
  stops: RouteStop[],
  rideDate: string,
  rideTime: string
): SegmentMatch[]
```

**SegmentMatch Interface:**
```typescript
interface SegmentMatch {
  fromStop: RouteStop;
  toStop: RouteStop;
  fromStopIndex: number;
  toStopIndex: number;
  segmentStartTime: string;
  segmentEndTime: string;
  isAvailable: boolean; // Based on time window validation
}
```

### 2. Enhanced Ride Search (`src/services/rideService.ts`)

**Updated `searchAvailableRides` function:**

- Added time window validation to search results
- Filters out rides/segments outside booking window
- Returns availability status and booking window messages

**New Parameters:**
```typescript
{
  fromAddress?: string;  // For segment matching
  toAddress?: string;    // For segment matching
  // ... existing params
}
```

**Return Data Enhancement:**
```typescript
{
  ...ride,
  matchedSegment: RideSegment,
  isWithinBookingWindow: boolean,
  bookingWindowMessage: string,  // e.g., "Book within 8 hours"
  segmentStartTime: string,
  segmentEndTime: string,
}
```

### 3. Booking Validation (`src/services/bookingService.ts`)

**Updated `createBooking` function:**

- Added 12-hour window validation before creating booking
- Rejects requests outside valid booking window
- Provides clear error messages

**New Parameters:**
```typescript
createBooking(
  bookingData: CreateBookingData,
  rideDate?: string,     // For time validation
  rideTime?: string      // For time validation
): Promise<string | null>
```

**Validation Flow:**
1. Check if booking request is within 12-hour window
2. Reject with error if outside window
3. Proceed with booking creation if valid

### 4. Route Utilities (`src/utils/routeUtils.ts`)

Created helper utilities for distance calculations and route processing:

- `calculateDistance()` - Haversine formula for geographic distance
- `isWithinProximity()` - Check if locations are close enough
- `findClosestStopIndex()` - Find nearest stop to coordinates
- `formatDistance()` - Human-readable distance formatting
- `formatDuration()` - Time duration formatting
- `calculateArrivalTime()` - Estimate arrival times

## Database Schema

### Existing Tables Used

**rides table:**
- `date` (DATE) - Ride date
- `time` (TIME) - Ride start time
- `estimated_arrival` (TIME) - Final destination arrival time

**route_stops table:**
- `ride_id` (UUID) - Reference to ride
- `stop_order` (INTEGER) - Stop sequence
- `estimated_arrival` (TIME) - Stop arrival time
- `address`, `lat`, `lng` - Location data

**ride_requests table:**
- `request_date` (TIMESTAMP) - When booking was requested
- `pickup_location`, `dropoff_location` (JSONB) - Segment endpoints

## Usage Examples

### Example 1: Search Available Rides

```typescript
const rides = await searchAvailableRides({
  fromLat: 43.4493,
  fromLng: -80.4877,
  toLat: 42.9849,
  toLng: -81.2453,
  fromAddress: 'Kitchener',
  toAddress: 'London',
  date: '2025-11-20',
  seats: 2
});

// Returns only rides with segments available within booking window
// Automatically filters out expired segments
```

### Example 2: Create Booking with Validation

```typescript
const bookingId = await createBooking(
  {
    rideId: 'ride-uuid',
    passengerId: 'passenger-uuid',
    requestedSeats: 2,
    pickupLocation: { address: 'Kitchener', lat: 43.4493, lng: -80.4877 },
    dropoffLocation: { address: 'Woodstock', lat: 43.1315, lng: -80.7567 },
  },
  '2025-11-20',  // ride date
  '01:00:00'     // segment start time
);

// Throws error if booking is outside 12-hour window
```

### Example 3: Check Segment Availability

```typescript
// For Kitchener (1:00 AM) → Woodstock (1:45 AM) segment
const isAvailable = isSegmentAvailableForBooking(
  '2025-11-20',    // ride date
  '01:00:00',      // segment start time (Kitchener)
  '01:45:00'       // segment end time (Woodstock)
);

// Returns true if:
// - Current time <= 1:45 AM on Nov 20, OR
// - Current time >= 1:00 PM on Nov 19 (12 hours before)
```

## Time Window Logic Flow

```
┌─────────────────────────────────────────────────┐
│ User searches for ride: A → B                   │
└────────────────┬────────────────────────────────┘
                 ▼
┌─────────────────────────────────────────────────┐
│ Find rides with matching segments               │
│ (A appears before B in route)                   │
└────────────────┬────────────────────────────────┘
                 ▼
┌─────────────────────────────────────────────────┐
│ For each matching segment:                      │
│                                                  │
│ 1. Get segment start time (departure from A)    │
│ 2. Get segment end time (arrival at B)          │
└────────────────┬────────────────────────────────┘
                 ▼
┌─────────────────────────────────────────────────┐
│ TIME VALIDATION CHECKS:                         │
│                                                  │
│ Check 1: Is current time <= segment end time?   │
│   ✓ YES → Segment AVAILABLE                     │
│   ✗ NO  → Go to Check 2                         │
│                                                  │
│ Check 2: Is request within 12hrs before start?  │
│   ✓ YES → Segment AVAILABLE                     │
│   ✗ NO  → Segment UNAVAILABLE (filter out)      │
└────────────────┬────────────────────────────────┘
                 ▼
┌─────────────────────────────────────────────────┐
│ Return only AVAILABLE segments to user          │
└─────────────────────────────────────────────────┘
```

## Future Enhancements

### Recommended Additions

1. **Auto-Cancellation Cron Job**
   - Background process to automatically cancel requests outside 12-hour window
   - Run every hour to clean up expired booking requests

2. **Real-time Availability Updates**
   - WebSocket or polling to update search results as time windows close
   - Notify users when their viewed ride becomes unavailable

3. **Configurable Time Windows**
   - Make 12-hour window configurable per ride or system-wide
   - Allow drivers to set custom booking deadlines

4. **Time Zone Support**
   - Handle rides crossing time zones
   - Normalize all times to UTC in database
   - Display in user's local time zone

5. **Booking Deadline Warnings**
   - Show countdown timer for booking deadline
   - Send notifications when deadline approaches

## Testing Checklist

- [ ] Segment searchable until stop time
- [ ] Segment searchable within 12 hours before start
- [ ] Segment not searchable after end time AND outside 12-hour window
- [ ] Booking rejected if request > 12 hours before start
- [ ] Ongoing rides still show available segments
- [ ] Multiple segments in same ride validated independently
- [ ] Edge cases: midnight crossings, same-day rides

## Migration Notes

**No database migrations required** - implementation uses existing schema:
- `rides.date` + `rides.time` for ride start
- `route_stops.estimated_arrival` for stop times
- `ride_requests.request_date` for booking timestamp

All logic is application-level, making it easy to adjust time windows without schema changes.
