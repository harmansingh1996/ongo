import React from 'react';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChatHeaderProps {
  driverName: string;
  driverAvatar?: string;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  driverName,
  driverAvatar,
  onBack,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header
      className="flex-none bg-white border-b border-gray-200"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 active:bg-gray-100 rounded-full transition-colors min-h-touch min-w-touch flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>

          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold overflow-hidden">
              {driverAvatar ? (
                <img
                  src={driverAvatar}
                  alt={driverName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{driverName.charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-gray-900 truncate">
                {driverName}
              </h1>
              <p className="text-sm text-green-600">Online</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 active:bg-gray-100 rounded-full transition-colors min-h-touch min-w-touch flex items-center justify-center">

          </button>
          <button className="p-2 active:bg-gray-100 rounded-full transition-colors min-h-touch min-w-touch flex items-center justify-center">

          </button>
          <button className="p-2 active:bg-gray-100 rounded-full transition-colors min-h-touch min-w-touch flex items-center justify-center">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </header>
  );
};
