import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, RefreshCw } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getReviewsByUser, getUserAverageRating, Review } from '../../services/ratingService';
import { getUserProfile } from '../../services/profileService';

export default function RatingsReviewsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [myRating, setMyRating] = useState(5.0);
  const [totalRides, setTotalRides] = useState(0);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }
      
      setUser(currentUser);
      await loadRatingsData(currentUser.id);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRatingsData = async (userId: string) => {
    // Load user's average rating and total rides from profile
    const profile = await getUserProfile(userId);
    if (profile) {
      // Parse rating to ensure it's a number
      const rating = typeof profile.rating === 'string' 
        ? parseFloat(profile.rating) 
        : profile.rating;
      setMyRating(rating || 5.0);
      setTotalRides(profile.total_rides || 0);
    }
    
    // Load reviews given by this rider
    const reviews = await getReviewsByUser(userId);
    setMyReviews(reviews);
  };

  const handleRefresh = async () => {
    if (user) {
      setLoading(true);
      await loadRatingsData(user.id);
      setLoading(false);
    }
  };

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
      <main 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none px-4 py-3 bg-white shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 active:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Ratings & Reviews</h1>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 active:bg-gray-100 rounded-lg transition-colors"
            title="Refresh ratings"
          >
            <RefreshCw className="w-5 h-5 text-gray-900" />
          </button>
        </header>

        {/* My Rating Summary */}
        <div className="flex-none bg-white p-6 border-b border-gray-200">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Star className="w-8 h-8 text-yellow-500 fill-yellow-500" />
              <span className="text-4xl font-bold text-gray-900">{myRating.toFixed(1)}</span>
            </div>
            <p className="text-sm text-gray-600">Your average rating</p>
            <p className="text-xs text-gray-500 mt-1">{totalRides} rides completed</p>
          </div>
        </div>

        {/* Reviews Given */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Reviews You've Given</h2>
          
          {myReviews.length > 0 ? (
            <div className="space-y-3">
              {myReviews.map(review => (
                <div key={review.id} className="bg-white rounded-xl shadow-md p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                      {review.reviewed_user?.name.charAt(0) || 'D'}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {review.reviewed_user?.name || 'Driver'}
                      </h3>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map(star => (
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
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(review.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-gray-700">{review.comment}</p>
                  )}
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
                Complete rides and rate your drivers to see your reviews here
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
