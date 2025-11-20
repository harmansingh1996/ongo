import { supabase, handleSupabaseError } from './supabaseClient';

/**
 * Message Service
 * Handles chat messaging operations with Supabase
 * Uses conversations + conversation_messages architecture
 */

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    name: string;
    profile_image: string | null;
  };
}

export interface Conversation {
  id: string;
  driver_id: string;
  passenger_id: string;
  ride_request_id: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  partnerId: string;
  partnerName: string;
  partnerImage: string | null;
  messages: Message[];
  unreadCount: number;
  lastMessage?: Message;
}

export interface CreateMessageData {
  receiver_id: string;
  message: string;
  ride_id?: string;
}

export interface PickupConfirmationData {
  bookingId: string;
  confirmedAddress: string;
  confirmedLat: number;
  confirmedLng: number;
}

/**
 * Get or create a conversation between two users
 */
async function getOrCreateConversation(
  userId: string,
  partnerId: string,
  rideRequestId?: string
): Promise<string | null> {
  try {
    // Try to find existing conversation
    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(driver_id.eq.${userId},passenger_id.eq.${partnerId}),and(driver_id.eq.${partnerId},passenger_id.eq.${userId})`
      )
      .limit(1)
      .single();

    if (existing && !fetchError) {
      return existing.id;
    }

    // Create new conversation
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        driver_id: userId,
        passenger_id: partnerId,
        ride_request_id: rideRequestId || null,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createError) throw createError;
    return newConv?.id || null;
  } catch (error) {
    handleSupabaseError(error, 'Failed to get or create conversation');
    return null;
  }
}

/**
 * Get all conversations for a user
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        driver:profiles!conversations_driver_id_fkey(id, name, profile_image),
        passenger:profiles!conversations_passenger_id_fkey(id, name, profile_image)
      `)
      .or(`driver_id.eq.${userId},passenger_id.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    // Get messages for each conversation
    const conversationList = await Promise.all(
      (conversations || []).map(async (conv) => {
        const isDriver = conv.driver_id === userId;
        const partner = isDriver ? conv.passenger : conv.driver;

        // Fetch messages for this conversation
        const { data: messages, error: msgError } = await supabase
          .from('conversation_messages')
          .select(`
            *,
            sender:profiles!conversation_messages_sender_id_fkey(id, name, profile_image)
          `)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });

        if (msgError) {
          console.error('Error fetching messages:', msgError);
        }

        const messageList = messages || [];

        // Count unread messages (only incoming messages)
        const unreadCount = messageList.filter(
          (msg) => !msg.is_read && msg.sender_id !== userId
        ).length;

        // Get last message
        const lastMessage = messageList[messageList.length - 1];

        return {
          ...conv,
          partnerId: partner?.id || '',
          partnerName: partner?.name || 'Unknown User',
          partnerImage: partner?.profile_image || null,
          messages: messageList,
          unreadCount,
          lastMessage,
        };
      })
    );

    return conversationList;
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch conversations');
    return [];
  }
}

/**
 * Get messages for a specific conversation
 */
export async function getConversationMessages(
  userId: string,
  partnerId: string
): Promise<Message[]> {
  try {
    // Find conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(driver_id.eq.${userId},passenger_id.eq.${partnerId}),and(driver_id.eq.${partnerId},passenger_id.eq.${userId})`
      )
      .limit(1)
      .single();

    if (convError || !conversation) {
      return [];
    }

    const { data, error } = await supabase
      .from('conversation_messages')
      .select(`
        *,
        sender:profiles!conversation_messages_sender_id_fkey(id, name, profile_image)
      `)
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch conversation messages');
    return [];
  }
}

/**
 * Send a message
 */
export async function sendMessage(
  senderId: string,
  messageData: CreateMessageData
): Promise<Message | null> {
  try {
    // Get or create conversation
    const conversationId = await getOrCreateConversation(
      senderId,
      messageData.receiver_id,
      messageData.ride_id
    );

    if (!conversationId) {
      throw new Error('Failed to create conversation');
    }

    const { data, error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        message_text: messageData.message,
        is_read: false,
      })
      .select(`
        *,
        sender:profiles!conversation_messages_sender_id_fkey(id, name, profile_image)
      `)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    handleSupabaseError(error, 'Failed to send message');
    return null;
  }
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  userId: string,
  partnerId: string
): Promise<boolean> {
  try {
    // Find conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(driver_id.eq.${userId},passenger_id.eq.${partnerId}),and(driver_id.eq.${partnerId},passenger_id.eq.${userId})`
      )
      .limit(1)
      .single();

    if (convError || !conversation) {
      return false;
    }

    // Mark all messages from partner as read
    const { error } = await supabase
      .from('conversation_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversation.id)
      .eq('sender_id', partnerId)
      .eq('is_read', false);

    if (error) throw error;
    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to mark messages as read');
    return false;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(messageId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('conversation_messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to delete message');
    return false;
  }
}

/**
 * Send pickup address confirmation request to passenger
 */
export async function sendPickupConfirmationRequest(
  driverId: string,
  passengerId: string,
  rideId: string,
  bookingId: string,
  pickupAddress: string
): Promise<Message | null> {
  const confirmationMessage = `🚗 Ride starting soon! Please confirm your pickup address:\n\n${pickupAddress}\n\nReply with your exact address if different, or confirm this location.`;

  return sendMessage(driverId, {
    receiver_id: passengerId,
    message: confirmationMessage,
    ride_id: rideId,
  });
}

/**
 * Update booking pickup location after passenger confirmation
 */
export async function updatePickupLocation(
  bookingId: string,
  confirmedAddress: string,
  confirmedLat: number,
  confirmedLng: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('ride_requests')
      .update({
        pickup_location: {
          address: confirmedAddress,
          lat: confirmedLat,
          lng: confirmedLng,
        },
      })
      .eq('id', bookingId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to update pickup location');
    return false;
  }
}

/**
 * Get unread message count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    // Get all user's conversations
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`driver_id.eq.${userId},passenger_id.eq.${userId}`);

    if (convError || !conversations || conversations.length === 0) {
      return 0;
    }

    const conversationIds = conversations.map((c) => c.id);

    // Count unread messages in all conversations
    const { count, error } = await supabase
      .from('conversation_messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch unread count');
    return 0;
  }
}
