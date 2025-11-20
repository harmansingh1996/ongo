import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, Calendar, Check, Clock, XCircle, RefreshCw } from 'lucide-react';
import { getCurrentUser } from '../../services/authService';
import { getPaymentHistory, PaymentHistory } from '../../services/paymentService';
import { getUserRefunds } from '../../services/cancellationService';
import type { RefundTransaction } from '../../types';

const statusFilters = ['all', 'paid', 'authorized', 'pending', 'refunded'] as const;
type StatusFilter = typeof statusFilters[number];

const statusIcons = {
  paid: Check,
  authorized: Clock,
  pending: Clock,
  refunded: XCircle,
};

const statusColors = {
  paid: 'text-green-600 bg-green-100',
  authorized: 'text-yellow-600 bg-yellow-100',
  pending: 'text-gray-600 bg-gray-100',
  refunded: 'text-red-600 bg-red-100',
};

export default function PaymentHistoryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'payments' | 'refunds'>('payments');
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentHistory[]>([]);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPaymentHistory();
  }, []);

  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredPayments(payments);
    } else {
      setFilteredPayments(payments.filter(p => p.status === activeFilter));
    }
  }, [activeFilter, payments]);

  const loadPaymentHistory = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }

      // Load both payments and refunds
      const [history, refundHistory] = await Promise.all([
        getPaymentHistory(currentUser.id),
        getUserRefunds(currentUser.id)
      ]);
      
      setPayments(history);
      setRefunds(refundHistory);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments.filter(p => p.status === 'authorized' || p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  const totalRefunded = refunds.filter(r => r.transaction_status === 'completed').reduce((sum, r) => sum + r.refund_amount, 0);
  const pendingRefunds = refunds.filter(r => r.transaction_status === 'pending' || r.transaction_status === 'processing').reduce((sum, r) => sum + r.refund_amount, 0);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
    <div className="w-full h-dvh bg-gray-50">
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
            <h1 className="text-xl font-bold text-gray-900">Payment History</h1>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex-none px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('payments')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'payments'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            >
              Payments
            </button>
            <button
              onClick={() => setActiveTab('refunds')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'refunds'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
            >
              Refunds
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="flex-none px-4 py-4 bg-white border-b border-gray-200">
          {activeTab === 'payments' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-green-700 mb-1">Total Paid</p>
                <p className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3">
                <p className="text-xs text-yellow-700 mb-1">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">${totalPending.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-700 mb-1">Total Refunded</p>
                <p className="text-2xl font-bold text-blue-600">${totalRefunded.toFixed(2)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-xs text-orange-700 mb-1">Pending Refunds</p>
                <p className="text-2xl font-bold text-orange-600">${pendingRefunds.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>

        {activeTab === 'payments' ? (
          <>
            {/* Filters */}
            <div className="flex-none px-4 py-3 bg-white border-b border-gray-200 overflow-x-auto">
              <div className="flex gap-2">
                {statusFilters.map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap ${
                      activeFilter === filter 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                    }`}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {filteredPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <DollarSign className="w-16 h-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Payments</h3>
                  <p className="text-sm text-gray-600">
                    {activeFilter === 'all' 
                      ? 'No payment history available' 
                      : `No ${activeFilter} payments`}
                  </p>
                </div>
              ) : (
                filteredPayments.map(payment => {
                  const StatusIcon = statusIcons[payment.status];
                  return (
                    <div key={payment.id} className="bg-white rounded-xl shadow-md p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${statusColors[payment.status]}`}>
                            <StatusIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">${payment.amount.toFixed(2)}</p>
                            <p className="text-xs text-gray-600">{payment.payment_method}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[payment.status]}`}>
                          {payment.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(payment.date)}</span>
                        </div>
                        <span>ID: {payment.transaction_id}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {/* Refund List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {refunds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <RefreshCw className="w-16 h-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Refunds</h3>
                  <p className="text-sm text-gray-600">
                    No refund transactions available
                  </p>
                </div>
              ) : (
                refunds.map(refund => {
                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'completed':
                        return 'text-green-600 bg-green-100';
                      case 'processing':
                        return 'text-blue-600 bg-blue-100';
                      case 'pending':
                        return 'text-yellow-600 bg-yellow-100';
                      case 'failed':
                        return 'text-red-600 bg-red-100';
                      case 'cancelled':
                        return 'text-gray-600 bg-gray-100';
                      default:
                        return 'text-gray-600 bg-gray-100';
                    }
                  };

                  const getStatusIcon = (status: string) => {
                    switch (status) {
                      case 'completed':
                        return Check;
                      case 'processing':
                      case 'pending':
                        return Clock;
                      case 'failed':
                      case 'cancelled':
                        return XCircle;
                      default:
                        return Clock;
                    }
                  };

                  const StatusIcon = getStatusIcon(refund.transaction_status);
                  
                  return (
                    <div key={refund.id} className="bg-white rounded-xl shadow-md p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${getStatusColor(refund.transaction_status)}`}>
                            <StatusIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-blue-600">+${refund.refund_amount.toFixed(2)}</p>
                            <p className="text-xs text-gray-600">{refund.refund_method}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(refund.transaction_status)}`}>
                          {refund.transaction_status.toUpperCase()}
                        </span>
                      </div>

                      {/* Ride Information */}
                      {refund.rides && (
                        <div className="bg-gray-50 rounded-lg p-2 mb-3">
                          <p className="text-xs text-gray-600 mb-1">Ride Details:</p>
                          <p className="text-xs font-medium text-gray-900">
                            {refund.rides.from_address} → {refund.rides.to_address}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(refund.rides.date).toLocaleDateString()} at {refund.rides.time}
                          </p>
                        </div>
                      )}

                      {/* Cancellation Info */}
                      {refund.cancellations && (
                        <div className="bg-blue-50 rounded-lg p-2 mb-3">
                          <p className="text-xs text-blue-700">
                            Refund: {refund.cancellations.refund_percentage}% of original amount
                          </p>
                          {refund.cancellations.cancellation_reason && (
                            <p className="text-xs text-gray-600 mt-1">
                              Reason: {refund.cancellations.cancellation_reason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Transaction Details */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(refund.created_at)}</span>
                        </div>
                        {refund.transaction_reference && (
                          <span>Ref: {refund.transaction_reference}</span>
                        )}
                      </div>

                      {/* Error Message */}
                      {refund.error_message && refund.transaction_status === 'failed' && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700">
                            Error: {refund.error_message}
                          </p>
                          {refund.retry_count > 0 && (
                            <p className="text-xs text-red-600 mt-1">
                              Retry attempts: {refund.retry_count}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Processing Info */}
                      {refund.processed_at && (
                        <div className="mt-2 text-xs text-gray-500">
                          Processed: {formatDate(refund.processed_at)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
