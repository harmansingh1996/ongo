/**
 * Route Service
 * Handles real-time route calculations using Mapbox Directions API
 */

export interface RouteData {
  distance: number; // in kilometers
  duration: number; // in minutes
  eta: string; // formatted time (HH:MM)
  rawDistance: number; // in meters
  rawDuration: number; // in seconds
}

interface MapboxDirectionsResponse {
  routes?: Array<{
    distance: number; // meters
    duration: number; // seconds
  }>;
  code?: string;
  message?: string;
}

/**
 * Calculate route using Mapbox Directions API
 * @param pickupLat Pickup latitude
 * @param pickupLng Pickup longitude
 * @param dropoffLat Dropoff latitude
 * @param dropoffLng Dropoff longitude
 * @param mapboxToken Mapbox API token
 * @returns RouteData with distance, duration, and ETA
 */
export async function calculateRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  mapboxToken: string
): Promise<RouteData | null> {
  try {
    // Generate cache key
    const cacheKey = `route_${pickupLat}_${pickupLng}_${dropoffLat}_${dropoffLng}`;
    
    // Check sessionStorage cache
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        console.log('✅ Using cached route data');
        return cachedData;
      } catch (e) {
        console.warn('Failed to parse cached route data, fetching fresh data');
      }
    }

    // Build Mapbox Directions API URL
    const coordinates = `${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${mapboxToken}&geometries=geojson&overview=full`;

    console.log('🚗 Fetching route from Mapbox Directions API...');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Mapbox API error:', response.status, response.statusText);
      return null;
    }

    const data: MapboxDirectionsResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('No routes found:', data.message || 'Unknown error');
      return null;
    }

    const route = data.routes[0];
    
    // Convert meters to kilometers
    const distanceKm = route.distance / 1000;
    
    // Convert seconds to minutes
    const durationMin = Math.round(route.duration / 60);
    
    // Calculate ETA (current time + duration)
    const now = new Date();
    const etaDate = new Date(now.getTime() + route.duration * 1000);
    const eta = `${etaDate.getHours().toString().padStart(2, '0')}:${etaDate.getMinutes().toString().padStart(2, '0')}`;

    const routeData: RouteData = {
      distance: parseFloat(distanceKm.toFixed(1)),
      duration: durationMin,
      eta,
      rawDistance: route.distance,
      rawDuration: route.duration
    };

    // Cache the result
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(routeData));
      console.log('✅ Route data cached');
    } catch (e) {
      console.warn('Failed to cache route data:', e);
    }

    console.log('✅ Route calculated:', routeData);
    return routeData;

  } catch (error) {
    console.error('Error calculating route:', error);
    return null;
  }
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
 * Format duration for display
 */
export function formatDuration(durationMin: number): string {
  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Multi-stop route data interface
 */
export interface MultiStopRouteData {
  stops: Array<{
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    stop_order: number;
    cumulativeDuration: number; // seconds from start
    cumulativeDistance: number; // meters from start
    segmentDuration?: number; // seconds from previous stop
    segmentDistance?: number; // meters from previous stop
    eta: string; // formatted time (HH:MM:SS)
  }>;
  totalDistance: number; // kilometers
  totalDuration: number; // minutes
  routeGeometry?: any; // GeoJSON LineString for map display
}

/**
 * Calculate multi-stop route with cumulative ETAs
 * @param stops Array of stops with lat/lng coordinates
 * @param startTime Starting time (Date object or ISO string)
 * @param mapboxToken Mapbox API token
 * @returns MultiStopRouteData with cumulative distances and ETAs
 */
export async function calculateMultiStopRoute(
  stops: Array<{
    id: string;
    name?: string;
    address: string;
    lat: number;
    lng: number;
    stop_order: number;
  }>,
  startTime: Date | string,
  mapboxToken: string
): Promise<MultiStopRouteData | null> {
  try {
    if (!stops || stops.length < 2) {
      console.error('At least 2 stops required for route calculation');
      return null;
    }

    // Sort stops by stop_order
    const sortedStops = [...stops].sort((a, b) => a.stop_order - b.stop_order);

    // Convert startTime to Date object
    const startDate = typeof startTime === 'string' ? new Date(startTime) : startTime;

    // Build Mapbox Directions API URL for all stops
    const coordinates = sortedStops.map(stop => `${stop.lng},${stop.lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${mapboxToken}&geometries=geojson&overview=full&steps=true`;

    console.log('🚗 Fetching multi-stop route from Mapbox Directions API...');
    console.log('Stops:', sortedStops.map(s => s.name || s.address));
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Mapbox API error:', response.status, response.statusText);
      return null;
    }

    const data: any = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('No routes found:', data.message || 'Unknown error');
      return null;
    }

    const route = data.routes[0];
    const legs = route.legs || [];

    // Calculate cumulative data for each stop
    const enrichedStops = sortedStops.map((stop, index) => {
      let cumulativeDuration = 0;
      let cumulativeDistance = 0;
      let segmentDuration = 0;
      let segmentDistance = 0;

      // Sum up all previous legs
      for (let i = 0; i < index && i < legs.length; i++) {
        cumulativeDuration += legs[i].duration;
        cumulativeDistance += legs[i].distance;
      }

      // Get segment data from previous stop
      if (index > 0 && legs[index - 1]) {
        segmentDuration = legs[index - 1].duration;
        segmentDistance = legs[index - 1].distance;
      }

      // Calculate ETA for this stop
      const etaDate = new Date(startDate.getTime() + cumulativeDuration * 1000);
      const hours = etaDate.getHours().toString().padStart(2, '0');
      const minutes = etaDate.getMinutes().toString().padStart(2, '0');
      const seconds = etaDate.getSeconds().toString().padStart(2, '0');
      const eta = `${hours}:${minutes}:${seconds}`;

      return {
        id: stop.id,
        name: stop.name || '',
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        stop_order: stop.stop_order,
        cumulativeDuration,
        cumulativeDistance,
        segmentDuration: index > 0 ? segmentDuration : undefined,
        segmentDistance: index > 0 ? segmentDistance : undefined,
        eta
      };
    });

    const totalDistance = route.distance / 1000; // Convert to km
    const totalDuration = Math.round(route.duration / 60); // Convert to minutes

    console.log('✅ Multi-stop route calculated:');
    console.log('  Total distance:', totalDistance.toFixed(1), 'km');
    console.log('  Total duration:', totalDuration, 'min');
    enrichedStops.forEach((stop, index) => {
      console.log(`  Stop ${index + 1}: ${stop.name || stop.address}`);
      console.log(`    ETA: ${stop.eta}`);
      if (stop.segmentDistance) {
        console.log(`    From previous: ${(stop.segmentDistance / 1000).toFixed(1)} km, ${Math.round(stop.segmentDuration! / 60)} min`);
      }
    });

    return {
      stops: enrichedStops,
      totalDistance,
      totalDuration,
      routeGeometry: route.geometry
    };

  } catch (error) {
    console.error('Error calculating multi-stop route:', error);
    return null;
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDurationSeconds(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Clear route cache (useful for debugging or manual refresh)
 */
export function clearRouteCache(): void {
  const keys = Object.keys(sessionStorage);
  const routeKeys = keys.filter(key => key.startsWith('route_'));
  routeKeys.forEach(key => sessionStorage.removeItem(key));
  console.log(`🗑️ Cleared ${routeKeys.length} cached routes`);
}
