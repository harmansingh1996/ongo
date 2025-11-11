import { useEffect, useMemo, useState } from 'react';
import { X, CreditCard, Lock, Check, Plus, Wallet } from 'lucide-react';
import { PaymentHoldService, PaymentHoldData } from '../lib/paymentHoldService';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import PayPalButton from './PayPalButton';
import StripePaymentForm from './StripePaymentForm';
import {
  ensureStripeCustomer,
  listStripeCardPaymentMethods,
  createStripeSetupIntent,
  attachStripePaymentMethod,
  updateCustomerDefaultPaymentMethod,
  retrieveStripePaymentMethod,
  PaymentServiceResponseError,
  StripePaymentMethod as StripePaymentMethodDetails,
} from '../lib/stripeCustomerClient';
import type { User } from '../types';
import { formatCurrency } from '../utils/currency';

interface PaymentMethod {
  id: string;
  displayLabel: string;
  subtitle?: string;
  type: 'card' | 'paypal';
  processor: 'stripe' | 'paypal';
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  stripePaymentMethodId?: string;
  isDefault?: boolean;
}

interface PaymentModalProps {
  amount: number;
  bookingId?: number;
  userId?: string;
  usePaymentHold?: boolean;
  onSuccess: (paymentData: any) => void;
  onCancel: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  amount,
  bookingId,
  userId,
  usePaymentHold = false,
  onSuccess,
  onCancel,
}) => {
  const { user } = useAuthStore();
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [useNewMethod, setUseNewMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState<'card' | 'paypal'>('card');
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [stripeMethods, setStripeMethods] = useState<StripePaymentMethodDetails[]>([]);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeFormError, setStripeFormError] = useState<string | null>(null);
  const [initializingStripe, setInitializingStripe] = useState(false);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === selectedMethodId) || null,
    [paymentMethods, selectedMethodId]
  );

  useEffect(() => {
    if (!user) return;
    loadPaymentMethods(user);
  }, [user]);

  useEffect(() => {
    if (!useNewMethod || newMethodType !== 'card' || !stripeCustomerId) {
      return;
    }

    if (setupClientSecret || initializingStripe) {
      return;
    }

    const createIntent = async () => {
      try {
        setInitializingStripe(true);
        setStripeFormError(null);
        const { client_secret } = await createStripeSetupIntent(stripeCustomerId);
        setSetupClientSecret(client_secret);
      } catch (error) {
        console.error('Failed to create Stripe setup intent:', error);
        setStripeFormError('Unable to initialize card entry. Please try again later or use PayPal.');
      } finally {
        setInitializingStripe(false);
      }
    };

    createIntent();
  }, [useNewMethod, newMethodType, stripeCustomerId, setupClientSecret, initializingStripe]);

  const loadPaymentMethods = async (authUser: User) => {
    setLoadingMethods(true);
    setStripeError(null);
    setSetupClientSecret(null);

    try {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      const customer = await ensureStripeCustomer(
        {
          id: authUser.id,
          email: authUser.email || profile.email,
          display_name: profile.display_name,
        } as User,
        profile?.stripe_customer_id
      );

      if (customer.id !== profile?.stripe_customer_id) {
        await supabase
          .from('users')
          .update({ stripe_customer_id: customer.id })
          .eq('id', authUser.id);
      }

      setStripeCustomerId(customer.id);
      const stripePaymentMethods = await listStripeCardPaymentMethods(customer.id);
      setStripeMethods(stripePaymentMethods);

      const cardMethods: PaymentMethod[] = stripePaymentMethods.map((method) => ({
        id: method.id,
        displayLabel: method.card
          ? `•••• ${method.card.last4}`
          : 'Saved Card',
        subtitle: method.card
          ? `Expires ${method.card.exp_month}/${method.card.exp_year}`
          : undefined,
        type: 'card',
        processor: 'stripe',
        brand: method.card?.brand,
        last4: method.card?.last4,
        expMonth: method.card?.exp_month,
        expYear: method.card?.exp_year,
        stripePaymentMethodId: method.id,
        isDefault: method.id === customer.invoice_settings?.default_payment_method,
      }));

      const { data: paypalData, error: paypalError } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .eq('type', 'paypal')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (paypalError) {
        throw paypalError;
      }

      const paypalMethods: PaymentMethod[] = (paypalData || []).map((method: any) => ({
        id: method.id,
        displayLabel: method.email || 'PayPal Account',
        subtitle: 'PayPal',
        type: 'paypal',
        processor: 'paypal',
        isDefault: Boolean(method.is_default),
      }));

      const combined = [...cardMethods, ...paypalMethods];
      setPaymentMethods(combined);

      if (combined.length > 0) {
        const defaultMethod = combined.find((method) => method.isDefault) || combined[0];
        setSelectedMethodId(defaultMethod.id);
        setUseNewMethod(false);
      } else {
        setUseNewMethod(true);
        setSelectedMethodId(null);
      }

      setSavePaymentMethod(cardMethods.length === 0);
      setSetAsDefault(cardMethods.length === 0);
    } catch (error) {
      if (error instanceof PaymentServiceResponseError) {
        console.warn('Stripe payment methods unavailable:', error.message, error.details);
        if (error.code === 'PAYMENT_SERVICE_HTTP_ERROR' && error.details.status === 403) {
          setStripeError(
            'Stripe backend rejected the request (403). Confirm your server deployment and STRIPE_SECRET_KEY configuration. You can continue with PayPal.'
          );
        } else if (error.code === 'PAYMENT_SERVICE_HTML_RESPONSE') {
          setStripeError('Stripe backend is offline. Please deploy the serverless functions or continue with PayPal.');
        } else {
          setStripeError('Stripe is currently unavailable. You can continue with PayPal.');
        }
      } else {
        console.error('Failed to load payment methods:', error);
        setStripeError('Stripe is currently unavailable. You can continue with PayPal.');
      }
      setPaymentMethods([]);
      setSelectedMethodId(null);
      setUseNewMethod(true);
      setNewMethodType('paypal');
    } finally {
      setLoadingMethods(false);
    }
  };

  const handleCreatePaymentHold = async (
    paymentMethodData: PaymentHoldData['paymentMethod'],
    stripeCustomer?: string
  ) => {
    if (!bookingId || !userId) {
      throw new Error('Missing booking information for payment authorization.');
    }

    if (paymentMethodData.type === 'stripe' && !stripeCustomer) {
      throw new Error('Unable to verify Stripe customer. Please refresh and try again.');
    }

    const holdData: PaymentHoldData = {
      amount,
      paymentMethod: paymentMethodData,
      bookingId,
      userId,
      stripeCustomerId: stripeCustomer,
    };

    const result = await PaymentHoldService.createPaymentHold(holdData);
    if (!result.success) {
      throw new Error(result.error || 'Payment authorization failed.');
    }

    return {
      paymentIntentId: result.authorizationId,
      paymentId: result.paymentId,
      transactionId: null,
      paymentMethod: paymentMethodData.type,
      paymentMethodId: paymentMethodData.id,
      amount,
      currency: 'CAD',
      status: 'authorized',
      expiresAt: result.expiresAt,
      isHold: true,
    };
  };

  const handleSavedPayment = async () => {
    if (!selectedPaymentMethod || selectedPaymentMethod.processor !== 'stripe') {
      return;
    }

    try {
      setProcessing(true);

      if (!stripeCustomerId) {
        throw new Error('Unable to verify Stripe customer. Please refresh and try again.');
      }

      const summary = stripeMethods.find((method) => method.id === selectedPaymentMethod.stripePaymentMethodId);
      const paymentData = await handleCreatePaymentHold(
        {
          id: selectedPaymentMethod.stripePaymentMethodId!,
          type: 'stripe',
          last4: summary?.card?.last4,
          brand: summary?.card?.brand,
        },
        stripeCustomerId
      );

      onSuccess(paymentData);
    } catch (error) {
      console.error('Failed to authorize payment with saved method:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Payment authorization failed. Please try again.';
      alert(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleStripeSetupSuccess = async (setupIntent: any) => {
    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!paymentMethodId) {
      setStripeFormError('Unable to obtain payment method information.');
      return;
    }

    try {
      setProcessing(true);
      setStripeFormError(null);

      if (!stripeCustomerId) {
        throw new Error('Unable to verify Stripe customer.');
      }

      let paymentMethodDetails = stripeMethods.find((method) => method.id === paymentMethodId);
      if (!paymentMethodDetails) {
        paymentMethodDetails = await retrieveStripePaymentMethod(paymentMethodId);
      }

      if (!paymentMethodDetails || !paymentMethodDetails.card) {
        throw new Error('Unable to load card details from Stripe.');
      }

      if (savePaymentMethod) {
        await attachStripePaymentMethod(stripeCustomerId, paymentMethodId, setAsDefault);
      } else if (setAsDefault) {
        await updateCustomerDefaultPaymentMethod(stripeCustomerId, paymentMethodId);
      }

      const paymentData = await handleCreatePaymentHold(
        {
          id: paymentMethodId,
          type: 'stripe',
          last4: paymentMethodDetails.card.last4,
          brand: paymentMethodDetails.card.brand,
        },
        stripeCustomerId
      );

      if (savePaymentMethod || paymentMethods.length === 0) {
        await loadPaymentMethods(user as User);
      }

      onSuccess(paymentData);
    } catch (error) {
      console.error('Failed to authorize payment with new card:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Payment authorization failed. Please try again.';
      setStripeFormError(message);
    } finally {
      setProcessing(false);
      setStripeSubmitting(false);
    }
  };

  const handlePayPalSuccess = async (paymentData: any) => {
    if (paymentMethods.filter((method) => method.processor === 'paypal').length === 0 && userId) {
      await supabase
        .from('payment_methods')
        .insert([
          {
            user_id: userId,
            type: 'paypal',
            email: 'PayPal Account',
            is_default: paymentMethods.length === 0,
            is_active: true,
          },
        ]);
    }

    onSuccess(paymentData);
  };

  const getMethodIcon = (method: PaymentMethod) => {
    if (method.processor === 'stripe') {
      return <CreditCard size={20} className="text-gray-600" />;
    }

    switch (method.type) {
      case 'paypal':
        return <Wallet size={20} className="text-blue-600" />;
      case 'card':
        return <CreditCard size={20} className="text-gray-600" />;
      default:
        return <CreditCard size={20} className="text-gray-600" />;
    }
  };

  const canAuthorizeWithSavedMethod =
    !!selectedPaymentMethod &&
    selectedPaymentMethod.processor === 'stripe' &&
    !useNewMethod;

  const summaryAmountLabel = usePaymentHold ? 'Authorization Amount:' : 'Total Amount:';
  const formattedAmount = formatCurrency(amount, { currency: 'CAD' });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Complete Payment</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            disabled={processing || stripeSubmitting}
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Payment Summary</h3>
            <div className="space-y-2 text-sm">
              {usePaymentHold && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center space-x-2 mb-2">
                    <Lock size={16} className="text-blue-600" />
                    <span className="font-medium text-blue-900">Payment Authorization</span>
                  </div>
                  <p className="text-blue-700 text-sm">
                    Your payment will be authorized but not charged until the driver accepts your ride request.
                    If declined or no response within 12 hours, you'll receive a full refund automatically.
                  </p>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-3">
                <span className="font-semibold text-gray-900">{summaryAmountLabel}</span>
                <span className="font-bold text-gray-900">{formattedAmount}</span>
              </div>
            </div>
          </div>

          {loadingMethods ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600">Loading payment methods...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Select Payment Method</h3>
                {stripeError && (
                  <span className="text-xs text-red-600 font-medium">{stripeError}</span>
                )}
              </div>

              {paymentMethods.length > 0 && !useNewMethod && (
                <div className="space-y-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`w-full text-left p-4 border rounded-xl transition-all ${
                        selectedMethodId === method.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={processing || stripeSubmitting}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getMethodIcon(method)}
                          <div>
                            <div className="font-medium text-gray-900">{method.displayLabel}</div>
                            {method.subtitle && (
                              <div className="text-sm text-gray-500">{method.subtitle}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {method.isDefault && (
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                              Default
                            </span>
                          )}
                          {selectedMethodId === method.id && <Check size={20} className="text-blue-600" />}
                        </div>
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => {
                      setUseNewMethod(true);
                      setSetupClientSecret(null);
                      setStripeFormError(null);
                    }}
                    className="w-full p-4 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors flex items-center justify-center space-x-2 text-gray-600"
                    disabled={processing || stripeSubmitting}
                  >
                    <Plus size={20} />
                    <span>Add New Payment Method</span>
                  </button>
                </div>
              )}

              {(useNewMethod || paymentMethods.length === 0) && (
                <div className="space-y-4">
                  {paymentMethods.length > 0 && (
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">Add New Payment Method</h4>
                      <button
                        onClick={() => {
                          setUseNewMethod(false);
                          setSetupClientSecret(null);
                          setStripeFormError(null);
                          if (paymentMethods.length > 0) {
                            setSelectedMethodId(paymentMethods[0].id);
                          }
                        }}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        disabled={processing || stripeSubmitting}
                      >
                        Use Saved Method
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        setNewMethodType('card');
                        setStripeFormError(null);
                        setSetupClientSecret(null);
                      }}
                      className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                        newMethodType === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={processing || stripeSubmitting || !!stripeError}
                    >
                      <CreditCard size={16} />
                      <span className="text-sm font-medium">Card</span>
                    </button>
                    <button
                      onClick={() => {
                        setNewMethodType('paypal');
                        setStripeFormError(null);
                        setSetupClientSecret(null);
                      }}
                      className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                        newMethodType === 'paypal'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      disabled={processing || stripeSubmitting}
                    >
                      <Wallet size={16} />
                      <span className="text-sm font-medium">PayPal</span>
                    </button>
                  </div>

                  {newMethodType === 'card' && !stripeError && (
                    <div className="space-y-4">
                      {stripeFormError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                          {stripeFormError}
                        </div>
                      )}

                      {initializingStripe && !setupClientSecret ? (
                        <div className="text-center py-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-4 border-blue-500 border-t-transparent mx-auto mb-3" />
                          <p className="text-gray-600 text-sm">Preparing secure card entry…</p>
                        </div>
                      ) : setupClientSecret ? (
                        <StripePaymentForm
                          mode="setup"
                          clientSecret={setupClientSecret}
                          onSuccess={handleStripeSetupSuccess}
                          onError={(message) => setStripeFormError(message)}
                          processing={stripeSubmitting}
                          setProcessing={setStripeSubmitting}
                          submitLabel={usePaymentHold ? `Authorize ${formattedAmount}` : `Pay ${formattedAmount}`}
                        />
                      ) : (
                        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                          Secure card entry is unavailable at the moment. Please try again or use PayPal.
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <input
                            id="save-payment-method"
                            type="checkbox"
                            checked={savePaymentMethod}
                            onChange={(event) => setSavePaymentMethod(event.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            disabled={stripeSubmitting || processing}
                          />
                          <label htmlFor="save-payment-method" className="text-sm text-gray-700">
                            Save this card for future rides
                          </label>
                        </div>

                        {(paymentMethods.some((method) => method.processor === 'stripe') || !savePaymentMethod) && (
                          <div className="flex items-center space-x-3 ml-7">
                            <input
                              id="set-default-payment-method"
                              type="checkbox"
                              checked={setAsDefault}
                              onChange={(event) => setSetAsDefault(event.target.checked)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              disabled={stripeSubmitting || processing}
                            />
                            <label htmlFor="set-default-payment-method" className="text-sm text-gray-700">
                              Set as default payment method
                            </label>
                          </div>
                        )}

                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 flex items-start space-x-2">
                          <Lock size={16} className="text-gray-500 mt-0.5" />
                          <p>
                            Your card details are encrypted by Stripe. We never store sensitive card numbers on our
                            servers.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {newMethodType === 'card' && stripeError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {stripeError}
                    </div>
                  )}

                  {newMethodType === 'paypal' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="text-center mb-4">
                        <Wallet size={32} className="text-blue-600 mx-auto mb-2" />
                        <p className="text-blue-800 font-medium">PayPal</p>
                        <p className="text-blue-600 text-sm">
                          {usePaymentHold
                            ? "PayPal will authorize this payment. You'll only be charged if the driver accepts your ride."
                            : "You'll be redirected to PayPal to complete payment."}
                        </p>
                      </div>
                      <PayPalButton
                        amount={amount}
                        currency="CAD"
                        intent={usePaymentHold ? 'authorize' : 'capture'}
                        bookingId={bookingId}
                        userId={userId}
                        onSuccess={handlePayPalSuccess}
                        onError={(error) => {
                          console.error('PayPal payment error:', error);
                          const message =
                            error instanceof Error
                              ? error.message
                              : 'PayPal payment failed. Please try again.';
                          alert(message);
                        }}
                        onCancel={() => {
                          console.log('PayPal payment cancelled');
                        }}
                        style={{
                          layout: 'vertical',
                          color: 'gold',
                          shape: 'rect',
                          label: 'pay',
                          tagline: false,
                          height: 45,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {canAuthorizeWithSavedMethod && (
            <div className="flex space-x-3 pt-4">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors"
                disabled={processing || stripeSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSavedPayment}
                disabled={processing || stripeSubmitting}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    <span>Processing…</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <Lock size={16} />
                    <span>{usePaymentHold ? `Authorize ${formattedAmount}` : `Pay ${formattedAmount}`}</span>
                  </div>
                )}
              </button>
            </div>
          )}

          {!canAuthorizeWithSavedMethod && newMethodType !== 'paypal' && !useNewMethod && paymentMethods.length > 0 && (
            <div className="flex justify-end pt-4">
              <button
                onClick={onCancel}
                className="px-8 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium transition-colors"
                disabled={processing || stripeSubmitting}
              >
                Cancel
              </button>
            </div>
          )}

          {newMethodType === 'paypal' && useNewMethod && (
            <div className="flex justify-center pt-4">
              <button
                onClick={onCancel}
                className="px-8 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium transition-colors"
                disabled={processing || stripeSubmitting}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
