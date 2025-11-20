import { Star, Clock } from 'lucide-react';

export interface RatingBadgeProps {
  /** User's average rating (1-5 stars). If undefined, shows no rating */
  rating?: number;
  /** Whether rating is pending for this ride */
  pending?: boolean;
  /** Size variant for different contexts */
  size?: 'sm' | 'md';
}

/**
 * RatingBadge Component
 * 
 * Displays user rating or pending status on trip cards
 * - Shows star icon + rating number for rated users
 * - Shows "Pending" indicator for unrated completed rides
 * - Mobile-optimized with touch-friendly sizing
 */
export function RatingBadge({ rating, pending = false, size = 'sm' }: RatingBadgeProps) {
  // If pending, show pending indicator
  if (pending) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 border border-yellow-200 ${
        size === 'sm' ? 'text-xs' : 'text-sm'
      }`}>
        <Clock className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-yellow-600`} />
        <span className="font-medium text-yellow-700">Pending</span>
      </div>
    );
  }

  // If no rating available, don't show anything
  if (!rating) {
    return null;
  }

  // Show rating with star
  const displayRating = rating.toFixed(1);
  const ratingColor = rating >= 4.5 
    ? 'bg-green-50 border-green-200 text-green-700' 
    : rating >= 4.0 
    ? 'bg-blue-50 border-blue-200 text-blue-700'
    : rating >= 3.0
    ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
    : 'bg-orange-50 border-orange-200 text-orange-700';

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${ratingColor} ${
      size === 'sm' ? 'text-xs' : 'text-sm'
    }`}>
      <Star className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} fill-current`} />
      <span className="font-semibold">{displayRating}</span>
    </div>
  );
}
