import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChatHeader, MessageList, MessageInput, Message } from '../../components/chat';
import {
  getConversationMessages,
  sendMessage as sendSupabaseMessage,
  subscribeToMessages,
  markMessagesAsRead,
  Message as SupabaseMessage,
} from '../../services/chatService';
import { getCurrentUser } from '../../services/authService';
import { hapticFeedback } from '../../utils/mobileFeatures';

export default function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [driverName, setDriverName] = useState('Driver');

  // Load messages and set up real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    let unsubscribe: (() => void) | null = null;

    const setupChat = async () => {
      try {
        // Get current user
        const user = await getCurrentUser();
        if (user?.id) {
          setCurrentUserId(user.id);
        }

        // Load existing messages
        const supabaseMessages = await getConversationMessages(conversationId);
        
        // Transform Supabase messages to component format
        const transformedMessages: Message[] = supabaseMessages.map((msg: SupabaseMessage) => ({
          id: msg.id,
          text: msg.message_text,
          senderId: msg.sender_id,
          senderName: msg.sender_id === user?.id ? 'Me' : driverName,
          timestamp: new Date(msg.created_at),
          status: msg.is_read ? 'read' : 'sent',
          isCurrentUser: msg.sender_id === user?.id,
        }));

        setMessages(transformedMessages);
        setLoading(false);

        // Mark messages as read
        if (user?.id) {
          await markMessagesAsRead(conversationId, user.id);
        }

        // Subscribe to new messages
        unsubscribe = subscribeToMessages(conversationId, (newMessage: SupabaseMessage) => {
          const transformedMessage: Message = {
            id: newMessage.id,
            text: newMessage.message_text,
            senderId: newMessage.sender_id,
            senderName: newMessage.sender_id === user?.id ? 'Me' : driverName,
            timestamp: new Date(newMessage.created_at),
            status: newMessage.is_read ? 'read' : 'sent',
            isCurrentUser: newMessage.sender_id === user?.id,
          };

          setMessages((prev) => [...prev, transformedMessage]);
          hapticFeedback('light');

          // Mark new message as read if not from current user
          if (newMessage.sender_id !== user?.id && user?.id) {
            markMessagesAsRead(conversationId, user.id);
          }
        });
      } catch (error) {
        console.error('Error setting up chat:', error);
        setLoading(false);
      }
    };

    setupChat();

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, driverName]);

  const handleSendMessage = async (text: string) => {
    if (!conversationId || !currentUserId) return;

    try {
      // Optimistic UI update
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        text,
        senderId: currentUserId,
        senderName: 'Me',
        timestamp: new Date(),
        status: 'sending',
        isCurrentUser: true,
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      hapticFeedback('light');

      // Send to Supabase
      const sentMessage = await sendSupabaseMessage(conversationId, currentUserId, text);

      if (sentMessage) {
        // Update optimistic message with real data
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === optimisticMessage.id
              ? {
                  ...msg,
                  id: sentMessage.id,
                  status: 'sent',
                }
              : msg
          )
        );
      } else {
        // Remove optimistic message if send failed
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center px-4">
          <p className="text-gray-600 text-lg">Conversation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gray-50 flex flex-col">
      <ChatHeader driverName={driverName} />

      <MessageList messages={messages} currentUserId={currentUserId} />

      <MessageInput onSendMessage={handleSendMessage} />
    </div>
  );
}
