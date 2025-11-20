import { supabase } from './supabaseClient';

/**
 * Rating Service
 * Handles user ratings and reviews with Supabase
 */

export interface Review {
  id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  ride_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  reviewer?: {
    name: string;
    profile_image: string | null;
  };
  reviewed_user?: {
    name: string;
    profile_image: string | null;
  };
}

export interface CreateReviewData {
  reviewed_user_id: string;
  ride_id: string | null;
  rating: number;
  comment?: string;
}

/**
 * Create a new review
 * The database trigger will automatically update the user's rating
 * (see RATING_UPDATE_TRIGGER_FIX.sql)
 */
export async function createReview(
  reviewerId: string,
  reviewData: CreateReviewData
): Promise<Review | null> {
  try {
    console.log('[ratingService] Creating review:', { reviewerId, ...reviewData });

    const { data, error } = await supabase
      .from('reviews')
      .insert([
        {
          reviewer_id: reviewerId,
          ...reviewData,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('[ratingService] ❌ Failed to create review:', error);
      throw error;
    }

    console.log('[ratingService] ✓ Review created successfully:', data.id);

    // DEPRECATED: Manual rating update - database trigger should handle this
    // Keeping this call for backward compatibility with databases that don't have the trigger
    // This will fail with RLS error but won't block review creation
    await updateUserRating(reviewData.reviewed_user_id);

    console.log('[ratingService] Note: If you see RLS errors above, apply RATING_UPDATE_TRIGGER_FIX.sql to your database');

    return data;
  } catch (error) {
    console.error('[ratingService] Error creating review:', error);
    return null;
  }
}

/**
 * Get reviews written by a user
 */
export async function getReviewsByUser(userId: string): Promise<Review[]> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        reviewed_user:profiles!reviews_reviewed_user_id_fkey(name, profile_image)
      `)
      .eq('reviewer_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting reviews by user:', error);
    return [];
  }
}

/**
 * Get reviews received by a user
 */
export async function getReviewsForUser(userId: string): Promise<Review[]> {
  try {
    const { data, error} = await supabase
      .from('reviews')
      .select(`
        *,
        reviewer:profiles!reviews_reviewer_id_fkey(name, profile_image)
      `)
      .eq('reviewed_user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting reviews for user:', error);
    return [];
  }
}

/**
 * Get average rating for a user
 */
export async function getUserAverageRating(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('rating')
      .eq('reviewed_user_id', userId);

    if (error) throw error;

    if (!data || data.length === 0) {
      return 5.0; // Default rating
    }

    const sum = data.reduce((acc, review) => acc + review.rating, 0);
    return Number((sum / data.length).toFixed(2));
  } catch (error) {
    console.error('Error calculating average rating:', error);
    return 5.0;
  }
}

/**
 * Update user's rating in profiles table
 * NOTE: This function should NOT be called from frontend due to RLS restrictions
 * Rating updates should be handled by the database trigger (RATING_UPDATE_TRIGGER_FIX.sql)
 * Keeping this function for backward compatibility but marking it as deprecated
 * @deprecated Use database trigger instead - apply RATING_UPDATE_TRIGGER_FIX.sql to your Supabase database
 */
async function updateUserRating(userId: string): Promise<void> {
  try {
    const avgRating = await getUserAverageRating(userId);

    console.log(`[ratingService] Attempting to update rating for user ${userId} to ${avgRating}`);

    const { error } = await supabase
      .from('profiles')
      .update({ rating: avgRating })
      .eq('id', userId);

    if (error) {
      console.error('[ratingService] ❌ CRITICAL: Rating update blocked by RLS policy:', error);
      console.error('[ratingService] This is expected - ratings should be updated by database trigger');
      console.error('[ratingService] Please apply RATING_UPDATE_TRIGGER_FIX.sql to your Supabase database');
      throw error;
    }

    console.log(`[ratingService] ✓ Rating updated successfully for user ${userId}`);
  } catch (error) {
    console.error('[ratingService] Error updating user rating:', error);
    // Don't rethrow - allow review creation to succeed even if manual update fails
    // Database trigger should handle the update
  }
}

/**
 * Update an existing review
 */
export async function updateReview(
  reviewId: string,
  reviewerId: string,
  updateData: { rating?: number; comment?: string }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', reviewId)
      .eq('reviewer_id', reviewerId);

    if (error) throw error;

    // Get the reviewed user id to update their rating
    const { data: review } = await supabase
      .from('reviews')
      .select('reviewed_user_id')
      .eq('id', reviewId)
      .single();

    if (review) {
      await updateUserRating(review.reviewed_user_id);
    }

    return true;
  } catch (error) {
    console.error('Error updating review:', error);
    return false;
  }
}

/**
 * Delete a review
 */
export async function deleteReview(
  reviewId: string,
  reviewerId: string
): Promise<boolean> {
  try {
    // Get the reviewed user id before deleting
    const { data: review } = await supabase
      .from('reviews')
      .select('reviewed_user_id')
      .eq('id', reviewId)
      .single();

    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId)
      .eq('reviewer_id', reviewerId);

    if (error) throw error;

    // Update the reviewed user's rating after deletion
    if (review) {
      await updateUserRating(review.reviewed_user_id);
    }

    return true;
  } catch (error) {
    console.error('Error deleting review:', error);
    return false;
  }
}

/**
 * Get total number of reviews for a user
 */
export async function getReviewCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('reviewed_user_id', userId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting review count:', error);
    return 0;
  }
}

/**
 * Check if a user has already reviewed another user for a specific ride
 */
export async function hasUserReviewedForRide(
  reviewerId: string,
  reviewedUserId: string,
  rideId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id')
      .eq('reviewer_id', reviewerId)
      .eq('reviewed_user_id', reviewedUserId)
      .eq('ride_id', rideId)
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0) || false;
  } catch (error) {
    console.error('Error checking if user reviewed:', error);
    return false;
  }
}

/**
 * Get review for a specific ride between two users
 */
export async function getReviewForRide(
  reviewerId: string,
  reviewedUserId: string,
  rideId: string
): Promise<Review | null> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('reviewer_id', reviewerId)
      .eq('reviewed_user_id', reviewedUserId)
      .eq('ride_id', rideId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting review for ride:', error);
    return null;
  }
}
