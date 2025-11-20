import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, TrendingUp, DollarSign, X, MapPin, Calendar, Clock, Users, MessageCircle } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { NotificationBell } from '../../components/NotificationBell';
import { NotificationPanel } from '../../components/NotificationPanel';
import { getCurrentUser } from '../../services/authService';
import { getDriverRideStats, filterCleanupRides, getDriverRides } from '../../services/rideService';
import { getDriverBookingRequests, updateBookingStatus, filterCleanupBookings, getAcceptedBookingsForRide } from '../../services/bookingService';
import { createOrGetConversation } from '../../services/chatService';
import { sendPickupConfirmationRequest } from '../../services/messageService';
import { hapticFeedback } from '../../utils/mobileFeatures';
import { formatTime } from '../../utils/timeUtils';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import * as locationService from '../../services/locationService';
import RiderProfileModal from '../../components/RiderProfileModal';
import { RideCardSkeletonList } from '../../components/RideCard';
import { OptimizedImage } from '../../components/ProfileUploader';

export default function DriverHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRides: 0, completedRides: 0, upcomingRides: 0, cancelledRides: 0 });
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [ongoingRide, setOngoingRide] = useState<any>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [acceptedPassengers, setAcceptedPassengers] = useState<any[]>([]);
  const [sendingConfirmation, setSendingConfirmation] = useState<string | null>(null);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  useEffect(() => {
    loadUserData();

    // Cleanup tracking on unmount
    return () => {
      if (isTracking) {
        locationService.stopTracking();
      }
    };
  }, [navigate]);

  const loadUserData = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    
    // Show page immediately with loading states
    setLoading(false);
    
    // Load data in background
    await loadRidesData(currentUser.id);
  };

  const loadRidesData = async (driverId: string) => {
    try {
      setDataLoading(true);
      
      const [requests, rideStats, allRides] = await Promise.all([
        getDriverBookingRequests(driverId),
        getDriverRideStats(driverId),
        getDriverRides(driverId),
      ]);
      
      // Filter for pending requests only and remove old completed/cancelled rides
      const cleanedRequests = filterCleanupBookings(requests);
      const pendingRequests = cleanedRequests.filter(r => r.status === 'pending');
      setBookingRequests(pendingRequests);
      setStats(rideStats);

      // Check for ongoing rides
      const ongoing = allRides.find(ride => ride.status === 'ongoing');
      setOngoingRide(ongoing || null);

      // Load accepted passengers for route planning
      if (ongoing) {
        const passengers = await getAcceptedBookingsForRide(ongoing.id);
        setAcceptedPassengers(passengers);
      } else {
        setAcceptedPassengers([]);
      }

      // Start tracking if there's an ongoing ride and not already tracking
      if (ongoing && !isTracking) {
        const success = await locationService.startTracking(ongoing.id, driverId);
        if (success) {
          setIsTracking(true);
          hapticFeedback('success');
        }
      } else if (!ongoing && isTracking) {
        // Stop tracking if no ongoing ride
        locationService.stopTracking();
        setIsTracking(false);
      }
    } catch (error) {
      console.error('Error loading booking requests:', error);
    } finally {
      setDataLoading(false);
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

        // Refresh data
        await loadRidesData(driverId);

        // Close modal
        setSelectedRequest(null);

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
        // Refresh data
        if (user) {
          await loadRidesData(user.id);
        }

        // Close modal
        setSelectedRequest(null);

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

  // Send pickup confirmation request to passenger
  const handleSendPickupConfirmation = async (passengerId: string, passengerName: string, bookingId: string, pickupAddress: string) => {
    if (!user || !ongoingRide) return;

    setSendingConfirmation(bookingId);
    hapticFeedback('light');

    try {
      const message = await sendPickupConfirmationRequest(
        user.id,
        passengerId,
        ongoingRide.id,
        bookingId,
        pickupAddress
      );

      if (message) {
        hapticFeedback('success');
        alert(`Pickup confirmation request sent to ${passengerName}!`);
      } else {
        alert('Failed to send confirmation request. Please try again.');
      }
    } catch (error) {
      console.error('Error sending pickup confirmation:', error);
      alert('An error occurred while sending the confirmation request.');
    } finally {
      setSendingConfirmation(null);
    }
  };

  // Get the price that was saved when the rider made the booking
  const getBookingPrice = (request: any) => {
    // First priority: Use price_per_seat directly from ride_requests table
    if (request.price_per_seat != null) {
      return request.price_per_seat;
    }

    // Fallback: If no stored price, use the ride's base price
    return request.ride?.price_per_seat || 0;
  };

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {!user && loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-gray-600">Loading...</div>
            </div>
          </div>
        ) : !user ? null : (
          <>
            {/* Header */}
            <div className="flex-none bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold">Welcome back!</h1>
                  <p className="text-blue-100">{user.name}</p>
                </div>
                <NotificationBell 
                  onOpen={() => setNotificationPanelOpen(true)}
                  className="p-2 bg-white/20 rounded-full hover:bg-white/30 active:scale-95 transition-all"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">Total Rides</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.totalRides}</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">Upcoming</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.upcomingRides}</div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
              <div className="space-y-4">
                {/* Live Tracking Widget - Show when ride is ongoing */}
                {ongoingRide && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 overflow-hidden">
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                          Live Tracking
                        </h3>
                        <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full font-medium">
                          ONGOING
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {ongoingRide.from_location?.address} → {ongoingRide.to_location?.address}
                      </p>
                    </div>
                    <div className="h-[500px]">
                      <LiveTrackingMap
                        rideId={ongoingRide.id}
                        pickupLocation={ongoingRide.from_location}
                        dropoffLocation={ongoingRide.to_location}
                        role="driver"
                        passengerPickups={acceptedPassengers.map(p => ({
                          lat: p.pickup_location.lat,
                          lng: p.pickup_location.lng,
                          address: p.pickup_location.address,
                          passengerId: p.passenger_id,
                          passengerName: p.passenger?.name || 'Passenger'
                        }))}
                      />
                    </div>
                    
                    {/* Passenger Pickup List */}
                    {acceptedPassengers.length > 0 && (
                      <div className="mt-3 px-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Passenger Pickups</h4>
                        <div className="space-y-2">
                          {acceptedPassengers.map((passenger, index) => (
                            <div key={passenger.id} className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900">{passenger.passenger?.name || 'Passenger'}</div>
                                    <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                                      {passenger.pickup_location.address}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleSendPickupConfirmation(
                                    passenger.passenger_id,
                                    passenger.passenger?.name || 'Passenger',
                                    passenger.id,
                                    passenger.pickup_location.address
                                  )}
                                  disabled={sendingConfirmation === passenger.id}
                                  className="ml-2 p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
                                >
                                  {sendingConfirmation === passenger.id ? (
                                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <MessageCircle className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Section Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Ride Requests</h2>
                  {bookingRequests.length > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {bookingRequests.length}
                    </span>
                  )}
                </div>

                {/* Booking Request Cards */}
                {dataLoading ? (
                  <RideCardSkeletonList count={3} />
                ) : bookingRequests.length > 0 ? (
                  <div className="space-y-3">
                    {bookingRequests.map((request) => {
                      const segmentPrice = getBookingPrice(request);
                      const isSegment = 
                        request.pickup_location?.address !== request.ride?.from_location?.address ||
                        request.dropoff_location?.address !== request.ride?.to_location?.address;

                      return (
                        <div
                          key={request.id}
                          onClick={() => setSelectedRequest(request)}
                          className="bg-white rounded-xl p-4 shadow-sm border border-orange-200 active:scale-98 transition-all cursor-pointer"
                        >
                          {/* Segment Badge */}
                          {isSegment && (
                            <div className="mb-2">

                            </div>
                          )}
                          {/* Passenger Info */}
                          <div className="flex items-center gap-3 mb-3">
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRiderId(request.passenger_id);
                                setShowRiderModal(true);
                              }}
                              className="cursor-pointer"
                            >
                              {request.passenger?.profile_image ? (
                                <OptimizedImage 
                                  src={request.passenger.profile_image} 
                                  alt={request.passenger.name}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 hover:border-blue-500 transition-colors"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors">
                                  <span className="text-gray-600 font-semibold">
                                    {request.passenger?.name?.charAt(0) || '?'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">{request.passenger?.name || 'Unknown'}</div>
                              <div className="text-sm text-gray-600">
                                {request.requested_seats} seat{request.requested_seats > 1 ? 's' : ''} requested
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-orange-600 font-semibold text-xs">NEW</div>
                              <div className="text-lg font-bold text-blue-600">
                                ${(segmentPrice * request.requested_seats).toFixed(2)}
                              </div>

                            </div>
                          </div>
                          {/* Trip Info - Show segment locations */}
                          <div className="space-y-1 mb-3">
                            <div
                              className="text-sm text-gray-600"
                              style={{
                                fontWeight: "bold"
                              }}>
                               {request.pickup_location?.address || 'N/A'}→ {request.dropoff_location?.address || 'N/A'}
                            </div>
                            {isSegment}
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Date:</span> {request.ride?.date} at {formatTime(request.ride?.time)}
                            </div>
                          </div>
                          {/* Message */}
                          {request.message}
                          {/* Action buttons */}

                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-8 text-center space-y-3 shadow-sm border border-gray-100">
                    <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
                      <Bell className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">No pending requests</h3>
                      <p className="text-sm text-gray-600">Booking requests from riders will appear here</p>
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => navigate('/driver/trips')}
                      className="bg-blue-50 text-blue-700 py-3 rounded-lg font-medium hover:bg-blue-100 active:scale-95 transition-all border border-blue-200 min-h-touch"
                    >
                      View Trips
                    </button>
                    <button
                      onClick={() => navigate('/driver/post-ride')}
                      className="bg-green-50 text-green-700 py-3 rounded-lg font-medium hover:bg-green-100 active:scale-95 transition-all border border-green-200 min-h-touch"
                    >
                      Post Ride
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Bottom Navigation - Always Visible */}
        <BottomNav userType="driver" />
      </div>
      {/* Ride Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div 
            className="w-full bg-white rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Modal Header */}
            <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Ride Request Details</h2>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-2 hover:bg-gray-100 rounded-full active:scale-95 transition-all"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {/* Passenger Info Section */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Passenger Information
                  </h3>
                  <div className="flex items-center gap-3 mb-3">
                    {selectedRequest.passenger?.profile_image ? (
                      <OptimizedImage 
                        src={selectedRequest.passenger.profile_image} 
                        alt={selectedRequest.passenger.name}
                        className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white shadow-md">
                        <span className="text-white font-bold text-xl">
                          {selectedRequest.passenger?.name?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 text-lg">
                        {selectedRequest.passenger?.name || 'Unknown Passenger'}
                      </div>

                      {selectedRequest.passenger?.rating && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-yellow-500">★</span>
                          <span className="text-sm font-medium text-gray-700">
                            {selectedRequest.passenger.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-white/60 rounded-lg p-2">
                    <span className="text-sm text-gray-600">Seats Requested</span>
                    <span className="font-bold text-gray-900">
                      {selectedRequest.requested_seats} seat{selectedRequest.requested_seats > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Ride Details Section */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Trip Details
                  </h3>
                  
                  {/* Route Information */}
                  <div className="space-y-3 mb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div className="w-0.5 h-8 bg-gray-300"></div>
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Pickup Location</div>
                          <div className="font-medium text-gray-900">
                            {selectedRequest.pickup_location?.address || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Dropoff Location</div>
                          <div className="font-medium text-gray-900">
                            {selectedRequest.dropoff_location?.address || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Check if segment booking */}
                  {(() => {
                    const isSegment = 
                      selectedRequest.pickup_location?.address !== selectedRequest.ride?.from_location?.address ||
                      selectedRequest.dropoff_location?.address !== selectedRequest.ride?.to_location?.address;
                    
                    return isSegment && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                        <div className="text-xs font-semibold text-purple-700 mb-2">
                          🎯 Segment Booking (Partial Route)
                        </div>
                        <div className="text-xs text-purple-600">
                          Full route: {selectedRequest.ride?.from_location?.address} → {selectedRequest.ride?.to_location?.address}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Date and Time */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-2">
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        Date
                      </div>
                      <div className="font-medium text-gray-900 text-sm">
                        {selectedRequest.ride?.date || 'N/A'}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Clock className="w-3 h-3" />
                        Time
                      </div>
                      <div className="font-medium text-gray-900 text-sm">
                        {formatTime(selectedRequest.ride?.time) || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Message Section */}
                {selectedRequest.message && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      Passenger Message
                    </h3>
                    <p className="text-gray-800 text-sm leading-relaxed">
                      {selectedRequest.message}
                    </p>
                  </div>
                )}

                {/* Price Section */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Total Earning</div>
                      <div className="text-3xl font-bold text-green-600">
                        ${(getBookingPrice(selectedRequest) * selectedRequest.requested_seats).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        ${getBookingPrice(selectedRequest).toFixed(2)} per seat × {selectedRequest.requested_seats} seat{selectedRequest.requested_seats > 1 ? 's' : ''}
                      </div>
                    </div>
                    <DollarSign className="w-12 h-12 text-green-500 opacity-50" />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions - Fixed at Bottom */}
            <div className="flex-none p-4 border-t border-gray-200 bg-white">
              <div className="space-y-2">
                {/* Chat Button */}
                <button
                  onClick={() => {
                    navigate(`/driver/chat/${selectedRequest.id}`);
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 active:scale-95 transition-all min-h-touch shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Chat with Passenger
                </button>
                
                {/* Accept/Decline Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDeclineRequest(selectedRequest.id)}
                    disabled={processingRequest === selectedRequest.id}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 active:scale-95 transition-all min-h-touch disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingRequest === selectedRequest.id ? 'Processing...' : 'Decline'}
                  </button>
                  <button
                    onClick={() => handleAcceptRequest(selectedRequest.id, user.id, selectedRequest.passenger_id)}
                    disabled={processingRequest === selectedRequest.id}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all min-h-touch shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingRequest === selectedRequest.id ? 'Processing...' : 'Accept Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Rider Profile Modal */}
      {selectedRiderId && (
        <RiderProfileModal
          riderId={selectedRiderId}
          isOpen={showRiderModal}
          onClose={() => {
            setShowRiderModal(false);
            setSelectedRiderId(null);
          }}
        />
      )}

      {/* Notification Panel */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
      />
    </div>
  );
}
