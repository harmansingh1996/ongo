import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { hapticFeedback } from '../../utils/mobileFeatures';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  userName: string;
  userImage?: string;
  userType: 'driver' | 'passenger';
}

export const RatingModal: React.FC<RatingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  userName,
  userImage,
  userType,
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleStarClick = (value: number) => {
    setRating(value);
    hapticFeedback('light');
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      alert('Please select a rating');
      return;
    }

    setSubmitting(true);
    hapticFeedback('medium');

    try {
      await onSubmit(rating, comment);
      onClose();
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div 
        className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Rate Your {userType === 'driver' ? 'Driver' : 'Passenger'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 active:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="flex flex-col items-center">
            <img
              src={userImage || '/assets/placeholder-avatar.jpg'}
              alt={userName}
              className="w-20 h-20 rounded-full object-cover mb-3"
            />
            <h3 className="text-xl font-semibold text-gray-900">{userName}</h3>
            <p className="text-sm text-gray-600">
              How was your ride with {userName}?
            </p>
          </div>

          {/* Star Rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => handleStarClick(value)}
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1 active:scale-110 transition-transform"
              >
                <Star
                  className={`w-10 h-10 ${
                    value <= (hoverRating || rating)
                      ? 'text-yellow-500 fill-yellow-500'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Rating Text */}
          {rating > 0 && (
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900">
                {rating === 5 && 'Excellent!'}
                {rating === 4 && 'Great!'}
                {rating === 3 && 'Good'}
                {rating === 2 && 'Fair'}
                {rating === 1 && 'Poor'}
              </p>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add a comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={500}
            />
            <div className="text-xs text-gray-500 text-right mt-1">
              {comment.length}/500
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium active:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>

          {/* Skip Button */}
          <button
            onClick={onClose}
            className="w-full text-gray-600 py-2 text-sm"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};
