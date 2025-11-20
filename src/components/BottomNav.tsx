import { Home, Calendar, PlusCircle, MessageSquare, UserCircle, MapPin, SearchCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface BottomNavProps {
  active?: string;
  userType: 'driver' | 'rider';
}

export default function BottomNav({ active, userType }: BottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (navKey: string) => {
    if (active) return active === navKey;
    return location.pathname.includes(`/${userType}/${navKey}`);
  };

  const navItems = [
    { 
      icon: Home, 
      label: 'Home', 
      key: 'home',
      path: `/${userType}/home` 
    },
    { 
      icon: Calendar, 
      label: 'Trips', 
      key: 'trips',
      path: `/${userType}/trips` 
    },
    ...(userType === 'driver' ? [{ 
      icon: PlusCircle, 
      label: 'Post', 
      key: 'post',
      path: '/driver/post-ride',
      isPrimary: true
    }] : [{ 
      icon: SearchCheck, 
      label: 'Find', 
      key: 'find',
      path: '/rider/find-ride',
      isPrimary: true
    }]),
    // Chat navigation for both drivers and riders
    { 
      icon: MessageSquare, 
      label: 'Chat', 
      key: 'chat',
      path: `/${userType}/chat` 
    },
    { 
      icon: UserCircle, 
      label: 'Profile', 
      key: 'profile',
      path: `/${userType}/profile` 
    },
  ];

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 shadow-2xl backdrop-blur-lg bg-opacity-95 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around px-1 pt-2 pb-1 max-w-screen-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const activeNav = isActive(item.key);
          const isPrimary = 'isPrimary' in item && item.isPrimary;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center justify-center space-y-1 py-2 px-3 rounded-2xl transition-all duration-300 min-h-touch ${
                activeNav 
                  ? isPrimary
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg scale-110'
                    : 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 active:scale-95'
              }`}
            >
              {/* Active indicator dot */}
              {activeNav && !isPrimary && (
                <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
              )}
              
              <Icon 
                className={`transition-all duration-300 ${
                  isPrimary && activeNav 
                    ? 'w-7 h-7 stroke-[2.5]' 
                    : activeNav 
                      ? 'w-6 h-6 stroke-[2.5]' 
                      : 'w-6 h-6 stroke-[1.5]'
                }`} 
              />
              <span 
                className={`text-[10px] transition-all duration-300 ${
                  activeNav 
                    ? 'font-bold tracking-wide' 
                    : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
