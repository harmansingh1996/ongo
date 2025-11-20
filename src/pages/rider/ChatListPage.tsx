import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ChevronRight, Search } from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { getUserConversations } from '../../services/chatService';
import { getCurrentUser } from '../../services/authService';
import { hapticFeedback } from '../../utils/mobileFeatures';

interface ConversationItem {
  id: string;
  driverName: string;
  passengerName: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
}

export default function ChatListPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const user = await getCurrentUser();
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const supabaseConversations = await getUserConversations(user.id);

      const transformedConversations: ConversationItem[] = supabaseConversations.map((conv) => ({
        id: conv.id,
        driverName: conv.driver_name || 'Driver',
        passengerName: conv.passenger_name || 'Passenger',
        lastMessage: conv.last_message || 'No messages yet',
        lastMessageTime: new Date(conv.last_message_at),
        unreadCount: conv.unread_count || 0,
      }));

      setConversations(transformedConversations);
      setLoading(false);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.passengerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const handleConversationClick = (conversationId: string) => {
    hapticFeedback('light');
    navigate(`/rider/chat/${conversationId}`);
  };

  return (
    <div className="w-full h-dvh bg-gray-50 flex flex-col">
      {/* Header */}
      <header
        className="flex-none bg-white border-b border-gray-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-[15px] outline-none focus:bg-gray-200 transition-colors"
            />
          </div>
        </div>
      </header>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {searchQuery ? 'No conversations found' : 'No messages yet'}
            </h3>
            <p className="text-gray-500 text-sm">
              {searchQuery
                ? 'Try searching with different keywords'
                : 'Start chatting with drivers after booking a ride'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleConversationClick(conversation.id)}
                className="w-full px-4 py-4 flex items-center gap-3 bg-white active:bg-gray-50 transition-colors"
              >
                {/* Avatar */}
                <div className="flex-none relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold">
                    <span>{conversation.driverName.charAt(0)}</span>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {conversation.unreadCount > 9
                          ? '9+'
                          : conversation.unreadCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {conversation.driverName}
                    </h3>
                    <span className="text-xs text-gray-500 flex-none ml-2">
                      {formatTime(conversation.lastMessageTime)}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate ${
                      conversation.unreadCount > 0
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-500'
                    }`}
                  >
                    {conversation.lastMessage}
                  </p>
                </div>

                {/* Chevron */}
                <ChevronRight className="w-5 h-5 text-gray-400 flex-none" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav active="chat" userType="rider" />
    </div>
  );
}
