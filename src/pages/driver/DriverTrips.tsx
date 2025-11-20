import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import RideCard from '../../components/RideCard';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { getDriverRides, filterCleanupRides } from '../../services/rideService';
import { Ride } from '../../types';
import { formatTime } from '../../utils/timeUtils';
import { RatingModal, RatingBadge } from '../../components/rating';
import { createReview, hasUserReviewedForRide } from '../../services/ratingService';
import { getDriverBookingRequests } from '../../services/bookingService';
import { supabase } from '../../services/supabaseClient';

type TripFilter = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

export default function DriverTrips() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeFilter, setActiveFilter] = useState<TripFilter>('scheduled');
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingPassenger, setRatingPassenger] = useState<any>(null);
  const [currentRideForRating, setCurrentRideForRating] = useState<any>(null);
  const [ridesWithPendingRatings, setRidesWithPendingRatings] = useState<Set<string>>(new Set());
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    loadUserAndRides();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadRides();
      setupRealtimeSubscription();
    }

    // Cleanup subscription on unmount or user change
    return () => {
      if (subscriptionRef.current) {
        console.log('🔌 Unsubscribing from rides realtime updates');
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [activeFilter, user]);

  const setupRealtimeSubscription = () => {
    if (!user) return;

    // Remove existing subscription if any
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    console.log('🔌 Setting up realtime subscription for driver rides');

    // Subscribe to changes in rides table for this driver
    const channel = supabase
      .channel('driver-rides-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'rides',
          filter: `driver_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('🔔 Ride change detected:', payload);
          
          // Reload rides when any change occurs
          loadRides();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
        },
        (payload) => {
          console.log('🔔 Ride request change detected:', payload);
          
          // Reload rides when booking requests change
          // This catches status changes like pending -> accepted
          loadRides();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to realtime updates');
        } else if (status === 'CLOSED') {
          console.log('🔴 Realtime subscription closed');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime subscription error');
        }
      });

    subscriptionRef.current = channel;
  };

  const loadUserAndRides = async () => {
    setLoading(true);
    const currentUser = await getCurrentUser();
    
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    // Pass userId directly to loadRides to avoid state timing issues
    await loadRides(currentUser.id);
    setLoading(false);
  };

  const loadRides = async (userId?: string) => {
    const driverId = userId || user?.id;
    if (!driverId) return;
    
    try {
      const allRides = await getDriverRides(driverId);
      console.log('All rides from DB:', allRides); // Debug log
      
      // Filter out old completed/cancelled rides (8+ hours)
      const cleanedRides = filterCleanupRides(allRides);
      const filteredRides = cleanedRides.filter(r => r.status === activeFilter);
      console.log('Filtered rides:', filteredRides); // Debug log
      setRides(filteredRides);

      // Check for completed rides that need rating
      await checkForUnratedPassengers(driverId, cleanedRides);
    } catch (error) {
      console.error('Error loading rides:', error);
      setRides([]);
    }
  };

  const checkForUnratedPassengers = async (driverId: string, ridesData: any[]) => {
    // Find completed rides
    const completedRides = ridesData.filter(r => r.status === 'completed');
    const ridesWithPending = new Set<string>();
    let firstUnratedPassenger: any = null;
    let firstUnratedRide: any = null;

    for (const ride of completedRides) {
      // Get all accepted passengers for this ride
      const bookings = await getDriverBookingRequests(driverId);
      const acceptedPassengers = bookings.filter(
        b => b.ride_id === ride.id && b.status === 'accepted'
      );

      // Check each passenger for unrated
      for (const booking of acceptedPassengers) {
        if (!booking.passenger) continue;

        const alreadyReviewed = await hasUserReviewedForRide(
          driverId,
          booking.passenger.id,
          ride.id
        );

        if (!alreadyReviewed) {
          ridesWithPending.add(ride.id);
          if (!firstUnratedPassenger) {
            firstUnratedPassenger = booking.passenger;
            firstUnratedRide = ride;
          }
        }
      }
    }

    // Update state with rides that have pending ratings
    setRidesWithPendingRatings(ridesWithPending);

    // Show modal for first unrated passenger
    if (firstUnratedPassenger && firstUnratedRide) {
      setRatingPassenger(firstUnratedPassenger);
      setCurrentRideForRating(firstUnratedRide);
      setShowRatingModal(true);
    }
  };

  const handleSubmitRating = async (rating: number, comment: string) => {
    if (!user || !ratingPassenger || !currentRideForRating) return;

    const success = await createReview(user.id, {
      reviewed_user_id: ratingPassenger.id,
      ride_id: currentRideForRating.id,
      rating,
      comment,
    });

    if (success) {
      setShowRatingModal(false);
      setRatingPassenger(null);
      setCurrentRideForRating(null);
      // Check for more unrated passengers
      const allRides = await getDriverRides(user.id);
      const cleanedRides = filterCleanupRides(allRides);
      await checkForUnratedPassengers(user.id, cleanedRides);
    }
  };

  const filters: { label: string; value: TripFilter; color: string }[] = [
    { label: 'Scheduled', value: 'scheduled', color: 'blue' },
    { label: 'Ongoing', value: 'ongoing', color: 'green' },
    { label: 'Completed', value: 'completed', color: 'gray' },
    { label: 'Cancelled', value: 'cancelled', color: 'red' },
  ];

  const getFilterColor = (color: string, active: boolean) => {
    const colors = {
      blue: active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 border-blue-200',
      green: active ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border-green-200',
      gray: active ? 'bg-gray-600 text-white' : 'bg-gray-50 text-gray-700 border-gray-200',
      red: active ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[color as keyof typeof colors];
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
            <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
              <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
            </div>

            {/* Filter Tabs */}
            <div className="flex-none bg-white border-b border-gray-200 px-4 py-3 overflow-x-auto">
              <div className="flex space-x-2">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setActiveFilter(filter.value)}
                    className={`px-4 py-2 rounded-lg font-medium border transition-all whitespace-nowrap min-h-touch ${
                      getFilterColor(filter.color, activeFilter === filter.value)
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-600">Loading trips...</p>
                  </div>
                </div>
              ) : rides.length > 0 ? (
                <div className="space-y-3">
                  {rides.map((ride: any) => (
                    <div
                      key={ride.id}
                      onClick={() => navigate(`/driver/ride/${ride.id}`)}
                      className="bg-white rounded-xl shadow-md p-4 space-y-3 border border-gray-100 active:scale-98 transition-transform"
                    >
                      {/* Status Badge */}
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 flex-1 pr-2">
                          {ride.from_location?.address || 'Unknown'} → {ride.to_location?.address || 'Unknown'}
                        </h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ridesWithPendingRatings.has(ride.id) && (
                            <RatingBadge pending={true} />
                          )}
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            ride.status === 'scheduled' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                            ride.status === 'ongoing' ? 'bg-green-100 text-green-800 border-green-200' :
                            ride.status === 'completed' ? 'bg-gray-100 text-gray-800 border-gray-200' :
                            'bg-red-100 text-red-800 border-red-200'
                          }`}>
                            {ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}
                          </span>
                        </div>
                      </div>

                      {/* Ride Details */}
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <div className="text-gray-500 text-xs">Date</div>
                          <div className="font-medium text-gray-900">{ride.date}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500 text-xs">Time</div>
                          <div className="font-medium text-gray-900">{formatTime(ride.time)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500 text-xs">Seats</div>
                          <div className="font-medium text-gray-900">{ride.available_seats}</div>
                        </div>
                      </div>

                      {/* Price and Distance */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div className="text-sm text-gray-600">
                          {ride.distance ? `${ride.distance}km` : 'Distance N/A'}
                        </div>
                        <div className="text-green-600 font-semibold">
                          ${ride.price_per_seat}/seat
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl p-8 text-center space-y-3 shadow-sm border border-gray-100 mt-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
                    <span className="text-3xl">📅</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">No {activeFilter} trips</h3>
                    <p className="text-sm text-gray-600">
                      {activeFilter === 'scheduled' 
                        ? 'Post a ride to get started' 
                        : `You don't have any ${activeFilter} trips`}
                    </p>
                  </div>
                  {activeFilter === 'scheduled' && (
                    <button
                      onClick={() => navigate('/driver/post-ride')}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 active:scale-95 transition-all inline-block min-h-touch"
                    >
                      Post a Ride
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Bottom Navigation - Always Visible */}
        <BottomNav userType="driver" />
      </div>

      {/* Rating Modal */}
      {showRatingModal && ratingPassenger && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setRatingPassenger(null);
            setCurrentRideForRating(null);
          }}
          onSubmit={handleSubmitRating}
          userName={ratingPassenger.name || 'Passenger'}
          userImage={ratingPassenger.profile_image}
          userType="passenger"
        />
      )}
    </div>
  );
}
