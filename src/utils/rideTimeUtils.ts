/**
 * Ride Time Utilities
 * Handles time-based logic for ride search and booking windows
 */

import { RouteStop } from '../types';

/**
 * Calculate hours until a given date/time
 */
export function getHoursUntil(targetDate: string, targetTime: string): number {
  const target = new Date(`${targetDate}T${targetTime}`);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Check if current time is before the target time
 * Returns true if the ride/segment hasn't started yet (still bookable)
 * 
 * IMPORTANT: Removed 12-hour window restriction - bookings allowed until ride starts
 */
export function isWithin12HourWindow(targetDate: string, targetTime: string): boolean {
  const hoursUntil = getHoursUntil(targetDate, targetTime);
  // Allow booking as long as ride hasn't started yet
  return hoursUntil >= 0;
}

/**
 * Check if current time is before or at the stop time
 * Returns true if we haven't passed the stop time yet
 */
export function isBeforeStopTime(rideDate: string, stopTime: string): boolean {
  const stopDateTime = new Date(`${rideDate}T${stopTime}`);
  const now = new Date();
  return now <= stopDateTime;
}

/**
 * Check if a ride segment is available for booking
 * A segment is available if current time is before the segment START time
 * 
 * IMPORTANT: Users can book until the segment actually starts, not 12 hours before
 */
export function isSegmentAvailableForBooking(
  rideDate: string,
  segmentStartTime: string,
  segmentEndTime: string
): boolean {
  // Allow booking as long as segment hasn't started yet
  // Check if current time is before segment start time
  return isWithin12HourWindow(rideDate, segmentStartTime);
}

/**
 * Get the effective booking deadline for a segment
 * Returns the later of: segment end time OR 12 hours before segment start time
 */
export function getSegmentBookingDeadline(
  rideDate: string,
  segmentStartTime: string,
  segmentEndTime: string
): Date {
  const segmentEnd = new Date(`${rideDate}T${segmentEndTime}`);
  const segmentStart = new Date(`${rideDate}T${segmentStartTime}`);
  
  // 12 hours before segment start
  const twelveHoursBefore = new Date(segmentStart.getTime() - (12 * 60 * 60 * 1000));
  
  // Return the later deadline
  return segmentEnd > twelveHoursBefore ? segmentEnd : twelveHoursBefore;
}

/**
 * Check if a booking request should be auto-cancelled
 * Returns true if the request is outside the valid booking window
 */
export function shouldCancelBookingRequest(
  requestDate: Date,
  rideDate: string,
  segmentStartTime: string
): boolean {
  const segmentStart = new Date(`${rideDate}T${segmentStartTime}`);
  const twelveHoursBefore = new Date(segmentStart.getTime() - (12 * 60 * 60 * 1000));
  
  // Cancel if request was made more than 12 hours before segment start
  return requestDate < twelveHoursBefore;
}

/**
 * Find matching segments between origin and destination in a route
 * Returns array of matching segment pairs with their times
 */
export interface SegmentMatch {
  fromStop: RouteStop;
  toStop: RouteStop;
  fromStopIndex: number;
  toStopIndex: number;
  segmentStartTime: string;
  segmentEndTime: string;
  isAvailable: boolean;
}

export function findMatchingSegments(
  originAddress: string,
  destinationAddress: string,
  fromLocation: { address: string },
  toLocation: { address: string },
  stops: RouteStop[],
  rideDate: string,
  rideTime: string
): SegmentMatch[] {
  const matches: SegmentMatch[] = [];
  
  // Build full route: origin → stops → destination
  const fullRoute: RouteStop[] = [
    {
      id: 'origin',
      name: fromLocation.address,
      address: fromLocation.address,
      lat: 0,
      lng: 0,
      time: rideTime,
      order: 0,
    },
    ...stops.map((stop, idx) => ({
      ...stop,
      order: idx + 1,
    })),
    {
      id: 'destination',
      name: toLocation.address,
      address: toLocation.address,
      lat: 0,
      lng: 0,
      time: '', // Will be estimated arrival
      order: stops.length + 1,
    },
  ];

  // Find origin and destination indices
  const originIndex = fullRoute.findIndex(stop => 
    stop.address?.toLowerCase().includes(originAddress.toLowerCase()) ||
    stop.name?.toLowerCase().includes(originAddress.toLowerCase())
  );

  const destIndex = fullRoute.findIndex(stop =>
    stop.address?.toLowerCase().includes(destinationAddress.toLowerCase()) ||
    stop.name?.toLowerCase().includes(destinationAddress.toLowerCase())
  );

  // Check if valid route (origin before destination)
  if (originIndex === -1 || destIndex === -1 || originIndex >= destIndex) {
    return [];
  }

  // Create segment match
  const fromStop = fullRoute[originIndex];
  const toStop = fullRoute[destIndex];
  
  const segmentStartTime = fromStop.time || rideTime;
  const segmentEndTime = toStop.estimatedArrival || toStop.time || '';
  
  const isAvailable = segmentEndTime
    ? isSegmentAvailableForBooking(rideDate, segmentStartTime, segmentEndTime)
    : isWithin12HourWindow(rideDate, segmentStartTime);

  matches.push({
    fromStop,
    toStop,
    fromStopIndex: originIndex,
    toStopIndex: destIndex,
    segmentStartTime,
    segmentEndTime,
    isAvailable,
  });

  return matches;
}

/**
 * Format hours until as human-readable string
 */
export function formatHoursUntil(hours: number): string {
  if (hours < 0) {
    return 'Departed';
  } else if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  } else if (hours < 24) {
    return `${Math.round(hours)} hr${Math.round(hours) !== 1 ? 's' : ''}`;
  } else {
    const days = Math.round(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
}
