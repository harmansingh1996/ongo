import { supabase } from './supabaseClient';

/**
 * Profile Service
 * Handles user profile data management with Supabase
 */

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  profile_image: string | null;
  user_type: 'driver' | 'rider';
  rating: number;
  total_rides: number;
  created_at: string;
}

export interface ProfileUpdateData {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  profile_image?: string;
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string, 
  updates: ProfileUpdateData
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating profile:', error);
    return false;
  }
}

/**
 * Update user rating (called after ride completion)
 */
export async function updateUserRating(
  userId: string,
  newRating: number
): Promise<boolean> {
  try {
    // Fetch current rating and total rides
    const { data: profile } = await supabase
      .from('profiles')
      .select('rating, total_rides')
      .eq('id', userId)
      .single();

    if (!profile) return false;

    // Calculate new average rating
    const currentTotal = profile.rating * profile.total_rides;
    const newTotal = currentTotal + newRating;
    const newTotalRides = profile.total_rides + 1;
    const updatedRating = newTotal / newTotalRides;

    // Update profile
    const { error } = await supabase
      .from('profiles')
      .update({
        rating: Number(updatedRating.toFixed(2)),
        total_rides: newTotalRides,
      })
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating rating:', error);
    return false;
  }
}

/**
 * Increment total rides count
 */
export async function incrementTotalRides(userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_rides')
      .eq('id', userId)
      .single();

    if (!profile) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ total_rides: profile.total_rides + 1 })
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error incrementing total rides:', error);
    return false;
  }
}

/**
 * Get real-time trip count for a driver from bookings
 */
export async function getDriverTripCount(driverId: string): Promise<number> {
  try {
    // Count completed bookings for rides created by this driver
    // Need to join with rides table since bookings don't have driver_id directly
    const { count, error } = await supabase
      .from('bookings')
      .select('*, rides!inner(driver_id)', { count: 'exact', head: true })
      .eq('rides.driver_id', driverId)
      .eq('status', 'completed');

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching driver trip count:', error);
    return 0;
  }
}

/**
 * Get real-time trip count for a rider from bookings
 */
export async function getRiderTripCount(riderId: string): Promise<number> {
  try {
    // Count completed rides from bookings where the user is the rider
    const { count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .eq('status', 'completed');

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error fetching rider trip count:', error);
    return 0;
  }
}
