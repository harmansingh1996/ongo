import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Briefcase,
  Car,
  Clock,
  DollarSign,
  FileText,
  Info,
  Luggage,
  MapPin,
  MoonStar,
  Music4,
  PawPrint,
  Plus,
  Route,
  ShieldCheck,
  Snowflake,
  SprayCan,
  Timer,
  Users,
  UserCircle,
  Wifi,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getMultiStopRouteInfo, calculateStopETAs, formatDuration, formatDistance } from '../utils/distance';
import { rideConflictService, ConflictCheckResult } from '../lib/rideConflictService';
import { DriverResponseService } from '../lib/driverResponseService';
import TermsCheckbox from '../components/TermsCheckbox';

interface Stop {
  id: string;
  address: string;
  coordinates?: { lat: number; lng: number };
}

interface RouteInfo {
  totalDistance: number;
  totalDuration: number;
  segments: Array<{ distance: number; duration: number; from: number; to: number }>;
}

interface PriceTier {
  id: number;
  name: string;
  min_distance_km: string;
  max_distance_km: string | null;
  min_price_per_km: string;
  max_price_per_km: string;
}

interface PriceRangeSummary {
  overallMin: number;
  overallMax: number;
  tiers: Array<{
    name: string;
    minDistance: number;
    maxDistance: number | null;
    minTotal: number;
    maxTotal: number;
  }>;
}

interface RideFeature {
  id: number;
  key: string;
  name: string;
  description: string;
  icon_slug: string;
}

interface RideLimitUsage {
  target_departure_date: string;
  target_month_start: string;
  rides_on_target_day: number;
  rides_in_target_month: number;
  daily_limit: number;
  monthly_limit: number;
  effective_daily_limit: number;
  effective_monthly_limit: number;
  override_expires_at: string | null;
}

const formatDateTimeStamp = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const getLocalISODate = (date: Date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const formatDisplayDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const formatDisplayMonth = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const PostRidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [licenseStatus, setLicenseStatus] = useState<{
    status: string | null;
    expirationDate: string | null;
    loading: boolean;
  }>({ status: null, expirationDate: null, loading: true });
  const [rideData, setRideData] = useState({
    fromLocation: '',
    toLocation: '',
    departureDate: getLocalISODate(),
    departureTime: '',
    availableSeats: 1,
    pricePerSeat: '',
    carModel: '',
    carColor: '',
    licensePlate: '',
    description: '',
  });
  const [coordinates, setCoordinates] = useState({
    from: { lat: 0, lng: 0 },
    to: { lat: 0, lng: 0 },
  });
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [currentTier, setCurrentTier] = useState<PriceTier | null>(null);
  const [priceValidation, setPriceValidation] = useState<{
    isValid: boolean;
    message: string;
    suggestedPrice?: number;
  }>({ isValid: true, message: '' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rideFeatures, setRideFeatures] = useState<RideFeature[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<number[]>([]);
  const [rideLimitStatus, setRideLimitStatus] = useState<{
    loading: boolean;
    data: RideLimitUsage | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });
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

  const priceRangeSummary = useMemo<PriceRangeSummary>(() => {
    if (!routeInfo || priceTiers.length === 0) {
      return { overallMin: 0, overallMax: 0, tiers: [] };
    }

    const distanceKm = routeInfo.totalDistance;
    const baseRanges = priceTiers.map(tier => {
      const minDistance = parseFloat(tier.min_distance_km);
      const maxDistance = tier.max_distance_km ? parseFloat(tier.max_distance_km) : Infinity;
      const minPricePerKm = parseFloat(tier.min_price_per_km);
      const maxPricePerKm = parseFloat(tier.max_price_per_km);

      const applicableDistance = Math.min(Math.max(distanceKm, minDistance), maxDistance);
      const minTotal = minPricePerKm * applicableDistance;
      const maxTotal = maxPricePerKm * applicableDistance;

      return {
        name: tier.name,
        minDistance,
        maxDistance: isFinite(maxDistance) ? maxDistance : null,
        minTotal: maxDistance === Infinity ? minPricePerKm * distanceKm : minTotal,
        maxTotal: maxDistance === Infinity ? maxPricePerKm * distanceKm : maxTotal,
      };
    });

    const relevantRanges = baseRanges.filter(range => {
      const maxDistance = range.maxDistance ?? Infinity;
      return distanceKm >= range.minDistance && distanceKm <= maxDistance;
    });

    const rangesToUse = relevantRanges.length > 0 ? relevantRanges : baseRanges;

    const overallMin = Math.min(...rangesToUse.map(range => range.minTotal));
    const overallMax = Math.max(...rangesToUse.map(range => range.maxTotal));

    return {
      overallMin,
      overallMax,
      tiers: rangesToUse,
    };
  }, [routeInfo, priceTiers]);

  const fetchRideLimitStatus = useCallback(async (targetDate?: string | null) => {
    if (!user) {
      setRideLimitStatus({ loading: false, data: null, error: null });
      return null;
    }

    const resolvedDate = targetDate && targetDate.trim().length > 0 ? targetDate : getLocalISODate();

    setRideLimitStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.rpc('get_driver_ride_usage', {
        p_driver_id: user.id,
        p_target_departure_date: resolvedDate,
      }, {
        head: false,
        count: 'exact'
      });

      if (error) {
        throw error;
      }

      const usage = Array.isArray(data) ? (data[0] as RideLimitUsage | undefined) : undefined;
      if (!usage) {
        setRideLimitStatus({
          loading: false,
          data: null,
          error: 'Unable to load ride limits. Please try again later.',
        });
        return null;
      }

      setRideLimitStatus({ loading: false, data: usage, error: null });
      return usage;
    } catch (fetchError) {
      console.error('Error fetching ride limits:', fetchError);
      setRideLimitStatus({
        loading: false,
        data: null,
        error: 'Unable to load ride limits. Please try again later.',
      });
      return null;
    }
  }, [user]);

  const ensureRideWithinLimits = useCallback(async () => {
    const usage = await fetchRideLimitStatus(rideData.departureDate);
    if (!usage) {
      return true;
    }

    const {
      rides_on_target_day,
      rides_in_target_month,
      effective_daily_limit,
      effective_monthly_limit,
      target_departure_date,
      target_month_start,
    } = usage;

    if (rides_on_target_day >= effective_daily_limit) {
      alert(
        `Daily ride limit reached (${effective_daily_limit} rides) for ${formatDisplayDate(target_departure_date)}. Please adjust the departure date or contact support to request additional allowance.`
      );
      return false;
    }

    if (rides_in_target_month >= effective_monthly_limit) {
      alert(
        `Monthly ride limit reached (${effective_monthly_limit} rides) for ${formatDisplayMonth(target_month_start)}. Please adjust your schedule or contact support to request additional allowance.`
      );
      return false;
    }

    return true;
  }, [fetchRideLimitStatus, rideData.departureDate]);

  // Define fetchRemainingRides outside useEffect, using useCallback

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRideData({
      ...rideData,
      [name]: value,
    });

    // Validate price when price per seat changes
    if (name === 'pricePerSeat') {
      validatePrice(parseFloat(value));
    }

    if (name === 'departureDate') {
      fetchRideLimitStatus(value);
    }
  };

  // Fetch price tiers, remaining rides, and license status on component mount
  useEffect(() => {
    const fetchPriceTiers = async () => {
      try {
        const { data, error } = await supabase
          .from('price_tiers')
          .select('id, name, min_distance_km, max_distance_km, min_price_per_km, max_price_per_km, driver_override_allowed')
          .eq('is_active', true)
          .order('priority');
        
        if (error) throw error;
        setPriceTiers(data || []);
      } catch (error) {
        console.error('Error fetching price tiers:', error);
      }
    };

    const fetchRideFeatures = async () => {
      try {
        const { data, error } = await supabase
          .from('ride_features')
          .select('id, key, name, description, icon_slug')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setRideFeatures(data || []);
      } catch (error) {
        console.error('Error fetching ride features:', error);
      }
    };

    const fetchLicenseStatus = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('users')
          .select('license_verification_status, license_expiration_date')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        
        setLicenseStatus({
          status: data.license_verification_status,
          expirationDate: data.license_expiration_date,
          loading: false
        });
      } catch (error) {
        console.error('Error fetching license status:', error);
        setLicenseStatus({
          status: null,
          expirationDate: null,
          loading: false
        });
      }
    };

    fetchPriceTiers();
    fetchRideFeatures();
    fetchLicenseStatus();
    fetchRideLimitStatus(rideData.departureDate);
  }, [user, rideData.departureDate, fetchRideLimitStatus]);

  // Get applicable price tier based on distance
  const getPriceTierForDistance = (distanceKm: number): PriceTier | null => {
    if (priceTiers.length === 0) return null;

    const tier = priceTiers.find(tier => {
      const minDistance = parseFloat(tier.min_distance_km);
      const maxDistance = tier.max_distance_km ? parseFloat(tier.max_distance_km) : Infinity;
      return distanceKm >= minDistance && distanceKm <= maxDistance;
    });

    if (tier) return tier;

    const sorted = [...priceTiers].sort((a, b) => parseFloat(a.min_distance_km) - parseFloat(b.min_distance_km));
    if (distanceKm < parseFloat(sorted[0].min_distance_km)) {
      return sorted[0];
    }
    return sorted[sorted.length - 1];
  };

  const calculatePerKmPrice = (perSeatPrice: number, distanceKm: number) => {
    if (!distanceKm || distanceKm <= 0) return 0;
    return perSeatPrice / distanceKm;
  };

  // Validate price against tier limits and convert to per-km pricing
  const validatePrice = (price: number) => {
    if (!routeInfo || !price || price <= 0) {
      setPriceValidation({ isValid: true, message: '' });
      return;
    }

    const distanceKm = routeInfo.totalDistance;
    const tier = getPriceTierForDistance(distanceKm);
    
    if (!tier) {
      setPriceValidation({ 
        isValid: false, 
        message: 'No pricing tier found for this distance. Please adjust your route.' 
      });
      return;
    }

    const minPricePerKm = parseFloat(tier.min_price_per_km);
    const maxPricePerKm = parseFloat(tier.max_price_per_km);
    const driverPricePerKm = calculatePerKmPrice(price, distanceKm);

    const minTotalPrice = minPricePerKm * distanceKm;
    const maxTotalPrice = maxPricePerKm * distanceKm;

    if (driverPricePerKm < minPricePerKm) {
      setPriceValidation({
        isValid: false,
        message: `Price too low. Minimum: $${minPricePerKm.toFixed(2)} per km per seat`,
        suggestedPrice: minTotalPrice
      });
    } else if (driverPricePerKm > maxPricePerKm) {
      setPriceValidation({
        isValid: false,
        message: `Price too high. Maximum: $${maxPricePerKm.toFixed(2)} per km per seat`,
        suggestedPrice: maxTotalPrice
      });
    } else {
      setPriceValidation({
        isValid: true,
        message: ""
      });
    }

    setCurrentTier(tier);
  };

  const addStop = () => {
    setStops([...stops, { id: Date.now().toString(), address: '' }]);
  };

  const updateStop = (id: string, address: string, coords?: { lat: number; lng: number }) => {
    setStops(stops.map(stop => 
      stop.id === id ? { ...stop, address, coordinates: coords } : stop
    ));
  };

  const removeStop = (id: string) => {
    setStops(stops.filter(stop => stop.id !== id));
  };

  // Calculate route information whenever coordinates change
  useEffect(() => {
    const calculateRoute = async () => {
      // Check if we have at least origin and destination coordinates
      if (coordinates.from.lat === 0 || coordinates.to.lat === 0) return;
      
      setRouteLoading(true);
      
      try {
        // Build coordinates array including stops
        const allCoordinates = [coordinates.from];
        
        // Add stop coordinates if they exist
        stops.forEach(stop => {
          if (stop.coordinates) {
            allCoordinates.push(stop.coordinates);
          }
        });
        
        allCoordinates.push(coordinates.to);
        
        // Only calculate if we have at least 2 points
        if (allCoordinates.length >= 2) {
          const routeData = await getMultiStopRouteInfo(allCoordinates);
          setRouteInfo(routeData);
          
          // Validate current price when route changes
          if (rideData.pricePerSeat) {
            validatePrice(parseFloat(rideData.pricePerSeat));
          }
        }
      } catch (error) {
        console.error('Error calculating route:', error);
      } finally {
        setRouteLoading(false);
      }
    };
    
    calculateRoute();
  }, [coordinates, stops]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check terms acceptance
    if (!termsAccepted) {
      alert('Please accept the Terms and Conditions to post a ride.');
      return;
    }

    // Check if driver can post rides (not suspended/banned)
    try {
      console.log('Checking driver eligibility for user:', user.id);
      const eligibility = await DriverResponseService.canDriverPostRide(user.id);
      
      if (!eligibility.canPost) {
        console.error('Driver eligibility check failed:', eligibility.reason);
        alert(eligibility.reason || 'You cannot post rides at this time');
        return;
      }
      console.log('Driver eligibility check passed');
    } catch (error) {
      console.error('Error checking driver eligibility:', error);
      alert('Unable to verify your driver status. Please try again or contact support if the issue persists.');
      return;
    }

    // Check license verification before allowing ride posting
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('license_verification_status, license_expiration_date')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Check if license is verified
      if (userProfile.license_verification_status !== 'verified') {
        let message = 'License verification is required to post rides.\n\n';
        
        switch (userProfile.license_verification_status) {
          case 'unverified':
          case null:
            message += 'Please upload your driver\'s license in your profile to start offering rides.';
            break;
          case 'pending':
            message += 'Your license is currently under review. Please wait for verification to complete.';
            break;
          case 'rejected':
            message += 'Your license was rejected. Please upload a new, valid license document in your profile.';
            break;
          default:
            message += 'Please verify your driver\'s license in your profile.';
        }
        
        message += '\n\nWould you like to go to your profile now?';
        
        if (confirm(message)) {
          navigate('/profile');
        }
        return;
      }

      // Check if license is expired
      if (userProfile.license_expiration_date) {
        const expirationDate = new Date(userProfile.license_expiration_date);
        const now = new Date();
        
        if (expirationDate < now) {
          alert('Your driver\'s license has expired. Please update your license information in your profile before posting rides.');
          navigate('/profile');
          return;
        }
        
        // Warn if expiring within 30 days
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        if (expirationDate < thirtyDaysFromNow) {
          const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (!confirm(`Your driver's license expires in ${daysUntilExpiration} days. Do you want to continue posting this ride?`)) {
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error checking license verification:', error);
      alert('Unable to verify your license status. Please try again.');
      return;
    }

    const withinLimits = await ensureRideWithinLimits();
    if (!withinLimits) {
      return;
    }

    // Check price validation before submitting
    if (!priceValidation.isValid) {
      alert('Please set a valid price within the allowed range.');
      return;
    }

    // FIXED TIMEZONE ISSUE: Prepare departure and arrival times using local time
    const departureDateTime = new Date(`${rideData.departureDate}T${rideData.departureTime}`);
    const arrivalDateTime = routeInfo 
      ? new Date(departureDateTime.getTime() + routeInfo.totalDuration * 60 * 1000)
      : new Date(departureDateTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours if no route info

    // Check for ride conflicts before proceeding (still use ISO for API consistency)
    try {
      const conflictResult = await rideConflictService.checkRideConflicts(
        user.id,
        departureDateTime.toISOString(),
        arrivalDateTime.toISOString()
      );

      if (conflictResult && conflictResult.conflict_exists) {
        const conflictMessage = rideConflictService.formatConflictMessage(conflictResult);
        alert(`⚠️ Ride Conflict\n\n${conflictMessage}\n\nPlease adjust your departure or arrival time so rides do not overlap.`);
        return;
      }
    } catch (error) {
      console.error('Error checking ride conflicts:', error);
      alert('Unable to verify schedule conflicts. Please try again.');
      return;
    }

    setLoading(true);

    try {
      // Prepare stops data for JSON storage
      const stopsData = stops.length > 0 ? stops.map(stop => ({
        address: stop.address,
        lat: stop.coordinates?.lat || null,
        lng: stop.coordinates?.lng || null
      })).filter(stop => stop.address.trim()) : null;

      // FIXED TIMEZONE ISSUE: Properly handle user's intended local time
      // Create date in local time and format as ISO string without timezone conversion
      const localDepartureDate = new Date(`${rideData.departureDate}T${rideData.departureTime}`);
      
      // Format the date to preserve the user's intended local time in database
      // This prevents the timezone conversion issue where Sep 12 8PM becomes Sep 13 12AM UTC
      const year = localDepartureDate.getFullYear();
      const month = String(localDepartureDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDepartureDate.getDate()).padStart(2, '0');
      const hours = String(localDepartureDate.getHours()).padStart(2, '0');
      const minutes = String(localDepartureDate.getMinutes()).padStart(2, '0');
      const seconds = String(localDepartureDate.getSeconds()).padStart(2, '0');
      
      const departureDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      
      // Calculate arrival time based on route duration (also preserve local time)
      let arrivalDateTime = null;
      if (routeInfo?.totalDuration) {
        const localArrivalDate = new Date(localDepartureDate.getTime() + routeInfo.totalDuration * 60 * 1000);
        const arrYear = localArrivalDate.getFullYear();
        const arrMonth = String(localArrivalDate.getMonth() + 1).padStart(2, '0');
        const arrDay = String(localArrivalDate.getDate()).padStart(2, '0');
        const arrHours = String(localArrivalDate.getHours()).padStart(2, '0');
        const arrMinutes = String(localArrivalDate.getMinutes()).padStart(2, '0');
        const arrSeconds = String(localArrivalDate.getSeconds()).padStart(2, '0');
        
        arrivalDateTime = `${arrYear}-${arrMonth}-${arrDay} ${arrHours}:${arrMinutes}:${arrSeconds}`;
      }

      // Create the ride
      const { data: rideData_result, error: rideError } = await supabase
        .from('rides')
        .insert([
          {
            driver_id: user.id,
            from_location: rideData.fromLocation,
            to_location: rideData.toLocation,
            from_lat: coordinates.from.lat || null,
            from_lng: coordinates.from.lng || null,
            to_lat: coordinates.to.lat || null,
            to_lng: coordinates.to.lng || null,
            departure_time: departureDateTime,
            arrival_time: arrivalDateTime,
            estimated_duration: routeInfo?.totalDuration || null,
            estimated_distance: routeInfo?.totalDistance || null,
            available_seats: rideData.availableSeats,
            price_per_seat: parseFloat(rideData.pricePerSeat),
            car_model: rideData.carModel,
            car_color: rideData.carColor,
            license_plate: rideData.licensePlate,
            description: rideData.description,
            status: 'active',
            use_direct_route: stops.length === 0, // True for direct routes, false for multi-stop
          }
        ])
        .select()
        .single();

      if (rideError) throw rideError;

      await fetchRideLimitStatus();

      // Add stops as segments if any
      if (stops.length > 0) {
        const segments = [];

        const addSegment = (params: {
          address: string;
          lat: number | null;
          lng: number | null;
          order: number;
          isPickup: boolean;
          etaMinutes?: number;
        }) => {
          const arrivalDate = new Date(localDepartureDate.getTime() + (params.etaMinutes || 0) * 60 * 1000);
          segments.push({
            ride_id: rideData_result.id,
            address: params.address,
            lat: params.lat,
            lng: params.lng,
            segment_order: params.order,
            is_pickup: params.isPickup,
            estimated_arrival_time: params.etaMinutes != null ? formatDateTimeStamp(arrivalDate) : null,
          });
        };

        addSegment({
          address: rideData.fromLocation,
          lat: coordinates.from.lat || null,
          lng: coordinates.from.lng || null,
          order: 0,
          isPickup: true,
          etaMinutes: 0,
        });

        const routeSegments = routeInfo?.segments || [];
        let cumulativeDuration = 0;

        stops.forEach((stop, index) => {
          if (stop.address.trim()) {
            const segmentDuration = routeSegments[index]?.duration || 0;
            cumulativeDuration += segmentDuration;
            addSegment({
              address: stop.address,
              lat: stop.coordinates?.lat || null,
              lng: stop.coordinates?.lng || null,
              order: segments.length,
              isPickup: true,
              etaMinutes: cumulativeDuration,
            });
          }
        });

        const finalDuration = routeSegments[segments.length - 1]?.duration || ((routeInfo?.totalDuration || cumulativeDuration) - cumulativeDuration);
        cumulativeDuration += finalDuration;

        addSegment({
          address: rideData.toLocation,
          lat: coordinates.to.lat || null,
          lng: coordinates.to.lng || null,
          order: segments.length,
          isPickup: false,
          etaMinutes: cumulativeDuration,
        });

        const { data: insertedSegments, error: segmentError } = await supabase
          .from('ride_segments')
          .insert(segments)
          .select();

        if (segmentError) {
          console.error('Error creating segments:', segmentError);
        } else if (insertedSegments && insertedSegments.length > 0) {
          const initialEtaEvents = insertedSegments
            .filter(segment => segment.estimated_arrival_time)
            .map(segment => ({
              ride_id: rideData_result.id,
              segment_id: segment.id,
              estimated_arrival_time: segment.estimated_arrival_time,
              source: 'initial_route_calculation',
              notes: 'Initial ETA recorded at ride creation'
            }));

          if (initialEtaEvents.length > 0) {
            const { error: etaError } = await supabase
              .from('ride_eta_events')
              .insert(initialEtaEvents);

            if (etaError) {
              console.error('Error saving initial ETA events:', etaError);
            }
          }
        }
      }

      if (selectedFeatures.length > 0) {
        const { error: featureLinkError } = await supabase
          .from('ride_feature_assignments')
          .insert(
            selectedFeatures.map((featureId) => ({
              ride_id: rideData_result.id,
              feature_id: featureId,
            }))
          );

        if (featureLinkError) {
          console.error('Error linking ride features:', featureLinkError);
        }
      }

      alert('Ride posted successfully!');
      navigate('/trip');
    } catch (error) {
      console.error('Error posting ride:', error);
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('DAILY_LIMIT_REACHED')) {
        alert('Daily ride limit reached. Please contact support to request additional rides.');
      } else if (errorMessage.includes('MONTHLY_LIMIT_REACHED')) {
        alert('Monthly ride limit reached. Please contact support to request additional rides.');
      } else {
        alert('Failed to post ride. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Get current date and time for minimum datetime
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-12 pb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <ArrowLeft size={24} className="text-white" />
              </button>
              <div>
                <h1 className="text-3xl font-bold">Post a Ride</h1>
                <p className="text-sm text-blue-100 mt-1">Share your route and help others get there</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="px-4 -mt-6 space-y-6">
        {rideLimitStatus.loading ? (
          <div className="bg-white/80 border border-blue-100 text-blue-800 rounded-3xl p-4 shadow-sm">
            <p className="text-sm font-medium">Checking your ride availability...</p>
          </div>
        ) : rideLimitStatus.error ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-3xl p-4 shadow-sm">
            <p className="text-sm font-medium">{rideLimitStatus.error}</p>
          </div>
        ) : rideLimitStatus.data ? (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-3xl p-4 shadow-sm">
            <p className="text-sm font-semibold">
              Daily rides scheduled for {formatDisplayDate(rideLimitStatus.data.target_departure_date)}: {rideLimitStatus.data.rides_on_target_day}/{rideLimitStatus.data.effective_daily_limit}
            </p>

          </div>
        ) : null}

        {/* Route Details */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Details</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
              <AddressAutocomplete
                value={rideData.fromLocation}
                onChange={(value, coords) => {
                  setRideData({ ...rideData, fromLocation: value });
                  if (coords) {
                    setCoordinates({ ...coordinates, from: coords });
                  }
                }}
                placeholder="Enter pickup location"
              />
            </div>

            {/* Optional Stops */}
            {stops.map((stop) => (
              <div key={stop.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stop</label>
                <div className="relative">
                  <AddressAutocomplete
                    value={stop.address}
                    onChange={(value, coords) => updateStop(stop.id, value, coords)}
                    placeholder="Enter stop location"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => removeStop(stop.id)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500 hover:text-red-700 z-10"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addStop}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={16} />
              <span>Add Stop</span>
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
              <AddressAutocomplete
                value={rideData.toLocation}
                onChange={(value, coords) => {
                  setRideData({ ...rideData, toLocation: value });
                  if (coords) {
                    setCoordinates({ ...coordinates, to: coords });
                  }
                }}
                placeholder="Enter destination"
              />
            </div>
          </div>
        </div>

        {/* Route Information Display */}
        {routeInfo && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl p-6 border border-blue-200 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Route className="mr-2 text-blue-600" size={20} />
              Route Information
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/70 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <MapPin size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-gray-600">Total Distance</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatDistance(routeInfo.totalDistance)}</p>
              </div>
              
              <div className="bg-white/70 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <Timer size={16} className="text-purple-600" />
                  <span className="text-sm font-medium text-gray-600">Total Duration</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatDuration(routeInfo.totalDuration)}</p>
              </div>
            </div>

            {routeInfo.segments.length > 1 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Route Stops</h4>
                <div className="space-y-2">
                  {routeInfo.segments.map((segment, index) => (
                    <div key={index} className="flex items-center justify-between bg-white/50 rounded-lg p-3">
                      <span className="text-sm text-gray-600">
                        Stop {index + 1}
                      </span>
                      <div className="flex space-x-4">
                        <span className="text-sm font-medium text-blue-600">
                          {formatDistance(segment.distance)}
                        </span>
                        <span className="text-sm font-medium text-purple-600">
                          {formatDuration(segment.duration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {routeLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-sm text-gray-600">Calculating route...</span>
              </div>
            )}
          </div>
        )}

        {/* Trip Details */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trip Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gradient-to-r from-blue-50 via-white to-purple-50 rounded-2xl p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Date</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="date"
                  name="departureDate"
                  required
                  value={rideData.departureDate}
                  onChange={handleInputChange}
                  min={getLocalISODate()}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gradient-to-r from-blue-50 to-purple-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  name="departureTime"
                  required
                  value={rideData.departureTime}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select departure time</option>
                  {Array.from({ length: 24 }, (_, hour) => {
                    return Array.from({ length: 4 }, (_, quarter) => {
                      const minutes = quarter * 15;
                      const timeString = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                      const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      });
                      
                      return (
                        <option key={`${hour}-${quarter}`} value={timeString}>
                          {displayTime}
                        </option>
                      );
                    });
                  }).flat()}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Available Seats</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  name="availableSeats"
                  value={rideData.availableSeats}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <option key={num} value={num}>
                      {num} seat{num > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price per Seat
                {currentTier && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    ({currentTier.name})
                  </span>
                )}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="number"
                  name="pricePerSeat"
                  required
                  min="1"
                  step="0.01"
                  value={rideData.pricePerSeat}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent ${
                    priceValidation.isValid 
                      ? 'border-gray-300 focus:ring-blue-500' 
                      : 'border-red-300 focus:ring-red-500 bg-red-50'
                  }`}
                  placeholder={
                    priceRangeSummary.overallMin > 0
                      ? `${priceRangeSummary.overallMin.toFixed(2)} - ${priceRangeSummary.overallMax.toFixed(2)}`
                      : '0.00'
                  }
                />
                {priceValidation.suggestedPrice && !priceValidation.isValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setRideData({
                        ...rideData,
                        pricePerSeat: priceValidation.suggestedPrice!.toFixed(2)
                      });
                      validatePrice(priceValidation.suggestedPrice!);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
                  >
                    Use ${priceValidation.suggestedPrice.toFixed(2)}
                  </button>
                )}
              </div>

              <div className="mt-2 space-y-2">
                {priceRangeSummary.overallMin > 0 && (
                  <p
                    className="text-xs text-gray-500"
                    style={{
                      fontWeight: "bold",
                      color: "#0b1e13"
                    }}>
                    Suggested range based on distance: ${priceRangeSummary.overallMin.toFixed(2)} - ${priceRangeSummary.overallMax.toFixed(2)} per seat
                  </p>
                )}

                <div className="flex items-start space-x-2 rounded-lg bg-blue-50/80 border border-blue-100 p-3">
                  <AlertCircle size={14} className="mt-0.5 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-900 leading-relaxed">
                    All OnGoPool trips must be paid through the app. Cash or off-platform payments are not allowed—rides arranged outside secure payments will be cancelled.
                  </p>
                </div>

                {priceValidation.message && (
                  <div className={`flex items-start space-x-2 text-sm ${
                    priceValidation.isValid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{priceValidation.message}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 text-gray-400" size={20} />
                <textarea
                  name="description"
                  value={rideData.description}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Add any special instructions or notes..."
                />
              </div>
            </div>
          </div>

          {rideFeatures.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-gray-900 mb-3">Ride Features</h4>
              <p className="text-sm text-gray-600 mb-4">Highlight amenities such as winter tires, luggage capacity, or pet friendliness.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rideFeatures.map((feature) => {
                  const selected = selectedFeatures.includes(feature.id);
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      onClick={() => {
                        setSelectedFeatures((prev) =>
                          prev.includes(feature.id)
                            ? prev.filter((id) => id !== feature.id)
                            : [...prev, feature.id]
                        );
                      }}
                      className={`flex items-center space-x-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 shadow-sm ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                      }`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        selected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {(() => {
                          const IconComponent = featureIconMap[feature.icon_slug] || Info;
                          return <IconComponent size={22} />;
                        })()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{feature.name}</div>
                        <p className="text-xs text-gray-500 leading-tight">{feature.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Car Details */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Car Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gradient-to-r from-blue-50 via-white to-purple-50 rounded-2xl p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Car Model</label>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  name="carModel"
                  value={rideData.carModel}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Toyota Camry"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Car Color</label>
              <input
                type="text"
                name="carColor"
                value={rideData.carColor}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">License Plate</label>
              <input
                type="text"
                name="licensePlate"
                value={rideData.licensePlate}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., ABC-123"
              />
            </div>
          </div>
        </div>

        {/* License Verification Warning */}
        {!licenseStatus.loading && licenseStatus.status !== 'verified' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle size={20} className="text-orange-600" />
              <div className="flex-1">
                <h4 className="text-orange-800 font-semibold">License Verification Required</h4>
                <p className="text-orange-700 text-sm mb-3">
                  {licenseStatus.status === 'pending' 
                    ? 'Your license is under review. You cannot post rides until verification is complete.'
                    : licenseStatus.status === 'rejected'
                    ? 'Your license was rejected. Please upload a new license document in your profile.'
                    : 'You need to verify your driver\'s license before posting rides.'
                  }
                </p>
                <button
                  onClick={() => navigate('/profile')}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Go to Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* License Expiration Warning */}
        {!licenseStatus.loading && licenseStatus.status === 'verified' && licenseStatus.expirationDate && (
          (() => {
            const expirationDate = new Date(licenseStatus.expirationDate);
            const now = new Date();
            const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (expirationDate < now) {
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle size={20} className="text-red-600" />
                    <div className="flex-1">
                      <h4 className="text-red-800 font-semibold">License Expired</h4>
                      <p className="text-red-700 text-sm mb-3">
                        Your driver's license expired on {expirationDate.toLocaleDateString()}. Please update your license information.
                      </p>
                      <button
                        onClick={() => navigate('/profile')}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Update License
                      </button>
                    </div>
                  </div>
                </div>
              );
            } else if (daysUntilExpiration <= 30) {
              return (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle size={20} className="text-yellow-600" />
                    <div>
                      <h4 className="text-yellow-800 font-semibold">License Expiring Soon</h4>
                      <p className="text-yellow-700 text-sm">
                        Your license expires in {daysUntilExpiration} days ({expirationDate.toLocaleDateString()}). 
                        Consider updating your license information.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()
        )}


        {/* Terms and Conditions */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
          <TermsCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            context="posting"
            required={true}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            loading || 
            !priceValidation.isValid || 
            !termsAccepted ||
            licenseStatus.status !== 'verified' ||
            (!licenseStatus.loading && licenseStatus.status === 'verified' && licenseStatus.expirationDate && new Date(licenseStatus.expirationDate) < new Date())
          }
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none transition-all duration-200"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Posting Ride...</span>
            </div>
          ) : licenseStatus.status !== 'verified' ? (
            licenseStatus.status === 'pending' ? 'License Under Review' :
            licenseStatus.status === 'rejected' ? 'License Rejected' :
            'License Verification Required'
          ) : (!licenseStatus.loading && licenseStatus.expirationDate && new Date(licenseStatus.expirationDate) < new Date()) ? (
            'License Expired'
          ) : (
            'Post Ride'
          )}
        </button>
      </form>
    </div>
  );
};

export default PostRidePage;