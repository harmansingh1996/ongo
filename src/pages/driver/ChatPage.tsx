import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import {
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  markMessagesAsRead,
  subscribeToMessages,
  Message,
  Conversation,
} from '../../services/chatService';
import { getBookingById } from '../../services/bookingService';
import { hapticFeedback } from '../../utils/mobileFeatures';

export default function ChatPage() {
  const navigate = useNavigate();
  const { rideRequestId } = useParams<{ rideRequestId: string }>();
  const [user, setUser] = useState<any>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChat();
  }, [rideRequestId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!conversation || !user) return;

    const userId = user.id; // Capture user ID to avoid dependency issues
    const conversationId = conversation.id;

    const unsubscribe = subscribeToMessages(conversationId, (newMsg) => {
      setMessages((prev) => {
        // Prevent duplicate messages (check if message already exists)
        if (prev.some(msg => msg.id === newMsg.id)) {
          return prev;
        }
        return [...prev, newMsg];
      });
      
      // Mark as read if message is from other user
      if (newMsg.sender_id !== userId) {
        markMessagesAsRead(conversationId, userId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversation, user]);

  const loadChat = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }
      setUser(currentUser);

      if (!rideRequestId) {
        console.error('No ride request ID provided');
        setLoading(false);
        return;
      }

      // Fetch ride request details to get driver and passenger IDs
      const booking = await getBookingById(rideRequestId);
      
      if (!booking) {
        console.error(`[ChatPage] Failed to load ride request: ${rideRequestId}`);
        console.error('[ChatPage] This may be due to: invalid ID, RLS policy restrictions, or deleted record');
        setError('Ride request not found. It may have been deleted or you may not have access to it.');
        setLoading(false);
        return;
      }

      // Extract driver and passenger IDs from booking
      const driverId = booking.ride?.driver?.id || booking.ride?.driver_id;
      const passengerId = booking.passenger?.id || booking.passenger_id;

      if (!driverId || !passengerId) {
        console.error('Missing driver or passenger ID in booking data');
        setLoading(false);
        return;
      }

      // Create or get conversation
      const conv = await createOrGetConversation(
        rideRequestId,
        driverId,
        passengerId
      );

      if (!conv) {
        console.error('Failed to create/get conversation');
        setLoading(false);
        return;
      }

      setConversation(conv);

      // Load messages
      const msgs = await getConversationMessages(conv.id);
      setMessages(msgs);

      // Mark messages as read
      await markMessagesAsRead(conv.id, currentUser.id);

      // Determine who the "other user" is (if current user is driver, show passenger; if passenger, show driver)
      const isDriver = currentUser.id === driverId;
      const otherUserData = isDriver ? booking.passenger : booking.ride?.driver;

      setOtherUser({
        id: otherUserData?.id,
        name: otherUserData?.name || 'User',
        profile_image: otherUserData?.profile_image || null,
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading chat:', error);
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation || !user || sending) return;

    setSending(true);
    hapticFeedback('light');

    const message = newMessage.trim();
    setNewMessage('');

    // Optimistic update - add message immediately
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`, // Temporary ID
      conversation_id: conversation.id,
      sender_id: user.id,
      message_text: message,
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, optimisticMessage]);

    const sent = await sendMessage(conversation.id, user.id, message);

    if (sent) {
      // Replace optimistic message with real one from database
      setMessages((prev) => {
        const filtered = prev.filter(msg => msg.id !== optimisticMessage.id);
        // Check if real message already received via subscription
        if (filtered.some(msg => msg.id === sent.id)) {
          return filtered;
        }
        return [...filtered, sent];
      });
      hapticFeedback('success');
    } else {
      // Remove optimistic message and restore input on error
      setMessages((prev) => prev.filter(msg => msg.id !== optimisticMessage.id));
      setNewMessage(message);
      alert('Failed to send message. Please try again.');
    }

    setSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Loading chat...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center px-6 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Chat Not Available</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/driver/bookings')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
          >
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gray-50 flex flex-col">
      <div
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-blue-600 text-white px-4 py-3 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-blue-700 rounded-full active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            {otherUser?.profile_image ? (
              <img
                src={otherUser.profile_image}
                alt={otherUser.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-white"
              />
            ) : (
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
                <span className="text-white font-bold">
                  {otherUser?.name?.charAt(0) || '?'}
                </span>
              </div>
            )}
            <div className="flex-1">
              <div className="font-semibold">{otherUser?.name || 'Chat'}</div>
              <div className="text-xs text-blue-100">
                {messages.length > 0 ? 'Active' : 'Start conversation'}
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwnMessage = message.sender_id === user?.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 border border-gray-200'
                    }`}
                  >
                    <p className="text-sm leading-relaxed break-words">
                      {message.message_text}
                    </p>
                    <div
                      className={`text-xs mt-1 ${
                        isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-none bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[44px] max-h-32"
              rows={1}
              style={{ height: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending}
              className={`flex-none p-3 rounded-full transition-all active:scale-95 ${
                newMessage.trim() && !sending
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
