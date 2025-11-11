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
  MessageCircle,
  MoonStar,
  Music4,
  Navigation,
  PawPrint,
  ShieldCheck,
  Snowflake,
  SprayCan,
  Star,
  Users,
  UserCircle,
  Wifi
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import PaymentModal from '../components/PaymentModal';
import TermsCheckbox from '../components/TermsCheckbox';

interface RouteSegment {
  id: number;
  address: string;
  segment_order: number;
  is_pickup: boolean;
  estimatedTime?: string;
}

const RideDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const { ride, segmentMatch, searchParams, driverProfile: initialDriverProfile, features: initialFeatures, rideFeatureAssignments } = location.state || {};
  
  const [loading, setLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [fullRoute, setFullRoute] = useState<RouteSegment[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [currentBookingId, setCurrentBookingId] = useState<number | null>(null);
  const [driverProfile, setDriverProfile] = useState<any>(initialDriverProfile);
  const [rideFeatures, setRideFeatures] = useState(initialFeatures || []);

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

  useEffect(() => {
    if (Array.isArray(initialFeatures) && initialFeatures.length > 0) {
      setRideFeatures(initialFeatures);
    }
  }, [initialFeatures]);

  useEffect(() => {
    if (rideFeatureAssignments && rideFeatureAssignments.length) {
      const mappedFeatures = rideFeatureAssignments
        .map((link: any) => link?.feature)
        .filter(Boolean);

      if (mappedFeatures.length) {
        setRideFeatures(mappedFeatures);
      }
    }
  }, [rideFeatureAssignments]);

  useEffect(() => {
    if (!ride) {
      return;
    }

    calculateFullRouteETA();

    if (!initialDriverProfile && ride.driver_id) {
      fetchDriverProfile(ride.driver_id);
    }

    if (ride.id && (!initialFeatures?.length && !rideFeatureAssignments?.length)) {
      fetchRideFeatures(ride.id);
    }
  }, [ride, rideFeatureAssignments, initialDriverProfile, initialFeatures]);

  const fetchDriverProfile = async (driverId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_driver_profile', { profile_id: driverId });
      if (error) {
        console.error('Failed to load driver profile', error);
        return;
      }
      if (data) {
        setDriverProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error loading driver profile', err);
    }
  };

  const fetchRideFeatures = async (rideId: number) => {
    try {
      const { data, error } = await supabase
        .from('ride_feature_assignments')
        .select('feature:ride_features(id, key, name, description, icon_slug)')
        .eq('ride_id', rideId);

      if (error) {
        console.error('Failed to load ride features', error);
        return;
      }

      setRideFeatures((data || []).map((link: any) => link.feature).filter(Boolean));
    } catch (err) {
      console.error('Unexpected error loading ride features', err);
    }
  };

  const calculateFullRouteETA = async () => {
    if (!ride?.ride_segments) return;

    const segments = [...ride.ride_segments].sort((a, b) => a.segment_order - b.segment_order);
    
    // FIXED TIMEZONE ISSUE: Handle departure time properly to avoid timezone conversion
    let departureTime;
    if (ride.departure_time.includes('+') || ride.departure_time.includes('Z')) {
      // If the string has timezone info, extract the date/time part and treat as local
      const dateTimePart = ride.departure_time.split('+')[0].split('Z')[0];
      const localDateString = dateTimePart.replace('T', ' ');
      departureTime = new Date(localDateString);
    } else {
      departureTime = new Date(ride.departure_time);
    }
    
    try {
      // Create coordinates array for OSRM API call
      const coordinates = segments.map(segment => ({
        lat: segment.lat || 0,
        lng: segment.lng || 0
      }));

      // Use OSRM API for live ETA calculation
      let routeWithETA;
      
      if (coordinates.length >= 2 && coordinates.every(coord => coord.lat && coord.lng)) {
        // Build coordinates string for OSRM multi-stop route
        const coordString = coordinates
          .map(coord => `${coord.lng},${coord.lat}`)
          .join(';');

        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=false&alternatives=false&steps=false`
        );

        if (response.ok) {
          const data = await response.json();
          
          if (data.routes && data.routes.length > 0) {
            const legs = data.routes[0].legs || [];
            let cumulativeMinutes = 0;
            
            routeWithETA = segments.map((segment, index) => {
              if (index === 0) {
                // First segment starts at departure time
                return {
                  ...segment,
                  estimatedTime: departureTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  realTimeETA: true
                };
              }
              
              // Add duration from previous leg
              if (legs[index - 1]) {
                cumulativeMinutes += Math.round(legs[index - 1].duration / 60);
              }
              
              return {
                ...segment,
                estimatedTime: new Date(
                  departureTime.getTime() + (cumulativeMinutes * 60 * 1000)
                ).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                realTimeETA: true
              };
            });
          }
        }
      }
      
      // Fallback to simplified calculation if API fails or no coordinates
      if (!routeWithETA) {
        console.log('Using fallback ETA calculation with realistic durations');
        
        // Use realistic segment durations based on typical Ontario highway/city driving
        const getRealisticSegmentDuration = (segmentIndex: number): number => {
          // First segment is always departure time (0 minutes)
          if (segmentIndex === 0) return 0;
          
          // Use realistic durations based on segment order
          // Kitchener→Woodstock: ~50 min, Woodstock→London: ~45 min, London→Windsor: ~240 min
          const realisticDurations = [0, 50, 45, 240]; // minutes for each segment
          
          if (segmentIndex < realisticDurations.length) {
            return realisticDurations[segmentIndex];
          }
          
          // For additional segments beyond the known route, use 60 minutes
          return 60;
        };
        
        let cumulativeMinutes = 0;
        routeWithETA = segments.map((segment, index) => {
          if (index > 0) {
            cumulativeMinutes += getRealisticSegmentDuration(index);
          }
          
          return {
            ...segment,
            estimatedTime: new Date(
              departureTime.getTime() + (cumulativeMinutes * 60 * 1000)
            ).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            realTimeETA: false
          };
        });
      }

      setFullRoute(routeWithETA);
    } catch (error) {
      console.error('Error calculating route ETA:', error);
      
      // Fallback calculation with realistic durations
      console.log('Error fallback: Using realistic segment durations');
      
      const getRealisticSegmentDuration = (segmentIndex: number): number => {
        if (segmentIndex === 0) return 0;
        const realisticDurations = [0, 50, 45, 240]; // Kitchener→Woodstock→London→Windsor
        return segmentIndex < realisticDurations.length ? realisticDurations[segmentIndex] : 60;
      };
      
      let cumulativeMinutes = 0;
      const routeWithETA = segments.map((segment, index) => {
        if (index > 0) {
          cumulativeMinutes += getRealisticSegmentDuration(index);
        }
        
        return {
          ...segment,
          estimatedTime: new Date(
            departureTime.getTime() + (cumulativeMinutes * 60 * 1000)
          ).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          realTimeETA: false
        };
      });
      
      setFullRoute(routeWithETA);
    }
  };

  const handleRequestRide = async () => {
    if (!user) {
      alert('Please login to request a ride');
      navigate('/auth');
      return;
    }
    
    if (!termsAccepted) {
      alert('Please accept the Terms and Conditions to book this ride.');
      return;
    }

    console.log('RideDetailsPage - Creating booking before payment');
    setLoading(true);
    
    try {
      const rideSegments = Array.isArray(ride?.ride_segments) ? ride.ride_segments : [];
      const hasRealFromSegment = rideSegments.some((segment: any) => segment.id === segmentMatch.fromSegment?.id);
      const hasRealToSegment = rideSegments.some((segment: any) => segment.id === segmentMatch.toSegment?.id);
      const fromSegmentId = hasRealFromSegment ? segmentMatch.fromSegment.id : null;
      const toSegmentId = hasRealToSegment ? segmentMatch.toSegment.id : null;

      // Create booking record first (with pending payment)
      const { data: booking, error: bookingError } = await supabase
        .from('ride_bookings')
        .insert({
          ride_id: ride.id,
          passenger_id: user.id,
          seats_booked: searchParams.passengers,
          total_amount: segmentMatch.segmentPrice * searchParams.passengers,
          status: 'pending',
          payment_status: 'pending', // Payment authorization pending
          from_segment_id: fromSegmentId,
          to_segment_id: toSegmentId,
        })
        .select()
        .single();

      if (bookingError) {
        console.error('RideDetailsPage - Failed to create booking:', bookingError);
        throw bookingError;
      }

      console.log('RideDetailsPage - Booking created:', booking);
      
      // Create segment seat bookings
      const segmentSeats: { booking_id: number; segment_id: number; seats_count: number }[] = [];
      if (rideSegments.length > 0 && typeof segmentMatch.fromSegment?.segment_order === 'number' && typeof segmentMatch.toSegment?.segment_order === 'number') {
        for (let i = segmentMatch.fromSegment.segment_order; i < segmentMatch.toSegment.segment_order; i++) {
          const segment = rideSegments.find((s: any) => s.segment_order === i);
          if (segment) {
            segmentSeats.push({
              booking_id: booking.id,
              segment_id: segment.id,
              seats_count: searchParams.passengers
            });
          }
        }
      }

      if (segmentSeats.length > 0) {
        const { error: seatsError } = await supabase
          .from('segment_seats')
          .insert(segmentSeats);

        if (seatsError) {
          console.error('RideDetailsPage - Failed to create segment seats:', seatsError);
          throw seatsError;
        }
      }

      // Create conversation for driver-passenger communication
      await supabase.from('conversations').insert({
        booking_id: booking.id,
        driver_id: ride.driver_id,
        passenger_id: user.id,
        last_message_at: new Date().toISOString()
      });

      console.log('RideDetailsPage - Opening PaymentModal with booking ID:', booking.id);
      setCurrentBookingId(booking.id);
      setShowPaymentModal(true);
      
    } catch (error) {
      console.error('RideDetailsPage - Error creating booking:', error);
      alert('Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentData: any) => {
    console.log('RideDetailsPage - Payment successful:', paymentData);
    
    if (!currentBookingId) {
      console.error('RideDetailsPage - No booking ID available for payment success');
      alert('Payment successful but booking not found. Please contact support.');
      return;
    }

    setLoading(true);
    try {
      // Update booking with payment authorization details
      const { error: bookingUpdateError } = await supabase
        .from('ride_bookings')
        .update({
          payment_status: paymentData.isHold ? 'authorized' : 'paid',
          payment_intent_id: paymentData.paymentIntentId,
          payment_authorized_at: new Date().toISOString(),
          payment_expires_at: paymentData.expiresAt,
          response_deadline: paymentData.expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentBookingId);

      if (bookingUpdateError) {
        console.error('RideDetailsPage - Failed to update booking:', bookingUpdateError);
        throw bookingUpdateError;
      }

      console.log('RideDetailsPage - Booking updated with payment authorization');

      setShowPaymentModal(false);
      setCurrentBookingId(null);
      alert('Ride request successful! Payment authorized. You can now chat with your driver.');
      navigate('/chat', { 
        state: { 
          bookingId: currentBookingId,
          segmentInfo: {
            from: segmentMatch.fromSegment.address,
            to: segmentMatch.toSegment.address,
            pickupTime: segmentMatch.estimatedPickupTime,
            dropoffTime: segmentMatch.estimatedDropoffTime
          }
        } 
      });
    } catch (error) {
      console.error('RideDetailsPage - Error updating booking after payment:', error);
      alert('Payment was successful but failed to update booking. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    // FIXED TIMEZONE ISSUE: Handle date formatting properly to avoid timezone conversion
    let date;
    
    if (dateString.includes('+') || dateString.includes('Z')) {
      // If the string has timezone info, extract the date/time part and treat as local
      const dateTimePart = dateString.split('+')[0].split('Z')[0];
      const localDateString = dateTimePart.replace('T', ' ');
      date = new Date(localDateString);
    } else {
      date = new Date(dateString);
    }
    
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    };
  };

  if (!ride || !segmentMatch || !searchParams) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Ride details not found</p>
          <button
            onClick={() => navigate('/find')}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const pickupInfo = formatDateTime(segmentMatch.estimatedPickupTime);
  const dropoffInfo = formatDateTime(segmentMatch.estimatedDropoffTime);
  const totalPrice = segmentMatch.segmentPrice * searchParams.passengers;
  const driverData = driverProfile || ride.driver || {};
  const driverInitial = driverData.display_name?.[0]?.toUpperCase() || 'D';
  const driverRatingValue = driverData.average_rating ?? driverData.rating ?? 5;
  const driverRating = Number(driverRatingValue);
  const featureList = (rideFeatures || []).filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-8 pb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/20 rounded-full transition-colors mr-3"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Ride Details</h1>
              <p className="text-blue-100 text-sm">Review your segment booking</p>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 py-6 space-y-6">
        {/* Driver Info Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center overflow-hidden">
              {driverData.photo_url ? (
                <img
                  src={driverData.photo_url}
                  alt={driverData.display_name || 'Driver'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white font-bold text-xl">
                  {driverInitial}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900">{driverData.display_name || 'Driver'}</h3>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <Star size={16} className="text-yellow-500 fill-current" />
                  <span className="font-medium">{driverRating.toFixed(1)}</span>
                </div>
                {(driverData.car_model || driverData.car_plate) && (
                  <div className="flex items-center space-x-1 text-gray-600">
                    <Car size={16} />
                    <span>{driverData.car_model}</span>
                    {driverData.car_plate && <span>• {driverData.car_plate}</span>}
                  </div>
                )}
              </div>
            </div>

          </div>

          {featureList.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {featureList.map((feature: any) => {
                const IconComponent = featureIconMap[feature?.icon_slug || ''] || Info;
                return (
                  <div
                    key={`ride-feature-${feature?.id}`}
                    className="flex items-center space-x-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold"
                  >
                    <IconComponent size={14} />
                    <span>{feature?.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Your Segment Info */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center space-x-2 mb-4">
            <Navigation size={20} className="text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Your Journey</h3>
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold"></span>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {segmentMatch.fromSegment.address.split(',')[0]}
                  </div>
                  <div className="text-sm text-gray-600">Pickup location</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900">{pickupInfo.time}</div>
                <div className="text-sm text-gray-600">{pickupInfo.date}</div>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="border-l-2 border-dashed border-gray-300 h-8"></div>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {segmentMatch.toSegment.address.split(',')[0]}
                  </div>
                  <div className="text-sm text-gray-600">Dropoff location</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-gray-900">{dropoffInfo.time}</div>
                <div className="text-sm text-gray-600">{dropoffInfo.date}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Route Visualization */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center space-x-2 mb-4">
            <MapPin size={20} className="text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Complete Route</h3>
            <span className="text-sm text-gray-600">with ETAs</span>
            {fullRoute.length > 0 && fullRoute[0].realTimeETA && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold"></span>
            )}
            {fullRoute.length > 0 && !fullRoute[0].realTimeETA && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-semibold">
                Est. ETA
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            {fullRoute.map((segment, index) => {
              const isUserSegment = segment.segment_order >= segmentMatch.fromSegment.segment_order && 
                                 segment.segment_order <= segmentMatch.toSegment.segment_order;
              
              return (
                <div
                  key={segment.id}
                  className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                    isUserSegment 
                      ? 'bg-blue-50 border-2 border-blue-200' 
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      index === 0 ? 'bg-green-500' :
                      index === fullRoute.length - 1 ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}></div>
                    <div>
                      <div className={`font-medium ${isUserSegment ? 'text-blue-900' : 'text-gray-900'}`}>
                        {segment.address.split(',')[0]}
                      </div>
                      <div className="text-xs text-gray-600">
                        {segment.is_pickup ? 'Stop' : 'Final destination'}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${isUserSegment ? 'text-blue-700' : 'text-gray-600'}`}>
                    {segment.estimatedTime}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Request Summary */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Request Summary</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Passengers</span>
              <span className="font-semibold">{searchParams.passengers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Price per person</span>
              <span className="font-semibold">${segmentMatch.segmentPrice}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Available seats</span>
              <span className="font-semibold">{segmentMatch.availableSeats}</span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between text-lg">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-green-600">${totalPrice}</span>
            </div>
          </div>
        </div>

        {/* Terms Acceptance for Booking */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <TermsCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            context="booking"
            required={true}
          />
        </div>

        {/* Request Button */}
        <button
          onClick={handleRequestRide}
          disabled={loading || !termsAccepted}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
        >
          <MessageCircle size={24} />
          <span>{loading ? 'Processing...' : `Request Ride - $${totalPrice}`}</span>
        </button>
      </div>
      {/* Payment Modal */}
      {showPaymentModal && currentBookingId && (
        <PaymentModal
          amount={totalPrice}
          usePaymentHold={true}
          bookingId={currentBookingId}
          userId={user?.id}
          onSuccess={handlePaymentSuccess}
          onCancel={() => {
            setShowPaymentModal(false);
            setCurrentBookingId(null);
          }}
        />
      )}
    </div>
  );
};

export default RideDetailsPage;