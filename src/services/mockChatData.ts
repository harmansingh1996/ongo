import { Message } from '../components/chat';

/**
 * Mock chat data for development and testing
 */

export interface MockConversation {
  id: string;
  driverName: string;
  driverAvatar?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  rideRequestId: string;
}

// Mock conversations list
export const mockConversations: MockConversation[] = [
  {
    id: 'conv-1',
    driverName: 'John Smith',
    lastMessage: "I've arrived at the pickup point",
    lastMessageTime: new Date(Date.now() - 5 * 60 * 1000),
    unreadCount: 2,
    rideRequestId: 'ride-1',
  },
  {
    id: 'conv-2',
    driverName: 'Mike Johnson',
    lastMessage: 'Okay, departing now',
    lastMessageTime: new Date(Date.now() - 30 * 60 * 1000),
    unreadCount: 0,
    rideRequestId: 'ride-2',
  },
];

// Mock messages storage (in-memory)
const messageStore: Record<string, Message[]> = {
  'conv-1': [
    {
      id: 'msg-1',
      text: 'Hello, I am your driver John',
      senderId: 'driver-1',
      senderName: 'John Smith',
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      status: 'read',
      isCurrentUser: false,
    },
    {
      id: 'msg-2',
      text: 'Hi, how long until you arrive?',
      senderId: 'rider-1',
      senderName: 'Me',
      timestamp: new Date(Date.now() - 14 * 60 * 1000),
      status: 'read',
      isCurrentUser: true,
    },
    {
      id: 'msg-3',
      text: 'About 5 minutes, please wait',
      senderId: 'driver-1',
      senderName: 'John Smith',
      timestamp: new Date(Date.now() - 13 * 60 * 1000),
      status: 'read',
      isCurrentUser: false,
    },
    {
      id: 'msg-4',
      text: "I've arrived at the pickup point",
      senderId: 'driver-1',
      senderName: 'John Smith',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      status: 'sent',
      isCurrentUser: false,
    },
  ],
  'conv-2': [
    {
      id: 'msg-5',
      text: 'Could you help open the trunk please?',
      senderId: 'rider-1',
      senderName: 'Me',
      timestamp: new Date(Date.now() - 35 * 60 * 1000),
      status: 'read',
      isCurrentUser: true,
    },
    {
      id: 'msg-6',
      text: 'Okay, departing now',
      senderId: 'driver-2',
      senderName: 'Mike Johnson',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      status: 'read',
      isCurrentUser: false,
    },
  ],
};

/**
 * Get messages for a conversation
 */
export function getMockMessages(conversationId: string): Message[] {
  return messageStore[conversationId] || [];
}

/**
 * Add a new message to a conversation
 */
export function addMockMessage(
  conversationId: string,
  message: Omit<Message, 'id' | 'timestamp' | 'status'>
): Message {
  const newMessage: Message = {
    ...message,
    id: `msg-${Date.now()}`,
    timestamp: new Date(),
    status: 'sent',
  };

  if (!messageStore[conversationId]) {
    messageStore[conversationId] = [];
  }

  messageStore[conversationId].push(newMessage);

  // Simulate message read after 2 seconds
  setTimeout(() => {
    const msg = messageStore[conversationId].find((m) => m.id === newMessage.id);
    if (msg) {
      msg.status = 'read';
    }
  }, 2000);

  return newMessage;
}

/**
 * Get conversation by ID
 */
export function getMockConversation(
  conversationId: string
): MockConversation | undefined {
  return mockConversations.find((c) => c.id === conversationId);
}

/**
 * Get conversation by ride request ID
 */
export function getMockConversationByRide(
  rideRequestId: string
): MockConversation | undefined {
  return mockConversations.find((c) => c.rideRequestId === rideRequestId);
}

/**
 * Simulate driver reply after a delay
 */
export function simulateDriverReply(
  conversationId: string,
  replyText: string,
  delayMs: number = 3000
): Promise<Message> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const driverMessage = addMockMessage(conversationId, {
        text: replyText,
        senderId: 'driver-1',
        senderName: 'John Smith',
        isCurrentUser: false,
      });
      resolve(driverMessage);
    }, delayMs);
  });
}
