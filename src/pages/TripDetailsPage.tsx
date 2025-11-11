import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  MessageCircle,
  DollarSign,
  Activity,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { calculateRealTimeETAs } from '../utils/distance';
import { DriverResponseService } from '../lib/driverResponseService';
import EditRideModal from '../components/EditRideModal';

interface RouteSegment {
  id: number;
  address: string;
  segment_order: number;
  is_pickup: boolean;
  lat?: number;
  lng?: number;
  estimated_arrival_time?: string;
}

const TripDetailsPage: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [ride, setRide] = useState<any | null>(null);
  const [etaStops, setEtaStops] = useState<
    Array<{ stopIndex: number; stopName: string; formattedETA: string; isCurrent: boolean }>
  >([]);
  const [etaLoading, setEtaLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [derivedStatus, setDerivedStatus] = useState<'upcoming' | 'active' | 'completed' | 'cancelled'>('upcoming');


  useEffect(() => {
    if (!rideId) {
      navigate('/trip');
      return;
    }

    fetchRide();
  }, [rideId]);

  useEffect(() => {
    if (ride) {
      computeETAs(ride).catch(() => {
        /* silent fallback handled inside compute */
      });
    }
  }, [ride]);

  const fetchRide = async () => {
    if (!rideId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          driver:users!rides_driver_id_fkey(id, display_name, photo_url, rating, car_model),
          ride_bookings!left(
            id, passenger_id, seats_booked, status, total_amount,
            from_segment_id, to_segment_id,
            passenger:users!ride_bookings_passenger_id_fkey(
              id, display_name, photo_url, rating
            )
          ),
          ride_segments!left(
            id, address, segment_order, is_pickup, lat, lng, estimated_arrival_time
          )
        `)
        .eq('id', rideId)
        .single();

      if (error) throw error;

      setRide(data);

      if (data) {
        const computedStatus = deriveDisplayStatus(data);
        setDerivedStatus(computedStatus);
      }
    } catch (error) {
      console.error('Error loading trip:', error);
      alert('Unable to load trip details. Please try again.');
      navigate('/trip');
    } finally {
      setLoading(false);
    }
  };

  const computeETAs = async (rideData: any) => {
    if (!rideData?.ride_segments) return;

    try {
      setEtaLoading(true);
      const segments: RouteSegment[] = [...rideData.ride_segments].sort(
        (a, b) => a.segment_order - b.segment_order
      );

      const stops = segments.map((segment) => ({
        name: extractCityName(segment.address),
        lat: segment.lat || rideData.from_lat || 0,
        lng: segment.lng || rideData.from_lng || 0
      }));

      const firstStop = {
        name: extractCityName(rideData.from_location),
        lat: rideData.from_lat || 0,
        lng: rideData.from_lng || 0
      };

      const lastStop = {
        name: extractCityName(rideData.to_location),
        lat: rideData.to_lat || 0,
        lng: rideData.to_lng || 0
      };

      if (!stops.find((stop) => stop.name === firstStop.name)) {
        stops.unshift(firstStop);
      }
      if (!stops.find((stop) => stop.name === lastStop.name)) {
        stops.push(lastStop);
      }

      const departure = parseDate(rideData.departure_time);
      const current = new Date();

      const etas = await calculateRealTimeETAs(current, stops, departure);

      setEtaStops(
        etas.map((eta, index) => ({
          stopIndex: index,
          stopName: eta.stopName,
          formattedETA: eta.formattedETA,
          isCurrent: eta.isCurrentlyActive
        }))
      );
    } catch (error) {
      console.warn('Falling back to static ETAs:', error);

      const segments: RouteSegment[] = [...(rideData?.ride_segments || [])].sort(
        (a, b) => a.segment_order - b.segment_order
      );

      const departure = parseDate(rideData.departure_time);
      const stopsWithFallback = segments.map((segment, index) => ({
        stopIndex: index + 1,
        stopName: extractCityName(segment.address),
        formattedETA: segment.estimated_arrival_time
          ? formatTime(segment.estimated_arrival_time)
          : formatTime(new Date(departure.getTime() + (index + 1) * 30 * 60 * 1000).toISOString()),
        isCurrent: false
      }));

      setEtaStops([
        {
          stopIndex: 0,
          stopName: extractCityName(rideData.from_location),
          formattedETA: formatTime(rideData.departure_time),
          isCurrent: false
        },
        ...stopsWithFallback,
        {
          stopIndex: segments.length + 1,
          stopName: extractCityName(rideData.to_location),
          formattedETA: rideData.arrival_time
            ? formatTime(rideData.arrival_time)
            : formatTime(new Date(departure.getTime() + 60 * 60 * 1000).toISOString()),
          isCurrent: false
        }
      ]);
    } finally {
      setEtaLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!ride || !user) return;

    const confirmed = window.confirm('Cancel this ride and notify passengers?');
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc('cancel_ride', {
        p_ride_id: ride.id,
        p_driver_id: user.id,
        p_reason: 'Cancelled from Trip details page'
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.message || 'Failed to cancel ride');
      }

      await supabase.rpc('cleanup_segment_seats_for_ride', { p_ride_id: ride.id });
      await DriverResponseService.trackDriverCancellation(user.id, ride.id);
      alert('Ride cancelled successfully and passengers have been notified.');
      navigate('/trip');
    } catch (error) {
      console.error('Cancel ride error:', error);
      alert(error instanceof Error ? error.message : 'Failed to cancel ride.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading trip details...</p>
        </div>
      </div>
    );
  }

  if (!ride) {
    return null;
  }

  const departureDate = formatDate(ride.departure_time);
  const departureTime = formatTime(ride.departure_time);
  const isRideCompleted = ride.status === 'completed';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-8 pb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/trip')}
              className="p-2 hover:bg-white/20 rounded-full transition-colors mr-3"
              aria-label="Back to trips"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Trip Details</h1>
              <p className="text-blue-100 text-sm">Monitor your ride, passengers, and live ETAs</p>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 py-6 space-y-6">
        {/* Trip hero */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-blue-600 font-semibold">
                <Calendar size={16} />
                <span>{departureDate}</span>
                <Clock size={16} className="text-blue-100" />
                <span>{departureTime}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin size={16} className="text-blue-500" />
                <span className="font-semibold text-gray-800 uppercase tracking-wide">
                  {extractCityName(ride.from_location)}
                </span>
                <span className="text-gray-400">➜</span>
                <MapPin size={16} className="text-purple-500" />
                <span className="font-semibold text-gray-800 uppercase tracking-wide">
                  {extractCityName(ride.to_location)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Users size={14} />
                  <span>{ride.available_seats} seats</span>
                </div>
                <div className="flex items-center gap-1 text-green-600 font-semibold">
                  <DollarSign size={14} />
                  <span>${ride.price_per_seat} / seat</span>
                </div>
                {derivedStatus === 'active' && (
                  <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full text-xs font-semibold">
                    <Activity size={14} /> Active
                  </span>
                )}
                {derivedStatus === 'completed' && (
                  <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full text-xs font-semibold">
                    Completed
                  </span>
                )}
                {ride.status === 'cancelled' && (
                  <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full text-xs font-semibold">
                    Cancelled
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {ride.status !== 'completed' && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex-1 min-w-[160px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
                >
                  Edit full trip
                </button>
              )}
              <button
                onClick={() => navigate('/trip')}
                className="flex-1 min-w-[120px] px-4 py-2 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                Back to trips
              </button>
            </div>
          </div>
        </div>
        {/* Time management */}

        {/* Live ETA section */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-blue-100">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Route overview</h2>
          </div>

          <div className="space-y-3">
            {etaStops.map((stop, index) => (
              <div key={`${stop.stopIndex}-${stop.stopName}`}>
                {index > 0 && <div className="border-l-2 border-dashed border-blue-200 ml-2 h-4"></div>}
                <div
                  className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                    stop.isCurrent ? 'bg-blue-50 border border-blue-200 shadow-sm' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        index === 0
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : index === etaStops.length - 1
                          ? 'bg-gradient-to-r from-red-500 to-pink-500'
                          : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      }`}
                    ></div>
                    <span className={`font-medium ${stop.isCurrent ? 'text-blue-900' : 'text-gray-900'}`}>
                      {index === 0 ? '🚗 ' : index === etaStops.length - 1 ? '🏁 ' : '📍 '}
                      {stop.stopName}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold ${stop.isCurrent ? 'text-blue-700' : 'text-gray-600'}`}>
                    {stop.formattedETA}
                  </span>
                </div>
              </div>
            ))}
            {etaStops.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-6">
                ETA information unavailable for this trip.
              </div>
            )}
          </div>
        </div>
        {/* Passenger bookings */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">Passenger bookings</h2>
          </div>

          {ride.ride_bookings && ride.ride_bookings.length > 0 ? (
            <div className="space-y-3">
              {ride.ride_bookings.map((booking: any) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {booking.passenger?.display_name?.[0]?.toUpperCase() || 'P'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {booking.passenger?.display_name || 'Passenger'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {booking.seats_booked} seat{booking.seats_booked > 1 ? 's' : ''} • ${booking.total_amount}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        booking.status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : booking.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {booking.status?.toUpperCase()?.replace('_', ' ') || 'PENDING'}
                    </span>
                    <button
                      onClick={() =>
                        navigate('/chat', {
                          state: { bookingId: booking.id }
                        })
                      }
                      className="p-2 hover:bg-white rounded-full transition-colors"
                    >
                      <MessageCircle size={18} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-6">
              No passengers have booked this trip yet.
            </div>
          )}
        </div>
        {/* Danger zone */}
        {derivedStatus !== 'completed' && ride.status !== 'cancelled' && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-100">
            <div className="flex items-center gap-3 mb-4">
              <X size={20} className="text-red-500" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Cancel trip</h2>
                <p className="text-sm text-gray-600">
                  Cancelling will notify all passengers and remove the trip from search results.
                </p>
              </div>
            </div>
            <button
              onClick={handleCancelRide}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold hover:from-red-600 hover:to-pink-600 transition-colors"
            >
              Cancel trip
            </button>
          </div>
        )}
      </div>
      {ride && editOpen && (
        <EditRideModal
          ride={ride}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          onRideUpdated={async () => {
            await fetchRide();
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
};

function extractCityName(address: string) {
  if (!address) return address;
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return address;
  }

  let cityName = parts[0];

  if (/region of/i.test(cityName) && parts.length > 1) {
    cityName = parts[1];
  }

  cityName = cityName
    .replace(/^(City|Town|Village|Municipality) of\s+/i, '')
    .replace(/^(Regional Municipality|County) of\s+/i, '')
    .replace(/,.*$/, '')
    .trim();

  return cityName || address;
}

function deriveDisplayStatus(ride: any): 'upcoming' | 'active' | 'completed' | 'cancelled' {
  if (ride.status === 'cancelled') {
    return 'cancelled';
  }

  const departureTime = parseDate(ride.departure_time)?.getTime();
  if (!departureTime) {
    return 'completed';
  }

  const arrivalTime = ride.arrival_time ? parseDate(ride.arrival_time)?.getTime() : null;
  const completionTime = arrivalTime ?? departureTime + 2 * 60 * 60 * 1000;

  const now = Date.now();
  const startGraceMs = 5 * 60 * 1000;
  const completionBufferMs = 5 * 60 * 1000;

  const hasStarted = now >= departureTime - startGraceMs;
  const stillOngoing = now <= completionTime + completionBufferMs;

  if (!hasStarted) {
    return 'upcoming';
  }

  if (stillOngoing) {
    return 'active';
  }

  return 'completed';
}

function parseDate(dateString: string): Date {
  if (!dateString) return new Date();

  const trimmed = dateString.split(/[Z+]/)[0].replace('T', ' ');
  const localParsed = new Date(trimmed);
  if (!Number.isNaN(localParsed.getTime())) {
    return localParsed;
  }

  const fallback = new Date(dateString);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  return new Date();
}

function formatDate(dateString: string) {
  const date = parseDate(dateString);
  return date.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(dateString: string) {
  const date = parseDate(dateString);
  return date.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export default TripDetailsPage;
