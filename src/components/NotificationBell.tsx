import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { getUnreadCount, subscribeToNotifications } from '../services/notificationService';
import { supabase } from '../services/supabaseClient';

interface NotificationBellProps {
  onOpen?: () => void;
  className?: string;
}

export function NotificationBell({ onOpen, className = '' }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadUnreadCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        const count = await getUnreadCount(user.id);
        if (mounted) {
          setUnreadCount(count);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error loading unread count:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const setupRealtimeSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        // Subscribe to real-time updates
        unsubscribeRef.current = subscribeToNotifications(
          user.id,
          () => {
            // New notification received
            if (mounted) {
              setUnreadCount(prev => prev + 1);
            }
          },
          (notification) => {
            // Notification updated (e.g., marked as read)
            if (notification.is_read && mounted) {
              setUnreadCount(prev => Math.max(0, prev - 1));
            }
          }
        );
      } catch (error) {
        console.error('Error setting up notification subscription:', error);
      }
    };

    loadUnreadCount();
    setupRealtimeSubscription();

    return () => {
      mounted = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const handleClick = () => {
    if (onOpen) {
      onOpen();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`relative p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors ${className}`}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
    >
      <Bell className="w-6 h-6 text-gray-700" />
      
      {!isLoading && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
