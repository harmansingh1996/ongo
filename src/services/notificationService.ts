import { supabase } from './supabaseClient';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  ride_id?: string;
  booking_id?: string;
  conversation_id?: string;  // Changed from chat_id to match database
  sender_id?: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  action_url?: string;
  created_at: string;
  read_at?: string;
  sender_profile?: {
    name?: string;
    profile_image?: string;
  };
}

export type NotificationType =
  | 'ride_post'
  | 'chat_message'
  | 'ride_request'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'ride_started'
  | 'ride_completed'
  | 'payment_received'
  | 'cancellation'
  | 'rating_reminder'
  | 'refund_processed';

export interface NotificationPreferences {
  user_id: string;
  ride_post_enabled: boolean;
  chat_message_enabled: boolean;
  ride_request_enabled: boolean;
  booking_enabled: boolean;
  payment_enabled: boolean;
  rating_enabled: boolean;
  in_app_enabled: boolean;
  updated_at: string;
}

/**
 * Fetch user notifications with optional filters
 */
export async function getNotifications(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    type?: NotificationType;
  }
): Promise<{ data: Notification[]; error: Error | null }> {
  try {
    let query = supabase
      .from('notifications')
      .select(`
        *,
        sender_profile:profiles!notifications_sender_id_fkey(
          name,
          profile_image
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (options?.type) {
      query = query.eq('type', options.type);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_unread_notification_count');

    if (error) throw error;

    return data || 0;
  } catch (error) {
    console.error('Error getting unread count:', error);
    // Fallback to manual count
    try {
      const { count, error: countError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (countError) throw countError;
      return count || 0;
    } catch (fallbackError) {
      console.error('Fallback count failed:', fallbackError);
      return 0;
    }
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.rpc('mark_notification_read', {
      p_notification_id: notificationId
    });

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    // Fallback to direct update
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (updateError) throw updateError;
      return { success: true, error: null };
    } catch (fallbackError) {
      return { success: false, error: fallbackError as Error };
    }
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string): Promise<{ count: number; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('mark_all_notifications_read');

    if (error) throw error;

    return { count: data || 0, error: null };
  } catch (error) {
    console.error('Error marking all as read:', error);
    // Fallback to direct update
    try {
      const { data, error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select();

      if (updateError) throw updateError;
      return { count: data?.length || 0, error: null };
    } catch (fallbackError) {
      return { count: 0, error: fallbackError as Error };
    }
  }
}

/**
 * Create a notification manually (for system events not covered by triggers)
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  rideId?: string;
  bookingId?: string;
  conversationId?: string;  // Changed from chatId to match database
  senderId?: string;
  metadata?: Record<string, any>;
  actionUrl?: string;
}): Promise<{ notificationId: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('create_notification', {
      p_user_id: params.userId,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_ride_id: params.rideId || null,
      p_booking_id: params.bookingId || null,
      p_conversation_id: params.conversationId || null,  // Changed from p_chat_id
      p_sender_id: params.senderId || null,
      p_metadata: params.metadata || {},
      p_action_url: params.actionUrl || null
    });

    if (error) throw error;

    return { notificationId: data, error: null };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { notificationId: null, error: error as Error };
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting notification:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(
  userId: string
): Promise<{ data: NotificationPreferences | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // Create default preferences if not exists
    if (!data) {
      const { data: newPrefs, error: createError } = await supabase
        .from('notification_preferences')
        .insert([{ user_id: userId }])
        .select()
        .single();

      if (createError) throw createError;
      return { data: newPrefs, error: null };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<Omit<NotificationPreferences, 'user_id' | 'updated_at'>>
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('notification_preferences')
      .update({
        ...preferences,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Subscribe to real-time notification updates
 */
export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notification: Notification) => void,
  onNotificationUpdate: (notification: Notification) => void
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        onNewNotification(payload.new as Notification);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        onNotificationUpdate(payload.new as Notification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
