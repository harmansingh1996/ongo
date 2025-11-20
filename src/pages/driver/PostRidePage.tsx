import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Users, DollarSign, Car, Music, MessageCircle, Wind, Cigarette, Heart, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Ride, CarDetails, UserPreferences, RouteCalculationResult } from '../../types';
import { MapRouteInput } from '../../components/map';
import { createRide, checkDailyRideLimit, checkMonthlyRideLimit, checkRideTimeConflict } from '../../services/rideService';
import { getCurrentUser } from '../../services/authService';
import type { AuthUser } from '../../services/authService';
import { getPricingTierForDistance, validatePricePerKm, calculatePricePerSeat, type PricingTier } from '../../services/pricingService';
import { hasVerifiedLicence } from '../../services/licenceService';
import TermsCheckbox from '../../components/TermsCheckbox';

// Get Mapbox token from ywConfig (set in yw_manifest.json)
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || 'pk.YOUR_MAPBOX_ACCESS_TOKEN_HERE';

const PostRidePage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Route data from map
  const [routeResult, setRouteResult] = useState<RouteCalculationResult | null>(null);
  
  // Pricing tier and validation
  const [pricingTier, setPricingTier] = useState<PricingTier | null>(null);
  const [pricePerKm, setPricePerKm] = useState(0.15); // Default price per km
  const [priceValidationError, setPriceValidationError] = useState<string | null>(null);

  // Load current user and check licence verification
  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.userType !== 'driver') {
        navigate('/auth');
        return;
      }
      setUser(currentUser);
      
      // Check if driver has verified licence
      const isVerified = await hasVerifiedLicence(currentUser.id);
      if (!isVerified) {
        // Redirect to licence verification page
        alert('You must verify your driver\'s licence before posting a ride.');
        navigate('/driver/license-verification');
        return;
      }
    };
    loadUser();
  }, [navigate]);
  
  // Form data
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // Set to today's date
    hour: '9',
    minute: '00',
    period: 'AM' as 'AM' | 'PM',
    availableSeats: 3,
    pricePerSeat: 15,
    carMake: '',
    carModel: '',
    carYear: new Date().getFullYear(),
    carColor: '',
    licensePlate: '',
    music: true,
    conversation: 'moderate' as 'quiet' | 'chatty' | 'moderate',
    smoking: false,
    pets: false,
    temperature: 'moderate' as 'cool' | 'warm' | 'moderate',
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleRouteCalculated = async (result: RouteCalculationResult) => {
    setRouteResult(result);
    
    // Get pricing tier for this distance
    const distanceKm = Math.round(result.totalDistance / 1000);
    const tier = await getPricingTierForDistance(distanceKm);
    setPricingTier(tier);
    
    if (tier) {
      // Set default price per km to minimum of tier
      const defaultPricePerKm = tier.min_price_per_km;
      setPricePerKm(defaultPricePerKm);
      
      // Calculate suggested price per seat based on minimum price per km
      const calculatedPrice = calculatePricePerSeat(defaultPricePerKm, distanceKm);
      handleInputChange('pricePerSeat', Math.max(calculatedPrice, 5)); // Minimum $5
    } else {
      // Fallback if no tier found
      const suggestedPrice = Math.max(result.totalPrice, 5);
      handleInputChange('pricePerSeat', Math.round(suggestedPrice));
    }
  };
  
  const handlePricePerSeatChange = (newPricePerSeat: number) => {
    handleInputChange('pricePerSeat', newPricePerSeat);
    setPriceValidationError(null);
    
    // Calculate price per km for backend validation
    if (routeResult && pricingTier) {
      const distanceKm = Math.round(routeResult.totalDistance / 1000);
      const newPricePerKm = newPricePerSeat / distanceKm;
      setPricePerKm(newPricePerKm);
      
      const validation = validatePricePerKm(newPricePerKm, pricingTier);
      if (!validation.valid) {
        setPriceValidationError(validation.message || 'Invalid price');
      }
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !routeResult) {
      alert('Please enter start and end locations to calculate route');
      return;
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(-1);
    }
  };

  const handleSubmit = async () => {
    if (!policyAccepted) {
      alert('Please accept the ride policy to continue');
      return;
    }

    if (!routeResult) {
      alert('Please calculate route first');
      return;
    }

    if (!user) {
      alert('User not authenticated');
      navigate('/auth');
      return;
    }
    
    // Validate price per km against tier limits
    if (pricingTier) {
      const priceValidation = validatePricePerKm(pricePerKm, pricingTier);
      if (!priceValidation.valid) {
        alert(priceValidation.message);
        setCurrentStep(1);
        return;
      }
    }

    // Convert time to 24-hour format for backend
    let hour24 = parseInt(formData.hour);
    if (formData.period === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (formData.period === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    const time24 = `${hour24.toString().padStart(2, '0')}:${formData.minute}`;

    // Validate required fields
    if (!formData.date || !formData.hour) {
      alert('Please fill in date and time');
      setCurrentStep(1);
      return;
    }

    if (!formData.carMake || !formData.carModel || !formData.carColor || !formData.licensePlate) {
      alert('Please fill in all car details');
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);

    try {
      // Check daily ride limit
      const dailyLimitCheck = await checkDailyRideLimit(user.id, formData.date);
      if (!dailyLimitCheck.allowed) {
        alert(dailyLimitCheck.message || 'Daily ride limit exceeded');
        setIsSubmitting(false);
        return;
      }
      
      // Check monthly ride limit
      const monthlyLimitCheck = await checkMonthlyRideLimit(user.id, formData.date);
      if (!monthlyLimitCheck.allowed) {
        alert(monthlyLimitCheck.message || 'Monthly ride limit exceeded');
        setIsSubmitting(false);
        return;
      }
      
      // Check for time conflicts
      const durationMinutes = Math.round(routeResult.totalDuration / 60);
      const conflictCheck = await checkRideTimeConflict(
        user.id,
        formData.date,
        time24,
        durationMinutes
      );
      
      if (conflictCheck.hasConflict) {
        const conflictMsg = `${conflictCheck.message}\n\nConflicting ride(s):\n${conflictCheck.conflictingRides.map(
          (r, i) => `${i + 1}. ${r.from_location.address} → ${r.to_location.address} at ${r.time}`
        ).join('\n')}\n\nPlease choose a different time.`;
        alert(conflictMsg);
        setIsSubmitting(false);
        setCurrentStep(1);
        return;
      }

      // Prepare ride data for submission
      const rideData = {
        fromLocation: {
          address: routeResult.stops[0].address,
          lat: routeResult.stops[0].lat,
          lng: routeResult.stops[0].lng,
        },
        toLocation: {
          address: routeResult.stops[routeResult.stops.length - 1].address,
          lat: routeResult.stops[routeResult.stops.length - 1].lat,
          lng: routeResult.stops[routeResult.stops.length - 1].lng,
        },
        stops: routeResult.stops,
        date: formData.date,
        time: time24,
        availableSeats: formData.availableSeats,
        pricePerSeat: formData.pricePerSeat,
        pricePerKm: pricePerKm, // Use the driver-selected price per km
        distance: Math.round(routeResult.totalDistance / 1000), // Convert to km
        duration: Math.round(routeResult.totalDuration / 60), // Convert to minutes
        estimatedArrival: routeResult.stops[routeResult.stops.length - 1].estimatedArrival,
        routeData: routeResult.fullRoute,
        ridePolicyAccepted: policyAccepted,
      };

      // Submit ride to database
      const rideId = await createRide(user.id, rideData);

      if (rideId) {
        // Success - navigate to driver trips
        alert('Ride posted successfully! 🎉');
        navigate('/driver/trips');
      } else {
        // Error
        alert('Failed to post ride. Please try again.');
      }
    } catch (error) {
      console.error('Error posting ride:', error);
      alert('An error occurred while posting your ride. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[1, 2, 3].map((step) => (
        <React.Fragment key={step}>
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {currentStep > step ? <CheckCircle className="w-5 h-5" /> : step}
          </div>
          {step < 3 && (
            <div
              className={`w-16 h-1 ${currentStep > step ? 'bg-blue-600' : 'bg-gray-200'}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Route & Schedule</h2>

      {/* Map Route Input */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <MapRouteInput
          onRouteCalculated={handleRouteCalculated}
          startTime={`${parseInt(formData.hour) + (formData.period === 'PM' && parseInt(formData.hour) !== 12 ? 12 : 0)}:${formData.minute}`}
          pricePerKm={pricePerKm}
          mapboxToken={MAPBOX_TOKEN}
        />
      </div>
      
      {/* Full Address Reminder */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">📍</span>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1 text-sm">Enter Full Addresses</h4>
            <p className="text-sm text-gray-700">
              Please provide complete pickup and dropoff addresses (street name, number, city) for accurate location tracking and easier navigation.
            </p>
          </div>
        </div>
      </div>
      
      {/* Pricing Tier Information */}
      {pricingTier && routeResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-none mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 mb-2">
                {pricingTier.tier_name} ({Math.round(routeResult.totalDistance / 1000)} km)
              </h4>
              <p className="text-sm text-blue-800">
                Allowed price range per seat:
              </p>
              <p className="text-lg font-bold text-blue-900 my-1">
                ${(pricingTier.min_price_per_km * Math.round(routeResult.totalDistance / 1000)).toFixed(2)} - ${(pricingTier.max_price_per_km * Math.round(routeResult.totalDistance / 1000)).toFixed(2)}
              </p>
              
              {priceValidationError && (
                <p className="text-sm text-red-600 mt-2 font-medium">
                  ⚠️ {priceValidationError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Calendar className="inline w-4 h-4 mr-1" />
          Date
        </label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => handleInputChange('date', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
          min={new Date().toISOString().split('T')[0]}
        />
      </div>

      {/* Time with AM/PM */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Clock className="inline w-4 h-4 mr-1" />
          Time
        </label>
        <div className="flex gap-2">
          <select
            value={formData.hour}
            onChange={(e) => handleInputChange('hour', e.target.value)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h.toString()}>
                {h}
              </option>
            ))}
          </select>
          <select
            value={formData.minute}
            onChange={(e) => handleInputChange('minute', e.target.value)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="00">00</option>
            <option value="15">15</option>
            <option value="30">30</option>
            <option value="45">45</option>
          </select>
          <select
            value={formData.period}
            onChange={(e) => handleInputChange('period', e.target.value)}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>

      {/* Seats & Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Users className="inline w-4 h-4 mr-1" />
            Available Seats
          </label>
          <input
            type="number"
            value={formData.availableSeats}
            onChange={(e) => handleInputChange('availableSeats', parseInt(e.target.value))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="1"
            max="7"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <DollarSign className="inline w-4 h-4 mr-1" />
            Price per Seat
          </label>
          <input
            type="number"
            value={formData.pricePerSeat}
            onChange={(e) => handlePricePerSeatChange(parseFloat(e.target.value))}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="1"
            step="0.5"
            required
          />
        </div>
      </div>

      {routeResult && pricingTier && (
        <div className="p-3 bg-green-50 rounded-lg text-sm text-green-700">
          💡 Suggested price range: ${(pricingTier.min_price_per_km * Math.round(routeResult.totalDistance / 1000)).toFixed(2)} - ${(pricingTier.max_price_per_km * Math.round(routeResult.totalDistance / 1000)).toFixed(2)} per seat
        </div>
      )}
      
      {/* No Cash Policy Notice */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">💳</span>
          <div className="flex-1">
            <h4 className="font-semibold text-green-900 mb-1 text-sm">Cashless Payments Only</h4>
            <p className="text-sm text-gray-700">
              All payments are processed digitally through the app. Do not accept cash from passengers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Car Details</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Car className="inline w-4 h-4 mr-1" />
              Make
            </label>
            <input
              type="text"
              value={formData.carMake}
              onChange={(e) => handleInputChange('carMake', e.target.value)}
              placeholder="Toyota"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
            <input
              type="text"
              value={formData.carModel}
              onChange={(e) => handleInputChange('carModel', e.target.value)}
              placeholder="Camry"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <input
              type="number"
              value={formData.carYear}
              onChange={(e) => handleInputChange('carYear', parseInt(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="1990"
              max={new Date().getFullYear() + 1}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <input
              type="text"
              value={formData.carColor}
              onChange={(e) => handleInputChange('carColor', e.target.value)}
              placeholder="Silver"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">License Plate</label>
          <input
            type="text"
            value={formData.licensePlate}
            onChange={(e) => handleInputChange('licensePlate', e.target.value.toUpperCase())}
            placeholder="ABC 1234"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Ride Preferences</h2>

      <div className="space-y-4">
        {/* Music */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Music Allowed</span>
          </div>
          <button
            onClick={() => handleInputChange('music', !formData.music)}
            className={`w-12 h-6 rounded-full transition-colors ${
              formData.music ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                formData.music ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Conversation */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <MessageCircle className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Conversation Level</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['quiet', 'moderate', 'chatty'].map((level) => (
              <button
                key={level}
                onClick={() => handleInputChange('conversation', level)}
                className={`py-2 px-3 rounded-lg text-sm font-medium ${
                  formData.conversation === level
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <Wind className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Temperature</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['cool', 'moderate', 'warm'].map((temp) => (
              <button
                key={temp}
                onClick={() => handleInputChange('temperature', temp)}
                className={`py-2 px-3 rounded-lg text-sm font-medium ${
                  formData.temperature === temp
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300'
                }`}
              >
                {temp.charAt(0).toUpperCase() + temp.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Smoking */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Cigarette className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Smoking Allowed</span>
          </div>
          <button
            onClick={() => handleInputChange('smoking', !formData.smoking)}
            className={`w-12 h-6 rounded-full transition-colors ${
              formData.smoking ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                formData.smoking ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Pets */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-gray-600" />
            <span className="font-medium">Pets Allowed</span>
          </div>
          <button
            onClick={() => handleInputChange('pets', !formData.pets)}
            className={`w-12 h-6 rounded-full transition-colors ${
              formData.pets ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                formData.pets ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Safe Driving Reminder */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">🚗</span>
          <div className="flex-1">
            <h4 className="font-semibold text-orange-900 mb-1 text-sm">Drive Safely</h4>
            <p className="text-sm text-gray-700">
              Follow all traffic rules, maintain safe speeds, and ensure passenger safety at all times. Your safety and theirs is our priority.
            </p>
          </div>
        </div>
      </div>

      {/* Terms & Conditions Acceptance */}
      <div className="mt-6">
        <TermsCheckbox
          checked={policyAccepted}
          onChange={setPolicyAccepted}
          type="posting"
        />
      </div>
    </div>
  );

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
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold">Post a Ride</h1>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-mobile mx-auto">
            {renderStepIndicator()}

            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
          </div>
        </main>

        {/* Footer Buttons */}
        <div className="flex-none p-4 bg-white border-t border-gray-200">
          <div className="max-w-mobile mx-auto flex gap-3">
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium"
              >
                Back
              </button>
            )}
            {currentStep < 3 ? (
              <button
                onClick={handleNext}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!policyAccepted || isSubmitting}
                className={`flex-1 py-3 px-4 rounded-lg font-medium ${
                  policyAccepted && !isSubmitting
                    ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Posting...' : 'Post Ride'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostRidePage;
