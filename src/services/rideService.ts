import { supabase, handleSupabaseError } from './supabaseClient';
import { Ride, RideStatus, Stop } from '../types';
import { createEarning } from './earningsService';
import { createNotification } from './notificationService';
import { capturePayment, getPaymentIntentByBookingId } from './paymentService';
import { 
  isSegmentAvailableForBooking, 
  findMatchingSegments, 
  getHoursUntil,
  isWithin12HourWindow 
} from '../utils/rideTimeUtils';

/**
 * Ride Service
 * Handles all ride-related operations with Supabase
 */

/**
 * Check if a ride should be automatically cleaned up (hidden from UI)
 * Rides are cleaned up 8 hours after completion or cancellation
 */
export function shouldCleanupRide(ride: any): boolean {
  if (!ride) return false;
  
  // Only cleanup completed or cancelled rides
  if (ride.status !== 'completed' && ride.status !== 'cancelled') {
    return false;
  }
  
  // Get the timestamp to check against
  const completionTime = ride.completed_at || ride.updated_at || ride.created_at;
  if (!completionTime) return false;
  
  const completionDate = new Date(completionTime);
  const now = new Date();
  const hoursSinceCompletion = (now.getTime() - completionDate.getTime()) / (1000 * 60 * 60);
  
  // Cleanup after 8 hours
  return hoursSinceCompletion >= 8;
}

/**
 * Filter out rides that should be cleaned up
 */
export function filterCleanupRides(rides: any[]): any[] {
  return rides.filter(ride => !shouldCleanupRide(ride));
}

export interface CreateRideData {
  fromLocation: {
    address: string;
    lat: number;
    lng: number;
  };
  toLocation: {
    address: string;
    lat: number;
    lng: number;
  };
  stops?: Stop[];
  date: string;
  time: string;
  availableSeats: number;
  pricePerSeat: number;
  pricePerKm?: number;
  distance?: number;
  duration?: number;
  estimatedArrival?: string;
  routeData?: any;
  ridePolicyAccepted: boolean;
}

export interface UpdateRideData {
  status?: RideStatus;
  availableSeats?: number;
  pricePerSeat?: number;
}

export interface RideSegment {
  fromStop: any;
  toStop: any;
  fromStopIndex: number;
  toStopIndex: number;
  distance: number;
  duration: number;
  price: number;
  isFullRoute: boolean;
}

/**
 * Create a new ride
 */
export async function createRide(driverId: string, rideData: CreateRideData): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('rides')
      .insert({
        driver_id: driverId,
        from_location: rideData.fromLocation,
        to_location: rideData.toLocation,
        date: rideData.date,
        time: rideData.time,
        available_seats: rideData.availableSeats,
        price_per_seat: rideData.pricePerSeat,
        price_per_km: rideData.pricePerKm || null,
        distance: rideData.distance || null,
        duration: rideData.duration || null,
        estimated_arrival: rideData.estimatedArrival || null,
        route_data: rideData.routeData || null,
        status: 'scheduled',
        ride_policy_accepted: rideData.ridePolicyAccepted,
      })
      .select('id')
      .single();

    if (error) {
      handleSupabaseError(error);
      return null;
    }

    // Create route stops if provided
    if (rideData.stops && rideData.stops.length > 0) {
      const stopsToInsert = rideData.stops.map((stop, index) => ({
        ride_id: data.id,
        name: stop.address,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        stop_order: index,
        estimated_arrival: stop.estimatedArrival || null,
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stopsToInsert);

      if (stopsError) {
        console.error('Error creating route stops:', stopsError);
      }
    }

    return data.id;
  } catch (error) {
    console.error('Error creating ride:', error);
    return null;
  }
}

/**
 * Get all rides for a driver
 */
export async function getDriverRides(driverId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!rides_driver_id_fkey(id, name, profile_image, rating),
        route_stops(*)
      `)
      .eq('driver_id', driverId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching driver rides:', error);
    return [];
  }
}

/**
 * Get a single ride by ID
 */
export async function getRideById(rideId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!rides_driver_id_fkey(
          id, name, profile_image, rating, phone,
          car_details:car_details!car_details_user_id_fkey(*)
        ),
        route_stops(*)
      `)
      .eq('id', rideId)
      .single();

    if (error) {
      handleSupabaseError(error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching ride:', error);
    return null;
  }
}

/**
 * Find matching segment in a ride's route
 */
function findMatchingSegment(ride: any, searchFrom: { lat: number; lng: number }, searchTo: { lat: number; lng: number }): RideSegment | null {
  const PROXIMITY_THRESHOLD = 20; // km - maximum distance to consider a stop as matching the search location
  
  // PRIORITY CHECK: First check if search matches the ride's actual start/end locations
  // This ensures full route bookings are detected correctly even with intermediate stops
  const distanceToRideStart = calculateDistance(searchFrom.lat, searchFrom.lng, ride.from_location.lat, ride.from_location.lng);
  const distanceToRideEnd = calculateDistance(searchTo.lat, searchTo.lng, ride.to_location.lat, ride.to_location.lng);
  
  // If search coordinates are close to ride's actual start AND end, this is a FULL ROUTE booking
  if (distanceToRideStart < PROXIMITY_THRESHOLD && distanceToRideEnd < PROXIMITY_THRESHOLD) {
    console.log(`✅ FULL ROUTE MATCH: Start distance ${distanceToRideStart.toFixed(1)}km, End distance ${distanceToRideEnd.toFixed(1)}km`);
    console.log(`✅ Using stored price $${ride.price_per_seat} directly from database (NO calculations)`);
    
    // Build stops for display purposes
    const allStops = [
      { ...ride.from_location, order: -1, time: ride.time, estimatedArrival: ride.time },
      ...(ride.route_stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order),
      { ...ride.to_location, order: 999, estimatedArrival: ride.estimated_arrival }
    ];
    
    // Return stored price directly - NO CALCULATIONS
    return {
      fromStop: allStops[0],
      toStop: allStops[allStops.length - 1],
      fromStopIndex: 0,
      toStopIndex: allStops.length - 1,
      distance: ride.distance || calculateDistance(ride.from_location.lat, ride.from_location.lng, ride.to_location.lat, ride.to_location.lng),
      duration: ride.duration || 0,
      price: ride.price_per_seat, // Direct from database
      isFullRoute: true
    };
  }
  
  // SEGMENT BOOKING: Search through all stops to find matching segment
  const allStops = [
    { ...ride.from_location, order: -1, time: ride.time, estimatedArrival: ride.time },
    ...(ride.route_stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order),
    { ...ride.to_location, order: 999, estimatedArrival: ride.estimated_arrival }
  ];

  console.log(`🔍 Checking ${allStops.length} stops for segment match`);
  console.log(`🔍 Search FROM: ${searchFrom.lat}, ${searchFrom.lng}`);
  console.log(`🔍 Search TO: ${searchTo.lat}, ${searchTo.lng}`);

  // Find closest matching stops for search start and end
  let fromStopIndex = -1;
  let toStopIndex = -1;
  let fromDistance = Infinity;
  let toDistance = Infinity;

  allStops.forEach((stop, index) => {
    const distanceToSearchFrom = calculateDistance(searchFrom.lat, searchFrom.lng, stop.lat, stop.lng);
    const distanceToSearchTo = calculateDistance(searchTo.lat, searchTo.lng, stop.lat, stop.lng);

    console.log(`  Stop ${index} (${stop.address}): from=${distanceToSearchFrom.toFixed(1)}km, to=${distanceToSearchTo.toFixed(1)}km`);

    if (distanceToSearchFrom < fromDistance && distanceToSearchFrom < PROXIMITY_THRESHOLD) {
      fromDistance = distanceToSearchFrom;
      fromStopIndex = index;
      console.log(`    ✅ New best FROM match (${distanceToSearchFrom.toFixed(1)}km)`);
    }

    if (distanceToSearchTo < toDistance && distanceToSearchTo < PROXIMITY_THRESHOLD) {
      toDistance = distanceToSearchTo;
      toStopIndex = index;
      console.log(`    ✅ New best TO match (${distanceToSearchTo.toFixed(1)}km)`);
    }
  });

  console.log(`🎯 Final match indices: FROM=${fromStopIndex}, TO=${toStopIndex}`);

  // No match found
  if (fromStopIndex === -1 || toStopIndex === -1 || fromStopIndex >= toStopIndex) {
    console.log(`❌ No valid segment: from=${fromStopIndex}, to=${toStopIndex}, fromDist=${fromDistance.toFixed(1)}km, toDist=${toDistance.toFixed(1)}km`);
    return null;
  }

  const fromStop = allStops[fromStopIndex];
  const toStop = allStops[toStopIndex];

  // Calculate segment distance and proportional price
  const segmentDistance = calculateDistance(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
  const totalDistance = ride.distance || calculateDistance(
    ride.from_location.lat,
    ride.from_location.lng,
    ride.to_location.lat,
    ride.to_location.lng
  );

  const segmentPrice = totalDistance > 0
    ? Math.round((segmentDistance / totalDistance) * ride.price_per_seat * 100) / 100
    : ride.price_per_seat;

  console.log(`✅ SEGMENT BOOKING: stop ${fromStopIndex} → ${toStopIndex}, ${segmentDistance.toFixed(1)}km / ${totalDistance.toFixed(1)}km`);
  console.log(`✅ Calculated price $${segmentPrice}`);

  return {
    fromStop,
    toStop,
    fromStopIndex,
    toStopIndex,
    distance: segmentDistance,
    duration: 0,
    price: segmentPrice,
    isFullRoute: false
  };
}

/**
 * Search for available rides with segment matching support and time window validation
 */
export async function searchAvailableRides(params: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  fromAddress?: string;
  toAddress?: string;
  date: string;
  seats?: number;
}): Promise<any[]> {
  try {
    console.log('🔎 Searching rides with date:', params.date);
    console.log('🔎 From:', params.fromAddress, 'To:', params.toAddress);
    
    // Basic search - get rides on the same date with available seats
    const { data, error } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!rides_driver_id_fkey(
          id, name, profile_image, rating,
          car_details:car_details!car_details_user_id_fkey(*)
        ),
        route_stops(*)
      `)
      .eq('date', params.date)
      .eq('status', 'scheduled')
      .gte('available_seats', params.seats || 1)
      .order('time', { ascending: true });

    if (error) {
      console.error('❌ Database error:', error);
      handleSupabaseError(error);
      return [];
    }

    console.log(`📊 Database returned ${data?.length || 0} rides for date ${params.date}`);

    // Process rides with segment matching and time window validation
    const processedRides = (data || []).map((ride: any) => {
      const segment = findMatchingSegment(
        ride,
        { lat: params.fromLat, lng: params.fromLng },
        { lat: params.toLat, lng: params.toLng }
      );

      if (!segment) {
        return null;
      }

      // TIME WINDOW VALIDATION
      // Check if segment is still available based on time constraints
      // For intermediate stops, use estimated_arrival as the pickup time
      const segmentStartTime = segment.fromStop.estimatedArrival || segment.fromStop.time || ride.time;
      const segmentEndTime = segment.toStop.estimatedArrival || segment.toStop.time || '';
      
      let isAvailable = true;
      let bookingWindowMessage = '';
      
      if (segmentEndTime) {
        // Check time window availability
        isAvailable = isSegmentAvailableForBooking(
          ride.date,
          segmentStartTime,
          segmentEndTime
        );
        
        if (!isAvailable) {
          console.log(`⏰ Segment ${segment.fromStop.address} → ${segment.toStop.address} is past booking window`);
          return null; // Don't show rides outside booking window
        }
        
        // Calculate hours until segment start for display
        const hoursUntilStart = getHoursUntil(ride.date, segmentStartTime);
        if (hoursUntilStart >= 0 && hoursUntilStart < 24) {
          bookingWindowMessage = `Starts in ${Math.floor(hoursUntilStart)} hours`;
        }
      } else {
        // No end time, check if ride hasn't started yet
        isAvailable = isWithin12HourWindow(ride.date, segmentStartTime);
        if (!isAvailable) {
          console.log(`⏰ Ride starting at ${segmentStartTime} has already started or passed`);
          return null;
        }
      }

      // Return ride with segment info and time validation
      return {
        ...ride,
        matchedSegment: segment,
        // Override displayed values with segment-specific data
        displayFrom: segment.fromStop,
        displayTo: segment.toStop,
        displayPrice: segment.price,
        displayDistance: segment.distance,
        isSegmentBooking: !segment.isFullRoute,
        // Time window info
        isWithinBookingWindow: isAvailable,
        bookingWindowMessage,
        segmentStartTime,
        segmentEndTime,
      };
    }).filter(Boolean);

    console.log(`✨ Found ${processedRides.length} rides with matching segments within booking window`);
    return processedRides;
  } catch (error) {
    console.error('Error searching rides:', error);
    return [];
  }
}

/**
 * Update ride information
 */
export async function updateRide(rideId: string, updates: UpdateRideData): Promise<boolean> {
  try {
    const updateData: any = {
      status: updates.status,
      available_seats: updates.availableSeats,
      price_per_seat: updates.pricePerSeat,
      updated_at: new Date().toISOString(),
    };

    // Add completed_at timestamp when marking as completed
    if (updates.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('rides')
      .update(updateData)
      .eq('id', rideId);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    // Send notifications for status changes
    if (updates.status) {
      await notifyRideStatusChange(rideId, updates.status);
    }

    return true;
  } catch (error) {
    console.error('Error updating ride:', error);
    return false;
  }
}

/**
 * Delete/Cancel a ride
 */
export async function deleteRide(rideId: string): Promise<boolean> {
  try {
    // Update status to cancelled instead of deleting
    const { error } = await supabase
      .from('rides')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', rideId);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error cancelling ride:', error);
    return false;
  }
}

/**
 * Get upcoming rides for a driver
 */
export async function getUpcomingRides(driverId: string): Promise<any[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!rides_driver_id_fkey(id, name, profile_image, rating),
        route_stops(*)
      `)
      .eq('driver_id', driverId)
      .in('status', ['scheduled', 'ongoing'])
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .limit(10);

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching upcoming rides:', error);
    return [];
  }
}

/**
 * Get ride statistics for a driver
 */
export async function getDriverRideStats(driverId: string): Promise<{
  totalRides: number;
  completedRides: number;
  upcomingRides: number;
  cancelledRides: number;
}> {
  try {
    const { data, error } = await supabase
      .from('rides')
      .select('status')
      .eq('driver_id', driverId);

    if (error) {
      handleSupabaseError(error);
      return { totalRides: 0, completedRides: 0, upcomingRides: 0, cancelledRides: 0 };
    }

    const stats = {
      totalRides: data.length,
      completedRides: data.filter(r => r.status === 'completed').length,
      upcomingRides: data.filter(r => r.status === 'scheduled' || r.status === 'ongoing').length,
      cancelledRides: data.filter(r => r.status === 'cancelled').length,
    };

    return stats;
  } catch (error) {
    console.error('Error fetching ride stats:', error);
    return { totalRides: 0, completedRides: 0, upcomingRides: 0, cancelledRides: 0 };
  }
}

/**
 * Helper function to calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check driver's daily ride limit
 * Default: 2 rides per day, but admin can override
 */
export async function checkDailyRideLimit(driverId: string, rideDate: string): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
  message?: string;
}> {
  try {
    // Get driver's admin override limits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('admin_daily_ride_limit')
      .eq('id', driverId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    const dailyLimit = profile?.admin_daily_ride_limit || 2; // Default 2 rides per day

    // Count rides for the given date
    const { count, error } = await supabase
      .from('rides')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('date', rideDate)
      .in('status', ['scheduled', 'ongoing']);

    if (error) {
      handleSupabaseError(error);
      return {
        allowed: true,
        currentCount: 0,
        limit: dailyLimit,
      };
    }

    const currentCount = count || 0;
    const allowed = currentCount < dailyLimit;

    return {
      allowed,
      currentCount,
      limit: dailyLimit,
      message: allowed
        ? undefined
        : `Daily ride limit reached (${currentCount}/${dailyLimit} rides). You cannot post more rides for this date.`,
    };
  } catch (error) {
    console.error('Error checking daily ride limit:', error);
    return {
      allowed: true,
      currentCount: 0,
      limit: 2,
    };
  }
}

/**
 * Check driver's monthly ride limit
 * Default: 42 rides per month, but admin can override
 */
export async function checkMonthlyRideLimit(driverId: string, rideDate: string): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
  message?: string;
}> {
  try {
    // Get driver's admin override limits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('admin_monthly_ride_limit')
      .eq('id', driverId)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    const monthlyLimit = profile?.admin_monthly_ride_limit || 42; // Default 42 rides per month

    // Calculate the month range
    const date = new Date(rideDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    
    // Calculate last day of month
    const nextMonth = new Date(year, month, 1);
    const lastDay = new Date(nextMonth.getTime() - 1);
    const monthEnd = lastDay.toISOString().split('T')[0];

    // Count rides for the month
    const { count, error } = await supabase
      .from('rides')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .in('status', ['scheduled', 'ongoing', 'completed']);

    if (error) {
      handleSupabaseError(error);
      return {
        allowed: true,
        currentCount: 0,
        limit: monthlyLimit,
      };
    }

    const currentCount = count || 0;
    const allowed = currentCount < monthlyLimit;

    return {
      allowed,
      currentCount,
      limit: monthlyLimit,
      message: allowed
        ? undefined
        : `Monthly ride limit reached (${currentCount}/${monthlyLimit} rides). You cannot post more rides this month.`,
    };
  } catch (error) {
    console.error('Error checking monthly ride limit:', error);
    return {
      allowed: true,
      currentCount: 0,
      limit: 42,
    };
  }
}

/**
 * Check for ride time conflicts
 * Same driver cannot have overlapping rides
 */
export async function checkRideTimeConflict(
  driverId: string,
  rideDate: string,
  startTime: string,
  durationMinutes: number
): Promise<{
  hasConflict: boolean;
  conflictingRides: any[];
  message?: string;
}> {
  try {
    // Get all driver's rides for the same date
    const { data: existingRides, error } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverId)
      .eq('date', rideDate)
      .in('status', ['scheduled', 'ongoing']);

    if (error) {
      handleSupabaseError(error);
      return {
        hasConflict: false,
        conflictingRides: [],
      };
    }

    if (!existingRides || existingRides.length === 0) {
      return {
        hasConflict: false,
        conflictingRides: [],
      };
    }

    // Calculate end time for the new ride
    const newStartMinutes = timeToMinutes(startTime);
    const newEndMinutes = newStartMinutes + durationMinutes;

    // Check each existing ride for overlap
    const conflicts = [];
    for (const ride of existingRides) {
      const existingStartMinutes = timeToMinutes(ride.time);
      const existingDuration = ride.duration || 0;
      const existingEndMinutes = existingStartMinutes + existingDuration;

      // Check for time overlap
      const hasOverlap =
        (newStartMinutes >= existingStartMinutes && newStartMinutes < existingEndMinutes) ||
        (newEndMinutes > existingStartMinutes && newEndMinutes <= existingEndMinutes) ||
        (newStartMinutes <= existingStartMinutes && newEndMinutes >= existingEndMinutes);

      if (hasOverlap) {
        conflicts.push(ride);
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflictingRides: conflicts,
      message:
        conflicts.length > 0
          ? `Time conflict detected! You have ${conflicts.length} existing ride(s) at this time.`
          : undefined,
    };
  } catch (error) {
    console.error('Error checking ride time conflict:', error);
    return {
      hasConflict: false,
      conflictingRides: [],
    };
  }
}

/**
 * Helper function to convert time string (HH:MM) to minutes
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Complete a ride and create earnings for all accepted bookings
 * This function handles the ride completion workflow:
 * 1. Update ride status to completed with timestamp
 * 2. Create earning records for each accepted booking
 */
export async function completeRide(rideId: string): Promise<{
  success: boolean;
  earningsCreated: number;
  error?: string;
}> {
  try {
    console.log(`🏁 Starting ride completion for ride ID: ${rideId}`);

    // Step 1: Get ride details
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('id, driver_id, price_per_seat, status')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) {
      console.error('❌ Error fetching ride:', rideError);
      return {
        success: false,
        earningsCreated: 0,
        error: 'Ride not found',
      };
    }

    // Don't process if already completed
    if (ride.status === 'completed') {
      console.log('⚠️ Ride already completed, skipping earnings creation');
      return {
        success: true,
        earningsCreated: 0,
      };
    }

    // Step 2: Get all accepted ride requests for this ride
    const { data: rideRequests, error: requestsError } = await supabase
      .from('ride_requests')
      .select('id, passenger_id, requested_seats, price_per_seat')
      .eq('ride_id', rideId)
      .eq('status', 'accepted');

    if (requestsError) {
      console.error('❌ Error fetching ride requests:', requestsError);
      return {
        success: false,
        earningsCreated: 0,
        error: 'Failed to fetch ride requests',
      };
    }

    console.log(`📊 Found ${rideRequests?.length || 0} accepted ride requests`);

    // Step 3: Update ride status to completed
    const updateSuccess = await updateRide(rideId, { status: 'completed' });
    
    if (!updateSuccess) {
      return {
        success: false,
        earningsCreated: 0,
        error: 'Failed to update ride status',
      };
    }

    console.log('✅ Ride status updated to completed');

    // Step 4: Capture payments and create earnings for each accepted ride request
    let earningsCreated = 0;
    
    if (rideRequests && rideRequests.length > 0) {
      for (const request of rideRequests) {
        // Calculate total price: requested_seats * price_per_seat
        const totalAmount = parseFloat(request.price_per_seat.toString()) * request.requested_seats;

        // First, get payment intent by ride_id and rider_id
        const { data: paymentIntents, error: piError } = await supabase
          .from('stripe_payment_intents')
          .select('*')
          .eq('ride_id', rideId)
          .eq('rider_id', request.passenger_id)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (piError || !paymentIntents || paymentIntents.length === 0) {
          console.warn(`⚠️ No payment intent found for ride request ${request.id} (rider: ${request.passenger_id})`);
          continue;
        }
        
        const paymentIntent = paymentIntents[0];
        
        if (paymentIntent && paymentIntent.status === 'authorized') {
          console.log(`💳 Capturing payment for ride request ${request.id}...`);
          
          const captureResult = await capturePayment({
            paymentIntentId: paymentIntent.id,
          });

          if (captureResult.success) {
            console.log(`✅ Payment captured: $${(captureResult.capturedAmount || 0) / 100}`);
            
            // Payment captured successfully, earning will be created automatically by capturePayment
            earningsCreated++;
          } else {
            console.error(`❌ Failed to capture payment for ride request ${request.id}: ${captureResult.error}`);
            // Continue with next request even if capture fails
          }
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
          // Payment already captured, just ensure earning exists
          console.log(`ℹ️ Payment already captured for ride request ${request.id}`);
          earningsCreated++;
        } else {
          // No payment intent found or payment not authorized - create earning without payment capture
          console.warn(`⚠️ No authorized payment found for ride request ${request.id}, creating earning without payment`);
          
          const earningCreated = await createEarning(
            ride.driver_id,
            rideId,
            totalAmount,
            null // No booking_id since we're using ride_requests
          );

          if (earningCreated) {
            earningsCreated++;
            console.log(`💰 Created earning for ride request ${request.id}: $${totalAmount.toFixed(2)}`);
          } else {
            console.error(`❌ Failed to create earning for ride request ${request.id}`);
          }
        }
      }
    }

    console.log(`✅ Ride completion successful! Created ${earningsCreated} earnings`);

    return {
      success: true,
      earningsCreated,
    };
  } catch (error) {
    console.error('❌ Error completing ride:', error);
    return {
      success: false,
      earningsCreated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Notify riders about ride status changes
 */
async function notifyRideStatusChange(rideId: string, status: RideStatus): Promise<void> {
  try {
    // Get ride details and all accepted bookings
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select(`
        *,
        driver:profiles!rides_driver_id_fkey(name, email)
      `)
      .eq('id', rideId)
      .single();

    if (rideError || !ride) {
      console.error('Error fetching ride for notification:', rideError);
      return;
    }

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('rider_id, id')
      .eq('ride_id', rideId)
      .eq('status', 'accepted');

    if (bookingsError || !bookings) {
      console.error('Error fetching bookings for notification:', bookingsError);
      return;
    }

    const driverName = ride.driver?.name || ride.driver?.email || 'Driver';
    const rideDetails = `${ride.from_location?.address || 'Unknown'} → ${ride.to_location?.address || 'Unknown'}`;

    // Send notifications based on status
    if (status === 'ongoing') {
      // Ride started notification
      for (const booking of bookings) {
        await createNotification({
          userId: booking.rider_id,
          type: 'ride_started',
          title: 'Ride Started',
          message: `${driverName} has started your ride: ${rideDetails}`,
          rideId: rideId,
          bookingId: booking.id,
          senderId: ride.driver_id,
          actionUrl: `/rider/ride-detail/${booking.id}`
        });
      }
      console.log(`✅ Sent ride_started notifications to ${bookings.length} riders`);
    } else if (status === 'completed') {
      // Ride completed notification
      for (const booking of bookings) {
        await createNotification({
          userId: booking.rider_id,
          type: 'ride_completed',
          title: 'Ride Completed',
          message: `Your ride with ${driverName} is complete. Please rate your experience!`,
          rideId: rideId,
          bookingId: booking.id,
          senderId: ride.driver_id,
          actionUrl: `/rider/rate/${booking.id}`
        });
      }
      console.log(`✅ Sent ride_completed notifications to ${bookings.length} riders`);
    }
  } catch (error) {
    console.error('Error sending ride status notifications:', error);
  }
}
