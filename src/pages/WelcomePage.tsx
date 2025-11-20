import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Car, Users, Shield, DollarSign } from 'lucide-react';

export default function WelcomePage() {
  const navigate = useNavigate();

  // Auto-redirect to auth page after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/auth');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="w-full h-dvh bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Logo and Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-6">
          {/* Logo */}
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl">
            <span className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              OG
            </span>
          </div>

          {/* App Name */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">OnGoPool</h1>
            <p className="text-xl text-blue-100">Share rides, save money, go green</p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white">
              <Car className="w-8 h-8 mb-2 mx-auto" />
              <div className="text-sm font-medium">Easy Booking</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white">
              <Users className="w-8 h-8 mb-2 mx-auto" />
              <div className="text-sm font-medium">Safe Community</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white">
              <Shield className="w-8 h-8 mb-2 mx-auto" />
              <div className="text-sm font-medium">Verified Drivers</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white">
              <DollarSign className="w-8 h-8 mb-2 mx-auto" />
              <div className="text-sm font-medium">Save Money</div>
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="flex-none px-6 pb-8">
          <p className="text-center text-sm text-blue-100">
            Join thousands of happy carpoolers
          </p>
        </div>
      </div>
    </div>
  );
}
