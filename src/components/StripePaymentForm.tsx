import { useState } from 'react';
import { 
  PaymentElement, 
  useStripe, 
  useElements 
} from '@stripe/react-stripe-js';
import { Check, AlertCircle, Loader } from 'lucide-react';

interface StripePaymentFormProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  amount: number;
}

/**
 * Stripe Payment Form Component
 * Collects payment method and confirms payment intent
 */
export default function StripePaymentForm({ 
  onSuccess, 
  onError, 
  amount 
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError('Stripe not loaded');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Confirm payment with Stripe
      const { error: submitError } = await elements.submit();
      
      if (submitError) {
        setError(submitError.message || 'Payment submission failed');
        setProcessing(false);
        onError(submitError.message || 'Payment submission failed');
        return;
      }

      // Confirm the payment
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required', // Stay on page after payment
        confirmParams: {
          return_url: window.location.origin + '/rider/trips',
        },
      });

      if (confirmError) {
        setError(confirmError.message || 'Payment confirmation failed');
        setProcessing(false);
        onError(confirmError.message || 'Payment confirmation failed');
        return;
      }

      // Payment succeeded
      if (paymentIntent && paymentIntent.status === 'requires_capture') {
        setProcessing(false);
        onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Automatic capture (shouldn't happen with manual capture)
        setProcessing(false);
        onSuccess();
      } else {
        setError('Unexpected payment status: ' + paymentIntent?.status);
        setProcessing(false);
        onError('Unexpected payment status');
      }
    } catch (err) {
      console.error('Payment error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      setError(errorMessage);
      setProcessing(false);
      onError(errorMessage);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Payment Element */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <PaymentElement 
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'google_pay', 'apple_pay'],
          }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">Payment Error</p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg"
      >
        {processing ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Processing Payment...
          </>
        ) : (
          <>
            <Check className="w-5 h-5" />
            Authorize ${(amount / 100).toFixed(2)}
          </>
        )}
      </button>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>Secure Authorization:</strong> Your payment method will be authorized but not charged until the ride is completed. The hold will be released if the ride is cancelled.
        </p>
      </div>
    </form>
  );
}
