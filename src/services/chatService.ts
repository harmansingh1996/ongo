import { supabase } from './supabaseClient';

export interface Conversation {
  id: string;
  ride_request_id: string;
  driver_id: string;
  passenger_id: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Create or get existing conversation for a ride request
 */
export async function createOrGetConversation(
  rideRequestId: string,
  driverId: string,
  passengerId: string
): Promise<Conversation | null> {
  try {
    // First, try to get existing conversation
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('ride_request_id', rideRequestId)
      .single();

    if (existing && !fetchError) {
      return existing as Conversation;
    }

    // If no existing conversation, create new one
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          ride_request_id: rideRequestId,
          driver_id: driverId,
          passenger_id: passengerId,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    return data as Conversation;
  } catch (error) {
    console.error('Error in createOrGetConversation:', error);
    return null;
  }
}

/**
 * Get all messages for a conversation
 */
export async function getConversationMessages(
  conversationId: string
): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    return (data as Message[]) || [];
  } catch (error) {
    console.error('Error in getConversationMessages:', error);
    return [];
  }
}

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  messageText: string
): Promise<Message | null> {
  try {
    const { data, error } = await supabase
      .from('conversation_messages')
      .insert([
        {
          conversation_id: conversationId,
          sender_id: senderId,
          message_text: messageText,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return null;
    }

    return data as Message;
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return null;
  }
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  conversationId: string,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('conversation_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking messages as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
    return false;
  }
}

/**
 * Subscribe to new messages in a conversation (real-time)
 */
export function subscribeToMessages(
  conversationId: string,
  callback: (message: Message) => void
) {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        callback(payload.new as Message);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Get unread message count for a conversation
 */
export async function getUnreadCount(
  conversationId: string,
  userId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('conversation_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    return 0;
  }
}

/**
 * Check if a conversation should be hidden based on ride completion/cancellation time
 * Matches the cleanup logic: hide conversations 8 hours after ride completion/cancellation
 */
function shouldHideConversation(ride: any): boolean {
  if (!ride) return false;
  
  // Only hide conversations for completed or cancelled rides
  if (ride.status !== 'completed' && ride.status !== 'cancelled') {
    return false;
  }
  
  // Get the timestamp to check against
  const completionTime = ride.completed_at || ride.updated_at || ride.created_at;
  if (!completionTime) return false;
  
  const completionDate = new Date(completionTime);
  const now = new Date();
  const hoursSinceCompletion = (now.getTime() - completionDate.getTime()) / (1000 * 60 * 60);
  
  // Hide after 8 hours (same as ride cleanup logic)
  return hoursSinceCompletion >= 8;
}

/**
 * Get all conversations for current user (as driver or passenger)
 * Automatically filters out conversations for old completed/cancelled rides
 */
export async function getUserConversations(
  userId: string
): Promise<Array<Conversation & { 
  last_message?: string;
  unread_count?: number;
  driver_name?: string;
  passenger_name?: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        driver:driver_id(name),
        passenger:passenger_id(name),
        ride_request:ride_request_id(
          ride:ride_id(
            status,
            completed_at,
            updated_at,
            created_at
          )
        )
      `)
      .or(`driver_id.eq.${userId},passenger_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    if (!data) return [];

    // Filter out conversations for old completed/cancelled rides
    const activeConversations = data.filter((conv: any) => {
      const ride = conv.ride_request?.ride;
      return !shouldHideConversation(ride);
    });

    console.log(`📊 Filtered ${data.length - activeConversations.length} old conversations`);

    // Fetch last message and unread count for each active conversation
    const conversationsWithDetails = await Promise.all(
      activeConversations.map(async (conv: any) => {
        // Get last message
        const { data: lastMsg } = await supabase
          .from('conversation_messages')
          .select('message_text')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const unreadCount = await getUnreadCount(conv.id, userId);

        return {
          ...conv,
          last_message: lastMsg?.message_text || '',
          unread_count: unreadCount,
          driver_name: conv.driver?.name || 'Driver',
          passenger_name: conv.passenger?.name || 'Passenger',
        };
      })
    );

    return conversationsWithDetails;
  } catch (error) {
    console.error('Error in getUserConversations:', error);
    return [];
  }
}
