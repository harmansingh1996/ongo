import { supabase, handleSupabaseError } from './supabaseClient';

/**
 * Location Tracking Service
 * Handles real-time GPS tracking for drivers and location updates for riders
 */

export interface LocationData {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: string;
}

export interface DriverLocation extends LocationData {
  id: string;
  driver_id: string;
  ride_id: string;
  created_at: string;
}

let watchId: number | null = null;
let currentRideId: string | null = null;
let updateInterval: NodeJS.Timeout | null = null;
let lastLocation: LocationData | null = null;
let wakeLock: any = null; // WakeLock API to keep screen on

/**
 * Start tracking driver's location
 */
export async function startTracking(
  rideId: string,
  driverId: string,
  updateFrequency: number = 5000 // Update every 5 seconds
): Promise<boolean> {
  try {
    console.log(`[LocationService] Starting tracking for ride: ${rideId}`);
    
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      console.error('[LocationService] Geolocation not supported');
      alert('GPS location tracking is not supported on this device');
      return false;
    }

    // Request permission first
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (result.state === 'denied') {
        alert('Location permission denied. Please enable location access in your device settings.');
        return false;
      }
    } catch (e) {
      console.warn('[LocationService] Permission API not supported, will prompt for location access');
    }

    currentRideId = rideId;

    // Request WakeLock to keep screen on during tracking (prevents device sleep)
    // Gracefully handle iframe Feature-Policy restrictions
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        console.log('[LocationService] Screen WakeLock acquired - screen will stay on');
        
        // Re-acquire wake lock if visibility changes (user comes back to app)
        const handleVisibilityChange = async () => {
          if (wakeLock !== null && document.visibilityState === 'visible') {
            try {
              wakeLock = await (navigator as any).wakeLock.request('screen');
              console.log('[LocationService] WakeLock re-acquired after visibility change');
            } catch (e) {
              console.warn('[LocationService] WakeLock re-acquire failed, continuing without WakeLock');
            }
          }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        wakeLock.addEventListener('release', () => {
          console.log('[LocationService] WakeLock released');
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        });
      } else {
        console.warn('[LocationService] WakeLock API not supported - device may sleep during tracking');
      }
    } catch (err: any) {
      // Handle Feature-Policy restrictions gracefully (common in iframes)
      if (err?.name === 'NotAllowedError') {
        console.warn('[LocationService] WakeLock not allowed by Feature-Policy (iframe restriction) - tracking will continue without screen wake lock');
      } else {
        console.warn('[LocationService] WakeLock request failed:', err?.message || err, '- tracking will continue without screen wake lock');
      }
      // Continue tracking even without WakeLock - geolocation still works
      wakeLock = null;
    }

    // Start watching position
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading || undefined,
          speed: position.coords.speed ? position.coords.speed * 3.6 : undefined, // Convert m/s to km/h
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
        };

        lastLocation = locationData;
        console.log('[LocationService] Location updated:', locationData);
      },
      (error) => {
        console.error('[LocationService] Geolocation error:', error);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert('Location permission denied. Please enable location access to track your ride.');
            stopTracking();
            break;
          case error.POSITION_UNAVAILABLE:
            console.warn('[LocationService] Location information unavailable');
            break;
          case error.TIMEOUT:
            console.warn('[LocationService] Location request timed out');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // Set up interval to save location to database
    updateInterval = setInterval(async () => {
      if (lastLocation && currentRideId) {
        await saveLocationToDatabase(currentRideId, driverId, lastLocation);
      }
    }, updateFrequency);

    console.log('[LocationService] Tracking started successfully');
    return true;
  } catch (error) {
    console.error('[LocationService] Error starting tracking:', error);
    return false;
  }
}

/**
 * Stop tracking driver's location
 */
export function stopTracking(): void {
  console.log('[LocationService] Stopping tracking');
  
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  // Release wake lock
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      console.log('[LocationService] WakeLock released');
      wakeLock = null;
    }).catch((err: any) => {
      console.error('[LocationService] WakeLock release failed:', err);
    });
  }

  currentRideId = null;
  lastLocation = null;
  
  console.log('[LocationService] Tracking stopped');
}

/**
 * Save current location to database
 */
async function saveLocationToDatabase(
  rideId: string,
  driverId: string,
  location: LocationData
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('driver_locations')
      .insert({
        ride_id: rideId,
        driver_id: driverId,
        lat: location.lat,
        lng: location.lng,
        heading: location.heading,
        speed: location.speed,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
      });

    if (error) {
      console.error('[LocationService] Error saving location:', error);
      handleSupabaseError(error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[LocationService] Error saving location:', error);
    return false;
  }
}

/**
 * Get latest driver location for a ride
 */
export async function getLatestDriverLocation(rideId: string): Promise<DriverLocation | null> {
  try {
    const { data, error } = await supabase
      .from('driver_locations')
      .select('*')
      .eq('ride_id', rideId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // Not found error is ok
        handleSupabaseError(error);
      }
      return null;
    }

    return data;
  } catch (error) {
    console.error('[LocationService] Error getting latest location:', error);
    return null;
  }
}

/**
 * Subscribe to driver location updates in real-time
 */
export function subscribeToDriverLocation(
  rideId: string,
  onLocationUpdate: (location: DriverLocation) => void
): { unsubscribe: () => void } {
  console.log(`[LocationService] Subscribing to ride location: ${rideId}`);

  const channel = supabase
    .channel(`driver-location-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'driver_locations',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        console.log('[LocationService] Location update received:', payload.new);
        onLocationUpdate(payload.new as DriverLocation);
      }
    )
    .subscribe((status) => {
      console.log('[LocationService] Subscription status:', status);
    });

  return {
    unsubscribe: () => {
      console.log('[LocationService] Unsubscribing from location updates');
      channel.unsubscribe();
    },
  };
}

/**
 * Calculate distance between two points (Haversine formula)
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate estimated time of arrival (ETA)
 * Returns ETA in minutes based on distance and average speed
 */
export function calculateETA(
  distanceKm: number,
  avgSpeedKmh: number = 50 // Default average speed
): number {
  if (avgSpeedKmh <= 0) return 0;
  return Math.round((distanceKm / avgSpeedKmh) * 60); // Convert hours to minutes
}

/**
 * Get current tracking status
 */
export function isTracking(): boolean {
  return watchId !== null;
}

/**
 * Get current ride ID being tracked
 */
export function getCurrentRideId(): string | null {
  return currentRideId;
}

/**
 * Get last known location (for emergency/SOS purposes)
 */
export function getLastKnownLocation(): LocationData | null {
  return lastLocation;
}

/**
 * Start real-time location tracking for SOS emergency
 * Updates location continuously without database saves
 */
export function startSOSTracking(
  onLocationUpdate: (location: LocationData) => void,
  updateFrequency: number = 2000 // Update every 2 seconds for emergency
): { stopTracking: () => void } {
  console.log('[LocationService] Starting SOS real-time tracking');
  
  let sosWatchId: number | null = null;
  let sosUpdateInterval: NodeJS.Timeout | null = null;
  let sosLastLocation: LocationData | null = null;

  // Start watching position with high accuracy
  sosWatchId = navigator.geolocation.watchPosition(
    (position) => {
      sosLastLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: position.coords.heading || undefined,
        speed: position.coords.speed ? position.coords.speed * 3.6 : undefined,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
      };
      console.log('[LocationService] SOS location updated:', sosLastLocation);
    },
    (error) => {
      console.error('[LocationService] SOS geolocation error:', error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );

  // Set up interval to call update callback
  sosUpdateInterval = setInterval(() => {
    if (sosLastLocation) {
      onLocationUpdate(sosLastLocation);
    }
  }, updateFrequency);

  return {
    stopTracking: () => {
      console.log('[LocationService] Stopping SOS tracking');
      if (sosWatchId !== null) {
        navigator.geolocation.clearWatch(sosWatchId);
      }
      if (sosUpdateInterval) {
        clearInterval(sosUpdateInterval);
      }
    },
  };
}
