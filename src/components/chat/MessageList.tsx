import React, { useEffect, useRef } from 'react';
import { Check, CheckCheck } from 'lucide-react';

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'read';
  isCurrentUser: boolean;
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const renderMessageStatus = (status: Message['status']) => {
    if (status === 'sending') {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
    if (status === 'sent') {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    }
    return <CheckCheck className="w-4 h-4 text-blue-500" />;
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
      <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.isCurrentUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[75%] ${
                message.isCurrentUser ? 'items-end' : 'items-start'
              } flex flex-col gap-1`}
            >
              {!message.isCurrentUser && (
                <span className="text-xs text-gray-500 px-2">
                  {message.senderName}
                </span>
              )}

              <div
                className={`rounded-2xl px-4 py-2.5 ${
                  message.isCurrentUser
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-[15px] leading-relaxed break-words">
                  {message.text}
                </p>
              </div>

              <div
                className={`flex items-center gap-1 px-2 ${
                  message.isCurrentUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <span className="text-xs text-gray-500">
                  {formatTime(message.timestamp)}
                </span>
                {message.isCurrentUser && renderMessageStatus(message.status)}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
