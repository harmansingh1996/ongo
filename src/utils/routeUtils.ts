/**
 * Route Utilities
 * Helper functions for route calculations and segment matching
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Check if a location is within proximity threshold of another location
 */
export function isWithinProximity(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  thresholdKm: number = 50
): boolean {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return distance <= thresholdKm;
}

/**
 * Find the index of the closest stop to given coordinates
 */
export function findClosestStopIndex(
  targetLat: number,
  targetLng: number,
  stops: Array<{ lat: number; lng: number }>,
  maxDistanceKm: number = 50
): number {
  let closestIndex = -1;
  let minDistance = Infinity;

  stops.forEach((stop, index) => {
    const distance = calculateDistance(targetLat, targetLng, stop.lat, stop.lng);
    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Format duration for display (in seconds)
 */
export function formatDuration(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Calculate estimated arrival time
 */
export function calculateArrivalTime(
  startTime: string,
  durationSeconds: number
): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  
  const arrivalDate = new Date(startDate.getTime() + durationSeconds * 1000);
  
  const arrivalHours = arrivalDate.getHours().toString().padStart(2, '0');
  const arrivalMinutes = arrivalDate.getMinutes().toString().padStart(2, '0');
  
  return `${arrivalHours}:${arrivalMinutes}`;
}

/**
 * Get segment distance between two stops from route data
 * @param routeData Multi-stop route data from Mapbox
 * @param fromAddress Address/name of start stop
 * @param toAddress Address/name of end stop
 * @returns Distance in kilometers, or null if not found
 */
export function getSegmentDistance(
  routeData: any,
  fromAddress: string,
  toAddress: string
): number | null {
  if (!routeData || !routeData.stops || routeData.stops.length < 2) {
    return null;
  }

  // Find from and to stop indices
  const fromIndex = routeData.stops.findIndex(
    (stop: any) => stop.address === fromAddress || stop.name === fromAddress
  );
  const toIndex = routeData.stops.findIndex(
    (stop: any) => stop.address === toAddress || stop.name === toAddress
  );

  if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
    return null;
  }

  // Calculate cumulative distance between the two stops
  const fromCumulative = routeData.stops[fromIndex].cumulativeDistance || 0;
  const toCumulative = routeData.stops[toIndex].cumulativeDistance || 0;
  
  // Convert from meters to kilometers
  const segmentDistanceKm = (toCumulative - fromCumulative) / 1000;
  
  return segmentDistanceKm;
}
