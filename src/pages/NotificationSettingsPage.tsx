import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, MessageSquare, Car, CreditCard, Star } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences
} from '../services/notificationService';
import { hapticFeedback } from '../utils/mobileFeatures';

export default function NotificationSettingsPage() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await getNotificationPreferences(user.id);
      if (error) throw error;

      setPreferences(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading preferences:', error);
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof Omit<NotificationPreferences, 'user_id' | 'updated_at'>) => {
    if (!preferences) return;

    const newValue = !preferences[key];
    const updatedPrefs = { ...preferences, [key]: newValue };
    setPreferences(updatedPrefs);

    hapticFeedback('light');

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await updateNotificationPreferences(user.id, {
        [key]: newValue
      });

      if (error) throw error;

      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Error updating preferences:', error);
      // Revert on error
      setPreferences(prev => prev ? { ...prev, [key]: !newValue } : null);
      setSaveMessage('Error saving');
      setTimeout(() => setSaveMessage(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Loading preferences...</div>
        </div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-gray-600">Failed to load preferences</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const notificationTypes = [
    {
      key: 'ride_post_enabled' as const,
      icon: Car,
      title: 'New Ride Posts',
      description: 'Get notified when new rides match your preferences'
    },
    {
      key: 'chat_message_enabled' as const,
      icon: MessageSquare,
      title: 'Chat Messages',
      description: 'Receive notifications for new chat messages'
    },
    {
      key: 'ride_request_enabled' as const,
      icon: Car,
      title: 'Ride Requests',
      description: 'Be notified when riders request to join your rides'
    },
    {
      key: 'booking_enabled' as const,
      icon: Bell,
      title: 'Booking Updates',
      description: 'Stay informed about booking confirmations and rejections'
    },
    {
      key: 'payment_enabled' as const,
      icon: CreditCard,
      title: 'Payment Notifications',
      description: 'Receive updates on payments and refunds'
    },
    {
      key: 'rating_enabled' as const,
      icon: Star,
      title: 'Rating Reminders',
      description: 'Get reminded to rate your completed rides'
    }
  ];

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        {/* Header */}
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Notification Settings</h1>
              <p className="text-sm text-gray-500">Manage your notification preferences</p>
            </div>
            {saveMessage && (
              <span className={`text-sm font-medium ${
                saveMessage === 'Saved' ? 'text-green-600' : 'text-red-600'
              }`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Master Toggle */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">All Notifications</h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Enable or disable all in-app notifications
                  </p>
                </div>
                <button
                  onClick={() => handleToggle('in_app_enabled')}
                  disabled={saving}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    preferences.in_app_enabled ? 'bg-blue-600' : 'bg-gray-300'
                  } ${saving ? 'opacity-50' : ''}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                      preferences.in_app_enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Individual Notification Types */}
            <div className="space-y-3">
              {notificationTypes.map((type) => {
                const Icon = type.icon;
                const isEnabled = preferences[type.key];
                const isDisabled = !preferences.in_app_enabled || saving;

                return (
                  <div
                    key={type.key}
                    className={`bg-white rounded-xl p-4 border border-gray-200 ${
                      isDisabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-5 h-5 text-gray-600" />
                          <h3 className="font-semibold text-gray-900">{type.title}</h3>
                        </div>
                        <p className="text-sm text-gray-500">{type.description}</p>
                      </div>
                      <button
                        onClick={() => handleToggle(type.key)}
                        disabled={isDisabled}
                        className={`relative w-14 h-8 rounded-full transition-colors ${
                          isEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        } ${isDisabled ? 'cursor-not-allowed' : ''}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                            isEnabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Info Section */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Notification preferences are synced across all your devices.
                Disabling a notification type will prevent you from receiving those notifications.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
