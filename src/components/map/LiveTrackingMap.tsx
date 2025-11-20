import { useEffect, useRef, useState } from 'react';
import { Navigation, Clock, MapPin } from 'lucide-react';
import { DriverLocation, subscribeToDriverLocation, getLatestDriverLocation, calculateDistance, calculateETA } from '../../services/locationService';
import { getRideById } from '../../services/rideService';

interface LiveTrackingMapProps {
  rideId: string;
  pickupLocation: { lat: number; lng: number; address: string };
  dropoffLocation: { lat: number; lng: number; address: string };
  role: 'driver' | 'rider';
  onLocationUpdate?: (location: DriverLocation) => void;
  passengerPickups?: Array<{ lat: number; lng: number; address: string; passengerId: string; passengerName: string }>;
}

interface RouteStop {
  id: string;
  ride_id: string;
  name: string;
  lat: number;
  lng: number;
  stop_order: number;
  estimated_arrival?: string;
}

const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || '';

export default function LiveTrackingMap({
  rideId,
  pickupLocation,
  dropoffLocation,
  role,
  onLocationUpdate,
  passengerPickups = []
}: LiveTrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<boolean>(false);
  
  // Smart route recalculation tracking
  const lastRouteCalcPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteCalcTimeRef = useRef<number>(0);
  const lastRouteCalcHeadingRef = useRef<number | null>(null);
  
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [eta, setETA] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [rideStops, setRideStops] = useState<RouteStop[]>([]);
  const [fetchingStops, setFetchingStops] = useState(false);

  // Fetch ride stops from database
  useEffect(() => {
    const fetchRideStops = async () => {
      setFetchingStops(true);
      try {
        console.log('[LiveTrackingMap] Fetching ride stops for ride:', rideId);
        const ride = await getRideById(rideId);
        
        if (ride && ride.route_stops) {
          console.log('[LiveTrackingMap] Loaded', ride.route_stops.length, 'stops from database');
          setRideStops(ride.route_stops);
        } else {
          console.log('[LiveTrackingMap] No stops found for this ride');
          setRideStops([]);
        }
      } catch (error) {
        console.error('[LiveTrackingMap] Error fetching ride stops:', error);
        setRideStops([]);
      } finally {
        setFetchingStops(false);
      }
    };

    fetchRideStops();
  }, [rideId]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;

    // Load Mapbox GL JS dynamically
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.async = true;

    const link = document.createElement('link');
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
    link.rel = 'stylesheet';

    document.head.appendChild(link);
    document.head.appendChild(script);

    script.onload = () => {
      const mapboxgl = (window as any).mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      // Initialize map centered between pickup and dropoff
      const centerLat = (pickupLocation.lat + dropoffLocation.lat) / 2;
      const centerLng = (pickupLocation.lng + dropoffLocation.lng) / 2;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerLng, centerLat],
        zoom: 12,
      });

      // Add pickup marker
      new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat([pickupLocation.lng, pickupLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>Pickup</strong><br/>${pickupLocation.address}`))
        .addTo(mapRef.current);

      // Add dropoff marker
      new mapboxgl.Marker({ color: '#ef4444' })
        .setLngLat([dropoffLocation.lng, dropoffLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>Dropoff</strong><br/>${dropoffLocation.address}`))
        .addTo(mapRef.current);

      // Add passenger pickup markers if provided
      if (passengerPickups.length > 0) {
        passengerPickups.forEach((pickup, index) => {
          const el = document.createElement('div');
          el.className = 'passenger-marker';
          el.style.width = '32px';
          el.style.height = '32px';
          el.style.backgroundColor = '#f59e0b';
          el.style.color = 'white';
          el.style.borderRadius = '50%';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.fontWeight = 'bold';
          el.style.fontSize = '14px';
          el.style.border = '3px solid white';
          el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          el.textContent = String(index + 1);

          new mapboxgl.Marker({ element: el })
            .setLngLat([pickup.lng, pickup.lat])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${pickup.passengerName}</strong><br/>${pickup.address}`))
            .addTo(mapRef.current);
        });
      }

      // Add route stop markers from database (if not already shown as passenger pickups)
      // These are the waypoints/stops defined when creating the ride
      if (rideStops.length > 0) {
        rideStops.forEach((stop, index) => {
          // Skip if this stop is already shown as a passenger pickup
          const isAlreadyShown = passengerPickups.some(p => 
            Math.abs(p.lat - stop.lat) < 0.0001 && Math.abs(p.lng - stop.lng) < 0.0001
          );
          
          if (!isAlreadyShown) {
            const el = document.createElement('div');
            el.className = 'route-stop-marker';
            el.style.width = '28px';
            el.style.height = '28px';
            el.style.backgroundColor = '#8b5cf6';
            el.style.color = 'white';
            el.style.borderRadius = '50%';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.fontWeight = 'bold';
            el.style.fontSize = '12px';
            el.style.border = '2px solid white';
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
            el.textContent = String(stop.stop_order + 1);

            new mapboxgl.Marker({ element: el })
              .setLngLat([stop.lng, stop.lat])
              .setPopup(new mapboxgl.Popup().setHTML(`<strong>Stop ${stop.stop_order + 1}</strong><br/>${stop.name}`))
              .addTo(mapRef.current);
          }
        });
      }

      // Create driver marker (will be positioned when location arrives)
      const el = document.createElement('div');
      el.className = 'driver-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.backgroundImage = 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzM0NjZmZiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjE1IiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0yMCAxMEwyNSAyMEgyMFYzMEwxNSAyMEgyMFYxMFoiIGZpbGw9IiMzNDY2ZmYiLz48L3N2Zz4=)';
      el.style.backgroundSize = 'cover';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([centerLng, centerLat])
        .addTo(mapRef.current);

      setLoading(false);
    };

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [pickupLocation, dropoffLocation]);

  // Smart route recalculation - only when needed
  useEffect(() => {
    if (!mapRef.current || loading || !driverLocation || fetchingStops) return;

    const shouldRecalculate = shouldRecalculateRoute(driverLocation);
    
    if (shouldRecalculate) {
      console.log('[LiveTrackingMap] Route recalculation triggered');
      fetchAndDisplayRoute();
      
      // Update tracking refs
      lastRouteCalcPositionRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
      lastRouteCalcTimeRef.current = Date.now();
      lastRouteCalcHeadingRef.current = driverLocation.heading || null;
    }
  }, [driverLocation, passengerPickups, rideStops, loading, fetchingStops]);

  // Initial route calculation for rider (stable route from pickup to destination)
  useEffect(() => {
    if (role === 'rider' && mapRef.current && !loading && !driverLocation && !fetchingStops) {
      // For riders, show static route from pickup to destination initially
      fetchAndDisplayRoute();
    }
  }, [role, loading, fetchingStops, rideStops]);

  /**
   * Determines if route should be recalculated based on smart triggers:
   * - Distance moved > 50-100m
   * - Heading changed significantly (> 30 degrees)
   * - Time elapsed > 10-20 seconds
   */
  const shouldRecalculateRoute = (currentLocation: DriverLocation): boolean => {
    // For riders, don't recalculate route (stable view)
    if (role === 'rider') return false;

    // First calculation always happens
    if (!lastRouteCalcPositionRef.current) return true;

    const now = Date.now();
    const timeSinceLastCalc = now - lastRouteCalcTimeRef.current;

    // Time-based trigger: recalculate every 15 seconds minimum
    if (timeSinceLastCalc >= 15000) {
      console.log('[Route Trigger] Time threshold reached: 15s');
      return true;
    }

    // Distance-based trigger: moved more than 75 meters
    const distanceMoved = calculateDistance(
      lastRouteCalcPositionRef.current.lat,
      lastRouteCalcPositionRef.current.lng,
      currentLocation.lat,
      currentLocation.lng
    );
    const distanceMovedMeters = distanceMoved * 1000;

    if (distanceMovedMeters >= 75) {
      console.log(`[Route Trigger] Distance threshold reached: ${distanceMovedMeters.toFixed(0)}m`);
      return true;
    }

    // Heading-based trigger: direction changed more than 30 degrees
    if (
      currentLocation.heading !== null &&
      currentLocation.heading !== undefined &&
      lastRouteCalcHeadingRef.current !== null
    ) {
      let headingDiff = Math.abs(currentLocation.heading - lastRouteCalcHeadingRef.current);
      // Handle circular nature of degrees (0° and 360° are the same)
      if (headingDiff > 180) {
        headingDiff = 360 - headingDiff;
      }

      if (headingDiff >= 30) {
        console.log(`[Route Trigger] Heading change threshold reached: ${headingDiff.toFixed(0)}°`);
        return true;
      }
    }

    return false;
  };

  // Function to fetch and display route using Mapbox Directions API
  const fetchAndDisplayRoute = async () => {
    if (!mapRef.current || !MAPBOX_TOKEN) return;

    setRouteLoading(true);

    try {
      // Build waypoints based on role:
      // - Driver: current GPS position -> pickups -> destination (dynamic)
      // - Rider: pickup location -> destination (stable)
      let waypoints: number[][];
      
      if (role === 'driver' && driverLocation) {
        // Driver view: dynamic route from current position
        waypoints = [
          [driverLocation.lng, driverLocation.lat],
          ...passengerPickups.map(p => [p.lng, p.lat]),
          // Add route stops from database (sorted by order)
          ...(rideStops || []).sort((a, b) => a.stop_order - b.stop_order).map(s => [s.lng, s.lat]),
          [dropoffLocation.lng, dropoffLocation.lat]
        ];
      } else {
        // Rider view: stable route from pickup to destination
        waypoints = [
          [pickupLocation.lng, pickupLocation.lat],
          ...passengerPickups.map(p => [p.lng, p.lat]),
          // Add route stops from database (sorted by order)
          ...(rideStops || []).sort((a, b) => a.stop_order - b.stop_order).map(s => [s.lng, s.lat]),
          [dropoffLocation.lng, dropoffLocation.lat]
        ];
      }

      const coordinates = waypoints.map(w => `${w[0]},${w[1]}`).join(';');
      
      const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}&overview=full&steps=true`;

      const response = await fetch(directionsUrl);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;

        // Remove existing route layer if any
        if (routeLayerRef.current && mapRef.current.getLayer('route')) {
          mapRef.current.removeLayer('route');
          mapRef.current.removeSource('route');
          routeLayerRef.current = false;
        }

        // Add route layer
        mapRef.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: route
          }
        });

        mapRef.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 5,
            'line-opacity': 0.75
          }
        });

        routeLayerRef.current = true;

        // Fit map to show entire route
        const coordinates_list = route.coordinates;
        const bounds = coordinates_list.reduce((bounds: any, coord: any) => {
          return bounds.extend(coord);
        }, new (window as any).mapboxgl.LngLatBounds(coordinates_list[0], coordinates_list[0]));

        mapRef.current.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 40, right: 40 }
        });
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    } finally {
      setRouteLoading(false);
    }
  };

  // Subscribe to location updates (rider) or fetch initial location
  useEffect(() => {
    if (role === 'rider') {
      // Rider subscribes to real-time updates
      const subscription = subscribeToDriverLocation(rideId, (location) => {
        updateDriverPosition(location);
      });

      // Fetch latest location immediately
      getLatestDriverLocation(rideId).then((location) => {
        if (location) {
          updateDriverPosition(location);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Driver just shows their current position (updated by locationService)
      getLatestDriverLocation(rideId).then((location) => {
        if (location) {
          updateDriverPosition(location);
        }
      });

      // Poll for updates every 5 seconds for driver (in case tracking service updates)
      const interval = setInterval(async () => {
        const location = await getLatestDriverLocation(rideId);
        if (location) {
          updateDriverPosition(location);
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [rideId, role]);

  const updateDriverPosition = (location: DriverLocation) => {
    const previousLocation = driverLocation;
    setDriverLocation(location);

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLngLat([location.lng, location.lat]);

      // Rotate marker if heading is available
      if (location.heading !== null && location.heading !== undefined) {
        const el = driverMarkerRef.current.getElement();
        el.style.transform = `rotate(${location.heading}deg)`;
      }

      // Center map on driver for rider view
      if (role === 'rider' && mapRef.current) {
        mapRef.current.easeTo({
          center: [location.lng, location.lat],
          zoom: 14,
          duration: 1000,
        });
      }

      // Note: Route updates are now handled by the useEffect watching driverLocation
      // This prevents duplicate route calculations here
    }

    // Calculate distance and ETA to dropoff
    const dist = calculateDistance(
      location.lat,
      location.lng,
      dropoffLocation.lat,
      dropoffLocation.lng
    );
    setDistance(dist);

    const speed = location.speed || 50; // Use actual speed or default to 50 km/h
    setETA(calculateETA(dist, speed));

    // Callback
    if (onLocationUpdate) {
      onLocationUpdate(location);
    }
  };

  return (
    <div className="w-full h-full relative bg-gray-100 rounded-xl overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">Loading map...</p>
          </div>
        </div>
      )}

      {/* Route Loading Indicator */}
      {routeLoading && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Loading route...</span>
          </div>
        </div>
      )}

      {/* Info Overlay - Positioned at bottom to avoid hiding map */}
      {!loading && driverLocation && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-lg p-3">
          <div className="grid grid-cols-3 gap-2">
            {/* Distance */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xs text-gray-500">Distance</div>
              <div className="text-base font-bold text-gray-900">{distance.toFixed(1)} km</div>
            </div>

            {/* ETA */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Clock className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-xs text-gray-500">ETA</div>
              <div className="text-base font-bold text-gray-900">{eta} min</div>
            </div>

            {/* Speed */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Navigation className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xs text-gray-500">Speed</div>
              <div className="text-base font-bold text-gray-900">
                {driverLocation.speed ? Math.round(driverLocation.speed) : 0} km/h
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Location Message */}
      {!loading && !driverLocation && role === 'rider' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <div className="text-center px-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-3 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Waiting for driver location</h3>
            <p className="text-sm text-gray-600">The driver's location will appear here once they start the ride</p>
          </div>
        </div>
      )}
    </div>
  );
}
