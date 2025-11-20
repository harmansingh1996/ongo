import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserType } from '../types';
import { supabase } from '../services/supabaseClient';
import ProfileUploader from '../components/ProfileUploader';
import { ArrowLeft, Gift } from 'lucide-react';
import { applyReferralCode } from '../services/referralService';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    profilePicture: '',
    userType: 'rider' as UserType,
    referralCode: '', // Add referral code field
    
    // Driver specific
    licenseNumber: '',
    licenseExpiry: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    vehiclePlate: '',
  });

  const [referralApplied, setReferralApplied] = useState(false);
  const [referralMessage, setReferralMessage] = useState('');

  const [step, setStep] = useState(1); // For multi-step signup
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Sign in with timeout protection
      const authPromise = supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout')), 15000)
      );

      const { data, error } = await Promise.race([authPromise, timeoutPromise]) as any;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Fetch user profile with timeout and retry
        let profile = null;
        let profileError = null;
        
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const profilePromise = supabase
              .from('profiles')
              .select('user_type')
              .eq('id', data.user.id)
              .single();

            const profileTimeout = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Profile fetch timeout')), 10000)
            );

            const result = await Promise.race([profilePromise, profileTimeout]) as any;
            profile = result.data;
            profileError = result.error;
            
            if (profile) break; // Success, exit retry loop
            
            // Wait before retry
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (err) {
            profileError = err;
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Navigate even if profile fetch failed (home page will handle it)
        if (profile?.user_type === 'driver') {
          navigate('/driver/home');
        } else if (profile?.user_type === 'rider') {
          navigate('/rider/home');
        } else {
          // Fallback: navigate based on last known preference or default to rider
          console.warn('Profile fetch failed, using fallback navigation');
          navigate('/rider/home');
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message === 'Authentication timeout') {
        setError('Sign in is taking too long. Please check your internet connection and try again.');
      } else {
        setError(err.message || 'An error occurred during login');
      }
      setLoading(false);
    }
  };

  const handleSignupStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setStep(2);
  };

  const handleSignupStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.userType === 'driver') {
      setStep(3);
    } else {
      completeSignup();
    }
  };

  const handleSignupStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    completeSignup();
  };

  const completeSignup = async () => {
    setError('');

    try {
      // Create auth user with email confirmation disabled for development
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            name: formData.name,
            user_type: formData.userType,
          }
        }
      });

      if (authError) {
        // Provide more user-friendly error messages
        if (authError.message.includes('Invalid API')) {
          setError('Unable to connect to authentication service. Please check your internet connection and try again.');
        } else if (authError.message.includes('already registered')) {
          setError('This email is already registered. Please login instead.');
        } else {
          setError(authError.message);
        }
        setStep(1);
        return;
      }

      if (!authData.user) {
        setError('Failed to create user account. Please try again.');
        setStep(1);
        return;
      }

      // Check if email confirmation is required
      if (authData.user && !authData.session) {
        setError('Please check your email to confirm your account before logging in.');
        setStep(1);
        return;
      }

      // Create user profile with address data
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        email: formData.email,
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zipcode: formData.zipCode || null,
        user_type: formData.userType,
        profile_image: formData.profilePicture || null,
        bio: null,
        rating: 5.0,
        total_trips: 0,
        verified: false,
      });

      if (profileError) {
        setError('Failed to create user profile: ' + profileError.message);
        setStep(1);
        return;
      }

      // Create user preferences
      const { error: preferencesError } = await supabase.from('user_preferences').insert({
        user_id: authData.user.id,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zipCode,
        date_of_birth: formData.dateOfBirth || null,
      });

      if (preferencesError) {
        console.error('Failed to create user preferences:', preferencesError);
      }

      // If driver, create car details
      if (formData.userType === 'driver') {
        const { error: carError } = await supabase.from('car_details').insert({
          user_id: authData.user.id,
          make: formData.vehicleMake,
          model: formData.vehicleModel,
          year: parseInt(formData.vehicleYear),
          color: formData.vehicleColor,
          license_plate: formData.vehiclePlate,
          seats: 4, // Default
        });

        if (carError) {
          console.error('Failed to create car details:', carError);
        }
      }

      // Apply referral code if provided
      if (formData.referralCode.trim()) {
        const referralSuccess = await applyReferralCode(
          formData.referralCode.trim().toUpperCase(),
          authData.user.id
        );
        
        if (referralSuccess) {
          console.log('✅ Referral code applied successfully - 10% discount on first ride!');
          setReferralApplied(true);
          setReferralMessage('Referral code applied! You\'ll get 10% off your first ride.');
        } else {
          console.warn('⚠️ Referral code invalid or already used');
          setReferralMessage('Referral code could not be applied.');
        }
      }

      // Navigate to appropriate page
      if (formData.userType === 'driver') {
        navigate('/driver/home');
      } else {
        navigate('/rider/home');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup');
      setStep(1);
    }
  };

  return (
    <div className="w-full h-dvh bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex-none px-4 py-4">
          {mode === 'signup' && step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center space-x-2 text-blue-600 font-medium active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          <div className="max-w-md mx-auto py-6">
            {/* Login Form */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="text-center space-y-2 mb-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
                    <span className="text-3xl font-bold text-white">OG</span>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">Welcome to OnGoPool</h1>
                  <p className="text-gray-600">Share rides, save money</p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md min-h-touch disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Don't have an account? Sign Up
                  </button>
                </div>
              </form>
            )}

            {/* Signup Step 1: Basic Info */}
            {mode === 'signup' && step === 1 && (
              <form onSubmit={handleSignupStep1} className="space-y-4">
                <div className="text-center space-y-2 mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
                  <p className="text-gray-600">Step 1: Basic Information</p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <ProfileUploader
                  onImageSelect={(imageData) => setFormData({ ...formData, profilePicture: imageData })}
                  currentImage={formData.profilePicture}
                />

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="+1-555-0123"
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Referral Code Input */}
                  <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Gift className="w-5 h-5 text-blue-600" />
                      <label className="text-sm font-medium text-blue-900">
                        Have a Referral Code? (Optional)
                      </label>
                    </div>
                    <input
                      type="text"
                      name="referralCode"
                      value={formData.referralCode}
                      onChange={handleInputChange}
                      placeholder="Enter code for 10% off first ride"
                      className="w-full px-4 py-2 rounded-lg border-2 border-blue-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                      maxLength={12}
                    />
                    <p className="text-xs text-blue-700 mt-1">
                      🎁 Get 10% discount on your first ride with a referral code!
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md min-h-touch"
                >
                  Continue
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Already have an account? Sign In
                  </button>
                </div>
              </form>
            )}

            {/* Signup Step 2: Address & User Type */}
            {mode === 'signup' && step === 2 && (
              <form onSubmit={handleSignupStep2} className="space-y-4">
                <div className="text-center space-y-2 mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Address & Type</h1>
                  <p className="text-gray-600">Step 2: Where do you live?</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="ON"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Zip/Postal Code</label>
                      <input
                        type="text"
                        name="zipCode"
                        value={formData.zipCode}
                        onChange={handleInputChange}
                        placeholder="M5H 2N2"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">I want to:</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, userType: 'rider' })}
                        className={`p-4 rounded-lg border-2 text-center transition-all min-h-touch ${
                          formData.userType === 'rider'
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        <div className="font-semibold text-gray-900">Rider</div>
                        <div className="text-sm text-gray-600">Find rides</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, userType: 'driver' })}
                        className={`p-4 rounded-lg border-2 text-center transition-all min-h-touch ${
                          formData.userType === 'driver'
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        <div className="font-semibold text-gray-900">Driver</div>
                        <div className="text-sm text-gray-600">Offer rides</div>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md min-h-touch"
                >
                  {formData.userType === 'driver' ? 'Continue' : 'Complete Registration'}
                </button>
              </form>
            )}

            {/* Signup Step 3: Driver Information */}
            {mode === 'signup' && step === 3 && formData.userType === 'driver' && (
              <form onSubmit={handleSignupStep3} className="space-y-4">
                <div className="text-center space-y-2 mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">Driver Details</h1>
                  <p className="text-gray-600">Step 3: License & Vehicle</p>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">License Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                    <input
                      type="text"
                      name="licenseNumber"
                      value={formData.licenseNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                    <input
                      type="date"
                      name="licenseExpiry"
                      value={formData.licenseExpiry}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900">Vehicle Information</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Make</label>
                      <input
                        type="text"
                        name="vehicleMake"
                        value={formData.vehicleMake}
                        onChange={handleInputChange}
                        placeholder="Toyota"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                      <input
                        type="text"
                        name="vehicleModel"
                        value={formData.vehicleModel}
                        onChange={handleInputChange}
                        placeholder="Camry"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                      <input
                        type="number"
                        name="vehicleYear"
                        value={formData.vehicleYear}
                        onChange={handleInputChange}
                        placeholder="2020"
                        min="2000"
                        max="2025"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                      <input
                        type="text"
                        name="vehicleColor"
                        value={formData.vehicleColor}
                        onChange={handleInputChange}
                        placeholder="Silver"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">License Plate</label>
                    <input
                      type="text"
                      name="vehiclePlate"
                      value={formData.vehiclePlate}
                      onChange={handleInputChange}
                      placeholder="ABC 123"
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md min-h-touch"
                >
                  Complete Registration
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
