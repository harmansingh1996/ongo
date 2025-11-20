import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users, DollarSign, Star } from 'lucide-react';
import { searchAvailableRides } from '../../services/rideService';
import { formatTime } from '../../utils/timeUtils';
import { calculateMultiStopRoute, MultiStopRouteData } from '../../services/routeService';
import { getSegmentDistance } from '../../utils/routeUtils';

// Get Mapbox token from ywConfig
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || '';

export default function AvailableRidesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [availableRides, setAvailableRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeDataMap, setRouteDataMap] = useState<Map<string, MultiStopRouteData>>(new Map());
  const [calculatingRoutes, setCalculatingRoutes] = useState<Set<string>>(new Set());

  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const fromLat = searchParams.get('fromLat');
  const fromLng = searchParams.get('fromLng');
  const toLat = searchParams.get('toLat');
  const toLng = searchParams.get('toLng');
  const date = searchParams.get('date') || '';
  const passengers = searchParams.get('passengers') || '1';

  useEffect(() => {
    loadRides();
  }, [from, to, date, passengers, fromLat, fromLng, toLat, toLng]);

  const loadRides = async () => {
    setLoading(true);
    try {
      // Validate coordinates
      if (!fromLat || !fromLng || !toLat || !toLng) {
        console.error('Missing location coordinates');
        setAvailableRides([]);
        setLoading(false);
        return;
      }

      const searchDate = date || new Date().toISOString().split('T')[0];
      
      // DEBUG: Log search parameters
      console.log('🔍 SEARCH PARAMETERS:');
      console.log('From:', from, `(${fromLat}, ${fromLng})`);
      console.log('To:', to, `(${toLat}, ${toLng})`);
      console.log('Date:', searchDate);
      console.log('Passengers:', passengers);

      // Search rides using actual coordinates from user search
      const rides = await searchAvailableRides({
        fromLat: parseFloat(fromLat),
        fromLng: parseFloat(fromLng),
        toLat: parseFloat(toLat),
        toLng: parseFloat(toLng),
        date: searchDate,
        seats: parseInt(passengers),
      });
      
      console.log(`✅ Found ${rides.length} rides`);
      setAvailableRides(rides);
      
      // Calculate real-time routes for rides with multi-stop data
      if (MAPBOX_TOKEN) {
        calculateRoutesForRides(rides);
      }
    } catch (error) {
      console.error('Error loading rides:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate real-time routes for multi-stop rides
  const calculateRoutesForRides = async (rides: any[]) => {
    const newCalculating = new Set<string>();
    
    for (const ride of rides) {
      // Only calculate for multi-stop rides
      if (ride.route_stops && ride.route_stops.length >= 2) {
        newCalculating.add(ride.id);
      }
    }
    
    setCalculatingRoutes(newCalculating);
    
    // Calculate routes in parallel with Promise.all
    const routePromises = rides
      .filter(ride => ride.route_stops && ride.route_stops.length >= 2)
      .map(async (ride) => {
        try {
          const startTime = new Date(`${ride.date}T${ride.time}`);
          const multiRoute = await calculateMultiStopRoute(
            ride.route_stops,
            startTime,
            MAPBOX_TOKEN
          );
          
          if (multiRoute) {
            return { rideId: ride.id, routeData: multiRoute };
          }
        } catch (error) {
          console.warn(`Failed to calculate route for ride ${ride.id}:`, error);
        }
        return null;
      });
    
    const results = await Promise.all(routePromises);
    
    // Update route data map
    const newRouteDataMap = new Map(routeDataMap);
    results.forEach(result => {
      if (result) {
        newRouteDataMap.set(result.rideId, result.routeData);
      }
    });
    
    setRouteDataMap(newRouteDataMap);
    setCalculatingRoutes(new Set());
  };

  const handleRideClick = (ride: any) => {
    // Build URL with segment information if this is a segment booking
    const params = new URLSearchParams();
    
    if (ride.isSegmentBooking && ride.displayFrom && ride.displayTo) {
      // Pass segment-specific data
      params.set('from', ride.displayFrom.address || '');
      params.set('to', ride.displayTo.address || '');
      params.set('fromLat', ride.displayFrom.lat?.toString() || '');
      params.set('fromLng', ride.displayFrom.lng?.toString() || '');
      params.set('toLat', ride.displayTo.lat?.toString() || '');
      params.set('toLng', ride.displayTo.lng?.toString() || '');
      params.set('segmentPrice', ride.displayPrice?.toString() || '');
      params.set('segmentDistance', ride.displayDistance?.toString() || '');
    }
    
    const url = params.toString() 
      ? `/rider/ride-preview/${ride.id}?${params.toString()}`
      : `/rider/ride-preview/${ride.id}`;
    
    navigate(url);
  };

  const RideCard = ({ ride }: { ride: any }) => {
    // Use segment-specific data if available
    const displayFrom = ride.displayFrom || ride.from_location;
    const displayTo = ride.displayTo || ride.to_location;
    const displayPrice = ride.displayPrice || ride.price_per_seat;
    const displayDistance = ride.displayDistance || ride.distance;
    const isSegment = ride.isSegmentBooking || false;
    
    // Get real-time route data if available
    const routeData = routeDataMap.get(ride.id);
    const isCalculating = calculatingRoutes.has(ride.id);
    
    // Get segment start time - use estimated_arrival (snake_case from DB) for intermediate stops, time for origin
    const segmentStartTime = (displayFrom as any)?.estimated_arrival || displayFrom?.time || ride.time;
    
    // Find the actual ETA for displayTo location from route data
    let realTimeEta = null;
    if (routeData && displayTo?.address) {
      const matchingStop = routeData.stops.find(stop => 
        stop.address === displayTo.address || stop.name === displayTo.address
      );
      if (matchingStop) {
        realTimeEta = matchingStop.eta;
      } else {
        // Use last stop ETA if exact match not found
        realTimeEta = routeData.stops[routeData.stops.length - 1]?.eta;
      }
    }

    return (
      <div
        onClick={() => handleRideClick(ride)}
        className="bg-white rounded-xl shadow-md p-4 active:bg-gray-50 transition-colors"
      >
        {/* Segment Badge */}
        {isSegment && (
          <div className="mb-2">


          </div>
        )}
        {/* Driver Info */}
        <div className="flex items-center gap-3 mb-3">
          <img
            src={ride.driver?.profile_image || '/assets/placeholder-avatar.jpg'}
            alt={ride.driver?.name || 'Driver'}
            className="w-12 h-12 rounded-full object-cover"
          />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{ride.driver?.name || 'Driver'}</h3>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span className="text-sm text-gray-600">{ride.driver?.rating?.toFixed(1) || '5.0'}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-blue-600">${displayPrice.toFixed(2)}</p>
            <p className="text-xs text-gray-600">per seat</p>
            {isSegment && (
              <p className="text-xs text-purple-600 font-medium">price</p>
            )}
          </div>
        </div>
        {/* Route - Show user's searched segment */}
        <div className="space-y-2 mb-3">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-none"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {displayFrom?.address || 'Pickup location'}
              </p>
              <p className="text-xs text-gray-600">{formatTime(segmentStartTime)}</p>
            </div>
          </div>
          {isSegment}
          {!isSegment && ride.route_stops && ride.route_stops.length > 0}
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600 mt-1.5 flex-none"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {displayTo?.address || 'Dropoff location'}
              </p>
              <div className="flex items-center gap-2">
                {isCalculating ? (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Calculating...</span>
                  </div>
                ) : realTimeEta ? (
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-gray-900 font-medium">{formatTime(realTimeEta)}</p>
                    <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full" title="Real-time road-based ETA"></span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">{formatTime(displayTo?.estimatedArrival || ride.estimated_arrival || '')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Details */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{ride.available_seats} seats</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{ride.date}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {routeData && isSegment && displayFrom && displayTo ? (
              // For segments, show segment distance only
              ((() => {
                const segmentDist = getSegmentDistance(routeData, displayFrom.address, displayTo.address);
                return segmentDist !== null ? (
                  <span className="text-xs text-green-600 font-medium">{segmentDist.toFixed(1)} km</span>
                ) : (
                  displayDistance && <span className="text-xs text-gray-500">{displayDistance.toFixed(1)} km</span>
                );
              })())
            ) : routeData ? (
              // For full routes, show total distance
              (<span className="text-xs text-green-600 font-medium">{routeData.totalDistance.toFixed(1)}km</span>)
            ) : displayDistance ? (
              // Fallback to database distance
              (<span className="text-xs text-gray-500">{displayDistance.toFixed(1)}km</span>)
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-dvh bg-gray-50">
      <main 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none px-4 py-3 bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate(-1)} className="p-2 active:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Available Rides</h1>
          </div>
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{from} → {to}</span>
          </div>
        </header>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 font-medium">Searching for rides...</p>
            </div>
          ) : availableRides.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <MapPin className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rides Found</h3>
              <p className="text-sm text-gray-600">
                Try adjusting your search criteria or search for a different date
              </p>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-3">
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-6 bg-blue-600 rounded"></div>
                  <h2 className="text-lg font-bold text-gray-900">Available Rides</h2>
                  <span className="text-sm text-gray-600">({availableRides.length})</span>
                </div>
                {MAPBOX_TOKEN && calculatingRoutes.size > 0 && (
                  <div className="ml-3 flex items-center gap-1 text-xs text-blue-600">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Calculating accurate road-based ETAs...</span>
                  </div>
                )}
                {MAPBOX_TOKEN && routeDataMap.size > 0 && calculatingRoutes.size === 0}
              </div>
              {availableRides.map(ride => (
                <RideCard key={ride.id} ride={ride} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
