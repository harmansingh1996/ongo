import React from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { PayPalService } from '../lib/paypalService';

const PAYPAL_BACKEND_MESSAGE =
  'PayPal requires a secure backend to request access tokens. Please deploy the PayPal server endpoint before enabling PayPal payments.';

function normalizePayPalError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.includes('secure server')) {
      return new Error(PAYPAL_BACKEND_MESSAGE);
    }
    return error;
  }
  return new Error('PayPal payment failed. Please try again later.');
}

interface PayPalButtonProps {
  amount: number;
  currency?: string;
  bookingId?: number;
  userId?: string;
  intent?: 'capture' | 'authorize';
  onSuccess: (paymentData: any) => void;
  onError: (error: any) => void;
  onCancel?: () => void;
  disabled?: boolean;
  style?: {
    layout?: 'vertical' | 'horizontal';
    color?: 'gold' | 'blue' | 'silver' | 'white' | 'black';
    shape?: 'rect' | 'pill';
    label?: 'paypal' | 'checkout' | 'buynow' | 'pay' | 'installment';
    tagline?: boolean;
    height?: number;
  };
}

const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount,
  currency = 'CAD',
  bookingId,
  userId,
  intent = 'capture',
  onSuccess,
  onError,
  onCancel,
  disabled = false,
  style = {},
}) => {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();

  const defaultStyle = {
    layout: 'vertical' as const,
    color: 'gold' as const,
    shape: 'rect' as const,
    label: 'pay' as const,
    tagline: false,
    height: 45,
    ...style,
  };

  const createOrder = async () => {
    try {
      // Log PayPal environment info
      const envInfo = PayPalService.getEnvironmentInfo();
      console.log(`🔄 Creating PayPal order in ${envInfo.mode.toUpperCase()} mode`);
      console.log(`Amount: ${amount} ${currency}, Intent: ${intent}`);
      
      if (envInfo.isLive) {
        console.log('✅ LIVE PayPal payment - will process real money');
      } else {
        console.log('⚠️ SANDBOX PayPal payment - test mode only');
      }
      if (intent === 'authorize' && bookingId && userId) {
        // Create payment hold for ride authorization
        const paymentHold = await PayPalService.createPaymentHold(
          amount,
          currency,
          bookingId,
          userId
        );
        if (!paymentHold?.orderId) {
          throw new Error('Unable to create PayPal payment hold. Confirm backend configuration.');
        }
        return paymentHold.orderId;
      }

      // Regular payment creation
      const order = await PayPalService.createOrder(amount, currency, 'CAPTURE', {
        bookingId,
        userId,
        description: bookingId ? `Booking #${bookingId}` : undefined,
      });
      if (!order?.id) {
        throw new Error('PayPal order creation returned no identifier.');
      }
      return order.id;
    } catch (error) {
      console.error('Error creating PayPal order:', error);
      const normalized = normalizePayPalError(error);
      onError(normalized);
      alert(normalized.message);
      throw normalized;
    }
  };

  const onApprove = async (data: any) => {
    try {
      if (intent === 'authorize' && bookingId && userId) {
        // Process authorization for payment hold
        const paymentData = await PayPalService.processAuthorization(
          data.orderID,
          bookingId,
          userId
        );

        onSuccess({
          paymentIntentId: paymentData.authorizationId,
          transactionId: paymentData.orderId,
          paymentMethod: 'paypal',
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: 'requires_capture',
          authorization_id: paymentData.authorizationId,
        });
      } else if (bookingId && userId) {
        // Process regular payment for ride booking
        const paymentData = await PayPalService.processPayment(
          data.orderID,
          bookingId,
          userId,
          amount
        );

        onSuccess({
          paymentIntentId: paymentData.paymentId,
          transactionId: paymentData.orderId,
          paymentMethod: 'paypal',
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: 'succeeded',
        });
      } else {
        // Generic payment capture
        const captureData = await PayPalService.captureOrder(data.orderID);
        onSuccess({
          paymentIntentId: captureData.id,
          transactionId: data.orderID,
          paymentMethod: 'paypal',
          amount: amount,
          currency: currency,
          status: 'succeeded',
        });
      }
    } catch (error) {
      console.error('PayPal payment error:', error);
      const normalized = normalizePayPalError(error);
      onError(normalized);
      alert(normalized.message);
    }
  };

  const onCancelHandler = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const onErrorHandler = (error: any) => {
    console.error('PayPal error:', error);
    const normalized = normalizePayPalError(error);
    onError(normalized);
    alert(normalized.message);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading PayPal...</span>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="text-red-600 p-4 text-center">
        PayPal failed to load. Please refresh the page and try again.
      </div>
    );
  }

  return (
    <div className={`paypal-button-container ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <PayPalButtons
        style={defaultStyle}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancelHandler}
        onError={onErrorHandler}
        disabled={disabled}
      />
    </div>
  );
};

export default PayPalButton;