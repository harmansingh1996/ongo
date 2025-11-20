import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, User, DollarSign, Bell, TrendingUp, Star, Users } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getPassengerBookings, filterCleanupBookings } from '../../services/bookingService';
import { searchAvailableRides, filterCleanupRides } from '../../services/rideService';
import BottomNav from '../../components/BottomNav';
import { NotificationBell } from '../../components/NotificationBell';
import { NotificationPanel } from '../../components/NotificationPanel';
import { formatTime } from '../../utils/timeUtils';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import * as locationService from '../../services/locationService';
import { RideCardSkeletonList } from '../../components/RideCard';
import { OptimizedImage } from '../../components/ProfileUploader';

export default function RiderHome() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [availableRides, setAvailableRides] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [stats, setStats] = useState({ totalRides: 0, upcomingRides: 0 });
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = loadData();

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe && typeof unsubscribe.then === 'function') {
        unsubscribe.then((unsub: any) => {
          if (typeof unsub === 'function') {
            unsub();
          }
        });
      } else if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }
      setUser(currentUser);
      
      // Show page immediately with loading states
      setLoading(false);
      setDataLoading(true);
      
      // Load user's bookings and filter out old completed/cancelled rides
      const userBookings = await getPassengerBookings(currentUser.id);
      const cleanedBookings = filterCleanupBookings(userBookings);
      setBookings(cleanedBookings);

      // Calculate stats
      const total = cleanedBookings.length;
      const upcoming = cleanedBookings.filter(
        (b: any) => b.status === 'accepted' || b.status === 'pending'
      ).length;
      setStats({ totalRides: total, upcomingRides: upcoming });

      // Check for active booking (accepted and ride is ongoing)
      const active = cleanedBookings.find(
        (b: any) => b.status === 'accepted' && b.ride?.status === 'ongoing'
      );
      setActiveBooking(active || null);

      // Subscribe to driver location if active booking exists
      if (active && active.ride?.id) {
        const unsubscribe = locationService.subscribeToDriverLocation(
          active.ride.id,
          (location) => {
            setDriverLocation(location);
          }
        );

        // Store unsubscribe function for cleanup
        setDataLoading(false);
        return unsubscribe;
      }

      // Load some available rides for today
      const today = new Date().toISOString().split('T')[0];
      // Get rides around Toronto area as example
      const rides = await searchAvailableRides({
        fromLat: 43.6532,
        fromLng: -79.3832,
        toLat: 43.6708,
        toLng: -79.3799,
        date: today,
        seats: 1,
      });
      
      // Filter out old completed/cancelled rides from search results too
      const cleanedRides = filterCleanupRides(rides);
      setAvailableRides(cleanedRides.slice(0, 3)); // Show top 3 rides
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const handleRideClick = (ride: any) => {
    const params = new URLSearchParams();
    
    if (ride.isSegmentBooking && ride.displayFrom && ride.displayTo) {
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

  const handleBookingClick = (bookingId: string) => {
    navigate(`/rider/ride-detail/${bookingId}`);
  };

  const getBookingPrice = (booking: any) => {
    // First priority: Use price_per_seat directly from ride_requests table
    if (booking.price_per_seat != null) {
      return booking.price_per_seat;
    }

    // Fallback: If no stored price, use the ride's base price
    return booking.ride?.price_per_seat || 0;
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
            {/* Header with Gradient & Stats */}
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
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs font-medium">Upcoming</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.upcomingRides}</div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
              <div className="space-y-4">
                {/* Live Tracking Widget - Show when ride is active and ongoing */}
                {activeBooking && activeBooking.ride?.status === 'ongoing' && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 overflow-hidden">
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          Driver Approaching
                        </h3>
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-medium">
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {activeBooking.pickup_location?.address} → {activeBooking.dropoff_location?.address}
                      </p>
                    </div>
                    <div className="h-[500px]">
                      <LiveTrackingMap
                        rideId={activeBooking.ride.id}
                        pickupLocation={activeBooking.pickup_location}
                        dropoffLocation={activeBooking.dropoff_location}
                        role="rider"
                      />
                    </div>
                  </div>
                )}
                {/* My Bookings Section */}

                {/* Booking Cards */}
                {dataLoading ? (
                  <RideCardSkeletonList count={2} />
                ) : bookings.length > 0 ? (
                  <div className="space-y-3">
                    {bookings.slice(0, 2).map(booking => {})}
                    {bookings.length > 2 && (
                      <button
                        onClick={() => navigate('/rider/trips')}
                        className="w-full text-center text-blue-600 font-medium py-2 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        View All Bookings ({bookings.length})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-8 text-center space-y-3 shadow-sm border border-gray-100">
                    <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
                      <MapPin className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">No bookings yet</h3>
                      <p className="text-sm text-gray-600">Start your journey by finding a ride</p>
                    </div>
                  </div>
                )}
                {/* Available Rides Section */}
                <div className="flex items-center justify-between pt-4">
                  <h2 className="text-lg font-bold text-gray-900">Available Rides</h2>
                  <button
                    onClick={() => navigate('/rider/find-ride')}
                    className="text-blue-600 text-sm font-medium"
                  >
                    See All
                  </button>
                </div>
                {/* Available Ride Cards */}
                {availableRides.length > 0 ? (
                  <div className="space-y-3">
                    {availableRides.map((ride) => (
                      <div
                        key={ride.id}
                        onClick={() => handleRideClick(ride)}
                        className="bg-white rounded-xl p-4 shadow-sm border border-blue-100 active:scale-98 transition-all"
                      >
                        {/* Driver Info */}
                        <div className="flex items-center gap-3 mb-3">
                          {ride.driver?.profile_image ? (
                            <OptimizedImage 
                              src={ride.driver.profile_image} 
                              alt={ride.driver.name}
                              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-gray-600 font-semibold">
                                {ride.driver?.name?.charAt(0) || '?'}
                              </span>
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">{ride.driver?.name || 'Driver'}</div>
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              <span className="text-sm text-gray-600">{ride.driver?.rating?.toFixed(1) || '5.0'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">
                              ${(ride.displayPrice || ride.price_per_seat).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-600">per seat</p>
                          </div>
                        </div>

                        {/* Route */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-600 mt-1.5 flex-none"></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {ride.displayFrom?.address || ride.from_location?.address || 'Pickup'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-600 mt-1.5 flex-none"></div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {ride.displayTo?.address || ride.to_location?.address || 'Dropoff'}
                              </p>
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
                              <span>{formatTime(ride.time)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-600">No available rides at the moment</p>
                    <button
                      onClick={() => navigate('/rider/find-ride')}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg active:bg-blue-700"
                    >
                      Search Rides
                    </button>
                  </div>
                )}
                {/* Quick Actions */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => navigate('/rider/trips')}
                      className="bg-blue-50 text-blue-700 py-3 rounded-lg font-medium hover:bg-blue-100 active:scale-95 transition-all border border-blue-200 min-h-touch"
                    >
                      My Trips
                    </button>
                    <button
                      onClick={() => navigate('/rider/find-ride')}
                      className="bg-green-50 text-green-700 py-3 rounded-lg font-medium hover:bg-green-100 active:scale-95 transition-all border border-green-200 min-h-touch"
                    >
                      Find Ride
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Bottom Navigation - Always Visible */}
        <BottomNav active="home" userType="rider" />

        {/* Notification Panel */}
        <NotificationPanel
          isOpen={notificationPanelOpen}
          onClose={() => setNotificationPanelOpen(false)}
        />
      </div>
    </div>
  );
}
