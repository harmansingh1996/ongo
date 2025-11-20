import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PhoneCall, MapPin, AlertTriangle, Users, CheckCircle } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { createSOSEmergency, cancelSOSEmergency, getActiveSOSEmergency } from '../../services/issueService';
import { hapticFeedback, vibrate } from '../../utils/mobileFeatures';
import { startSOSTracking, LocationData } from '../../services/locationService';

const EMERGENCY_CONTACTS = [
  { id: '1', name: 'Emergency Services (911)', phone: '911', type: 'emergency' },
  { id: '2', name: 'OnGoPool Safety Team', phone: '+1-800-555-0199', type: 'support' },
  { id: '3', name: 'Local Police (Non-Emergency)', phone: '311', type: 'police' },
];

const EMERGENCY_TYPES = [
  'Medical Emergency',
  'Accident',
  'Safety Threat',
  'Vehicle Breakdown',
  'Lost/Stranded',
  'Other Emergency'
];

export default function SOSPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sosActivated, setSosActivated] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [activeEmergencyId, setActiveEmergencyId] = useState<string | null>(null);
  const [emergencyType, setEmergencyType] = useState('Safety Threat');
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null);
  const [realtimeLocation, setRealtimeLocation] = useState<LocationData | null>(null);
  const [sosTrackingCleanup, setSosTrackingCleanup] = useState<(() => void) | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }
      setUser(currentUser);

      // Check for active SOS emergency
      const activeEmergency = await getActiveSOSEmergency(currentUser.id);
      if (activeEmergency) {
        setActiveEmergencyId(activeEmergency.id);
        setSosActivated(true);
        setCountdown(0); // Already activated
      }

      setLoading(false);
    };
    loadData();

    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setCurrentLocation(position),
        (error) => console.error('Error getting location:', error)
      );
    }

    // Cleanup on unmount
    return () => {
      if (sosTrackingCleanup) {
        sosTrackingCleanup();
      }
    };
  }, [navigate, sosTrackingCleanup]);

  useEffect(() => {
    if (sosActivated && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
        vibrate(100); // Vibrate each second
      }, 1000);
      return () => clearTimeout(timer);
    } else if (sosActivated && countdown === 0 && !activeEmergencyId) {
      // Trigger emergency activation
      activateEmergency();
    }
  }, [sosActivated, countdown, activeEmergencyId]);

  const activateEmergency = async () => {
    try {
      const location = currentLocation ? {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
      } : undefined;

      const result = await createSOSEmergency(
        user.id,
        user.userType,
        emergencyType,
        location,
        `Emergency activated by ${user.userType}`,
        user.phone || undefined
      );

      if (result.success) {
        setActiveEmergencyId(result.emergencyId || null);
        hapticFeedback('success');
        vibrate([200, 100, 200]);
        
        // Start real-time location tracking for emergency
        const { stopTracking } = startSOSTracking((locationData) => {
          setRealtimeLocation(locationData);
          console.log('[SOS] Real-time location update:', locationData);
        }, 2000);
        
        setSosTrackingCleanup(() => stopTracking);
        
        // Simulate emergency services contact
        alert('🚨 Emergency Alert Sent!\n\nYour location has been shared with:\n• Emergency Services\n• OnGoPool Safety Team\n• Your emergency contacts\n\nReal-time location tracking is now active.\nHelp is on the way!');
      }
    } catch (error) {
      console.error('Error activating emergency:', error);
      alert('Failed to activate emergency. Please call 911 directly.');
    }
  };

  const handleSOSActivate = () => {
    if (window.confirm(`⚠️ EMERGENCY ACTIVATION\n\nThis will:\n• Contact emergency services (911)\n• Share your current location\n• Notify OnGoPool safety team\n• Alert your emergency contacts\n\nType: ${emergencyType}\n\nAre you sure you need emergency help?`)) {
      hapticFeedback('heavy');
      setSosActivated(true);
    }
  };

  const handleCancel = async () => {
    if (countdown > 0) {
      // Cancel countdown
      setSosActivated(false);
      setCountdown(5);
      hapticFeedback('light');
    } else if (activeEmergencyId) {
      // Cancel active emergency
      if (window.confirm('Are you sure you want to cancel the emergency alert?')) {
        const success = await cancelSOSEmergency(activeEmergencyId);
        if (success) {
          // Stop real-time location tracking
          if (sosTrackingCleanup) {
            sosTrackingCleanup();
            setSosTrackingCleanup(null);
          }
          
          setSosActivated(false);
          setActiveEmergencyId(null);
          setCountdown(5);
          setRealtimeLocation(null);
          hapticFeedback('success');
        }
      }
    }
  };

  const handleEmergencyCall = (phone: string) => {
    hapticFeedback('medium');
    window.location.href = `tel:${phone}`;
  };

  if (loading || !user) {
    return (
      <div className="w-full h-dvh flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

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
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              disabled={sosActivated && countdown > 0}
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">SOS Emergency</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {/* SOS Activation */}
            {sosActivated ? (
              <div className="bg-red-600 rounded-xl p-8 text-center shadow-lg">
                <AlertTriangle className="w-20 h-20 text-white mx-auto mb-4 animate-pulse" />
                <div className="text-white space-y-3">
                  {countdown > 0 ? (
                    <>
                      <div className="text-3xl font-bold">{countdown}</div>
                      <div className="text-xl font-semibold">Emergency Alert Activating...</div>
                      <div className="text-sm">
                        Emergency services will be contacted in {countdown} second{countdown !== 1 ? 's' : ''}
                      </div>
                      <button
                        onClick={handleCancel}
                        className="mt-4 px-6 py-3 bg-white text-red-600 font-semibold rounded-lg active:scale-95 transition-all"
                      >
                        CANCEL
                      </button>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-16 h-16 mx-auto mb-2" />
                      <div className="text-2xl font-bold">Emergency Alert Active</div>
                      <div className="text-sm">
                        Help has been contacted. Stay safe!
                      </div>
                      <button
                        onClick={handleCancel}
                        className="mt-4 px-6 py-3 bg-white text-red-600 font-semibold rounded-lg active:scale-95 transition-all"
                      >
                        Mark as Resolved
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Emergency Type Selection */}
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3">Emergency Type</h3>
                  <select
                    value={emergencyType}
                    onChange={(e) => setEmergencyType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    {EMERGENCY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* SOS Button */}
                <button
                  onClick={handleSOSActivate}
                  className="w-full bg-red-600 text-white rounded-xl p-8 shadow-lg active:scale-98 transition-all"
                >
                  <AlertTriangle className="w-16 h-16 mx-auto mb-3" />
                  <div className="text-2xl font-bold mb-2">ACTIVATE SOS</div>
                  <div className="text-sm">
                    Press to alert emergency services
                  </div>
                </button>

                {/* Warning */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <div className="font-semibold mb-1">Only use in real emergencies</div>
                      <div>False activation may result in fines and account suspension.</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Emergency Contacts */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-blue-600" />
                  Emergency Contacts
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {EMERGENCY_CONTACTS.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleEmergencyCall(contact.phone)}
                    className="w-full flex items-center justify-between px-4 py-4 active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        contact.type === 'emergency' ? 'bg-red-100' :
                        contact.type === 'support' ? 'bg-blue-100' :
                        'bg-gray-100'
                      }`}>
                        <PhoneCall className={`w-5 h-5 ${
                          contact.type === 'emergency' ? 'text-red-600' :
                          contact.type === 'support' ? 'text-blue-600' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{contact.name}</div>
                        <div className="text-sm text-gray-500">{contact.phone}</div>
                      </div>
                    </div>
                    <PhoneCall className="w-5 h-5 text-gray-400" />
                  </button>
                ))}
              </div>
            </div>

            {/* Real-time Location (when SOS is active) */}
            {sosActivated && realtimeLocation && (
              <div className="bg-green-50 border-2 border-green-500 rounded-xl p-4 shadow-sm animate-pulse">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      🔴 Live Location Tracking
                    </div>
                    <div className="text-sm text-gray-700">
                      Lat: {realtimeLocation.lat.toFixed(6)}<br />
                      Lng: {realtimeLocation.lng.toFixed(6)}
                      {realtimeLocation.accuracy && (
                        <><br />Accuracy: ±{Math.round(realtimeLocation.accuracy)}m</>
                      )}
                      {realtimeLocation.speed && realtimeLocation.speed > 0 && (
                        <><br />Speed: {realtimeLocation.speed.toFixed(1)} km/h</>
                      )}
                    </div>
                    <div className="text-xs text-green-700 mt-2 font-medium">
                      ✓ Location shared with emergency services in real-time
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Updated: {new Date(realtimeLocation.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Current Location (when SOS is not active) */}
            {!sosActivated && currentLocation && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-1">Current Location</div>
                    <div className="text-sm text-gray-600">
                      Lat: {currentLocation.coords.latitude.toFixed(6)}<br />
                      Lng: {currentLocation.coords.longitude.toFixed(6)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Location will be shared with emergency services
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
