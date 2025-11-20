import { RouteStop, RouteSegment } from '../../types';

export interface RouteTimingResult {
  stops: RouteStop[];
  totalDuration: number; // seconds
}

/**
 * Calculate ETA for each stop based on routing segments
 * @param baseStops - Initial stops with locations and start time
 * @param segments - Route segments with duration data from map API
 * @param startTime - Starting time in HH:MM format
 * @returns Updated stops with estimated arrival times
 */
export const calculateStopTimings = (
  baseStops: Omit<RouteStop, 'estimatedArrival'>[],
  segments: RouteSegment[],
  startTime: string
): RouteTimingResult => {
  if (baseStops.length === 0) {
    return { stops: [], totalDuration: 0 };
  }

  const stops: RouteStop[] = [];
  let cumulativeDuration = 0;

  // Parse start time - use current date in user's local timezone
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startDate = new Date();
  // Reset to midnight in local timezone
  startDate.setHours(0, 0, 0, 0);
  // Add the specified hours and minutes in local timezone
  startDate.setHours(startHour, startMinute, 0, 0);

  baseStops.forEach((stop, index) => {
    if (index === 0) {
      // First stop - use start time with seconds for consistency
      stops.push({
        ...stop,
        estimatedArrival: `${startTime}:00`,
      });
    } else {
      // Find segment from previous stop to current stop
      const previousStopId = baseStops[index - 1].id;
      const currentStopId = stop.id;
      const segment = segments.find(
        (seg) => seg.fromStopId === previousStopId && seg.toStopId === currentStopId
      );

      if (segment) {
        cumulativeDuration += segment.duration;
        
        // Calculate arrival time in local timezone
        const arrivalDate = new Date(startDate.getTime() + cumulativeDuration * 1000);
        // Format time in local timezone (HH:MM:SS for consistency with database)
        const arrivalTime = `${arrivalDate.getHours().toString().padStart(2, '0')}:${arrivalDate
          .getMinutes()
          .toString()
          .padStart(2, '0')}:00`;

        stops.push({
          ...stop,
          estimatedArrival: arrivalTime,
        });
      } else {
        // Fallback if segment not found
        stops.push({
          ...stop,
          estimatedArrival: 'TBD',
        });
      }
    }
  });

  return {
    stops,
    totalDuration: cumulativeDuration,
  };
};

/**
 * Format duration in seconds to human-readable string
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Calculate segment price based on distance ratio
 * @param segmentDistance - Distance of the segment in meters
 * @param fullRouteDistance - Total route distance in meters
 * @param fullRoutePrice - Driver's price for the full route
 * @param minimumPrice - Minimum price to charge (default $2)
 * @returns Calculated segment price
 */
export const calculateSegmentPrice = (
  segmentDistance: number,
  fullRouteDistance: number,
  fullRoutePrice: number,
  minimumPrice: number = 2
): number => {
  if (fullRouteDistance === 0) return minimumPrice;
  
  const ratio = segmentDistance / fullRouteDistance;
  const calculatedPrice = fullRoutePrice * ratio;
  
  // Round to 2 decimal places and enforce minimum
  return Math.max(Math.round(calculatedPrice * 100) / 100, minimumPrice);
};
