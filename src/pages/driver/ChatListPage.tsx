import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Clock, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getUserConversations } from '../../services/chatService';
import BottomNav from '../../components/BottomNav';

interface ConversationItem {
  id: string;
  ride_request_id: string;
  last_message?: string;
  unread_count?: number;
  passenger_name?: string;
  last_message_at: string;
}

export default function ChatListPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    await loadConversations(currentUser.id);
    setLoading(false);
  };

  const loadConversations = async (userId: string) => {
    try {
      const convs = await getUserConversations(userId);
      setConversations(convs);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading conversations...</p>
              </div>
            </div>
          ) : conversations.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/driver/chat/${conv.ride_request_id}`)}
                  className="w-full bg-white hover:bg-gray-50 active:bg-gray-100 px-4 py-4 flex items-center space-x-4 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex-none w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {conv.passenger_name?.charAt(0).toUpperCase() || 'P'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {conv.passenger_name || 'Passenger'}
                      </h3>
                      <div className="flex items-center space-x-2 ml-2">
                        {conv.unread_count && conv.unread_count > 0 && (
                          <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-none" />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-gray-600 truncate flex-1">
                        {conv.last_message || 'No messages yet'}
                      </p>
                      <span className="text-xs text-gray-400 flex-none">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center space-y-3 shadow-sm border border-gray-100 mx-4 mt-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">No messages yet</h3>
                <p className="text-sm text-gray-600">
                  When passengers send you messages, they'll appear here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNav userType="driver" />
      </div>
    </div>
  );
}
