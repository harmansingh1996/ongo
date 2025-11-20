import { useState, useEffect } from 'react';
import { X, Star, User, Calendar, TrendingUp, MessageCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface RiderProfileModalProps {
  riderId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function RiderProfileModal({ riderId, isOpen, onClose }: RiderProfileModalProps) {
  const [rider, setRider] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && riderId) {
      loadRiderData();
    }
  }, [isOpen, riderId]);

  const loadRiderData = async () => {
    setLoading(true);
    try {
      // Load rider profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', riderId)
        .single();

      if (profileError) throw profileError;
      setRider(profile);

      // Load rider reviews
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:profiles!reviews_reviewer_id_fkey(id, name, profile_image)
        `)
        .eq('reviewed_user_id', riderId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (reviewsError) throw reviewsError;
      setReviews(reviewsData || []);
    } catch (error) {
      console.error('Error loading rider data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div
        className="w-full bg-white rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Modal Header */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Rider Profile</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full active:scale-95 transition-all"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading rider details...</p>
              </div>
            </div>
          ) : rider ? (
            <div className="px-4 py-4 space-y-4">
              {/* Profile Info */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center gap-4 mb-4">
                  {rider.profile_image ? (
                    <img
                      src={rider.profile_image}
                      alt={rider.name}
                      className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center border-4 border-white shadow-md">
                      <User className="w-10 h-10 text-white" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{rider.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold text-gray-900">
                        {rider.rating?.toFixed(1) || '5.0'}
                      </span>
                      <span className="text-sm text-gray-600 ml-1">
                        ({reviews.length} reviews)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <TrendingUp className="w-4 h-4" />
                      Total Rides
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {rider.total_trips || 0}
                    </div>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      <Calendar className="w-4 h-4" />
                      Member Since
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {new Date(rider.member_since || rider.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                {rider.bio && (
                  <div className="mt-3 bg-white/60 rounded-lg p-3">
                    <p className="text-sm text-gray-700">{rider.bio}</p>
                  </div>
                )}
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
                        <div key={review.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
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
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-600">Failed to load rider profile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
