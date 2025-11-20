import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';

// Mock payout history data
const mockPayoutHistory = [
  { 
    id: '1', 
    date: '2025-11-10', 
    amount: 235.00, 
    status: 'completed' as const,
    bankAccount: '****1234',
    transactionId: 'TXN-001234'
  },
  { 
    id: '2', 
    date: '2025-11-03', 
    amount: 180.00, 
    status: 'completed' as const,
    bankAccount: '****1234',
    transactionId: 'TXN-001123'
  },
  { 
    id: '3', 
    date: '2025-10-27', 
    amount: 295.50, 
    status: 'completed' as const,
    bankAccount: '****1234',
    transactionId: 'TXN-000987'
  },
  { 
    id: '4', 
    date: '2025-10-20', 
    amount: 210.00, 
    status: 'completed' as const,
    bankAccount: '****1234',
    transactionId: 'TXN-000876'
  },
  { 
    id: '5', 
    date: '2025-11-17', 
    amount: 150.00, 
    status: 'pending' as const,
    bankAccount: '****1234',
    transactionId: 'TXN-001345'
  },
];

export default function PayoutHistoryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [payouts] = useState(mockPayoutHistory);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.userType !== 'driver') {
        navigate('/driver/home');
        return;
      }
      setUser(currentUser);
      setLoading(false);
    };
    
    checkAuth();
  }, [navigate]);

  const filteredPayouts = filter === 'all' 
    ? payouts 
    : payouts.filter(p => p.status === filter);

  const totalPaid = payouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = payouts
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading payout history...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

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
            <h1 className="text-xl font-bold text-gray-900">Payout History</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-2 text-gray-600 mb-2">
                <CheckCircle className="w-5 h-5" />
                <div className="text-sm font-medium">Total Paid</div>
              </div>
              <div className="text-2xl font-bold text-green-600">
                ${totalPaid.toFixed(2)}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-2 text-gray-600 mb-2">
                <Clock className="w-5 h-5" />
                <div className="text-sm font-medium">Pending</div>
              </div>
              <div className="text-2xl font-bold text-yellow-600">
                ${pendingAmount.toFixed(2)}
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
              onClick={() => setFilter('completed')}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all min-h-touch ${
                filter === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Completed
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

          {/* Payout List */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Transaction History</h3>
            
            {filteredPayouts.length > 0 ? (
              <div className="space-y-2">
                {filteredPayouts.map((payout) => (
                  <div key={payout.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <div className="font-semibold text-gray-900">
                            {new Date(payout.date).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            payout.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Bank Account: {payout.bankAccount}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Transaction ID: {payout.transactionId}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">
                          ${payout.amount.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {payout.status === 'pending' && (
                      <div className="text-xs text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
                        Processing • Estimated arrival: 2-3 business days
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-gray-400" />
                </div>
                <div className="font-semibold text-gray-900 mb-1">No payouts found</div>
                <div className="text-sm text-gray-600">
                  {filter === 'pending' ? 'No pending payouts' : 'No completed payouts yet'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
