import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Star, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { User as UserType } from '../types';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string;
    title: string;
    description?: string | null;
    activityType: string;
    createdAt: string;
    metadata?: Record<string, any> | null;
  }>>([]);
  const [totalRidesCount, setTotalRidesCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchRecentActivities();
      fetchTotalRidesCount();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTotalRidesCount = async () => {
    if (!user) return;

    try {
      // Count completed rides where user was driver
      const { count: driverRidesCount, error: driverError } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .eq('status', 'completed');

      if (driverError) throw driverError;

      // Count completed rides where user was passenger
      const { count: passengerRidesCount, error: passengerError } = await supabase
        .from('ride_bookings')
        .select(`
          rides!inner(status)
        `, { count: 'exact', head: true })
        .eq('passenger_id', user.id)
        .eq('status', 'confirmed')
        .eq('rides.status', 'completed');

      if (passengerError) throw passengerError;

      // Set total rides count (driver rides + passenger rides)
      const totalCount = (driverRidesCount || 0) + (passengerRidesCount || 0);
      setTotalRidesCount(totalCount);

    } catch (error) {
      console.error('Error fetching total rides count:', error);
      setTotalRidesCount(0);
    }
  };

  const fetchRecentActivities = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('recent_activities')
        .select('*')
        .eq('user_id', user.id)
        .in('activity_type', ['ride_posted', 'ride_requested', 'booking_confirmed'])
        .order('created_at', { ascending: false })
        .is('archived_at', null)
        .limit(10);

      if (error) throw error;

      const formatted = (data || []).map((activity) => ({
        id: activity.id?.toString() ?? crypto.randomUUID(),
        title: activity.title,
        description: activity.description,
        activityType: activity.activity_type,
        createdAt: activity.created_at,
        metadata: activity.metadata,
      }));

      setRecentActivities(formatted);
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      setRecentActivities([]);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return '';

    let date: Date | null = null;

    try {
      if (dateString.includes('+') || dateString.includes('Z')) {
        const dateTimePart = dateString.split('+')[0].split('Z')[0];
        const localDateString = dateTimePart.replace('T', ' ');
        date = new Date(localDateString);
      } else {
        date = new Date(dateString);
      }
    } catch (error) {
      console.error('Error parsing activity timestamp:', error);
      return '';
    }

    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks} week${diffInWeeks !== 1 ? 's' : ''} ago`;
    }

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderActivityBadge = (activityType: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1';

    switch (activityType) {
      case 'ride_posted':
        return (
          <span className={`${baseClasses} bg-blue-100 text-blue-700`}>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Ride posted</span>
          </span>
        );
      case 'ride_requested':
        return (
          <span className={`${baseClasses} bg-amber-100 text-amber-700`}>
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Ride requested</span>
          </span>
        );
      case 'booking_confirmed':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-700`}>
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Booking accepted</span>
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-700`}>
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span>{activityType.replace(/_/g, ' ')}</span>
          </span>
        );
    }
  };

  const quickActions = [
    {
      icon: Search,
      label: 'Find Rides',
      description: 'Search for available rides',
      color: 'bg-blue-500',
      action: () => navigate('/find'),
    },
    {
      icon: Plus,
      label: 'Post Ride',
      description: 'Offer a ride to others',
      color: 'bg-green-500',
      action: () => navigate('/post'),
    },
    {
      icon: MapPin,
      label: 'My Trips',
      description: 'View your ride history',
      color: 'bg-purple-500',
      action: () => navigate('/trip'),
    },
  ];



  return (
    <div className="p-4 space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">
          Welcome back{userProfile?.display_name ? `, ${userProfile.display_name}` : ''}!
        </h2>
        <p className="text-blue-100">Ready for your next journey?</p>
        
        <div className="flex items-center mt-4 space-x-4">
          <div className="flex items-center space-x-1">
            <Star className="text-yellow-300 fill-current" size={16} />
            <span className="text-sm">
              {userProfile?.rating && Number(userProfile.rating) > 0 
                ? Number(userProfile.rating).toFixed(1) + ' Rating'
                : 'New User'
              }
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <MapPin className="text-green-300" size={16} />
            <span className="text-sm">{totalRidesCount} Rides</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={action.action}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center space-x-4 hover:shadow-md transition-shadow"
            >
              <div className={`${action.color} p-3 rounded-full`}>
                <action.icon size={24} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-semibold text-gray-900">{action.label}</h4>
                <p className="text-sm text-gray-600">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivities.length > 0 ? (
            recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-4">
                    <div className="flex items-center space-x-2 mb-2">
                      {renderActivityBadge(activity.activityType)}
                      <span className="flex items-center text-xs text-gray-500">
                        <Clock size={14} className="mr-1" />
                        {formatTimeAgo(activity.createdAt)}
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">
                      {activity.title}
                    </h4>
                    {activity.description && (
                      <p className="text-sm text-gray-600">
                        {activity.description}
                      </p>
                    )}
                  </div>
                  {activity.metadata && activity.metadata.amount && (
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        ${Number(activity.metadata.amount).toFixed(2)}
                      </div>
                      {activity.metadata.payment_method && (
                        <div className="text-xs text-gray-500">
                          via {activity.metadata.payment_method}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {activity.metadata && (activity.metadata.from_location || activity.metadata.to_location) && (
                  <div className="mt-3 text-sm text-gray-500">
                    {activity.metadata.from_location && activity.metadata.to_location ? (
                      <span>{activity.metadata.from_location} → {activity.metadata.to_location}</span>
                    ) : activity.metadata.from_location ? (
                      <span>From {activity.metadata.from_location}</span>
                    ) : (
                      <span>To {activity.metadata.to_location}</span>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
              <div className="text-gray-500 mb-2">
                <MapPin size={48} className="mx-auto text-gray-300" />
              </div>
              <h4 className="font-medium text-gray-900 mb-1">No recent activity</h4>
              <p className="text-sm text-gray-600 mb-4">
                Start by finding a ride or posting one to see your activity here.
              </p>
              <div className="flex space-x-2 justify-center">
                <button
                  onClick={() => navigate('/find')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
                >
                  Find Rides
                </button>
                <button
                  onClick={() => navigate('/post')}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
                >
                  Post Ride
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <div className="bg-yellow-100 p-2 rounded-full">
            <span className="text-lg">💡</span>
          </div>
          <div>
            <h4 className="font-semibold text-yellow-800 mb-1">Tip of the day</h4>
            <p className="text-sm text-yellow-700">
              Post your regular commute routes to find consistent ride partners and save more money!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;