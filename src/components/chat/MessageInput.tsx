import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Smile, Mic } from 'lucide-react';
import { hapticFeedback } from '../../utils/mobileFeatures';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !disabled) {
      hapticFeedback('light');
      onSendMessage(trimmedMessage);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  };

  const handleVoiceRecord = () => {
    hapticFeedback('medium');
    setIsRecording(!isRecording);
    // TODO: Implement voice recording functionality
  };

  return (
    <div
      className="flex-none bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-3 py-3">
        <div className="flex items-end gap-2">
          {/* Message input area - takes most space */}
          <div className="flex-1 flex items-end gap-2 bg-gray-100 rounded-3xl px-3 py-2">
            <button
              onClick={() => hapticFeedback('light')}
              className="flex-none p-1 active:bg-gray-200 rounded-full transition-colors"
              disabled={disabled}
            >
              <Smile className="w-5 h-5 text-gray-500" />
            </button>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={disabled}
              className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed max-h-[120px] placeholder:text-gray-400"
              rows={1}
            />
          </div>

          {/* Send button - clearly visible on the right */}
          <button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className={`flex-none w-11 h-11 rounded-full transition-all flex items-center justify-center ${
              message.trim() && !disabled
                ? 'bg-blue-500 text-white active:bg-blue-600 shadow-lg'
                : 'bg-gray-200 text-gray-400'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
