import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, User, DollarSign, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getPassengerBookings, filterCleanupBookings } from '../../services/bookingService';
import BottomNav from '../../components/BottomNav';
import { RatingModal, RatingBadge } from '../../components/rating';
import { createReview, hasUserReviewedForRide } from '../../services/ratingService';
import { formatTime } from '../../utils/timeUtils';
import { RideCardSkeletonList } from '../../components/RideCard';
import { OptimizedImage } from '../../components/ProfileUploader';

const statusFilters = ['all', 'pending', 'confirmed', 'in-progress', 'completed', 'canceled'] as const;
type StatusFilter = typeof statusFilters[number];

const statusColors = {
  all: 'bg-gray-100 text-gray-700',
  searching: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  completed: 'bg-gray-100 text-gray-500',
  canceled: 'bg-red-100 text-red-700',
};

export default function RiderTrips() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingBooking, setRatingBooking] = useState<any>(null);
  const [pendingRatings, setPendingRatings] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [navigate]);

  const loadData = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.userType !== 'rider') {
      navigate('/');
      return;
    }
    setUser(currentUser);
    
    const bookingsData = await getPassengerBookings(currentUser.id);
    console.log('[RiderTrips] Fetched bookings:', bookingsData.length, bookingsData);
    
    // Filter out old completed/cancelled rides (8+ hours)
    const cleanedBookings = filterCleanupBookings(bookingsData);
    console.log('[RiderTrips] After cleanup:', cleanedBookings.length, cleanedBookings);
    
    setBookings(cleanedBookings);
    setLoading(false);

    // Check for completed rides that need rating
    await checkForUnratedRides(currentUser.id, cleanedBookings);
  };

  const checkForUnratedRides = async (userId: string, bookingsData: any[]) => {
    // Find completed accepted rides
    const completedRides = bookingsData.filter(
      (b) => b.status === 'accepted' && b.ride?.status === 'completed'
    );

    const pendingSet = new Set<string>();
    let firstUnrated: any = null;

    for (const booking of completedRides) {
      const alreadyReviewed = await hasUserReviewedForRide(
        userId,
        booking.ride.driver_id,
        booking.ride_id
      );

      if (!alreadyReviewed) {
        pendingSet.add(booking.id);
        if (!firstUnrated) {
          firstUnrated = booking;
        }
      }
    }

    // Update pending ratings state
    setPendingRatings(pendingSet);

    // Show modal for first unrated ride
    if (firstUnrated) {
      setRatingBooking(firstUnrated);
      setShowRatingModal(true);
    }
  };

  const handleSubmitRating = async (rating: number, comment: string) => {
    if (!user || !ratingBooking) return;

    const success = await createReview(user.id, {
      reviewed_user_id: ratingBooking.ride.driver_id,
      ride_id: ratingBooking.ride_id,
      rating,
      comment,
    });

    if (success) {
      setShowRatingModal(false);
      setRatingBooking(null);
      // Check for more unrated rides
      await checkForUnratedRides(user.id, bookings);
    }
  };

  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredRequests(bookings);
    } else {
      // Map Supabase statuses to display statuses
      const statusMap: any = {
        'pending': 'pending',
        'accepted': 'confirmed',
        'rejected': 'canceled',
        'cancelled': 'canceled',
      };
      setFilteredRequests(bookings.filter(b => statusMap[b.status] === activeFilter || b.status === activeFilter));
    }
  }, [activeFilter, bookings]);

  const handleCardClick = (booking: any) => {
    // Check if this is a completed ride that needs rating
    if (
      booking.status === 'accepted' &&
      booking.ride?.status === 'completed' &&
      user
    ) {
      hasUserReviewedForRide(user.id, booking.ride.driver_id, booking.ride_id).then(
        (alreadyReviewed) => {
          if (!alreadyReviewed) {
            // Show rating modal
            setRatingBooking(booking);
            setShowRatingModal(true);
          } else {
            // Navigate to detail page
            navigate(`/rider/ride-detail/${booking.id}`);
          }
        }
      );
    } else {
      navigate(`/rider/ride-detail/${booking.id}`);
    }
  };

  return (
    <>
      <div className="w-full h-dvh bg-gradient-to-b from-blue-50 to-white">
        <main 
          className="w-full h-full flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header */}
          <header className="flex-none px-4 pt-4 pb-3 bg-white shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
            <p className="text-sm text-gray-600">Track your ride requests</p>
          </header>

          {/* Status Filters */}
          <div className="flex-none px-4 py-3 bg-white border-b border-gray-200 overflow-x-auto">
            <div className="flex gap-2">
              {statusFilters.map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap ${
                    activeFilter === filter 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter.replace('-', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Booking Cards */}
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-3">
            {loading ? (
              <RideCardSkeletonList count={5} />
            ) : filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <MapPin className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No {activeFilter !== 'all' ? activeFilter : ''} Trips
                </h3>
                <p className="text-sm text-gray-600">
                  {activeFilter === 'all' 
                    ? 'Start your journey by finding a ride' 
                    : `No trips with ${activeFilter} status`}
                </p>
              </div>
            ) : (
              filteredRequests.map((booking) => {
                const statusMap: any = {
                  'pending': 'pending',
                  'accepted': 'confirmed',
                  'rejected': 'canceled',
                  'cancelled': 'canceled',
                };
                const displayStatus = statusMap[booking.status] || booking.status;
                
                return (
                  <div
                    key={booking.id}
                    onClick={() => handleCardClick(booking)}
                    className="bg-white rounded-xl shadow-md p-4 active:bg-gray-50 transition-colors"
                  >
                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[displayStatus] || statusColors.pending}`}>
                        {booking.status.toUpperCase()}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>

                    {/* Driver Info */}
                    {booking.ride?.driver && (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex-none">
                          <OptimizedImage
                            src={booking.ride.driver.profile_image || ''}
                            alt={booking.ride.driver.name || 'Driver'}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{booking.ride.driver.name}</h3>
                            <RatingBadge 
                              rating={booking.ride.driver.rating}
                              pending={pendingRatings.has(booking.id)}
                            />
                          </div>
                          {booking.ride.car_details?.[0] && (
                            <p className="text-sm text-gray-600">
                              {booking.ride.car_details[0].make} {booking.ride.car_details[0].model}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Route */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-600 mt-1 flex-none"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{booking.pickup_location?.address}</p>
                          <p className="text-xs text-gray-600">{formatTime(booking.ride?.time)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600 mt-1 flex-none"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{booking.dropoff_location?.address}</p>
                          <p className="text-xs text-gray-600">{booking.ride?.estimated_arrival || 'Est. arrival'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>{booking.requested_seats} seat{booking.requested_seats > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          <span>
                            ${booking.price?.[0]?.price_cents 
                              ? (booking.price[0].price_cents / 100).toFixed(2)
                              : (booking.requested_seats * (booking.ride?.price_per_seat || 0)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {booking.ride?.date}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Navigation */}
          <BottomNav active="trips" userType="rider" />
        </main>
      </div>

      {/* Rating Modal */}
      {showRatingModal && ratingBooking && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setRatingBooking(null);
          }}
          onSubmit={handleSubmitRating}
          userName={ratingBooking.ride?.driver?.name || 'Driver'}
          userImage={ratingBooking.ride?.driver?.profile_image}
          userType="driver"
        />
      )}
    </>
  );
}
