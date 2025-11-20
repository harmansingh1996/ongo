import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, RefreshCw } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { getReviewsForUser, getUserAverageRating, Review } from '../../services/ratingService';

export default function RatingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserAndRatings();
  }, [navigate]);

  const loadUserAndRatings = async () => {
    setLoading(true);
    const currentUser = await getCurrentUser();
    
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    await loadRatingsData(currentUser.id);
    setLoading(false);
  };

  const loadRatingsData = async (userId: string) => {
    // Force fresh data by adding timestamp to prevent caching
    const timestamp = Date.now();
    const [reviewsData, avgRating] = await Promise.all([
      getReviewsForUser(userId),
      getUserAverageRating(userId),
    ]);
    setReviews(reviewsData);
    setAverageRating(avgRating);
  };

  const handleRefresh = async () => {
    if (user) {
      setLoading(true);
      await loadRatingsData(user.id);
      setLoading(false);
    }
  };

  const ratingCounts = [5, 4, 3, 2, 1].map(star =>
    reviews.filter(r => r.rating === star).length
  );

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading ratings...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Ratings & Reviews</h1>
            </div>
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              title="Refresh ratings"
            >
              <RefreshCw className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Rating Summary */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
            <div className="text-5xl font-bold text-gray-900 mb-2">
              {averageRating > 0 ? averageRating.toFixed(1) : 'N/A'}
            </div>
            <div className="flex items-center justify-center space-x-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star 
                  key={star}
                  className={`w-6 h-6 ${
                    star <= Math.round(averageRating) 
                      ? 'text-yellow-500 fill-yellow-500' 
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <div className="text-sm text-gray-600">
              Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </div>

            {/* Rating Distribution */}
            {reviews.length > 0 && (
              <div className="mt-6 space-y-2">
                {[5, 4, 3, 2, 1].map((star, index) => (
                  <div key={star} className="flex items-center space-x-3">
                    <div className="text-sm text-gray-600 w-8 text-right">{star}</div>
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-yellow-500 h-full transition-all"
                        style={{ width: `${reviews.length > 0 ? (ratingCounts[index] / reviews.length) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-600 w-8">{ratingCounts[index]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reviews List */}
          {reviews.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Recent Reviews</h3>
              
              {reviews.map((review) => (
                <div key={review.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                      {review.reviewer?.name.charAt(0) || 'U'}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-gray-900">
                          {review.reviewer?.name || 'Unknown User'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star 
                            key={star}
                            className={`w-4 h-4 ${
                              star <= review.rating 
                                ? 'text-yellow-500 fill-yellow-500' 
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      
                      {review.comment && (
                        <p className="text-sm text-gray-700">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                <Star className="w-8 h-8 text-gray-400" />
              </div>
              <div className="font-semibold text-gray-900 mb-1">No reviews yet</div>
              <p className="text-sm text-gray-600">
                Complete rides to start receiving reviews from passengers
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
