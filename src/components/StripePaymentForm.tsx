import React from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';

type StripePaymentFormProps =
  | {
      mode: 'payment';
      clientSecret: string;
      onSuccess: (paymentIntent: any) => void;
      onError: (error: string) => void;
      processing: boolean;
      setProcessing: (processing: boolean) => void;
      submitLabel?: string;
      paymentMethodOptions?: {
        setupFutureUsage?: 'on_session' | 'off_session';
      };
    }
  | {
      mode: 'setup';
      clientSecret: string;
      onSuccess: (setupIntent: any) => void;
      onError: (error: string) => void;
      processing: boolean;
      setProcessing: (processing: boolean) => void;
      submitLabel?: string;
    };

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  clientSecret,
  onSuccess,
  onError,
  processing,
  setProcessing,
  submitLabel,
  ...rest
}) => {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements) {
      onError('Stripe has not finished loading. Please wait a moment and try again.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      onError('Card input is not available. Please refresh the page and try again.');
      return;
    }

    setProcessing(true);

    try {
      if (rest.mode === 'setup') {
        const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!setupIntent) {
          throw new Error('Stripe did not return a setup intent.');
        }

        if (setupIntent.status === 'succeeded') {
          onSuccess(setupIntent);
        } else {
          throw new Error(`Unexpected setup intent status: ${setupIntent.status}`);
        }
      } else {
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
          },
          setup_future_usage: rest.paymentMethodOptions?.setupFutureUsage,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!paymentIntent) {
          throw new Error('Stripe did not return a payment intent.');
        }

        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
          onSuccess(paymentIntent);
        } else {
          throw new Error(`Unexpected payment status: ${paymentIntent.status}`);
        }
      }
    } catch (err) {
      console.error('Stripe confirmation failed:', err);
      onError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Card Details
        </label>
        <div className="p-3 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white">
          <CardElement
            options={{
              style: {
                base: {
                  color: '#1f2937',
                  fontFamily: '"Inter", sans-serif',
                  fontSize: '16px',
                  '::placeholder': {
                    color: '#9ca3af',
                  },
                },
                invalid: {
                  color: '#ef4444',
                },
              },
            }}
          />
        </div>
      </div>

      <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <Lock className="w-4 h-4 mr-2" />
        <span>Your payment information is encrypted and secure</span>
      </div>

      <button
        type="submit"
        disabled={processing || !stripe || !elements}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          submitLabel || (rest.mode === 'setup' ? 'Save Card' : 'Authorize Payment')
        )}
      </button>
    </form>
  );
};

export default StripePaymentForm;