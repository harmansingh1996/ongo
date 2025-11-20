import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Copy, Share2, Users, DollarSign, CheckCircle } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getUserReferral, getReferralStats, Referral } from '../../services/referralService';

export default function ReferPage() {
  const navigate = useNavigate();
  const [referral, setReferral] = useState<Referral | null>(null);
  const [stats, setStats] = useState({ totalReferrals: 0, totalEarned: 0, pendingReferrals: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }

      const referralData = await getUserReferral(currentUser.id, currentUser.name);
      setReferral(referralData);

      const statsData = await getReferralStats(currentUser.id);
      if (statsData) {
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (referral) {
      navigator.clipboard.writeText(referral.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (!referral) return;

    const shareText = `Join OnGoPool with my referral code ${referral.referral_code} and get 10% off your first ride! 🚗`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'OnGoPool Referral',
          text: shareText,
        });
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gradient-to-b from-blue-50 to-white">
      <main 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none px-4 py-3 bg-white shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 active:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Refer & Earn</h1>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Hero Card */}
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Give 10%, Get Rewards</h2>
                <p className="text-blue-100 text-sm">Share with friends and earn together</p>
              </div>
            </div>
            
            <div className="bg-white/20 backdrop-blur rounded-xl p-4 mb-4">
              <p className="text-blue-100 text-xs mb-2">Your Referral Code</p>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold tracking-wider">
                  {referral?.referral_code || 'LOADING'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopyCode}
                className="bg-white text-blue-600 py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 active:bg-blue-50"
              >
                {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShare}
                className="bg-white/20 backdrop-blur text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 active:bg-white/30"
              >
                <Share2 className="w-5 h-5" />
                Share
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-md">
              <Users className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</p>
              <p className="text-xs text-gray-600">Total Referrals</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-md">
              <DollarSign className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">${stats.totalEarned.toFixed(0)}</p>
              <p className="text-xs text-gray-600">Total Earned</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-md">
              <Gift className="w-8 h-8 text-purple-600 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{stats.pendingReferrals}</p>
              <p className="text-xs text-gray-600">Pending</p>
            </div>
          </div>

          {/* How it Works */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">How It Works</h3>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Share Your Code</h4>
                  <p className="text-sm text-gray-600">Send your unique referral code to friends and family</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-purple-600 font-bold">2</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">They Get 10% Off</h4>
                  <p className="text-sm text-gray-600">Your friends receive 10% discount on their first ride</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-bold">3</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">You Earn Rewards</h4>
                  <p className="text-sm text-gray-600">Get credits and bonuses for each successful referral</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Terms & Conditions</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• 10% discount applies to first ride only</li>
              <li>• Minimum ride value of $10 required</li>
              <li>• Referral code valid for 90 days</li>
              <li>• Cannot be combined with other offers</li>
              <li>• OnGoPool reserves the right to modify terms</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
