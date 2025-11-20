import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, User, Car, TrendingUp, Calendar, MessageCircle, Phone, Mail } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function DriverProfileDetail() {
  const navigate = useNavigate();
  const { driverId } = useParams();
  const [driver, setDriver] = useState<any>(null);
  const [carDetails, setCarDetails] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalTrips: 0, completedTrips: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (driverId) {
      loadDriverData();
    }
  }, [driverId]);

  const loadDriverData = async () => {
    setLoading(true);
    try {
      // Load driver profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', driverId)
        .single();

      if (profileError) throw profileError;
      setDriver(profile);

      // Load car details
      const { data: car, error: carError } = await supabase
        .from('car_details')
        .select('*')
        .eq('user_id', driverId)
        .single();

      if (!carError && car) {
        setCarDetails(car);
      }

      // Load driver reviews
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:profiles!reviews_reviewer_id_fkey(id, name, profile_image)
        `)
        .eq('reviewed_user_id', driverId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!reviewsError && reviewsData) {
        setReviews(reviewsData);
      }

      // Load trip statistics
      const { data: rides, error: ridesError } = await supabase
        .from('rides')
        .select('id, status')
        .eq('driver_id', driverId);

      if (!ridesError && rides) {
        const total = rides.length;
        const completed = rides.filter((r: any) => r.status === 'completed').length;
        setStats({ totalTrips: total, completedTrips: completed });
      }
    } catch (error) {
      console.error('Error loading driver data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading driver profile...</p>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Driver not found</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold">Driver Profile</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Profile Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-center gap-4 mb-4">
              {driver.profile_image ? (
                <img
                  src={driver.profile_image}
                  alt={driver.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                  <User className="w-12 h-12 text-white" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900">{driver.name}</h2>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                  <span className="text-xl font-semibold text-gray-900">
                    {driver.rating?.toFixed(1) || '5.0'}
                  </span>
                  <span className="text-sm text-gray-600 ml-1">({reviews.length} reviews)</span>
                </div>
                {driver.verified && (
                  <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    ✓ Verified Driver
                  </span>
                )}
              </div>
            </div>
            {/* Contact Info */}

            {/* Bio */}
            {driver.bio && (
              <div className="mt-3 bg-white/60 rounded-lg p-3">
                <p className="text-sm text-gray-700">{driver.bio}</p>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <TrendingUp className="w-5 h-5" />
                Total Trips
              </div>
              <div className="text-3xl font-bold text-gray-900">{stats.totalTrips}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Calendar className="w-5 h-5" />
                Completed
              </div>
              <div className="text-3xl font-bold text-green-600">{stats.completedTrips}</div>
            </div>
          </div>

          {/* Car Details */}
          {carDetails && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Car className="w-5 h-5 text-gray-600" />
                  Vehicle Information
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Make & Model</span>
                  <span className="font-semibold text-gray-900">
                    {carDetails.make} {carDetails.model}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Year</span>
                  <span className="font-semibold text-gray-900">{carDetails.year}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Color</span>
                  <span className="font-semibold text-gray-900">{carDetails.color}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">License Plate</span>
                  <span className="font-semibold text-gray-900">{carDetails.license_plate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Seats</span>
                  <span className="font-semibold text-gray-900">{carDetails.seats}</span>
                </div>
              </div>
            </div>
          )}

          {/* Member Since */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <Calendar className="w-5 h-5" />
              Member Since
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {new Date(driver.member_since || driver.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>

          {/* Reviews Section */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-gray-600" />
                Reviews ({reviews.length})
              </h3>
            </div>
            <div className="p-4">
              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="border-b border-gray-100 last:border-0 pb-4 last:pb-0"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        {review.reviewer?.profile_image ? (
                          <img
                            src={review.reviewer.profile_image}
                            alt={review.reviewer.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-600" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {review.reviewer?.name || 'Anonymous'}
                          </div>
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
                                    ? 'text-yellow-500 fill-yellow-500'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-gray-700 ml-13">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No reviews yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
