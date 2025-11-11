import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Calendar,
  Car,
  Clock,
  DollarSign,
  Info,
  Luggage,
  MapPin,
  MoonStar,
  Music4,
  Navigation,
  PawPrint,
  ShieldCheck,
  Snowflake,
  SprayCan,
  Users,
  UserCircle,
  Wifi
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getRouteInfo, getMultiStopRouteInfo, calculateStopETAs, calculateSegmentPriceFromCoordinates, calculateRealTimeETAs, formatETATime } from '../utils/distance';

interface RideSegment {
  id: number;
  address: string;
  segment_order: number;
  is_pickup: boolean;
  lat?: number;
  lng?: number;
  estimated_arrival_time?: string;
  actual_arrival_time?: string;
}

type TripStatus = 'upcoming' | 'active' | 'completed';

interface SegmentMatch {
  ride: any;
  fromSegment: RideSegment;
  toSegment: RideSegment;
  segmentPrice: number;
  estimatedPickupTime: string;
  estimatedDropoffTime: string;
  availableSeats: number;
  realTimeETA?: boolean;
  actualDistance?: number;
  actualDuration?: number;
  isOwnRide: boolean;
  displayStatus?: TripStatus;
  formattedPickup?: string;
  formattedDropoff?: string;
}

interface DriverProfile {
  id: string;
  display_name: string | null;
  photo_url: string | null;
  car_model: string | null;
  car_plate: string | null;
  average_rating?: number | null;
  rating_count?: number | null;
}

interface RideFeature {
  id: number;
  key: string;
  name: string;
  description: string;
  icon_slug: string;
}

const AvailableRidesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const searchParams = location.state as {
    fromLocation: string;
    toLocation: string;
    fromCoords?: { lat: number; lng: number };
    toCoords?: { lat: number; lng: number };
    date: string;
    passengers: number;
  };

  const [loading, setLoading] = useState(true);
  const [segmentMatches, setSegmentMatches] = useState<SegmentMatch[]>([]);
  const [groupedMatches, setGroupedMatches] = useState<{[date: string]: SegmentMatch[]}>({});
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverProfile>>({});
  const [rideFeatures, setRideFeatures] = useState<RideFeature[]>([]);
  const driverProfileCacheRef = React.useRef<Record<string, DriverProfile>>({});
  const featureCacheRef = React.useRef<RideFeature[]>([]);

  const featureIconMap = useMemo<Record<string, LucideIcon>>(
    () => ({
      'shield-check': ShieldCheck,
      'spray-can': SprayCan,
      'suitcase': Briefcase,
      'suitcase-rolling': Luggage,
      'luggage': Luggage,
      'briefcase': Briefcase,
      'music-4': Music4,
      'moon-star': MoonStar,
      'ban': Ban,
      'paw-print': PawPrint,
      'user-circle': UserCircle,
      'snowflake': Snowflake,
      'winter-tires': Snowflake,
      'wifi': Wifi,
      'car': Car,
    }),
    []
  );

  const parseLocalDate = (timestamp?: string | null) => {
    if (!timestamp) return null;

    let normalized = timestamp.trim();

    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)/);
    if (match) {
      normalized = `${match[1]} ${match[2]}`;
    }

    normalized = normalized
      .replace(/\s*(AM|PM)$/i, ' $1')
      .replace(/\s+/g, ' ')
      .trim();

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')} ${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:${String(parsed.getSeconds()).padStart(2, '0')}`;
    return new Date(iso);
  };

  const formatLocalTimestamp = (date: Date | string | null | undefined) => {
    if (!date) return '';

    let actualDate: Date | null = null;
    if (typeof date === 'string') {
      actualDate = parseLocalDate(date);
    } else {
      actualDate = date;
    }

    if (!actualDate || Number.isNaN(actualDate.getTime())) {
      return '';
    }

    const year = actualDate.getFullYear();
    const month = String(actualDate.getMonth() + 1).padStart(2, '0');
    const day = String(actualDate.getDate()).padStart(2, '0');
    const hours = String(actualDate.getHours()).padStart(2, '0');
    const minutes = String(actualDate.getMinutes()).padStart(2, '0');
    const seconds = String(actualDate.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  useEffect(() => {
    const loadFeatures = async () => {
      if (featureCacheRef.current.length) {
        setRideFeatures(featureCacheRef.current);
        return;
      }
      const { data, error } = await supabase
        .from('ride_features')
        .select('id, key, name, description, icon_slug')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        featureCacheRef.current = data;
        setRideFeatures(data);
      } else if (error) {
        console.error('Failed to load ride features', error);
      }
    };

    loadFeatures();

    if (searchParams && user) {
      findSegmentMatches();
    }
    return () => {
      driverProfileCacheRef.current = {};
    };
  }, [searchParams, user]);

  const fetchDriverProfiles = async (driverIds: string[]) => {
    const cache = driverProfileCacheRef.current;
    const uniqueIds = Array.from(new Set(driverIds)).filter((id) => !cache[id]);

    if (uniqueIds.length === 0) {
      return cache;
    }

    const profileEntries = await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const { data, error } = await supabase.rpc('get_driver_profile', { profile_id: id });
          if (error) {
            console.error('Failed to fetch driver profile', id, error);
            return null;
          }
          return data ? [id, data as DriverProfile] : null;
        } catch (err) {
          console.error('Unexpected error fetching driver profile', id, err);
          return null;
        }
      })
    );

    profileEntries.forEach((entry) => {
      if (entry) {
        const [id, profile] = entry;
        cache[id] = profile;
      }
    });

    const updatedMap = { ...cache };
    driverProfileCacheRef.current = updatedMap;
    setDriverProfiles(updatedMap);
    return updatedMap;
  };

  const findSegmentMatches = async () => {
    if (!searchParams || !user) return;

    setLoading(true);
    try {
      if (!rideFeatures.length) {
        const { data: featureData, error: featureError } = await supabase
          .from('ride_features')
          .select('id, key, name, description, icon_slug')
          .eq('is_active', true)
          .order('name');
        if (!featureError && featureData) {
          featureCacheRef.current = featureData;
          setRideFeatures(featureData);
        }
      }
      // Get all rides for the specified date
      // Simplified date filtering - use local date string matching instead of complex UTC calculations
      const searchDate = searchParams.date; // Format: YYYY-MM-DD
      
      console.log('=== ENHANCED SEARCH DEBUG START ===');
      console.log('🔍 Search Configuration:');
      console.log('  - Search date:', searchDate);
      console.log('  - User ID:', user.id);
      console.log('  - Search params:', {
        fromLocation: searchParams.fromLocation,
        toLocation: searchParams.toLocation,
        fromCoords: searchParams.fromCoords,
        toCoords: searchParams.toCoords,
        date: searchParams.date,
        passengers: searchParams.passengers
      });
      console.log('  - Current timestamp:', new Date().toISOString());

      // Get all active rides and filter by date using simpler string matching
      let allRides = null;
      let ridesError = null;
      
      try {
        console.log('📊 Executing Supabase Query:');
        console.log('  - Table: rides');
        console.log('  - Status filter: active');
        console.log('  - Excluding driver:', user.id);
        
        // SAFE DELETION POLICY: Only show active rides (data preserved in database)
        const result = await supabase
          .from('rides')
          .select(`
            *,
            driver:users!rides_driver_id_fkey(
              id, display_name, photo_url, rating, car_model, car_plate
            ),
            ride_feature_assignments:ride_feature_assignments(
              feature:ride_features(id, key, name, description, icon_slug)
            )
          `)
          .in('status', ['active', 'scheduled', 'completed'])
          .neq('driver_id', user.id)
          .order('departure_time', { ascending: true });
          
        allRides = result.data || [];
        ridesError = result.error;
        
        console.log('📈 Database Query Results:');
        console.log('  - Raw rides fetched:', allRides?.length || 0);
        console.log('  - Query error:', ridesError);
        console.log('  - Raw rides data structure:', allRides?.map(r => ({
          id: r.id,
          from: r.from_location,
          to: r.to_location,
          departure: r.departure_time,
          status: r.status,
          use_direct_route: r.use_direct_route,
          available_seats: r.available_seats
        })));
      } catch (err) {
        console.error('💥 Initial query error:', err);
        allRides = [];
        ridesError = err;
      }

      if (ridesError) {
        console.error('❌ Supabase query failed:', ridesError);
        allRides = [];
      } else {
        console.log('✅ Supabase query succeeded');
        
        // ENHANCED: Include future rides on same route, not just specific date
        if (allRides) {
          console.log('📅 Enhanced Date Filtering Process (Including Future Rides):');
          console.log('  - Before date filtering:', allRides.length);
          console.log('  - Target search date:', searchDate);
          
          const dateFilterResults = [];
          const searchDateTime = new Date(searchDate);
          
          // Get rides from selected date and up to 30 days in the future
          allRides = allRides.filter(ride => {
            try {
              // FIXED: Validate departure_time before creating Date object
              if (!ride.departure_time) {
                console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping`);
                return false;
              }

              // FIXED: Check if departure_time creates a valid Date object
              const departureDate = new Date(ride.departure_time);
              if (isNaN(departureDate.getTime())) {
                console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping`);
                return false;
              }

              const rideDate = departureDate.toISOString().split('T')[0];
              const rideDateTime = new Date(rideDate);
              
              // Include rides from search date onwards (today and future)
              const isOnOrAfterSearchDate = rideDateTime >= searchDateTime;
              
              // Limit to 30 days in the future to keep results manageable
              const thirtyDaysFromSearch = new Date(searchDateTime);
              thirtyDaysFromSearch.setDate(thirtyDaysFromSearch.getDate() + 30);
              const isWithin30Days = rideDateTime <= thirtyDaysFromSearch;
              
              const matches = isOnOrAfterSearchDate && isWithin30Days;
              
              dateFilterResults.push({
                rideId: ride.id,
                rideDate,
                searchDate,
                isOnOrAfterSearchDate,
                isWithin30Days,
                matches,
                fullDepartureTime: ride.departure_time
              });
              
              return matches;
            } catch (error) {
              console.error(`Error processing ride ${ride.id} departure_time: ${ride.departure_time}`, error);
              return false; // Skip rides that cause errors
            }
          });
          
          console.log('  - Enhanced date filter details:', dateFilterResults);
          console.log('  - After enhanced date filtering (30 days forward):', allRides.length);
        }
        
        console.log('✅ Final Query Results:');
        console.log('  - Successfully fetched rides:', allRides?.length || 0);
        console.log('  - Ride summaries:', allRides?.map(r => `ID:${r.id} ${r.from_location} → ${r.to_location}`));
      }
      
      // Additional error handling
      if (ridesError) {
        console.error('💥 Rides query crashed:', ridesError);
        allRides = [];
        console.warn('⚠️ Failed to fetch rides, showing empty results');
      }

      const driverIds = (allRides || []).map((ride) => ride.driver_id).filter(Boolean);
      const profilesMap = await fetchDriverProfiles(driverIds);

      // Now fetch segments for rides that need them
      const segmentRideIds = (allRides || []).filter(ride => !ride.use_direct_route).map(ride => ride.id);
      let ridesWithSegments = [];
      
      if (segmentRideIds.length > 0) {
        try {
          console.log('🗺️ Fetching Segments for Multi-Stop Rides:');
          console.log('  - Segment ride IDs:', segmentRideIds);
          
          // SAFE DELETION POLICY: Only get segments for active rides (data preserved in database)
          const { data: segments, error: segmentsError } = await supabase
            .from('ride_segments')
            .select('*')
            .in('ride_id', segmentRideIds)
            .order('ride_id')
            .order('segment_order');

          if (segmentsError) {
            console.error('❌ Failed to fetch segments:', segmentsError);
            console.warn('⚠️ Using rides without segment data');
          } else {
            console.log('📍 Segments Query Results:');
            console.log('  - Segments found:', segments?.length || 0);
            console.log('  - Segments by ride:', segments?.reduce((acc, seg) => {
              acc[seg.ride_id] = (acc[seg.ride_id] || 0) + 1;
              return acc;
            }, {}));
            
            // Combine rides with their segments
            ridesWithSegments = (allRides || []).map(ride => ({
              ...ride,
              segments: !ride.use_direct_route ? (segments || []).filter(seg => seg.ride_id === ride.id) : [],
              ride_segments: !ride.use_direct_route ? (segments || []).filter(seg => seg.ride_id === ride.id) : []
            }));
          }
        } catch (err) {
          console.error('💥 Segments query crashed:', err);
          console.warn('⚠️ Proceeding without segment data');
          ridesWithSegments = (allRides || []).map(ride => ({ ...ride, segments: [], ride_segments: [] }));
        }
      } else {
        console.log('ℹ️ No multi-stop rides found, skipping segment fetch');
        ridesWithSegments = (allRides || []).map(ride => ({ ...ride, segments: [], ride_segments: [] }));
      }

      // Separate direct route rides from multi-stop rides
      const featureMap = (rideFeatures.length ? rideFeatures : featureCacheRef.current).reduce<Record<number, RideFeature>>((acc, feature) => {
        acc[feature.id] = feature;
        return acc;
      }, {});

      const directRides = ridesWithSegments.filter(ride => ride.use_direct_route);
      const multiStopRides = ridesWithSegments.filter(ride => !ride.use_direct_route);
      
      console.log('🎯 Ride Categories:');
      console.log(`  - Direct route rides: ${directRides.length}`);
      console.log(`  - Multi-stop rides: ${multiStopRides.length}`);

      const matches: SegmentMatch[] = [];

      // Process direct route rides
      console.log('\n🚗 === PROCESSING DIRECT ROUTE RIDES ===');
      for (let i = 0; i < directRides.length; i++) {
        const ride = directRides[i];
        console.log(`\n🚗 Processing Direct Ride ${i + 1}/${directRides.length} (ID: ${ride.id})`);
        console.log(`  📍 Route: ${ride.from_location} → ${ride.to_location}`);
        console.log(`  🕒 Departure: ${ride.departure_time}`);
        console.log(`  💺 Available seats: ${ride.available_seats}/${ride.total_seats}`);
        console.log(`  🎯 Search target: ${searchParams.fromLocation} → ${searchParams.toLocation}`);

        // Location matching for direct routes
        const normalizeLocation = (location: string) => {
          return location.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const searchFrom = normalizeLocation(searchParams.fromLocation);
        const searchTo = normalizeLocation(searchParams.toLocation);
        const rideFrom = normalizeLocation(ride.from_location);
        const rideTo = normalizeLocation(ride.to_location);
        const isOwnRide = ride.driver_id === user?.id;

        // Multiple matching strategies for better results
        const exactFromMatch = searchFrom === rideFrom;
        const exactToMatch = searchTo === rideTo;
        const containsFromMatch = rideFrom.includes(searchFrom) || searchFrom.includes(rideFrom);
        const containsToMatch = rideTo.includes(searchTo) || searchTo.includes(rideTo);
        
        // First word matching for city names
        const firstWordFromSearch = searchFrom.split(' ')[0];
        const firstWordFromRide = rideFrom.split(' ')[0];
        const firstWordToSearch = searchTo.split(' ')[0];
        const firstWordToRide = rideTo.split(' ')[0];
        const firstWordFromMatch = firstWordFromSearch === firstWordFromRide && firstWordFromSearch.length > 2;
        const firstWordToMatch = firstWordToSearch === firstWordToRide && firstWordToSearch.length > 2;

        const fromMatches = exactFromMatch || containsFromMatch || firstWordFromMatch;
        const toMatches = exactToMatch || containsToMatch || firstWordToMatch;

        console.log('    🔍 Location Analysis:');
        console.log('    - FROM matching:', {
          exact: exactFromMatch,
          contains: containsFromMatch,
          firstWord: firstWordFromMatch,
          result: fromMatches ? '✅' : '❌'
        });
        console.log('    - TO matching:', {
          exact: exactToMatch,
          contains: containsToMatch,
          firstWord: firstWordToMatch,
          result: toMatches ? '✅' : '❌'
        });
        console.log('    - Overall match:', fromMatches && toMatches ? '✅ PASS' : '❌ FAIL');
        console.log('    - Own ride:', isOwnRide ? 'YES' : 'NO');
        console.log(`  🎫 Direct Route Final Check:`);
        console.log('    - Location match:', fromMatches && toMatches);
        console.log('    - Seat availability:', `${ride.available_seats} >= ${searchParams.passengers} = ${ride.available_seats >= searchParams.passengers}`);
        console.log('    - Exclude own ride:', !isOwnRide);
        
        if (!isOwnRide && fromMatches && toMatches && ride.available_seats >= searchParams.passengers) {
          console.log(`    ✅ DIRECT RIDE ${ride.id} QUALIFIES!`);
          // Create a pseudo segment match for direct routes
          const fromSegment = {
            id: 0,
            address: ride.from_location,
            segment_order: 0,
            is_pickup: true,
            lat: ride.from_lat,
            lng: ride.from_lng
          };

          const toSegment = {
            id: 1,
            address: ride.to_location,
            segment_order: 1,
            is_pickup: false,
            lat: ride.to_lat,
            lng: ride.to_lng
          };

          // Calculate real-time ETA for direct routes
          // FIXED: Validate departure_time before creating Date object (already validated in filter above)
          const departureTime = new Date(ride.departure_time);
          let estimatedDropoffTime: Date;
          let realTimeETA = false;
          let actualDistance: number | undefined;
          let actualDuration: number | undefined;

          try {
            if (ride.from_lat && ride.from_lng && ride.to_lat && ride.to_lng) {
              console.log('🗺️ Calculating real-time routing for direct ride...');
              const routeInfo = await getRouteInfo(
                { lat: ride.from_lat, lng: ride.from_lng },
                { lat: ride.to_lat, lng: ride.to_lng }
              );
              
              if (routeInfo) {
                estimatedDropoffTime = new Date(departureTime.getTime() + routeInfo.duration * 60 * 1000);
                realTimeETA = true;
                actualDistance = routeInfo.distance;
                actualDuration = routeInfo.duration;
                console.log(`    ✅ Real-time routing: ${routeInfo.distance}km, ${routeInfo.duration}min`);
              } else {
                estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
                console.log('    ⚠️ Using estimated duration fallback');
              }
            } else {
              estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
              console.log('    ⚠️ Missing coordinates, using estimated duration');
            }
          } catch (routeError) {
            console.error('    ❌ Routing failed:', routeError);
            estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
          }

          // FIXED: Validate both departure and dropoff times before calling toISOString
          try {
            // Additional validation for estimatedDropoffTime
            if (isNaN(estimatedDropoffTime.getTime())) {
              console.warn(`Ride ${ride.id} has invalid estimatedDropoffTime, using fallback`);
              estimatedDropoffTime = new Date(departureTime.getTime() + 2 * 60 * 60 * 1000); // 2 hour fallback
            }

            matches.push({
              ride,
              fromSegment,
              toSegment,
              segmentPrice: ride.price_per_seat,
              estimatedPickupTime: formatLocalTimestamp(ride.departure_time ?? departureTime),
              estimatedDropoffTime: formatLocalTimestamp(estimatedDropoffTime),
              availableSeats: ride.available_seats,
              realTimeETA,
              actualDistance,
              actualDuration,
              isOwnRide: false
            });
          } catch (dateError) {
            console.error(`Error converting dates to ISO string for ride ${ride.id}:`, dateError);
            console.warn(`Skipping ride ${ride.id} due to date conversion error`);
          }
          
          console.log(`    💰 Price: $${ride.price_per_seat} per seat`);
          console.log(`    🕒 Pickup: ${departureTime.toLocaleString()}`);
          console.log(`    🏁 Dropoff: ${estimatedDropoffTime.toLocaleString()}`);
        } else {
          console.log(`    ❌ RIDE ${ride.id} DOESN'T QUALIFY`);
          if (!fromMatches || !toMatches) {
            console.log('      - Location mismatch');
          }
          if (ride.available_seats < searchParams.passengers) {
            console.log('      - Insufficient seats');
          }
        }
      }

      // Process multi-stop rides
      console.log('\n🚌 === PROCESSING MULTI-STOP RIDES ===');
      for (let i = 0; i < multiStopRides.length; i++) {
        const ride = multiStopRides[i];
        console.log(`\n🚌 Processing Multi-Stop Ride ${i + 1}/${multiStopRides.length} (ID: ${ride.id})`);
        console.log(`  📍 Main route: ${ride.from_location} → ${ride.to_location}`);
        console.log(`  🕒 Departure: ${ride.departure_time}`);
        console.log(`  🗺️ Segments: ${ride.segments?.length || 0}`);

        if (!ride.segments || ride.segments.length === 0) {
          console.log('    ⚠️ No segments found for multi-stop ride, skipping');
          continue;
        }

        // Sort segments by order
        const sortedSegments = ride.segments.sort((a, b) => a.segment_order - b.segment_order);
        console.log('    📋 Segment details:', sortedSegments.map(s => `${s.segment_order}: ${s.address} (${s.is_pickup ? 'pickup' : 'dropoff'})`));

        // Find matching pickup and dropoff segments
        for (let pickupIdx = 0; pickupIdx < sortedSegments.length; pickupIdx++) {
          const pickupSegment = sortedSegments[pickupIdx];
          
          for (let dropoffIdx = pickupIdx + 1; dropoffIdx < sortedSegments.length; dropoffIdx++) {
            const dropoffSegment = sortedSegments[dropoffIdx];
            
            console.log(`\n    🔄 Testing segment combination:`);
            console.log(`      - Pickup: ${pickupSegment.address}`);
            console.log(`      - Dropoff: ${dropoffSegment.address}`);

            // Location matching
            const normalizeLocation = (location: string) => {
              return location.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            };

            const searchFrom = normalizeLocation(searchParams.fromLocation);
            const searchTo = normalizeLocation(searchParams.toLocation);
            const segmentFrom = normalizeLocation(pickupSegment.address);
            const segmentTo = normalizeLocation(dropoffSegment.address);
            const isOwnRide = ride.driver_id === user?.id;

            const exactFromMatch = searchFrom === segmentFrom;
            const exactToMatch = searchTo === segmentTo;
            const containsFromMatch = segmentFrom.includes(searchFrom) || searchFrom.includes(segmentFrom);
            const containsToMatch = segmentTo.includes(searchTo) || searchTo.includes(segmentTo);
            
            const firstWordFromSearch = searchFrom.split(' ')[0];
            const firstWordFromSegment = segmentFrom.split(' ')[0];
            const firstWordToSearch = searchTo.split(' ')[0];
            const firstWordToSegment = segmentTo.split(' ')[0];
            const firstWordFromMatch = firstWordFromSearch === firstWordFromSegment && firstWordFromSearch.length > 2;
            const firstWordToMatch = firstWordToSearch === firstWordToSegment && firstWordToSearch.length > 2;

            const fromMatches = exactFromMatch || containsFromMatch || firstWordFromMatch;
            const toMatches = exactToMatch || containsToMatch || firstWordToMatch;

            console.log('      📍 Location Analysis:');
            console.log('        - FROM matching:', fromMatches ? '✅' : '❌');
            console.log('        - TO matching:', toMatches ? '✅' : '❌');
            console.log('        - Own ride:', isOwnRide ? '✅ (exclude)' : '❌');

            if (!isOwnRide && fromMatches && toMatches && ride.available_seats >= searchParams.passengers) {
              console.log(`      ✅ SEGMENT MATCH FOUND!`);
              
              // Calculate segment price and ETA
              let segmentPrice = ride.price_per_seat;
              let estimatedPickupTime = ride.departure_time;
              let estimatedDropoffTime = ride.departure_time;
              let actualDistance: number | undefined;
              let actualDuration: number | undefined;

              try {
                if (ride.segments.every(s => s.lat && s.lng)) {
                  console.log('      💰 Calculating segment pricing...');
                  const allCoords = sortedSegments.map(s => ({ lat: s.lat!, lng: s.lng! }));
                  const pricingResult = await calculateSegmentPriceFromCoordinates(
                    ride.price_per_seat,
                    allCoords,
                    pickupIdx,
                    dropoffIdx
                  );
                  
                  if (pricingResult) {
                    segmentPrice = pricingResult.segmentPrice;
                    actualDistance = pricingResult.segmentDistance;
                    console.log(`        ✅ Segment price: $${segmentPrice} (${pricingResult.priceRatio.toFixed(1)}% of full ride)`);
                  }
                }
              } catch (error) {
                console.error('      ❌ Error calculating segment details:', error);
              }

              matches.push({
                ride,
                fromSegment: pickupSegment,
                toSegment: dropoffSegment,
                segmentPrice,
                estimatedPickupTime,
                estimatedDropoffTime,
                availableSeats: ride.available_seats,
                actualDistance,
                actualDuration,
                isOwnRide: false
              });
              
              console.log(`      💰 Final price: $${segmentPrice}`);
            } else {
              console.log(`      ❌ No match`);
              if (!fromMatches || !toMatches) {
                console.log('        - Location mismatch');
              }
              if (ride.available_seats < searchParams.passengers) {
                console.log('        - Insufficient seats');
              }
            }
          }
        }
      }

      const now = new Date();
      const startGraceMs = 5 * 60 * 1000;
      const completionBufferMs = 5 * 60 * 1000;
      const pickupWindowGraceMs = 2 * 60 * 1000;

      const enrichMatchWithEtas = async (match: SegmentMatch) => {
        const departureTime = parseLocalDate(match.ride.departure_time);
        if (!departureTime) {
          return match;
        }

        const storedPickupETA = match.fromSegment?.estimated_arrival_time
          ? parseLocalDate(match.fromSegment.estimated_arrival_time)
          : null;
        const storedDropoffETA = match.toSegment?.estimated_arrival_time
          ? parseLocalDate(match.toSegment.estimated_arrival_time)
          : null;

        if (storedPickupETA && storedDropoffETA) {
          return {
            ...match,
            estimatedPickupTime: formatLocalTimestamp(storedPickupETA),
            estimatedDropoffTime: formatLocalTimestamp(storedDropoffETA),
            realTimeETA: false,
            formattedPickup: formatETATime(storedPickupETA),
            formattedDropoff: formatETATime(storedDropoffETA)
          };
        }

        const normalizeStopName = (value: string) => extractCityName(value).toLowerCase();

        try {
          const stops: Array<{ name: string; lat: number; lng: number }> = [];
          stops.push({
            name: extractCityName(match.ride.from_location),
            lat: match.ride.from_lat || 0,
            lng: match.ride.from_lng || 0
          });

          if (match.ride.segments && match.ride.segments.length > 0) {
            const orderedSegments = [...match.ride.segments].sort((a: RideSegment, b: RideSegment) => a.segment_order - b.segment_order);
            orderedSegments.forEach((segment: RideSegment) => {
              stops.push({
                name: extractCityName(segment.address),
                lat: segment.lat || 0,
                lng: segment.lng || 0
              });
            });
          }

          stops.push({
            name: extractCityName(match.ride.to_location),
            lat: match.ride.to_lat || 0,
            lng: match.ride.to_lng || 0
          });

          const etaStops = await calculateRealTimeETAs(new Date(), stops, departureTime);

          if (etaStops.length >= 2) {
            const pickupName = normalizeStopName(match.fromSegment.address);
            const dropoffName = normalizeStopName(match.toSegment.address);

            let pickupIndex = etaStops.findIndex((stop) => stop.stopName.toLowerCase() === pickupName);
            let dropoffIndex = etaStops.findIndex((stop) => stop.stopName.toLowerCase() === dropoffName);

            if (pickupIndex === -1) {
              pickupIndex = match.ride.use_direct_route ? 0 : match.fromSegment.segment_order;
            }

            if (dropoffIndex === -1) {
              dropoffIndex = match.ride.use_direct_route ? etaStops.length - 1 : match.toSegment.segment_order;
            }

            const pickupStop = etaStops[Math.min(Math.max(pickupIndex, 0), etaStops.length - 1)];
            const dropoffStop = etaStops[Math.min(Math.max(dropoffIndex, 0), etaStops.length - 1)];

            return {
              ...match,
              estimatedPickupTime: formatLocalTimestamp(pickupStop.eta),
              estimatedDropoffTime: formatLocalTimestamp(dropoffStop.eta),
              realTimeETA: true,
              formattedPickup: pickupStop.formattedETA,
              formattedDropoff: dropoffStop.formattedETA
            };
          }

          return match;
        } catch (error) {
          console.warn('ETA enrichment failed for ride', match.ride.id, error);
          return match;
        }
      };

      const matchesWithDerivedStatus = await Promise.all(
        matches.map(async (rawMatch) => {
          const enriched = await enrichMatchWithEtas(rawMatch);
          const departureTime = parseLocalDate(enriched.ride.departure_time);
          const arrivalTime = parseLocalDate(enriched.ride.arrival_time);
          const completionTime = arrivalTime || (departureTime ? new Date(departureTime.getTime() + 2 * 60 * 60 * 1000) : null);

          if (!departureTime || !completionTime) {
            return { ...enriched, displayStatus: 'completed' as TripStatus };
          }

          const hasStarted = now.getTime() >= departureTime.getTime() - startGraceMs;
          const stillOngoing = now.getTime() <= completionTime.getTime() + completionBufferMs;

          if (!hasStarted) {
            return { ...enriched, displayStatus: 'upcoming' as TripStatus };
          }

          if (stillOngoing) {
            return { ...enriched, displayStatus: 'active' as TripStatus };
          }

          return { ...enriched, displayStatus: 'completed' as TripStatus };
        })
      );

      const matchesWithStatus = matchesWithDerivedStatus.filter((match) => {
        if (match.displayStatus === 'completed') {
          return false;
        }

        const pickupTime = match.estimatedPickupTime ? parseLocalDate(match.estimatedPickupTime) : null;
        if (pickupTime && now.getTime() > pickupTime.getTime() + pickupWindowGraceMs) {
          console.log('  ⏰ Skipping match - pickup window closed', {
            rideId: match.ride?.id,
            pickupTime: pickupTime.toISOString(),
            currentTime: now.toISOString()
          });
          return false;
        }

        return true;
      });

      console.log('\n📊 === FINAL MATCHING RESULTS ===');
      console.log(`🎯 Total matches found: ${matchesWithStatus.length}`);
      console.log(`📍 Search criteria: ${searchParams.fromLocation} → ${searchParams.toLocation}`);
      console.log(`📅 Search date: ${searchParams.date}`);
      console.log(`👥 Passengers: ${searchParams.passengers}`);
      
      if (matchesWithStatus.length > 0) {
        console.log('🚗 Match details:');
        matchesWithStatus.forEach((match, idx) => {
          console.log(`  ${idx + 1}. Ride ${match.ride.id}: $${match.segmentPrice} (${match.displayStatus?.toUpperCase()}) Pickup:${match.formattedPickup ?? formatTime(match.estimatedPickupTime)} Dropoff:${match.formattedDropoff ?? formatTime(match.estimatedDropoffTime)}`);
        });
      } else {
        console.log('😢 No rides found matching the search criteria');
      }

      console.log('\n🔚 === ENHANCED SEARCH DEBUG END ===');
      
      // Group matches by date for enhanced UI display
      const grouped = matchesWithStatus.reduce((acc, match) => {
        try {
          if (!match.ride.departure_time) {
            console.warn(`Match ride ${match.ride.id} has null/undefined departure_time, skipping grouping`);
            return acc;
          }

          const departureDate = new Date(match.ride.departure_time);
          if (isNaN(departureDate.getTime())) {
            console.warn(`Match ride ${match.ride.id} has invalid departure_time: ${match.ride.departure_time}, skipping grouping`);
            return acc;
          }

          const rideDate = departureDate.toISOString().split('T')[0];
          if (!acc[rideDate]) {
            acc[rideDate] = [];
          }
          acc[rideDate].push(match);
          return acc;
        } catch (error) {
          console.error(`Error grouping match for ride ${match.ride.id}:`, error);
          return acc; // Skip matches that cause errors
        }
      }, {} as {[date: string]: SegmentMatch[]});

      setSegmentMatches(matchesWithStatus);
      setGroupedMatches(grouped);
      setDriverProfiles(profilesMap);

      
      console.log('📊 Grouped Results by Date:');
      Object.entries(grouped).forEach(([date, dateMatches]) => {
        console.log(`  - ${date}: ${dateMatches.length} ride(s)`);
      });
      
      setSegmentMatches(matchesWithStatus);
      setGroupedMatches(grouped);
    } catch (error) {
      console.error('Error finding segment matches:', error);
      setSegmentMatches([]);
      setGroupedMatches({});
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeStyles = (status: TripStatus) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-50 text-blue-700';
      case 'active':
        return 'bg-green-50 text-green-700';
      case 'completed':
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: TripStatus) => {
    switch (status) {
      case 'upcoming':
        return 'Upcoming';
      case 'active':
        return '';
      case 'completed':
        return 'Completed';
    }
  };

  const handleRideSelect = (match: SegmentMatch) => {
    const driverProfile = match.ride.driver_id ? driverProfiles[match.ride.driver_id] : null;

    // Navigate to ride details with segment information
    navigate(`/ride/${match.ride.id}`, {
      state: {
        ride: match.ride,
        driverProfile,
        segmentMatch: {
          fromSegment: match.fromSegment,
          toSegment: match.toSegment,
          segmentPrice: match.segmentPrice,
          estimatedPickupTime: match.estimatedPickupTime,
          estimatedDropoffTime: match.estimatedDropoffTime,
          availableSeats: match.availableSeats,
          realTimeETA: match.realTimeETA,
          actualDistance: match.actualDistance,
          actualDuration: match.actualDuration
        },
        features: (match.ride.ride_feature_assignments || [])
          .map((link: any) => link?.feature)
          .filter(Boolean),
        searchParams
      }
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) {
      return '';
    }

    const hasTimezone = /([+-]\d{2}:?\d{2}|Z)$/i.test(timeString.trim());
    let date: Date | null = null;

    if (hasTimezone) {
      const parsed = new Date(timeString);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!date) {
      const trimmed = timeString.split(/[Z+]/)[0].replace('T', ' ');
      const fallback = new Date(trimmed);
      if (!Number.isNaN(fallback.getTime())) {
        date = fallback;
      }
    }

    if (!date) {
      return '';
    }

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const extractCityName = (fullAddress: string) => {
    if (!fullAddress) return fullAddress;
    
    // Split by comma and take the first part (city name)
    const parts = fullAddress.split(',');
    const cityName = parts[0].trim();
    
    // Return the cleaned city name
    return cityName;
  };

  const formatDateLabel = (date: string) => {
    const [year, month, day] = date.split('-').map((part) => parseInt(part, 10));
    const dateObj = new Date(year, month - 1, day);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(dateObj, today)) {
      return 'Today';
    }

    if (sameDay(dateObj, tomorrow)) {
      return 'Tomorrow';
    }

    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Finding rides...</p>
        </div>
      </div>
    );
  }

  if (!searchParams) {
    navigate('/find');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white overflow-hidden">
        <div className="px-4 pt-8 pb-6">
          {/* Navigation */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold">Available Rides</h1>
          </div>
          {/* Search Summary */}

        </div>
      </div>
      {/* Results */}
      <div className="px-4 py-6">
        {segmentMatches.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 mb-6">
              <Navigation size={32} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              No rides found
            </h3>
            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              No rides match your route and schedule. Try adjusting your search or check back later.
            </p>
            <button
              onClick={() => navigate('/find')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
            >
              New Search
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-gray-600 font-medium mb-6">
              Found {segmentMatches.length} ride{segmentMatches.length > 1 ? 's' : ''} matching your route across {Object.keys(groupedMatches).length} day{Object.keys(groupedMatches).length > 1 ? 's' : ''}
            </p>
            
            {/* Group rides by date with date headers */}
            {Object.entries(groupedMatches)
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([date, dateMatches]) => {
                const dateLabel = formatDateLabel(date);
                
                return (
                  <div key={date} className="space-y-4">
                    {/* Date Header */}
                    <div className="flex items-center space-x-4 py-3">
                      <div className="flex-shrink-0">
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-semibold shadow-md">
                          <div className="flex items-center space-x-2">
                            <Calendar size={18} />
                            <span>{dateLabel}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-purple-200"></div>
                      <div className="text-sm text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">
                        {dateMatches.length} ride{dateMatches.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    {/* Rides for this date */}
                    <div className="space-y-4 pl-4">
                      {dateMatches.map((match, index) => {
                        const driverProfile = match.ride.driver_id ? driverProfiles[match.ride.driver_id] : undefined;
                        const fallbackInitial = match.ride.driver?.display_name?.[0]?.toUpperCase() || 'D';
                        const driverInitial = driverProfile?.display_name?.[0]?.toUpperCase() || fallbackInitial;
                        const driverName = driverProfile?.display_name || match.ride.driver?.display_name || 'Driver';
                        const driverPhoto = driverProfile?.photo_url || match.ride.driver?.photo_url || null;
                        const driverRatingValue = driverProfile?.average_rating ?? match.ride.driver?.rating ?? 5;
                        const driverRating = Number(driverRatingValue);
                        const carModel = driverProfile?.car_model || match.ride.driver?.car_model;
                        const carPlate = driverProfile?.car_plate || match.ride.driver?.car_plate;
                        const rideFeatureList = (match.ride.ride_feature_assignments || [])
                          .map((link: any) => link?.feature)
                          .filter(Boolean) as RideFeature[];

                        return (
                          <div
                            key={`${match.ride.id}-${index}`}
                            onClick={() => handleRideSelect(match)}
                            className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                          >
                            {/* Driver Info */}
                            <div className="flex items-center space-x-3 mb-4">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                                {driverPhoto ? (
                                  <img
                                    src={driverPhoto}
                                    alt={driverName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-white font-bold text-lg">
                                    {driverInitial}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900">
                                  {driverName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  ⭐ {driverRating.toFixed(1)}
                                  {carModel ? ` • ${carModel}` : ''}
                                  {carPlate ? ` • ${carPlate}` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                  ${match.segmentPrice}
                                </div>
                                <div className="text-sm text-gray-500">per person</div>
                              </div>
                            </div>
                            {/* Route Info - Segment Only */}
                            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-4 h-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
                                    <div>
                                      <div className="font-medium text-gray-900">{extractCityName(match.fromSegment.address)}</div>
                                      <div className="text-sm text-gray-600">
                                        Pickup • {match.formattedPickup ?? formatTime(match.estimatedPickupTime)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {match.displayStatus && match.displayStatus !== 'upcoming' && (
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeStyles(match.displayStatus)}`}>
                                        {getStatusLabel(match.displayStatus)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                  <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-pink-500 rounded-full"></div>
                                  <div>
                                    <div className="font-medium text-gray-900">{extractCityName(match.toSegment.address)}</div>
                                    <div className="text-sm text-gray-600">
                                      Dropoff • {match.formattedDropoff ?? formatTime(match.estimatedDropoffTime)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {rideFeatureList.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {rideFeatureList.map((feature) => {
                                  const IconComponent = featureIconMap[feature.icon_slug] || Info;
                                  return;
                                })}
                              </div>
                            )}
                            {/* Ride Details */}
                            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                              <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-1">
                                  <Users size={16} />
                                  <span>{match.availableSeats} seats available</span>
                                </div>

                              </div>
                              <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                                {match.ride.use_direct_route ? 'Direct Route' : 'Multi-Stop'}
                              </div>
                            </div>
                          </div>
                        );
                    })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailableRidesPage;