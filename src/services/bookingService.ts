import { supabase, handleSupabaseError } from './supabaseClient';
import { shouldCancelBookingRequest } from '../utils/rideTimeUtils';

/**
 * Booking Service
 * Handles all ride booking/request operations with Supabase
 */

/**
 * Check if a booking should be automatically cleaned up (hidden from UI)
 * Bookings are cleaned up 8 hours after their ride completes or gets cancelled
 */
export function shouldCleanupBooking(booking: any): boolean {
  if (!booking) return false;
  
  // Check if the associated ride should be cleaned up
  if (booking.ride) {
    const rideStatus = booking.ride.status;
    if (rideStatus !== 'completed' && rideStatus !== 'cancelled') {
      return false;
    }
    
    const completionTime = booking.ride.completed_at || booking.ride.updated_at || booking.ride.created_at;
    if (!completionTime) return false;
    
    const completionDate = new Date(completionTime);
    const now = new Date();
    const hoursSinceCompletion = (now.getTime() - completionDate.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceCompletion >= 8;
  }
  
  // If no ride info, check booking's own status
  if (booking.status === 'cancelled' || booking.status === 'rejected') {
    const updateTime = booking.updated_at || booking.created_at;
    if (!updateTime) return false;
    
    const updateDate = new Date(updateTime);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - updateDate.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceUpdate >= 8;
  }
  
  return false;
}

/**
 * Filter out bookings that should be cleaned up
 */
export function filterCleanupBookings(bookings: any[]): any[] {
  return bookings.filter(booking => !shouldCleanupBooking(booking));
}

export interface CreateBookingData {
  rideId: string;
  passengerId: string;
  requestedSeats: number;
  pickupLocation: {
    address: string;
    lat: number;
    lng: number;
  };
  dropoffLocation: {
    address: string;
    lat: number;
    lng: number;
  };
  message?: string;
  pricePerSeat?: number;
  totalPrice?: number;
  distanceKm?: number;
  referralUseId?: string; // For tracking which referral was used
  discountApplied?: number; // Amount of discount applied
}

export interface UpdateBookingData {
  status?: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message?: string;
}

/**
 * Create a new ride booking/request with 12-hour window validation
 */
export async function createBooking(
  bookingData: CreateBookingData,
  rideDate?: string,
  rideTime?: string
): Promise<string | null> {
  try {
    const now = new Date();
    
    // VALIDATION: Check if booking is within 12-hour window
    if (rideDate && rideTime) {
      const shouldCancel = shouldCancelBookingRequest(now, rideDate, rideTime);
      if (shouldCancel) {
        console.error('❌ Booking request rejected: Outside 12-hour booking window');
        throw new Error('Booking requests must be made within 12 hours of ride departure');
      }
    }
    
    // Create ride request with price_per_seat
    const { data, error } = await supabase
      .from('ride_requests')
      .insert({
        ride_id: bookingData.rideId,
        passenger_id: bookingData.passengerId,
        requested_seats: bookingData.requestedSeats,
        pickup_location: bookingData.pickupLocation,
        dropoff_location: bookingData.dropoffLocation,
        status: 'pending',
        message: bookingData.message || null,
        request_date: now.toISOString(),
        price_per_seat: bookingData.pricePerSeat || null, // Store calculated segment price per seat
      })
      .select('id')
      .single();

    if (error) {
      handleSupabaseError(error);
      return null;
    }

    const rideRequestId = data.id;

    // Save price information if provided (for backward compatibility)
    if (bookingData.pricePerSeat && bookingData.totalPrice && rideRequestId) {
      const distanceMeters = bookingData.distanceKm ? Math.round(bookingData.distanceKm * 1000) : 0;
      const priceCents = Math.round(bookingData.totalPrice * 100);

      const { error: priceError } = await supabase
        .from('ride_request_price')
        .insert({
          ride_request_id: rideRequestId,
          segment_index: 0,
          start_lat: bookingData.pickupLocation.lat,
          start_lng: bookingData.pickupLocation.lng,
          end_lat: bookingData.dropoffLocation.lat,
          end_lng: bookingData.dropoffLocation.lng,
          distance_meters: distanceMeters,
          price_cents: priceCents,
          currency: 'USD',
        });

      if (priceError) {
        console.error('Error saving price information:', priceError);
        // Don't fail the booking if price save fails, just log the error
      }
    }

    return rideRequestId;
  } catch (error) {
    console.error('Error creating booking:', error);
    return null;
  }
}

/**
 * Get all bookings for a passenger (rider)
 * Optimized with parallel queries for faster data fetching
 */
export async function getPassengerBookings(passengerId: string): Promise<any[]> {
  try {
    // Step 1: Get ride requests with basic ride info only (2-level join)
    const { data: requests, error } = await supabase
      .from('ride_requests')
      .select(`
        id, ride_id, passenger_id, requested_seats, pickup_location, dropoff_location, 
        message, status, confirmed_at, request_date, created_at, updated_at,
        ride:rides!ride_requests_ride_id_fkey(
          id, driver_id, from_location, to_location, date, time, available_seats, 
          price_per_seat, distance, duration, status, created_at
        )
      `)
      .eq('passenger_id', passengerId)
      .order('request_date', { ascending: false })
      .limit(100);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // Step 2: Extract IDs for parallel fetching
    const driverIds = [...new Set(requests.map((r: any) => r.ride?.driver_id).filter(Boolean))];
    const requestIds = requests.map((r: any) => r.id);

    // Step 3: Fetch all related data in parallel (3 queries at once)
    const [driversResult, carsResult, pricesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, profile_image, rating, phone')
        .in('id', driverIds),
      supabase
        .from('car_details')
        .select('user_id, id, make, model, year, color, license_plate, seats')
        .in('user_id', driverIds),
      supabase
        .from('ride_request_price')
        .select('ride_request_id, id, segment_index, distance_meters, price_cents, currency')
        .in('ride_request_id', requestIds)
    ]);

    // Handle errors gracefully
    if (driversResult.error) {
      console.error('Error fetching driver profiles:', driversResult.error);
    }
    if (carsResult.error) {
      console.error('Error fetching car details:', carsResult.error);
    }
    if (pricesResult.error) {
      console.error('Error fetching prices:', pricesResult.error);
    }

    // Step 4: Build lookup maps for fast data combination
    const driverMap = new Map((driversResult.data || []).map(d => [d.id, d]));
    const carMap = new Map((carsResult.data || []).map(c => [c.user_id, c]));
    const priceMap = new Map<string, any[]>();
    (pricesResult.data || []).forEach(p => {
      if (!priceMap.has(p.ride_request_id)) {
        priceMap.set(p.ride_request_id, []);
      }
      priceMap.get(p.ride_request_id)!.push(p);
    });

    // Step 5: Combine all data
    return requests.map((request: any) => {
      const driver = driverMap.get(request.ride?.driver_id);
      const car = carMap.get(request.ride?.driver_id);
      
      return {
        ...request,
        ride: request.ride ? {
          ...request.ride,
          driver: driver ? {
            ...driver,
            car_details: car ? [car] : []
          } : null
        } : null,
        price: priceMap.get(request.id) || []
      };
    });
  } catch (error) {
    console.error('Error fetching passenger bookings:', error);
    return [];
  }
}

/**
 * Get all booking requests for a driver's rides
 * Optimized by breaking queries into sequential simple queries
 */
export async function getDriverBookingRequests(driverId: string): Promise<any[]> {
  try {
    // Step 1: Get all rides for this driver
    const { data: rides, error: ridesError } = await supabase
      .from('rides')
      .select('id')
      .eq('driver_id', driverId);

    if (ridesError) {
      handleSupabaseError(ridesError);
      return [];
    }

    if (!rides || rides.length === 0) {
      return [];
    }

    const rideIds = rides.map(r => r.id);

    // Step 2: Get booking requests with ride info (2-level join only)
    const { data: requests, error } = await supabase
      .from('ride_requests')
      .select(`
        id, ride_id, passenger_id, requested_seats, pickup_location, dropoff_location, 
        message, status, confirmed_at, request_date, created_at, updated_at, price_per_seat,
        ride:rides!ride_requests_ride_id_fkey(
          id, driver_id, from_location, to_location, date, time, available_seats, 
          price_per_seat, distance, duration, status, created_at, updated_at
        )
      `)
      .in('ride_id', rideIds)
      .order('request_date', { ascending: false })
      .limit(100);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // Step 3: Extract IDs for parallel fetching
    const passengerIds = [...new Set(requests.map((r: any) => r.passenger_id).filter(Boolean))];
    const requestIds = requests.map((r: any) => r.id);

    // Step 4: Fetch passenger profiles and prices in parallel (2 queries at once)
    const [passengersResult, pricesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, profile_image, rating, phone')
        .in('id', passengerIds),
      supabase
        .from('ride_request_price')
        .select('ride_request_id, id, segment_index, distance_meters, price_cents, currency')
        .in('ride_request_id', requestIds)
    ]);

    // Handle errors gracefully
    if (passengersResult.error) {
      console.error('Error fetching passenger profiles:', passengersResult.error);
    }
    if (pricesResult.error) {
      console.error('Error fetching prices:', pricesResult.error);
    }

    // Step 5: Build lookup maps for fast data combination
    const passengerMap = new Map((passengersResult.data || []).map(p => [p.id, p]));
    const priceMap = new Map<string, any[]>();
    (pricesResult.data || []).forEach(p => {
      if (!priceMap.has(p.ride_request_id)) {
        priceMap.set(p.ride_request_id, []);
      }
      priceMap.get(p.ride_request_id)!.push(p);
    });

    // Step 6: Combine all data
    return requests.map((request: any) => {
      const passenger = passengerMap.get(request.passenger_id);
      
      return {
        ...request,
        passenger: passenger || null,
        price: priceMap.get(request.id) || []
      };
    });
  } catch (error) {
    console.error('Error fetching driver booking requests:', error);
    return [];
  }
}

/**
 * Get a single booking by ID
 */
export async function getBookingById(bookingId: string): Promise<any | null> {
  try {
    console.log(`[bookingService] Fetching ride request with ID: ${bookingId}`);
    
    const { data, error } = await supabase
      .from('ride_requests')
      .select(`
        *,
        passenger:profiles!ride_requests_passenger_id_fkey(id, name, profile_image, rating, phone),
        ride:rides!ride_requests_ride_id_fkey(
          *,
          driver:profiles!rides_driver_id_fkey(
            id, name, profile_image, rating, phone,
            car_details:car_details!car_details_user_id_fkey(*)
          ),
          route_stops(*)
        ),
        price:ride_request_price!ride_request_price_ride_request_id_fkey(*)
      `)
      .eq('id', bookingId)
      .single();

    if (error) {
      // Provide more detailed error information
      if (error.code === 'PGRST116') {
        console.error(`[bookingService] Ride request not found: ${bookingId}`);
        console.error('[bookingService] Possible causes: Invalid ID, deleted record, or RLS policy blocking access');
      } else {
        console.error(`[bookingService] Database error fetching ride request: ${error.message}`, error);
      }
      handleSupabaseError(error);
      return null;
    }

    if (!data) {
      console.error(`[bookingService] No data returned for ride request ID: ${bookingId}`);
      return null;
    }

    console.log(`[bookingService] Successfully fetched ride request: ${bookingId}`);
    return data;
  } catch (error) {
    console.error('[bookingService] Unexpected error fetching booking:', error);
    return null;
  }
}

/**
 * Update booking status (accept, reject, cancel)
 */
export async function updateBookingStatus(
  bookingId: string,
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled',
  message?: string
): Promise<boolean> {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (message) {
      updateData.message = message;
    }

    // Only set confirmed_at if status is accepted
    // Note: This requires the confirmed_at column to exist in the database
    // Run: ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
    if (status === 'accepted') {
      updateData.confirmed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', bookingId);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    // If accepted, decrease available seats on the ride
    if (status === 'accepted') {
      const booking = await getBookingById(bookingId);
      if (booking && booking.ride) {
        const { error: rideError } = await supabase
          .from('rides')
          .update({
            available_seats: booking.ride.available_seats - booking.requested_seats,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.ride_id);

        if (rideError) {
          console.error('Error updating ride seats:', rideError);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error updating booking status:', error);
    return false;
  }
}

/**
 * Cancel a booking
 */
export async function cancelBooking(bookingId: string): Promise<boolean> {
  try {
    // Get booking details first to restore seats if it was accepted
    const booking = await getBookingById(bookingId);
    
    if (!booking) {
      return false;
    }

    // Update booking status to cancelled
    const { error } = await supabase
      .from('ride_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    // If booking was accepted, restore the seats
    if (booking.status === 'accepted' && booking.ride) {
      const { error: rideError } = await supabase
        .from('rides')
        .update({
          available_seats: booking.ride.available_seats + booking.requested_seats,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.ride_id);

      if (rideError) {
        console.error('Error restoring ride seats:', rideError);
      }
    }

    return true;
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return false;
  }
}

/**
 * Get pending booking requests for a specific ride
 */
export async function getPendingBookingsForRide(rideId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('ride_requests')
      .select(`
        *,
        passenger:profiles!ride_requests_passenger_id_fkey(id, name, profile_image, rating, phone),
        price:ride_request_price!ride_request_price_ride_request_id_fkey(*)
      `)
      .eq('ride_id', rideId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    return [];
  }
}

/**
 * Get accepted bookings for a specific ride (for route planning)
 */
export async function getAcceptedBookingsForRide(rideId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('ride_requests')
      .select(`
        id, passenger_id, pickup_location, dropoff_location,
        passenger:profiles!ride_requests_passenger_id_fkey(id, name, profile_image)
      `)
      .eq('ride_id', rideId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch accepted bookings');
    return [];
  }
}

/**
 * Get booking statistics for a passenger
 */
export async function getPassengerBookingStats(passengerId: string): Promise<{
  totalBookings: number;
  pendingBookings: number;
  acceptedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
}> {
  try {
    const { data, error } = await supabase
      .from('ride_requests')
      .select('status')
      .eq('passenger_id', passengerId);

    if (error) {
      handleSupabaseError(error);
      return { totalBookings: 0, pendingBookings: 0, acceptedBookings: 0, completedBookings: 0, cancelledBookings: 0 };
    }

    const stats = {
      totalBookings: data.length,
      pendingBookings: data.filter(r => r.status === 'pending').length,
      acceptedBookings: data.filter(r => r.status === 'accepted').length,
      completedBookings: 0, // This would require joining with rides table to check ride status
      cancelledBookings: data.filter(r => r.status === 'cancelled' || r.status === 'rejected').length,
    };

    return stats;
  } catch (error) {
    console.error('Error fetching booking stats:', error);
    return { totalBookings: 0, pendingBookings: 0, acceptedBookings: 0, completedBookings: 0, cancelledBookings: 0 };
  }
}

/**
 * Check if a passenger has already booked a specific ride
 */
export async function hasExistingBooking(passengerId: string, rideId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ride_requests')
      .select('id')
      .eq('passenger_id', passengerId)
      .eq('ride_id', rideId)
      .in('status', ['pending', 'accepted'])
      .limit(1);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    return (data && data.length > 0) || false;
  } catch (error) {
    console.error('Error checking existing booking:', error);
    return false;
  }
}

/**
 * Get accepted passengers for a specific ride
 */
export async function getAcceptedPassengersForRide(rideId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('ride_requests')
      .select(`
        *,
        passenger:profiles!ride_requests_passenger_id_fkey(id, name, profile_image, rating, phone),
        price:ride_request_price!ride_request_price_ride_request_id_fkey(*)
      `)
      .eq('ride_id', rideId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true });

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching accepted passengers:', error);
    return [];
  }
}
