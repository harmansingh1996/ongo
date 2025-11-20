import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Star, Users, Check, DollarSign, Navigation, CreditCard } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getRideById } from '../../services/rideService';
import { createBooking, hasExistingBooking } from '../../services/bookingService';
import { createAndAuthorizePayment } from '../../services/paymentService';
import { getPendingReferralForUser } from '../../services/referralService';
import { supabase } from '../../services/supabaseClient';
import { RouteMapPreview } from '../../components/map';
import { formatTime } from '../../utils/timeUtils';
import { calculateRoute, formatDistance, formatDuration, RouteData, calculateMultiStopRoute, MultiStopRouteData, formatDurationSeconds } from '../../services/routeService';
import TermsCheckbox from '../../components/TermsCheckbox';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import StripePaymentForm from '../../components/StripePaymentForm';

// Initialize Stripe with publishable key from ywConfig
const getStripeKey = () => {
  if (typeof window === 'undefined') return null;
  
  const key = (window as any).ywConfig?.stripe_publishable_key;
  
  if (!key || key === 'pk_test_YOUR_KEY_HERE') {
    console.error('⚠️ STRIPE ERROR: No valid Stripe publishable key configured in yw_manifest.json');
    console.error('Please add your Stripe publishable key to yw_manifest.json:');
    console.error('{ "stripe_publishable_key": "pk_test_..." }');
    return null;
  }
  
  return key;
};

const stripePromise = getStripeKey() ? loadStripe(getStripeKey()!) : null;

// Get Mapbox token from ywConfig
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || '';

export default function RidePreviewPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ride, setRide] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [requestedSeats, setRequestedSeats] = useState(1);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [multiStopRouteData, setMultiStopRouteData] = useState<MultiStopRouteData | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pendingReferral, setPendingReferral] = useState<any>(null);
  const [hasReferralDiscount, setHasReferralDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<'referred' | 'referrer' | null>(null);

  // Get search parameters to determine segment booking
  const fromLat = searchParams.get('fromLat');
  const fromLng = searchParams.get('fromLng');
  const toLat = searchParams.get('toLat');
  const toLng = searchParams.get('toLng');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const urlSegmentPrice = searchParams.get('segmentPrice');
  const urlSegmentDistance = searchParams.get('segmentDistance');

  useEffect(() => {
    loadData();
  }, [rideId, navigate]);

  const loadData = async () => {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'rider') {
      navigate('/');
      return;
    }
    setCurrentUser(user);

    // Check if user has a pending referral discount (as referred or referrer)
    const referralData = await getPendingReferralForUser(user.id);
    if (referralData) {
      setPendingReferral(referralData);
      setHasReferralDiscount(true);
      setDiscountType(referralData.discountType || 'referred');
      
      if (referralData.discountType === 'referred') {
        console.log('✅ User has pending 10% discount (used referral code)');
      } else {
        console.log('✅ User has pending 10% discount (referral reward from sharing code)');
      }
    }

    if (rideId) {
      const rideData = await getRideById(rideId);
      console.log('Ride data loaded:', rideData);
      setRide(rideData);
      
      // Calculate real-time route if we have from and to location coordinates
      if (rideData.from_location?.lat && rideData.from_location?.lng && 
          rideData.to_location?.lat && rideData.to_location?.lng &&
          MAPBOX_TOKEN) {
        setLoadingRoute(true);
        const route = await calculateRoute(
          rideData.from_location.lat,
          rideData.from_location.lng,
          rideData.to_location.lat,
          rideData.to_location.lng,
          MAPBOX_TOKEN
        );
        
        if (route) {
          setRouteData(route);
        } else {
          console.warn('Failed to calculate route');
        }
        setLoadingRoute(false);
      }
      
      // Calculate real-time multi-stop route if available
      if (rideData.route_stops && rideData.route_stops.length >= 2 && MAPBOX_TOKEN) {
        setLoadingRoute(true);
        const startTime = new Date(`${rideData.date}T${rideData.time}`);
        const multiRoute = await calculateMultiStopRoute(
          rideData.route_stops,
          startTime,
          MAPBOX_TOKEN
        );
        
        if (multiRoute) {
          setMultiStopRouteData(multiRoute);
          console.log('✅ Multi-stop route calculated for preview');
        }
        setLoadingRoute(false);
      }
    }
    setLoading(false);
  };

  // Determine if this is a segment booking
  const isSegmentBooking = ride?.isSegmentBooking || (
    fromLat && fromLng && toLat && toLng &&
    ride?.from_location &&
    (parseFloat(fromLat) !== ride.from_location.lat || parseFloat(fromLng) !== ride.from_location.lng ||
     parseFloat(toLat) !== ride.to_location.lat || parseFloat(toLng) !== ride.to_location.lng)
  );

  // Use URL params first, then fallback to ride data
  const segmentFrom = ride?.displayFrom || (from && fromLat && fromLng ? { address: from, lat: parseFloat(fromLat), lng: parseFloat(fromLng) } : null);
  const segmentTo = ride?.displayTo || (to && toLat && toLng ? { address: to, lat: parseFloat(toLat), lng: parseFloat(toLng) } : null);
  const segmentPrice = urlSegmentPrice ? parseFloat(urlSegmentPrice) : (ride?.displayPrice || ride?.price_per_seat);
  const segmentDistance = urlSegmentDistance ? parseFloat(urlSegmentDistance) : (ride?.displayDistance || ride?.distance);

  const handleBookRide = async () => {
    if (requestedSeats < 1) {
      alert('Please select at least one seat');
      return;
    }

    if (!ride || !currentUser) return;

    setBooking(true);

    try {
      // Check if user already has a booking for this ride
      const existingBooking = await hasExistingBooking(currentUser.id, ride.id);
      if (existingBooking) {
        alert('You already have a booking for this ride');
        setBooking(false);
        return;
      }

      // Use segment locations if segment booking, otherwise use full ride locations
      const pickupLocation = isSegmentBooking && segmentFrom 
        ? { address: segmentFrom.address, lat: segmentFrom.lat, lng: segmentFrom.lng }
        : { address: ride.from_location.address, lat: ride.from_location.lat, lng: ride.from_location.lng };

      const dropoffLocation = isSegmentBooking && segmentTo
        ? { address: segmentTo.address, lat: segmentTo.lat, lng: segmentTo.lng }
        : { address: ride.to_location.address, lat: ride.to_location.lat, lng: ride.to_location.lng };

      // Calculate total price
      const pricePerSeat = segmentPrice || ride.price_per_seat;
      let totalPrice = requestedSeats * pricePerSeat;
      const distanceKm = segmentDistance || ride.distance;

      // Apply 10% referral discount if user has pending referral
      let discountAmount = 0;
      if (hasReferralDiscount && pendingReferral) {
        discountAmount = totalPrice * 0.1;
        totalPrice = totalPrice * 0.9; // Apply 10% discount
        console.log(`💰 Referral discount applied: -$${discountAmount.toFixed(2)} (10% off)`);
      }

      // CRITICAL FIX: Authorize payment FIRST before creating booking
      // This ensures driver only sees requests with valid payment authorization
      const amountSubtotalCents = Math.round(totalPrice * 100); // Convert to cents (discounted price)
      
      // Create payment intent (but don't authorize yet)
      const paymentResult = await createAndAuthorizePayment({
        rideId: ride.id,
        bookingId: undefined, // Will be updated after booking is created
        riderId: currentUser.id,
        driverId: ride.driver_id,
        amountSubtotal: amountSubtotalCents,
        // referralCode can be added here if you have referral UI
        metadata: {
          requestedSeats,
          isSegmentBooking,
          pickupAddress: pickupLocation.address,
          dropoffAddress: dropoffLocation.address,
        },
      });

      if (!paymentResult.success || !paymentResult.clientSecret) {
        alert(`Failed to initialize payment: ${paymentResult.error}\n\nPlease try again.`);
        setBooking(false);
        return;
      }

      // Store client secret and payment intent ID
      setClientSecret(paymentResult.clientSecret);
      setPaymentIntentId(paymentResult.paymentIntent?.id || null);
      
      // Show payment form to collect payment method
      setShowPaymentForm(true);
      setBooking(false);
    } catch (error) {
      console.error('Error booking ride:', error);
      alert('An error occurred while booking the ride.');
      setBooking(false);
    }
  };

  const handlePaymentSuccess = async () => {
    if (!ride || !currentUser || !paymentIntentId) return;

    setBooking(true);

    try {
      // Use segment locations if segment booking, otherwise use full ride locations
      const pickupLocation = isSegmentBooking && segmentFrom 
        ? { address: segmentFrom.address, lat: segmentFrom.lat, lng: segmentFrom.lng }
        : { address: ride.from_location.address, lat: ride.from_location.lat, lng: ride.from_location.lng };

      const dropoffLocation = isSegmentBooking && segmentTo
        ? { address: segmentTo.address, lat: segmentTo.lat, lng: segmentTo.lng }
        : { address: ride.to_location.address, lat: ride.to_location.lat, lng: ride.to_location.lng };

      // Calculate total price
      const pricePerSeat = segmentPrice || ride.price_per_seat;
      let totalPrice = requestedSeats * pricePerSeat;
      const distanceKm = segmentDistance || ride.distance;

      // Apply 10% referral discount if user has pending referral
      let discountAmount = 0;
      if (hasReferralDiscount && pendingReferral) {
        discountAmount = totalPrice * 0.1;
        totalPrice = totalPrice * 0.9; // Apply 10% discount
        console.log(`💰 Referral discount applied: -$${discountAmount.toFixed(2)} (10% off)`);
      }

      // Payment authorized successfully - now create the booking
      const bookingId = await createBooking({
        rideId: ride.id,
        passengerId: currentUser.id,
        requestedSeats: requestedSeats,
        pickupLocation,
        dropoffLocation,
        message: isSegmentBooking ? 'Segment booking request' : 'Looking forward to the ride!',
        pricePerSeat: pricePerSeat,
        totalPrice: totalPrice,
        distanceKm: distanceKm,
        referralUseId: pendingReferral?.id,
        discountApplied: discountAmount,
      });

      if (bookingId) {
        // Update payment intent with booking ID
        if (paymentIntentId) {
          await supabase
            .from('stripe_payment_intents')
            .update({ booking_id: bookingId })
            .eq('stripe_payment_intent_id', paymentIntentId);
        }

        let message = `Booking request sent successfully!\nTotal: $${totalPrice.toFixed(2)}\nPayment authorized (will be charged after ride completion)\nDriver will review your request.`;
        
        if (hasReferralDiscount && discountAmount > 0) {
          const discountSource = discountType === 'referred' 
            ? 'Used referral code' 
            : 'Reward for sharing your code';
          message = `Booking request sent successfully!\n🎉 Referral discount applied: -$${discountAmount.toFixed(2)}\n(${discountSource})\nTotal: $${totalPrice.toFixed(2)}\nPayment authorized (will be charged after ride completion)\nDriver will review your request.`;
        }
        
        alert(message);
        navigate('/rider/trips');
      } else {
        // Booking creation failed - cancel the authorized payment
        alert('Failed to create booking. Payment authorization will be cancelled.');
        if (paymentIntentId) {
          await supabase
            .from('stripe_payment_intents')
            .update({ 
              status: 'canceled',
              canceled_at: new Date().toISOString(),
              cancellation_reason: 'Booking creation failed'
            })
            .eq('stripe_payment_intent_id', paymentIntentId);
        }
        setBooking(false);
        return;
      }
    } catch (error) {
      console.error('Error booking ride:', error);
      alert('An error occurred while booking the ride.');
    } finally {
      setBooking(false);
    }
  };

  const handlePaymentError = (error: string) => {
    console.error('Payment error:', error);
    setShowPaymentForm(false);
    setClientSecret(null);
    setPaymentIntentId(null);
  };

  // Show payment form modal
  if (showPaymentForm && clientSecret) {
    return (
      <div className="w-full h-dvh bg-gray-50">
        <div
          className="w-full h-full flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header */}
          <header className="flex-none bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowPaymentForm(false);
                  setClientSecret(null);
                  setPaymentIntentId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Payment Authorization</h1>
            </div>
          </header>

          {/* Payment Form */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Authorize Payment</h2>
                <p className="text-sm text-gray-600">
                  Your payment method will be authorized for ${(requestedSeats * (segmentPrice || ride.price_per_seat)).toFixed(2)}.
                  No charge will be made until the ride is completed.
                </p>
              </div>

              {stripePromise ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <StripePaymentForm
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    amount={Math.round((requestedSeats * (segmentPrice || ride.price_per_seat)) * 100)}
                  />
                </Elements>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold text-red-900 mb-2">Payment Configuration Error</h3>
                  <p className="text-sm text-red-700 mb-4">
                    Stripe payment system is not properly configured. Please contact support or check your Stripe API keys in the project configuration.
                  </p>
                  <div className="text-xs text-red-600 font-mono bg-red-100 p-3 rounded">
                    <strong>Developer Note:</strong><br/>
                    1. Get your Stripe publishable key from: <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard</a><br/>
                    2. Update yw_manifest.json with: "stripe_publishable_key": "pk_test_YOUR_KEY"<br/>
                    3. Reload the application
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !ride) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading ride details...</p>
        </div>
      </div>
    );
  }

  // Build route stops list (start + intermediate + end)
  const allStops = ride.route_stops && ride.route_stops.length > 0 
    ? ride.route_stops.sort((a: any, b: any) => a.stop_order - b.stop_order)
    : [
        { 
          id: 'start', 
          address: ride.from_location.address, 
          estimated_arrival: ride.time,
          lat: ride.from_location.lat,
          lng: ride.from_location.lng,
          stop_order: 0 
        },
        { 
          id: 'end', 
          address: ride.to_location.address, 
          estimated_arrival: ride.estimated_arrival,
          lat: ride.to_location.lat,
          lng: ride.to_location.lng,
          stop_order: 999 
        }
      ];

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 active:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Ride Details</h1>
              <p className="text-sm text-gray-600">{ride.date} at {formatTime(ride.time)}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-3">
            {/* Segment Booking Badge */}
            {isSegmentBooking}

            {/* Real-time Route Information */}
            {(routeData || loadingRoute) && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <Navigation className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Live Route Information</h3>
                </div>
                
                {loadingRoute ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="ml-2 text-sm text-gray-600">Calculating route...</span>
                  </div>
                ) : routeData ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Distance</span>
                      <span className="text-sm font-medium text-gray-900">{formatDistance(routeData.distance)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Duration</span>
                      <span className="text-sm font-medium text-gray-900">{formatDuration(routeData.duration)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Estimated Arrival</span>
                      <span className="text-sm font-medium text-gray-900">{routeData.eta}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                        Real-time road data via Mapbox
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Interactive Map Preview */}
            {ride.route_stops && ride.route_stops.length > 0 && MAPBOX_TOKEN ? (
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">Route Map</div>
                  <div className="text-xs text-gray-500">
                    {segmentDistance ? `${segmentDistance.toFixed(1)} km` : ride.distance ? `${ride.distance.toFixed(1)} km` : ''}
                    {ride.duration ? ` • ${ride.duration} min` : ''}
                  </div>
                </div>
                <RouteMapPreview
                  routeStops={multiStopRouteData?.stops || ride.route_stops}
                  routeGeometry={multiStopRouteData?.routeGeometry || ride.route_data?.routes?.[0]?.geometry}
                  mapboxToken={MAPBOX_TOKEN}
                  className="w-full h-64"
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg flex flex-col items-center justify-center">
                  <Navigation className="w-12 h-12 text-blue-400 mb-2" />
                  <p className="text-sm text-gray-600">Route Preview</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {segmentDistance ? `${segmentDistance.toFixed(1)} km` : ride.distance ? `${ride.distance.toFixed(1)} km` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Driver Profile Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Driver</h2>
              <div
                onClick={() => navigate(`/rider/driver-profile/${ride.driver_id}`)}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg active:bg-gray-100"
              >
                <img
                  src={ride.driver?.profile_image || '/assets/placeholder-avatar.jpg'}
                  alt={ride.driver?.name || 'Driver'}
                  className="w-14 h-14 rounded-full object-cover border-2 border-blue-500"
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{ride.driver?.name || 'Driver'}</h4>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <span className="text-sm text-gray-600">{ride.driver?.rating?.toFixed(1) || '5.0'}</span>
                    <span className="text-xs text-gray-500">• {ride.driver?.total_rides || 0} trips</span>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">Tap to view profile</p>
                </div>
              </div>
            </div>

            {/* Route Stops with Segment Highlighting */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  {isSegmentBooking ? 'Full Route (Your Route highlighted)' : 'Route & Stops'}
                </h2>
                <span className="text-xs text-gray-500">{allStops.length} stops</span>
              </div>
              
              <div className="space-y-3">
                {allStops.map((stop: any, index: number) => {
                  const isFirstStop = index === 0;
                  const isLastStop = index === allStops.length - 1;
                  const isUserPickup = isSegmentBooking && segmentFrom && 
                    Math.abs(stop.lat - segmentFrom.lat) < 0.01 && 
                    Math.abs(stop.lng - segmentFrom.lng) < 0.01;
                  const isUserDropoff = isSegmentBooking && segmentTo &&
                    Math.abs(stop.lat - segmentTo.lat) < 0.01 && 
                    Math.abs(stop.lng - segmentTo.lng) < 0.01;
                  const isInSegment = isSegmentBooking && (isUserPickup || isUserDropoff);

                  return (
                    <div key={stop.id || index} className={`flex items-start gap-3 ${isInSegment ? 'bg-purple-50 -mx-2 px-2 py-2 rounded-lg' : ''}`}>
                      <div className="flex flex-col items-center">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          isUserPickup || isFirstStop ? 'bg-green-600 ring-4 ring-green-200' :
                          isUserDropoff || isLastStop ? 'bg-red-600 ring-4 ring-red-200' :
                          'bg-blue-600'
                        }`}>
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                        {!isLastStop && (
                          <div className={`w-0.5 h-12 my-1 ${isInSegment ? 'bg-purple-400' : 'bg-gray-300'}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{stop.name || stop.address}</div>
                            {stop.estimated_arrival && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                <Clock className="w-3 h-3" />
                                <span>{stop.estimated_arrival}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {isUserPickup && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                Your Pickup
                              </span>
                            )}
                            {isUserDropoff && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                Your Dropoff
                              </span>
                            )}
                            {!isInSegment && isFirstStop && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Start</span>
                            )}
                            {!isInSegment && isLastStop && (
                              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">End</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ride Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Trip Details</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Departure</span>
                  </div>
                  <div className="font-medium text-gray-900">{formatTime(ride.time)}</div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Users className="w-4 h-4" />
                    <span>Available</span>
                  </div>
                  <div className="font-medium text-gray-900">{ride.available_seats} seats</div>
                </div>

                {segmentDistance && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Distance</div>
                    <div className="font-medium text-gray-900">
                      {segmentDistance.toFixed(1)} km
                      {isSegmentBooking && <span className="text-xs text-purple-600 ml-1"></span>}
                    </div>
                  </div>
                )}

                {ride.duration && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Duration</div>
                    <div className="font-medium text-gray-900">{ride.duration} min</div>
                  </div>
                )}
              </div>
            </div>

            {/* Seat Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Select Seats</h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setRequestedSeats(Math.max(1, requestedSeats - 1))}
                  className="w-12 h-12 rounded-xl bg-gray-100 active:bg-gray-200 flex items-center justify-center font-bold text-gray-900 text-xl"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <div className="text-3xl font-bold text-blue-600">{requestedSeats}</div>
                  <div className="text-xs text-gray-600 mt-1">seat{requestedSeats > 1 ? 's' : ''} selected</div>
                </div>
                <button
                  onClick={() => setRequestedSeats(Math.min(ride.available_seats, requestedSeats + 1))}
                  disabled={requestedSeats >= ride.available_seats}
                  className="w-12 h-12 rounded-xl bg-blue-600 active:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center font-bold text-white text-xl"
                >
                  +
                </button>
              </div>
              <div className="mt-3 text-center">
                <span className="text-xs text-gray-600">
                  {ride.available_seats} seat{ride.available_seats > 1 ? 's' : ''} available
                </span>
              </div>
            </div>

            {/* Price Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Price Summary</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">
                    Price per Seat
                    {isSegmentBooking && <span className="text-xs text-purple-600 ml-1"></span>}
                  </span>
                  <span className="text-sm font-medium text-gray-900">${segmentPrice?.toFixed(2) || ride.price_per_seat?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Number of Seats</span>
                  <span className="text-sm font-medium text-gray-900">{requestedSeats}</span>
                </div>
                {hasReferralDiscount && (
                  <div className="flex flex-col gap-1 text-green-600 bg-green-50 -mx-2 px-2 py-2 rounded">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">
                        🎉 Referral Discount (10%)
                      </span>
                      <span className="text-sm font-medium">-${((segmentPrice || ride.price_per_seat) * requestedSeats * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-green-700">
                      {discountType === 'referred' 
                        ? 'Thank you for using a referral code!' 
                        : 'Reward for sharing your referral code!'}
                    </div>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="text-base font-semibold text-gray-900">Total Amount</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${hasReferralDiscount 
                      ? ((requestedSeats * (segmentPrice || ride.price_per_seat)) * 0.9).toFixed(2)
                      : (requestedSeats * (segmentPrice || ride.price_per_seat)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Terms & Conditions Checkbox - Scrollable at bottom */}
            <div className="mt-4">
              <TermsCheckbox
                checked={termsAccepted}
                onChange={setTermsAccepted}
                type="booking"
              />
            </div>
          </div>
        </div>

        {/* Book Button */}
        <div 
          className="flex-none bg-white border-t border-gray-200 p-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            onClick={handleBookRide}
            disabled={booking || requestedSeats < 1 || !termsAccepted}
            className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
          >
            {booking ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Booking...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Send Booking Request (${(requestedSeats * (segmentPrice || ride.price_per_seat)).toFixed(2)})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
