import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { getDriverEarnings, getEarningsSummary, DriverEarning } from '../../services/earningsService';

export default function EarningsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [earnings, setEarnings] = useState<DriverEarning[]>([]);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [summary, setSummary] = useState({
    totalEarnings: 0,
    totalNetEarnings: 0,
    totalPlatformFees: 0,
    thisMonthEarnings: 0,
    thisMonthNetEarnings: 0,
    thisWeekEarnings: 0,
    thisWeekNetEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserAndEarnings();
  }, [navigate]);

  const loadUserAndEarnings = async () => {
    setLoading(true);
    const currentUser = await getCurrentUser();
    
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    await loadEarningsData(currentUser.id);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      loadEarnings(user.id);
    }
  }, [filter, user]);

  const loadEarningsData = async (userId: string) => {
    const summaryData = await getEarningsSummary(userId);
    setSummary(summaryData);
    await loadEarnings(userId);
  };

  const loadEarnings = async (userId: string) => {
    const data = await getDriverEarnings(userId, filter);
    setEarnings(data);
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading earnings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Earnings</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium opacity-90">Total Net Earnings</div>
                <DollarSign className="w-6 h-6 opacity-90" />
              </div>
              <div className="text-4xl font-bold">${summary.totalNetEarnings.toFixed(2)}</div>
              <div className="text-sm mt-1 opacity-90">After 15% platform fee</div>
              <div className="text-xs mt-2 opacity-75 border-t border-white/20 pt-2">
                Gross: ${summary.totalEarnings.toFixed(2)} • Fee: ${summary.totalPlatformFees.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center space-x-2 text-gray-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <div className="text-xs font-medium">This Week</div>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  ${summary.thisWeekNetEarnings.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Gross: ${summary.thisWeekEarnings.toFixed(2)}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center space-x-2 text-gray-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <div className="text-xs font-medium">This Month</div>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  ${summary.thisMonthNetEarnings.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Gross: ${summary.thisMonthEarnings.toFixed(2)}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center space-x-2 text-gray-600 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <div className="text-xs font-medium">Pending</div>
                </div>
                <div className="text-xl font-bold text-yellow-600">
                  ${summary.pendingEarnings.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex space-x-2 bg-white rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all min-h-touch ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('paid')}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all min-h-touch ${
                filter === 'paid'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Paid
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all min-h-touch ${
                filter === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Pending
            </button>
          </div>

          {/* Earnings List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Transaction History</h3>
            
            {earnings.length > 0 ? (
              <div className="space-y-2">
                {earnings.map((earning) => (
                  <div key={earning.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <div className="font-semibold text-gray-900">Ride #{earning.ride_id.slice(0, 8)}</div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            earning.status === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : earning.status === 'processing'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {earning.status.charAt(0).toUpperCase() + earning.status.slice(1)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {new Date(earning.date).toLocaleDateString('en-US', { 
                            month: 'long', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">
                          ${earning.net_amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">Net amount</div>
                      </div>
                    </div>
                    
                    {/* Earnings Breakdown */}
                    <div className="border-t border-gray-100 pt-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Gross Amount:</span>
                        <span className="font-medium text-gray-900">${earning.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Platform Fee (15%):</span>
                        <span className="font-medium text-red-600">-${earning.platform_fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1 mt-1">
                        <span className="text-gray-900">You Receive:</span>
                        <span className="text-green-600">${earning.net_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-gray-400" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">No earnings found</div>
                <div className="text-sm text-gray-600">
                  {filter === 'pending' ? 'No pending earnings' : filter === 'paid' ? 'No paid earnings yet' : 'Complete rides to start earning'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
