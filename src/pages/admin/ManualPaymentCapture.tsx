import { useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

/**
 * Manual Payment Capture Tool
 * Admin tool to manually capture stuck payments for completed rides
 * 
 * Use case: When rides complete but payment capture fails
 */
export default function ManualPaymentCapture() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  // Hardcoded payment intent ID for the stuck payment
  const PAYMENT_INTENT_ID = 'e1a3edf5-28f3-4934-a93d-52061487b3c6';
  const RIDE_ID = '00980084-bae2-4443-86f7-d94470d0160e';

  const handleCapture = async () => {
    setLoading(true);
    setResult(null);

    try {
      console.log('🔄 Calling Stripe Edge Function to capture payment...');
      console.log('Payment Intent ID:', PAYMENT_INTENT_ID);

      const { data, error } = await supabase.functions.invoke('stripe-payment', {
        body: {
          action: 'capture',
          paymentIntentId: PAYMENT_INTENT_ID
        }
      });

      if (error) {
        throw error;
      }

      console.log('✅ Capture result:', data);

      setResult({
        success: true,
        message: 'Payment captured successfully!',
        details: data
      });
    } catch (err: any) {
      console.error('❌ Capture error:', err);
      
      setResult({
        success: false,
        message: err.message || 'Failed to capture payment',
        details: err
      });
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex-none bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Manual Payment Capture</h1>
              <p className="text-xs text-gray-500">Admin Tool</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Warning Banner */}
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-800 mb-1">Purpose</h3>
                  <p className="text-sm text-yellow-700 mb-3">
                    This tool manually captures stuck payments for completed rides.
                  </p>
                  <div className="text-sm text-yellow-700 space-y-1 font-mono">
                    <p><strong>Ride ID:</strong> {RIDE_ID}</p>
                    <p><strong>Payment Intent ID:</strong> {PAYMENT_INTENT_ID}</p>
                    <p><strong>Amount:</strong> $5.00 CAD</p>
                    <p><strong>Status:</strong> authorized (needs capture)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Capture Button */}
            <button
              onClick={handleCapture}
              disabled={loading || result?.success}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all ${
                result?.success
                  ? 'bg-green-600 cursor-not-allowed'
                  : loading
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-98'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Capturing payment...</span>
                </div>
              ) : result?.success ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>✅ Payment Captured</span>
                </div>
              ) : (
                'Capture Payment Now'
              )}
            </button>

            {/* Result Display */}
            {result && (
              <div
                className={`p-4 rounded-lg border-l-4 ${
                  result.success
                    ? 'bg-green-50 border-green-400'
                    : 'bg-red-50 border-red-400'
                }`}
              >
                <h3
                  className={`font-semibold mb-2 ${
                    result.success ? 'text-green-900' : 'text-red-900'
                  }`}
                >
                  {result.success ? '✅ Success' : '❌ Error'}
                </h3>
                <p
                  className={`text-sm mb-3 ${
                    result.success ? 'text-green-800' : 'text-red-800'
                  }`}
                >
                  {result.message}
                </p>
                {result.success && result.details && (
                  <div className="text-sm text-green-800 space-y-1 font-mono">
                    <p>
                      <strong>Captured Amount:</strong> $
                      {(result.details.capturedAmount / 100).toFixed(2)} CAD
                    </p>
                    <p>
                      <strong>Stripe Payment ID:</strong>{' '}
                      {result.details.stripePaymentIntentId}
                    </p>
                    <p>
                      <strong>Status:</strong> succeeded
                    </p>
                    {result.details.earningCreated && (
                      <p>
                        <strong>Driver Earning:</strong> Created ✅
                      </p>
                    )}
                  </div>
                )}
                {!result.success && result.details && (
                  <pre className="text-xs text-red-700 overflow-x-auto p-2 bg-red-100 rounded">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Info Box */}
            <div className="bg-gray-100 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">What this does:</h2>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>Calls the Supabase Edge Function to capture the Stripe payment</li>
                <li>Updates payment status from 'authorized' to 'succeeded'</li>
                <li>Creates driver earnings record</li>
                <li>Creates payment history record</li>
                <li>Transfers funds from rider to platform</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
