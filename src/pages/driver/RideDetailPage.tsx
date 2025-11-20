import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users, DollarSign, Edit, MessageCircle, Check, X, User, XCircle, Navigation } from 'lucide-react';
import { getRideById, updateRide, completeRide } from '../../services/rideService';
import { getCurrentUser } from '../../services/authService';
import { RouteMapPreview } from '../../components/map';
import { 
  getPendingBookingsForRide, 
  getAcceptedPassengersForRide, 
  updateBookingStatus 
} from '../../services/bookingService';
import { createOrGetConversation } from '../../services/chatService';
import { hapticFeedback } from '../../utils/mobileFeatures';
import { formatTime } from '../../utils/timeUtils';
import CancellationModal from '../../components/CancellationModal';
import { calculateRoute, formatDistance, formatDuration, RouteData, calculateMultiStopRoute, MultiStopRouteData, formatDurationSeconds } from '../../services/routeService';

// Get Mapbox token from ywConfig
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || '';

/**
 * Check if ride should be automatically marked as ongoing based on current time
 */
function shouldRideBeOngoing(rideDate: string, rideTime: string): boolean {
  const now = new Date();
  const rideDateTime = new Date(`${rideDate}T${rideTime}`);
  return now >= rideDateTime;
}

/**
 * Check if ride should be automatically marked as completed based on estimated arrival time
 */
function shouldRideBeCompleted(rideDate: string, estimatedArrival: string, duration: number): boolean {
  const now = new Date();
  
  // Try to use estimated_arrival if available
  if (estimatedArrival) {
    // estimated_arrival might be just time (HH:MM:SS) or full datetime
    const arrivalDateTime = estimatedArrival.includes('T') 
      ? new Date(estimatedArrival)
      : new Date(`${rideDate}T${estimatedArrival}`);
    return now >= arrivalDateTime;
  }
  
  // Fallback: estimate based on duration if no estimated_arrival
  // This is a safety measure
  return false;
}

export default function RideDetailPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const [ride, setRide] = useState<any | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [acceptedPassengers, setAcceptedPassengers] = useState<any[]>([]);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [multiStopRouteData, setMultiStopRouteData] = useState<MultiStopRouteData | null>(null);

  useEffect(() => {
    const loadRideDetails = async () => {
      setLoading(true);
      
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.userType !== 'driver') {
        navigate('/auth');
        return;
      }
      setUser(currentUser);

      if (!rideId) {
        navigate('/driver/home');
        return;
      }

      const rideData = await getRideById(rideId);
      console.log('Ride data:', rideData);
      if (rideData) {
        // Auto-update status based on current time
        if (rideData.status === 'scheduled' && shouldRideBeOngoing(rideData.date, rideData.time)) {
          // Ride should start
          await updateRide(rideData.id, { status: 'ongoing' });
          rideData.status = 'ongoing';
        } else if (rideData.status === 'ongoing') {
          // Check if ride should be completed
          const lastStop = rideData.route_stops?.sort((a: any, b: any) => b.stop_order - a.stop_order)[0];
          const estimatedArrival = lastStop?.estimated_arrival || rideData.estimated_arrival;
          
          if (estimatedArrival && shouldRideBeCompleted(rideData.date, estimatedArrival, rideData.duration)) {
            // Use completeRide to automatically create earnings
            const result = await completeRide(rideData.id);
            if (result.success) {
              rideData.status = 'completed';
              console.log(`✅ Ride completed with ${result.earningsCreated} earnings created`);
            }
          }
        }
        setRide(rideData);

        // Calculate real-time route if we have from and to location coordinates
        if (rideData.from_location?.lat && rideData.from_location?.lng && 
            rideData.to_location?.lat && rideData.to_location?.lng &&
            MAPBOX_TOKEN) {
          setLoadingRoute(true);
          const route = await calculateRoute(
            rideData.from_location.lat,
            rideData.from_location.lng,
            rideData.to_location.lat,
            rideData.to_location.lng,
            MAPBOX_TOKEN
          );
          
          if (route) {
            setRouteData(route);
          } else {
            console.warn('Failed to calculate route, using database values as fallback');
          }
          setLoadingRoute(false);
        }
        
        // Calculate real-time multi-stop route if available
        if (rideData.route_stops && rideData.route_stops.length >= 2 && MAPBOX_TOKEN) {
          setLoadingRoute(true);
          const startTime = new Date(`${rideData.date}T${rideData.time}`);
          const multiRoute = await calculateMultiStopRoute(
            rideData.route_stops,
            startTime,
            MAPBOX_TOKEN
          );
          
          if (multiRoute) {
            setMultiStopRouteData(multiRoute);
            console.log('✅ Multi-stop route calculated with accurate road-based ETAs');
          } else {
            console.warn('Failed to calculate multi-stop route, using database values as fallback');
          }
          setLoadingRoute(false);
        }

        // Load pending requests and accepted passengers
        const pending = await getPendingBookingsForRide(rideId);
        setPendingRequests(pending);

        const accepted = await getAcceptedPassengersForRide(rideId);
        setAcceptedPassengers(accepted);
      } else {
        navigate('/driver/trips');
      }
      
      setLoading(false);
    };

    loadRideDetails();
  }, [rideId, navigate]);

  // Check ride status every minute to auto-update when time passes
  useEffect(() => {
    if (!ride || (ride.status !== 'scheduled' && ride.status !== 'ongoing')) return;

    const interval = setInterval(() => {
      // Check scheduled → ongoing
      if (ride.status === 'scheduled' && shouldRideBeOngoing(ride.date, ride.time)) {
        updateRide(ride.id, { status: 'ongoing' });
        setRide({ ...ride, status: 'ongoing' });
      }
      // Check ongoing → completed
      else if (ride.status === 'ongoing') {
        const lastStop = ride.route_stops?.sort((a: any, b: any) => b.stop_order - a.stop_order)[0];
        const estimatedArrival = lastStop?.estimated_arrival || ride.estimated_arrival;
        
        if (estimatedArrival && shouldRideBeCompleted(ride.date, estimatedArrival, ride.duration)) {
          // Use completeRide to automatically create earnings
          completeRide(ride.id).then((result) => {
            if (result.success) {
              setRide({ ...ride, status: 'completed' });
              console.log(`✅ Ride completed with ${result.earningsCreated} earnings created`);
            }
          });
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [ride]);

  const handleEditRide = () => {
    navigate(`/driver/edit-ride/${rideId}`);
  };

  const handleCancelRide = async () => {
    if (ride && window.confirm('Are you sure you want to cancel this ride?')) {
      await updateRide(ride.id, { status: 'cancelled' });
      navigate('/driver/trips');
    }
  };

  const handleAcceptRequest = async (requestId: string, driverId: string, passengerId: string) => {
    setProcessingRequest(requestId);
    hapticFeedback('medium');

    try {
      // Update booking status to accepted
      const success = await updateBookingStatus(requestId, 'accepted');
      
      if (success) {
        // Create or get conversation for chat
        await createOrGetConversation(requestId, driverId, passengerId);

        // Refresh pending requests and accepted passengers
        if (rideId) {
          const pending = await getPendingBookingsForRide(rideId);
          setPendingRequests(pending);
          
          const accepted = await getAcceptedPassengersForRide(rideId);
          setAcceptedPassengers(accepted);
        }

        hapticFeedback('success');
        alert('Request accepted successfully!');
      } else {
        alert('Failed to accept request. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      alert('An error occurred while accepting the request.');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to decline this request?')) {
      return;
    }

    setProcessingRequest(requestId);
    hapticFeedback('light');

    try {
      const success = await updateBookingStatus(requestId, 'rejected');
      
      if (success) {
        // Refresh pending requests
        if (rideId) {
          const pending = await getPendingBookingsForRide(rideId);
          setPendingRequests(pending);
        }

        hapticFeedback('light');
      } else {
        alert('Failed to decline request. Please try again.');
      }
    } catch (error) {
      console.error('Error declining request:', error);
      alert('An error occurred while declining the request.');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleCancelBooking = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to cancel this accepted passenger?')) {
      return;
    }

    setProcessingRequest(requestId);
    hapticFeedback('light');

    try {
      const success = await updateBookingStatus(requestId, 'cancelled');
      
      if (success) {
        // Refresh accepted passengers
        if (rideId) {
          const accepted = await getAcceptedPassengersForRide(rideId);
          setAcceptedPassengers(accepted);
        }

        hapticFeedback('light');
        alert('Passenger cancelled successfully.');
      } else {
        alert('Failed to cancel passenger. Please try again.');
      }
    } catch (error) {
      console.error('Error cancelling passenger:', error);
      alert('An error occurred while cancelling the passenger.');
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleChatWithPassenger = async (request: any) => {
    hapticFeedback('light');
    
    try {
      // Create or get conversation
      const conversation = await createOrGetConversation(
        request.id,
        user.id,
        request.passenger_id
      );
      
      if (conversation) {
        // Navigate with ride request ID, not conversation ID
        navigate(`/driver/chat/${request.id}`);
      } else {
        alert('Failed to open chat. Please try again.');
      }
    } catch (error) {
      console.error('Error opening chat:', error);
      alert('An error occurred while opening the chat.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'ongoing': return 'bg-green-100 text-green-800 border-green-300';
      case 'completed': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Loading ride details...</div>
        </div>
      </div>
    );
  }

  if (!ride) {
    return null;
  }

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Ride Details</h1>
              <p className="text-sm text-gray-600">{ride.date} at {formatTime(ride.time)}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(ride.status)}`}>
              {ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Real-time Route Information */}
          {(routeData || loadingRoute) && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Navigation className="w-4 h-4 text-blue-600" />
                <h2 className="font-semibold text-gray-900">Live Route Data</h2>
              </div>
              
              {loadingRoute ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2 text-sm text-gray-600">Calculating route...</span>
                </div>
              ) : routeData ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Distance</span>
                    <span className="text-sm font-medium text-gray-900">{formatDistance(routeData.distance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Duration</span>
                    <span className="text-sm font-medium text-gray-900">{formatDuration(routeData.duration)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Current ETA</span>
                    <span className="text-sm font-medium text-gray-900">{routeData.eta}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      Real-time road data via Mapbox
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Interactive Map Preview */}
          {ride.route_stops && ride.route_stops.length > 0 && MAPBOX_TOKEN ? (
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Route Preview</div>
                <div className="text-xs text-gray-500">
                  {ride.route_stops.length} stops
                </div>
              </div>
              <RouteMapPreview
                routeStops={multiStopRouteData?.stops || ride.route_stops}
                routeGeometry={multiStopRouteData?.routeGeometry || ride.route_data?.routes?.[0]?.geometry}
                mapboxToken={MAPBOX_TOKEN}
                className="w-full h-64"
              />
            </div>
          ) : null}
          {/* Route Stops with Enhanced Display */}
          {ride.route_stops && ride.route_stops.length > 0 ? (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">Route & Stops</h2>
                  {loadingRoute && (
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  )}
                </div>
                <span className="text-xs text-gray-500">{ride.route_stops.length} stops</span>
              </div>
              
              {multiStopRouteData && (
                <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-1 text-xs text-blue-700 mb-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span className="font-medium">Real-time road-based route via Mapbox</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-600">Total Distance:</span>
                      <span className="ml-1 font-medium text-gray-900">{multiStopRouteData.totalDistance.toFixed(1)} km</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Duration:</span>
                      <span className="ml-1 font-medium text-gray-900">{formatDuration(multiStopRouteData.totalDuration)}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                {(multiStopRouteData?.stops || ride.route_stops)
                  .sort((a: any, b: any) => a.stop_order - b.stop_order)
                  .map((stop: any, index: number) => {
                    const totalStops = multiStopRouteData?.stops?.length || ride.route_stops.length;
                    return (
                      <div key={stop.id} className="flex items-start space-x-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            index === 0 ? 'bg-green-600' : 
                            index === totalStops - 1 ? 'bg-red-600' : 
                            'bg-blue-600'
                          }`}>
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                          {index < totalStops - 1 && (
                            <div className="w-0.5 h-16 bg-gray-300 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{stop.name || stop.address}</div>
                              <div className="mt-1 space-y-1">
                                {/* ETA Display */}
                                {stop.eta && (
                                  <div className="flex items-center gap-1 text-xs text-gray-700">
                                    <Clock className="w-3 h-3" />
                                    <span className="font-medium">ETA: {stop.eta}</span>
                                  </div>
                                )}
                                {/* Segment Info (from previous stop) */}
                                {stop.segmentDistance && stop.segmentDuration && (
                                  <div className="text-xs text-gray-500">
                                    → {(stop.segmentDistance / 1000).toFixed(1)} km, {formatDurationSeconds(stop.segmentDuration)}
                                  </div>
                                )}
                              </div>
                            </div>
                            {index === 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-2">Start</span>
                            )}
                            {index === totalStops - 1 && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-2">End</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}

          {/* Basic Route (Fallback if no stops) */}
          {(!ride.route_stops || ride.route_stops.length === 0) && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-900 mb-3">Route</h2>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-green-600 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                    <div className="w-0.5 h-12 bg-gray-300 my-1" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">Pick-up</div>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Start</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{ride.from_location?.address || 'N/A'}</div>
                    {ride.time && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(ride.time)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">Drop-off</div>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">End</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{ride.to_location?.address || 'N/A'}</div>
                    {ride.estimated_arrival && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>ETA: {ride.estimated_arrival}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ride Details */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-3">Details</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Clock className="w-4 h-4" />
                  <span>Time</span>
                </div>
                <div className="font-medium text-gray-900">{formatTime(ride.time)}</div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Users className="w-4 h-4" />
                  <span>Seats</span>
                </div>
                <div className="font-medium text-gray-900">{ride.available_seats} available</div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span>Price</span>
                </div>
                <div className="font-medium text-gray-900">${ride.price_per_seat} per seat</div>
              </div>

              {ride.distance && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Distance</div>
                  <div className="font-medium text-gray-900">{ride.distance} km</div>
                </div>
              )}

              {ride.duration && (
                <div>
                  <div className="text-sm text-gray-600 mb-1">Duration</div>
                  <div className="font-medium text-gray-900">{ride.duration} min</div>
                </div>
              )}

              {ride.estimated_arrival && (
                <div className="col-span-2">
                  <div className="text-sm text-gray-600 mb-1">Estimated Arrival</div>
                  <div className="font-medium text-gray-900">{ride.estimated_arrival}</div>
                </div>
              )}
            </div>
          </div>

          {/* Pending Ride Requests */}
          {pendingRequests.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Pending Requests</h2>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                  {pendingRequests.length} pending
                </span>
              </div>

              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-3 mb-3">
                      <img
                        src={request.passenger?.profile_image || '/assets/placeholder-avatar.jpg'}
                        alt={request.passenger?.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{request.passenger?.name}</div>
                        <div className="text-sm text-gray-600">
                          {request.requested_seats} seat{request.requested_seats > 1 ? 's' : ''}
                        </div>
                        {request.price?.[0] && (
                          <div className="text-sm font-medium text-green-600">
                            ${(request.price[0].price_cents / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 mb-3">
                      <div>From: {request.pickup_location?.address}</div>
                      <div>To: {request.dropoff_location?.address}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptRequest(request.id, user.id, request.passenger_id)}
                        disabled={processingRequest === request.id}
                        className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium active:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(request.id)}
                        disabled={processingRequest === request.id}
                        className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg font-medium active:bg-red-100 disabled:bg-gray-300 border border-red-200 flex items-center justify-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted Passengers */}
          {acceptedPassengers.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">Passengers</h2>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  {acceptedPassengers.length} confirmed
                </span>
              </div>

              <div className="space-y-3">
                {acceptedPassengers.map((request) => (
                  <div key={request.id} className="border border-green-200 bg-green-50 rounded-lg p-3">
                    <div className="flex items-start gap-3 mb-3">
                      <img
                        src={request.passenger?.profile_image || '/assets/placeholder-avatar.jpg'}
                        alt={request.passenger?.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{request.passenger?.name}</div>
                        <div className="text-sm text-gray-600">
                          {request.requested_seats} seat{request.requested_seats > 1 ? 's' : ''}
                        </div>
                        {request.price?.[0] && (
                          <div className="text-sm font-medium text-green-600">
                            ${(request.price[0].price_cents / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleChatWithPassenger(request)}
                        className="flex-1 bg-blue-500 text-white py-2 rounded-lg font-medium active:bg-blue-600 flex items-center justify-center gap-1"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Chat
                      </button>
                      {ride.status === 'scheduled' && (
                        <button
                          onClick={() => handleCancelBooking(request.id)}
                          disabled={processingRequest === request.id}
                          className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg font-medium active:bg-red-100 disabled:bg-gray-300 border border-red-200 flex items-center justify-center gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons - Only for scheduled rides */}
          {ride.status === 'scheduled' && (
            <div className="space-y-2">
              <button
                onClick={handleEditRide}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <Edit className="w-5 h-5" />
                Edit Ride
              </button>
              <button
                onClick={() => setShowCancellationModal(true)}
                className="w-full bg-red-50 text-red-600 py-3 rounded-lg font-medium hover:bg-red-100 active:scale-98 transition-all border border-red-200 flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" />
                Cancel Ride
              </button>
            </div>
          )}

          {/* Status information for ongoing/completed rides */}
          {ride.status === 'ongoing' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-green-800 font-medium">Ride In Progress</div>
              <div className="text-green-600 text-sm mt-1">
                Will automatically complete at arrival time
              </div>
            </div>
          )}

          {ride.status === 'completed' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <div className="text-gray-800 font-medium">Ride Completed ✅</div>
              <div className="text-gray-600 text-sm mt-1">
                Earnings have been added to your account
              </div>
              <div className="text-green-600 text-xs mt-2 font-medium">
                Check your Earnings page for details
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Cancellation Modal */}
      {user && ride && (
        <CancellationModal
          isOpen={showCancellationModal}
          onClose={() => setShowCancellationModal(false)}
          rideId={ride.id}
          userId={user.id}
          userRole="driver"
          rideName={`${ride.from_location?.address || 'Unknown'} → ${ride.to_location?.address || 'Unknown'}`}
          onCancellationSuccess={() => {
            setShowCancellationModal(false);
            navigate('/driver/home');
          }}
        />
      )}
    </div>
  );
}
