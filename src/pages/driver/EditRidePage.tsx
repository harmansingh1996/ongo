import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Calendar, Clock, MapPin, DollarSign, Users, Save, Loader } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getRideById } from '../../services/rideService';
import { getDriverBookingRequests } from '../../services/bookingService';
import { hapticFeedback } from '../../utils/mobileFeatures';
import { formatTime } from '../../utils/timeUtils';
import { supabase } from '../../services/supabaseClient';

export default function EditRidePage() {
  const navigate = useNavigate();
  const { rideId } = useParams();
  const [user, setUser] = useState<any>(null);
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasActiveBookings, setHasActiveBookings] = useState(false);
  const [activeBookingsCount, setActiveBookingsCount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    availableSeats: 1,
    pricePerSeat: '',
  });

  // Time picker state (for AM/PM format)
  const [timePickerState, setTimePickerState] = useState({
    hour: '12',
    minute: '00',
    period: 'AM' as 'AM' | 'PM'
  });

  useEffect(() => {
    loadData();
  }, [rideId]);

  const loadData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.userType !== 'driver') {
        navigate('/auth');
        return;
      }
      setUser(currentUser);

      if (!rideId) {
        navigate('/driver/trips');
        return;
      }

      // Load ride details
      const rideData = await getRideById(rideId);
      if (!rideData) {
        alert('Ride not found');
        navigate('/driver/trips');
        return;
      }

      // Verify this is the driver's ride
      if (rideData.driver_id !== currentUser.id) {
        alert('You can only edit your own rides');
        navigate('/driver/trips');
        return;
      }

      setRide(rideData);

      // Populate form with existing data
      setFormData({
        date: rideData.date || '',
        time: rideData.time || '',
        availableSeats: rideData.available_seats || 1,
        pricePerSeat: rideData.price_per_seat?.toString() || '',
      });

      // Parse existing time to AM/PM format
      if (rideData.time) {
        const [hours, minutes] = rideData.time.split(':');
        const hour24 = parseInt(hours);
        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        const period = hour24 >= 12 ? 'PM' : 'AM';
        setTimePickerState({
          hour: hour12.toString().padStart(2, '0'),
          minute: minutes,
          period: period
        });
      }

      // Check for active bookings
      const allBookings = await getDriverBookingRequests(currentUser.id);
      const rideBookings = allBookings.filter((b: any) => b.ride_id === rideId);
      const activeBookings = rideBookings.filter(
        (b: any) => b.status === 'pending' || b.status === 'accepted'
      );

      if (activeBookings.length > 0) {
        setHasActiveBookings(true);
        setActiveBookingsCount(activeBookings.length);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load ride details');
      navigate('/driver/trips');
    } finally {
      setLoading(false);
    }
  };

  // Convert AM/PM time to 24-hour format
  const convertTo24Hour = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
    let hour24 = parseInt(hour);
    if (period === 'AM') {
      if (hour24 === 12) hour24 = 0;
    } else {
      if (hour24 !== 12) hour24 += 12;
    }
    return `${hour24.toString().padStart(2, '0')}:${minute}:00`;
  };

  // Add time in HH:MM:SS format without timezone conversion
  const addTimeOffset = (timeStr: string, offsetMs: number): string => {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    const totalSeconds = hours * 3600 + minutes * 60 + (seconds || 0);
    const offsetSeconds = Math.floor(offsetMs / 1000);
    let newTotalSeconds = totalSeconds + offsetSeconds;
    
    // Handle day wrap (keep within 0-86400 seconds)
    if (newTotalSeconds < 0) newTotalSeconds += 86400;
    if (newTotalSeconds >= 86400) newTotalSeconds -= 86400;
    
    const newHours = Math.floor(newTotalSeconds / 3600);
    const newMinutes = Math.floor((newTotalSeconds % 3600) / 60);
    const newSeconds = newTotalSeconds % 60;
    
    return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasActiveBookings) {
      alert('Cannot edit ride with active bookings');
      return;
    }

    hapticFeedback('medium');
    setSaving(true);

    try {
      // Convert AM/PM time to 24-hour format
      const time24 = convertTo24Hour(timePickerState.hour, timePickerState.minute, timePickerState.period);
      
      // Check for time conflicts with other rides by this driver
      const { data: conflictingRides, error: conflictError } = await supabase
        .from('rides')
        .select('id, time, estimated_arrival, from_location, to_location')
        .eq('driver_id', user.id)
        .eq('date', formData.date)
        .eq('status', 'scheduled')
        .neq('id', rideId);
      
      if (conflictError) throw conflictError;
      
      // Check if the new time conflicts with any existing ride
      if (conflictingRides && conflictingRides.length > 0) {
        // Calculate new estimated arrival for this ride
        const [newH, newM, newS] = time24.split(':').map(Number);
        const newStartMinutes = newH * 60 + newM;
        const newEndMinutes = newStartMinutes + (ride.duration || 0);
        
        for (const otherRide of conflictingRides) {
          const [otherH, otherM] = otherRide.time.split(':').map(Number);
          const otherStartMinutes = otherH * 60 + otherM;
          
          let otherEndMinutes = otherStartMinutes;
          if (otherRide.estimated_arrival) {
            const [arrH, arrM] = otherRide.estimated_arrival.split(':').map(Number);
            otherEndMinutes = arrH * 60 + arrM;
          }
          
          // Check for overlap: (start1 < end2) AND (start2 < end1)
          const hasOverlap = (newStartMinutes < otherEndMinutes) && (otherStartMinutes < newEndMinutes);
          
          if (hasOverlap) {
            alert(
              `Time conflict detected!\n\n` +
              `Your new ride time (${timePickerState.hour}:${timePickerState.minute} ${timePickerState.period}) ` +
              `conflicts with another ride:\n` +
              `${otherRide.from_location.address} → ${otherRide.to_location.address}\n` +
              `at ${otherRide.time}\n\n` +
              `Please choose a different time.`
            );
            setSaving(false);
            return;
          }
        }
      }
      
      // Calculate new estimated arrival if time changed
      let newEstimatedArrival = ride.estimated_arrival;
      
      if (time24 !== ride.time && ride.duration) {
        // Calculate time difference in seconds
        const [oldH, oldM, oldS] = ride.time.split(':').map(Number);
        const [newH, newM, newS] = time24.split(':').map(Number);
        const oldSeconds = oldH * 3600 + oldM * 60 + (oldS || 0);
        const newSeconds = newH * 3600 + newM * 60 + (newS || 0);
        const timeDiffMs = (newSeconds - oldSeconds) * 1000;
        
        // Apply time difference to estimated arrival
        if (ride.estimated_arrival) {
          newEstimatedArrival = addTimeOffset(ride.estimated_arrival, timeDiffMs);
        }
      }

      // Update rides table
      const { error } = await supabase
        .from('rides')
        .update({
          date: formData.date,
          time: time24,
          available_seats: formData.availableSeats,
          estimated_arrival: newEstimatedArrival,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (error) throw error;

      // Update route stops estimated arrival times if time changed
      if (time24 !== ride.time) {
        const [oldH, oldM, oldS] = ride.time.split(':').map(Number);
        const [newH, newM, newS] = time24.split(':').map(Number);
        const oldSeconds = oldH * 3600 + oldM * 60 + (oldS || 0);
        const newSeconds = newH * 3600 + newM * 60 + (newS || 0);
        const timeDiffMs = (newSeconds - oldSeconds) * 1000;

        // Get all route stops for this ride
        const { data: stops, error: stopsError } = await supabase
          .from('route_stops')
          .select('*')
          .eq('ride_id', rideId);

        if (!stopsError && stops && stops.length > 0) {
          // Update each stop's estimated arrival
          const stopUpdates = stops.map(async (stop: any) => {
            if (stop.estimated_arrival) {
              const newStopArrival = addTimeOffset(stop.estimated_arrival, timeDiffMs);

              return supabase
                .from('route_stops')
                .update({ estimated_arrival: newStopArrival })
                .eq('id', stop.id);
            }
          });

          await Promise.all(stopUpdates.filter(Boolean));
        }
      }

      hapticFeedback('success');
      alert('Ride updated successfully with new ETA times!');
      navigate('/driver/trips');
    } catch (error) {
      console.error('Error updating ride:', error);
      alert('Failed to update ride');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600">Loading ride details...</p>
        </div>
      </div>
    );
  }

  if (!ride) {
    return null;
  }

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold">Edit Ride</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {/* Active Bookings Warning */}
            {hasActiveBookings && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-orange-600 flex-none mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-orange-900 mb-1">
                      Cannot Edit This Ride
                    </h3>
                    <p className="text-sm text-orange-700 mb-3">
                      You have {activeBookingsCount} active booking{activeBookingsCount > 1 ? 's' : ''}{' '}
                      (pending or accepted) for this ride. Please cancel or complete these bookings
                      before editing the ride.
                    </p>
                    <button
                      onClick={() => navigate(`/driver/ride-detail/${rideId}`)}
                      className="text-sm font-medium text-orange-700 underline"
                    >
                      View Booking Requests
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Route Info (Read-only) */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-600" />
                Route (Cannot be changed)
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5 flex-none"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">From</p>
                    <p className="font-medium text-gray-900">
                      {ride.from_location?.address || 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full mt-1.5 flex-none"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">To</p>
                    <p className="font-medium text-gray-900">
                      {ride.to_location?.address || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date */}
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <label className="block">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Date</span>
                  </div>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    disabled={hasActiveBookings}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </label>
              </div>

              {/* Time - AM/PM Picker */}
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Time</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {/* Hour */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Hour</label>
                    <select
                      value={timePickerState.hour}
                      onChange={(e) => setTimePickerState({ ...timePickerState, hour: e.target.value })}
                      disabled={hasActiveBookings}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-center font-medium"
                      required
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => (
                        <option key={hour} value={hour.toString().padStart(2, '0')}>
                          {hour.toString().padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Minute */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Minute</label>
                    <select
                      value={timePickerState.minute}
                      onChange={(e) => setTimePickerState({ ...timePickerState, minute: e.target.value })}
                      disabled={hasActiveBookings}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-center font-medium"
                      required
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map(minute => (
                        <option key={minute} value={minute.toString().padStart(2, '0')}>
                          {minute.toString().padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* AM/PM */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Period</label>
                    <select
                      value={timePickerState.period}
                      onChange={(e) => setTimePickerState({ ...timePickerState, period: e.target.value as 'AM' | 'PM' })}
                      disabled={hasActiveBookings}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-center font-medium"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Available Seats */}
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <label className="block">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Available Seats</span>
                  </div>
                  <input
                    type="number"
                    value={formData.availableSeats}
                    onChange={(e) =>
                      setFormData({ ...formData, availableSeats: parseInt(e.target.value) || 1 })
                    }
                    disabled={hasActiveBookings}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                    min="1"
                    max="8"
                  />
                </label>
              </div>

              {/* Price Per Seat - Read Only */}
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Price Per Seat ($)</span>
                  <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Cannot be changed</span>
                </div>
                <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold text-lg">
                  ${parseFloat(formData.pricePerSeat || '0').toFixed(2)}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={hasActiveBookings || saving}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all min-h-touch shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
