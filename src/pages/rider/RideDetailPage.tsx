import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, User, Car, DollarSign, Phone, MessageCircle, X, Check, XCircle, Navigation } from 'lucide-react';
import { getBookingById } from '../../services/bookingService';
import { formatTime } from '../../utils/timeUtils';
import CancellationModal from '../../components/CancellationModal';
import { calculateRoute, formatDistance, formatDuration, RouteData } from '../../services/routeService';

// Get Mapbox token from ywConfig
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || '';

export default function RideDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    loadBookingDetails();
  }, [requestId]);

  const loadBookingDetails = async () => {
    if (!requestId) {
      setLoading(false);
      return;
    }

    try {
      const bookingData = await getBookingById(requestId);
      
      if (!bookingData) {
        console.error(`[RideDetailPage] Booking not found: ${requestId}`);
        console.error('[RideDetailPage] This may be due to: invalid ID, RLS policy restrictions, or deleted record');
        setBooking(null);
        setLoading(false);
        return;
      }
      
      setBooking(bookingData);
      
      // Calculate real-time route if we have pickup and dropoff coordinates
      if (bookingData.pickup_location?.lat && bookingData.pickup_location?.lng && 
          bookingData.dropoff_location?.lat && bookingData.dropoff_location?.lng &&
          MAPBOX_TOKEN) {
        setLoadingRoute(true);
        const route = await calculateRoute(
          bookingData.pickup_location.lat,
          bookingData.pickup_location.lng,
          bookingData.dropoff_location.lat,
          bookingData.dropoff_location.lng,
          MAPBOX_TOKEN
        );
        
        if (route) {
          setRouteData(route);
        } else {
          console.warn('Failed to calculate route, using database values as fallback');
        }
        setLoadingRoute(false);
      }
    } catch (error) {
      console.error('Error loading booking details:', error);
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = () => {
    if (booking && window.confirm('Are you sure you want to cancel this ride?')) {
      // TODO: Implement cancel booking functionality
      navigate('/rider/home');
    }
  };

  const handleContactDriver = () => {
    navigate(`/rider/chat/${booking?.id}`);
  };

  if (loading) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading ride details...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Booking Not Found</h2>
          <p className="text-gray-600 mb-6 max-w-sm mx-auto">
            This booking may have been deleted, cancelled, or you may not have access to it.
          </p>
          <button
            onClick={() => navigate('/rider/home')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
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
        <header className="flex-none px-4 py-3 bg-white shadow-sm flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 active:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Ride Details</h1>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Status */}
          <div className="bg-white p-4 mb-2">
            <div className="flex items-center justify-between">
              <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusColors[booking.status] || 'bg-gray-100 text-gray-700'}`}>
                {booking.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Driver Information */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Driver Information</h3>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {booking.ride?.driver?.profile_image ? (
                <img
                  src={booking.ride.driver.profile_image}
                  alt={booking.ride.driver.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xl">
                    {booking.ride?.driver?.name?.charAt(0) || '?'}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">{booking.ride?.driver?.name || 'Driver'}</h4>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-yellow-500">★</span>
                  <span className="text-sm text-gray-600">
                    {booking.ride?.driver?.rating?.toFixed(1) || '5.0'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trip Details */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Trip Details</h3>
            <div className="space-y-4">
              {/* Pickup */}
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-green-600 mt-1"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Pickup</p>
                  <p className="text-xs text-gray-600">{booking.pickup_location?.address || 'N/A'}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-600">{booking.ride?.date} {formatTime(booking.ride?.time)}</span>
                  </div>
                </div>
              </div>

              {/* Dropoff */}
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-red-600 mt-1"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Dropoff</p>
                  <p className="text-xs text-gray-600">{booking.dropoff_location?.address || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Route Information - Real-time calculated */}
          {(routeData || loadingRoute) && (
            <div className="bg-white p-4 mb-2">
              <div className="flex items-center gap-2 mb-3">
                <Navigation className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Route Information</h3>
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
                    <span className="text-sm text-gray-600">Estimated Arrival</span>
                    <span className="text-sm font-medium text-gray-900">{routeData.eta}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      Live route data via Mapbox
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Booking Summary */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Booking Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Seats Booked</span>
                <span className="text-sm font-medium text-gray-900">{booking.requested_seats}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Price per Seat</span>
                <span className="text-sm font-medium text-gray-900">
                  ${booking.price?.[0]?.price_cents 
                    ? ((booking.price[0].price_cents / 100) / booking.requested_seats).toFixed(2)
                    : (booking.ride?.price_per_seat?.toFixed(2) || '0.00')}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-base font-semibold text-blue-600">
                  ${booking.price?.[0]?.price_cents 
                    ? (booking.price[0].price_cents / 100).toFixed(2)
                    : ((booking.ride?.price_per_seat || 0) * booking.requested_seats).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex-none bg-white border-t border-gray-200 p-4 space-y-2">
          {booking.status === 'pending' ? (
            <>
              <button
                onClick={handleContactDriver}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 active:bg-blue-700"
              >
                <MessageCircle className="w-5 h-5" />
                Contact Driver
              </button>
              <button
                onClick={() => setShowCancellationModal(true)}
                className="w-full py-3 bg-red-50 text-red-600 font-medium rounded-lg flex items-center justify-center gap-2 active:bg-red-100"
              >
                <XCircle className="w-5 h-5" />
                Cancel Ride
              </button>
            </>
          ) : booking.status === 'accepted' ? (
            <>
              <button
                onClick={handleContactDriver}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 active:bg-blue-700"
              >
                <MessageCircle className="w-5 h-5" />
                Contact Driver
              </button>
              {booking.ride?.status === 'scheduled' && (
                <button
                  onClick={() => setShowCancellationModal(true)}
                  className="w-full py-3 bg-red-50 text-red-600 font-medium rounded-lg flex items-center justify-center gap-2 active:bg-red-100 border border-red-200"
                >
                  <XCircle className="w-5 h-5" />
                  Cancel Ride
                </button>
              )}
            </>
          ) : booking.status === 'rejected' ? (
            <button
              onClick={() => navigate('/rider/home')}
              className="w-full py-3 bg-gray-600 text-white font-medium rounded-lg active:bg-gray-700"
            >
              Back to Home
            </button>
          ) : null}
        </div>
      </main>

      {/* Cancellation Modal */}
      {booking && booking.passenger && booking.ride && (
        <CancellationModal
          isOpen={showCancellationModal}
          onClose={() => setShowCancellationModal(false)}
          rideId={booking.ride.id}
          userId={booking.passenger.id}
          userRole="passenger"
          rideName={`${booking.pickup_location?.address || booking.ride.from_location?.address || 'Unknown'} → ${booking.dropoff_location?.address || booking.ride.to_location?.address || 'Unknown'}`}
          bookingId={booking.id}
          onCancellationSuccess={() => {
            setShowCancellationModal(false);
            navigate('/rider/home');
          }}
        />
      )}
    </div>
  );
}
