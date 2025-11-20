import React, { useState, useEffect } from 'react';
import { X, AlertCircle, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { getRefundEstimate, cancelRide } from '../services/cancellationService';
import type { RefundCalculation } from '../types';

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: string;
  userId: string;
  userRole: 'driver' | 'passenger';
  rideName: string;
  bookingId?: string; // Optional booking ID for segment pricing
  onCancellationSuccess: () => void;
}

export default function CancellationModal({
  isOpen,
  onClose,
  rideId,
  userId,
  userRole,
  rideName,
  bookingId,
  onCancellationSuccess,
}: CancellationModalProps) {
  const [step, setStep] = useState<'estimate' | 'confirm' | 'processing' | 'result'>('estimate');
  const [refundEstimate, setRefundEstimate] = useState<RefundCalculation | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRefundEstimate();
    } else {
      // Reset state when modal closes
      setStep('estimate');
      setReason('');
      setResult(null);
    }
  }, [isOpen, rideId]);

  const loadRefundEstimate = async () => {
    setLoading(true);
    try {
      const estimate = await getRefundEstimate(rideId, userRole, bookingId);
      setRefundEstimate(estimate);
    } catch (error) {
      console.error('Error loading refund estimate:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setStep('processing');
    setLoading(true);

    try {
      const cancellationResult = await cancelRide({
        rideId,
        cancelledBy: userId,
        cancelledByRole: userRole,
        reason: reason || undefined,
        bookingId,
      });

      setResult({
        success: cancellationResult.success,
        message: cancellationResult.message,
      });
      setStep('result');

      if (cancellationResult.success) {
        // Notify parent component after a delay
        setTimeout(() => {
          onCancellationSuccess();
          onClose();
        }, 2000);
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || 'Failed to cancel ride',
      });
      setStep('result');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end mobile:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white w-full mobile:max-w-md rounded-t-3xl mobile:rounded-2xl shadow-2xl"
        style={{
          maxHeight: 'calc(100vh - env(safe-area-inset-top) - 1rem)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Cancel Ride</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* Estimate Step */}
          {step === 'estimate' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Cancelling: {rideName}</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Review the refund policy before proceeding
                    </p>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-4">Calculating refund...</p>
                </div>
              ) : refundEstimate ? (
                <>
                  {/* Refund Summary */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Time until departure</span>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {refundEstimate.hoursBeforeDeparture.toFixed(1)} hours
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Refund percentage</span>
                        <span className={`text-lg font-bold ${
                          refundEstimate.refundPercentage === 100 ? 'text-green-600' :
                          refundEstimate.refundPercentage === 50 ? 'text-orange-600' :
                          'text-red-600'
                        }`}>
                          {refundEstimate.refundPercentage}%
                        </span>
                      </div>
                    </div>

                    {refundEstimate.refundEligible ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Refund amount</span>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-green-500" />
                            <span className="text-lg font-bold text-green-600">
                              ${refundEstimate.refundAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {refundEstimate.cancellationFee > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Cancellation fee</span>
                            <span className="text-sm font-medium text-red-600">
                              -${refundEstimate.cancellationFee.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">No refund available</span>
                      </div>
                    )}
                  </div>

                  {/* Cancellation Policy */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-amber-900 mb-2">
                      Cancellation Policy
                    </h4>
                    <ul className="text-xs text-amber-800 space-y-1">
                      <li>• 24+ hours before: 100% refund</li>
                      <li>• 12-24 hours before: 50% refund</li>
                      <li>• Less than 12 hours: No refund</li>
                    </ul>
                  </div>

                  {/* Reason Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for cancellation (optional)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Let us know why you're cancelling..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={onClose}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors"
                    >
                      Keep Ride
                    </button>
                    <button
                      onClick={() => setStep('confirm')}
                      className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 active:bg-red-700 transition-colors"
                    >
                      Cancel Ride
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Unable to calculate refund</p>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Step */}
          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Confirm Cancellation</p>
                    <p className="text-xs text-red-700 mt-1">
                      This action cannot be undone. Are you sure you want to cancel this ride?
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('estimate')}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 active:bg-red-700 transition-colors"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto"></div>
              <p className="text-sm text-gray-600 mt-4 font-medium">Processing cancellation...</p>
              <p className="text-xs text-gray-500 mt-2">Please wait</p>
            </div>
          )}

          {/* Result Step */}
          {step === 'result' && result && (
            <div className="space-y-6">
              <div
                className={`${
                  result.success
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                } border rounded-xl p-4`}
              >
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  ) : (
                    <AlertCircle className="w-10 h-10 text-red-600 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${
                      result.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {result.success ? 'Cancellation Successful' : 'Cancellation Failed'}
                    </p>
                    <p className={`text-xs mt-1 ${
                      result.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {result.message}
                    </p>
                  </div>
                </div>
              </div>

              {result.success && (
                <p className="text-center text-xs text-gray-500">
                  Closing automatically...
                </p>
              )}

              {!result.success && (
                <button
                  onClick={onClose}
                  className="w-full px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 active:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
