import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Users,
  MessageCircle,
  DollarSign,
  Activity,
  CheckCircle,
  Plus,
  ChevronRight,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Ride } from '../types';

type TripStatus = 'upcoming' | 'active' | 'completed';
type DisplayRide = Ride & { displayStatus: TripStatus };

const TripPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TripStatus>('upcoming');
  const [rides, setRides] = useState<Record<TripStatus, DisplayRide[]>>({
    upcoming: [],
    active: [],
    completed: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDriverRides();
    }
  }, [user]);

  const fetchDriverRides = async () => {
    if (!user) return;

    try {
      await supabase.rpc('update_past_ride_statuses');

      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          ride_bookings!left(
            id, passenger_id, seats_booked, status, total_amount,
            from_segment_id, to_segment_id
          ),
          ride_segments!left(
            id, address, segment_order, is_pickup, estimated_arrival_time, lat, lng
          )
        `)
        .eq('driver_id', user.id)
        .order('departure_time', { ascending: false })
        .is('archived_at', null);

      if (error) throw error;

      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const startGraceMs = 5 * 60 * 1000;
      const completionBufferMs = 5 * 60 * 1000;

      const categorizedRides: Record<TripStatus, DisplayRide[]> = {
        upcoming: [],
        active: [],
        completed: []
      };

      data?.forEach((ride) => {
        if (!ride.departure_time) {
          console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping`);
          return;
        }

        const departureTime = parseLocalDate(ride.departure_time);
        if (!departureTime) {
          console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping`);
          return;
        }

        let arrivalTime: Date | null = null;
        if (ride.arrival_time) {
          arrivalTime = parseLocalDate(ride.arrival_time);
          if (!arrivalTime) {
            console.warn(`Ride ${ride.id} has invalid arrival_time: ${ride.arrival_time}, using null`);
            arrivalTime = null;
          }
        }

        const completionTime = arrivalTime || new Date(departureTime.getTime() + 2 * 60 * 60 * 1000);
        const archivedAt = ride.archived_at ? parseLocalDate(ride.archived_at) : null;
        const hasStarted = now.getTime() >= departureTime.getTime() - startGraceMs;
        const stillOngoing = now.getTime() <= completionTime.getTime() + completionBufferMs;

        if (ride.status === 'cancelled') {
          return;
        }

        if (!hasStarted) {
          categorizedRides.upcoming.push({ ...ride, displayStatus: 'upcoming' });
          return;
        }

        if (stillOngoing) {
          categorizedRides.active.push({ ...ride, displayStatus: 'active' });
          return;
        }

        if (archivedAt && archivedAt.getTime() <= sixHoursAgo.getTime()) {
          return;
        }

        if (completionTime.getTime() > sixHoursAgo.getTime()) {
          categorizedRides.completed.push({ ...ride, displayStatus: 'completed' });
        }
      });

      setRides(categorizedRides);
    } catch (error) {
      console.error('Error fetching driver rides:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractCityName = (address: string) => {
    if (!address) return address;

    const parts = address.split(',').map(part => part.trim()).filter(Boolean);
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
  };

  const getStatusColor = (status: TripStatus) => {
    switch (status) {
      case 'upcoming':
        return 'from-blue-500 to-purple-500';
      case 'active':
        return 'from-green-500 to-emerald-500';
      case 'completed':
        return 'from-slate-500 to-slate-600';
    }
  };

  const getStatusIcon = (status: TripStatus) => {
    switch (status) {
      case 'upcoming':
        return <Clock size={20} className="text-white" />;
      case 'active':
        return <Activity size={20} className="text-white" />;
      case 'completed':
        return <CheckCircle size={20} className="text-white" />;
    }
  };

  const tabs: { key: TripStatus; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' }
  ];

  const parseLocalDate = (timestamp?: string | null) => {
    if (!timestamp) return null;
    const trimmed = timestamp.split(/[Z+]/)[0];
    const normalized = trimmed.replace('T', ' ');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  };

  const formatTripTime = (timestamp?: string | null) => {
    const parsed = parseLocalDate(timestamp);
    if (!parsed) return '--';
    return parsed.toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatTripDateLabel = (timestamp?: string | null) => {
    const parsed = parseLocalDate(timestamp);
    if (!parsed) return { dateKey: '', label: '' };
    const dateKey = parsed.toISOString().split('T')[0];
    const label = parsed.toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    return { dateKey, label };
  };

  const groupedRides = useMemo(() => {
    const result: Record<TripStatus, { dateKey: string; label: string; rides: DisplayRide[] }[]> = {
      upcoming: [],
      active: [],
      completed: []
    };

    (['upcoming', 'active', 'completed'] as TripStatus[]).forEach((status) => {
      const map = new Map<string, { label: string; rides: DisplayRide[] }>();

      rides[status].forEach((ride) => {
        const parsed = parseLocalDate(ride.departure_time);
        if (!parsed) return;

        const localDateKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        const label = parsed.toLocaleDateString('en-CA', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });

        if (!map.has(localDateKey)) {
          map.set(localDateKey, { label, rides: [] });
        }

        map.get(localDateKey)!.rides.push(ride);
      });

      const sorted = Array.from(map.entries())
        .sort((a, b) => (status === 'completed' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
        .map(([dateKey, payload]) => ({
          dateKey,
          label: payload.label,
          rides: payload.rides.sort((a, b) => a.departure_time.localeCompare(b.departure_time))
        }));

      result[status] = sorted;
    });

    return result;
  }, [rides]);

  const totalRides = Object.values(rides).flat().length;
  const upcomingRides = rides.upcoming.length;
  const activeRides = rides.active.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your trips...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white overflow-hidden">
        <div className="px-4 pt-8 pb-12">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">My Trips</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">



          </div>
        </div>

        <div className="px-4">
          <div className="flex space-x-1 bg-white/10 backdrop-blur-sm rounded-2xl p-1 overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 py-3 px-2 sm:px-4 rounded-xl font-semibold transition-all duration-200 min-w-0 ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="flex-shrink-0">{getStatusIcon(tab.key)}</span>
                <span className="truncate text-sm sm:text-base">{tab.label}</span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                  activeTab === tab.key
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-white/20 text-white'
                }`}>
                  {rides[tab.key].length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-6">
        {groupedRides[activeTab].length === 0 ? (
          <div className="text-center py-16">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r ${getStatusColor(activeTab)} mb-6`}>
              {getStatusIcon(activeTab)}
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              {activeTab === 'upcoming' && 'No upcoming trips'}
              {activeTab === 'active' && 'No active trips'}
              {activeTab === 'completed' && 'No completed trips'}
            </h3>
            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              {activeTab === 'upcoming' && 'You have no upcoming rides scheduled. Create a new ride to start earning!'}
              {activeTab === 'active' && "You have no rides currently in progress. Upcoming rides will move here once they begin."}
              {activeTab === 'completed' && 'No completed rides to show yet. Your trip history will appear here.'}
            </p>
            {activeTab === 'upcoming' && (
              <button
                onClick={() => navigate('/post')}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center space-x-2 mx-auto text-sm sm:text-base"
              >
                <Plus size={18} className="sm:w-5 sm:h-5" />
                <span>Create New Ride</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedRides[activeTab].map((group) => (
              <section key={group.dateKey} className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-blue-200 via-purple-200 to-transparent" />
                  <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-sm font-semibold text-blue-800">
                    {group.label}
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-200 to-blue-200" />
                </div>

                <div className="space-y-4">
                  {group.rides.map((ride) => (
                    <article
                      key={ride.id}
                      onClick={() => navigate(`/trip/${ride.id}`)}
                      className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 transform hover:-translate-y-1 overflow-hidden cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${getStatusColor(ride.displayStatus)}`}>
                            {ride.displayStatus.toUpperCase()}
                          </span>
                          <span className="px-3 py-1 rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                            {formatTripTime(ride.departure_time)}
                          </span>
                        </div>

                        <span className="flex items-center text-xs font-medium text-blue-600">
                          View Details <ChevronRight size={14} className="ml-1" />
                        </span>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600">
                          <MapPin size={16} className="text-blue-500" />
                          <span className="font-semibold text-gray-800 uppercase tracking-wide">
                            {extractCityName(ride.from_location)}
                          </span>
                          <ChevronRight size={16} className="text-gray-300" />
                          <MapPin size={16} className="text-purple-500" />
                          <span className="font-semibold text-gray-800 uppercase tracking-wide">
                            {extractCityName(ride.to_location)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-600">
                          <div className="flex items-center space-x-1">
                            <Users size={14} />
                            <span>{ride.available_seats} seats</span>
                          </div>
                          {ride.ride_bookings && ride.ride_bookings.length > 0 && (
                            <div className="flex items-center space-x-1 text-blue-600">
                              <MessageCircle size={14} />
                              <span>{ride.ride_bookings.length} booking{ride.ride_bookings.length > 1 ? 's' : ''}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1 text-green-600 font-semibold">
                            <DollarSign size={14} />
                            <span>${ride.price_per_seat} / seat</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TripPage;
