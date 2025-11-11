import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  DollarSign,
  CreditCard,
  Wallet,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Plus,
  Shield,
  ExternalLink,
  Loader
} from 'lucide-react';
import { EarningsService } from '../lib/earningsService';
import { useAuthStore } from '../store/authStore';
import { formatPayout } from '../utils/currency';
import { PayoutMethod } from '../types';
import * as StripeConnectService from '../lib/stripeConnectService';

interface PayoutRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableAmount: number;
  onSuccess: () => void;
}

interface CanadianBank {
  id: string;
  name: string;
  institutionNumber: string;
  shortName: string;
}

const CANADIAN_BANKS: CanadianBank[] = [
  { id: 'bmo', name: 'Bank of Montreal (BMO)', institutionNumber: '001', shortName: 'BMO' },
  { id: 'scotia', name: 'The Bank of Nova Scotia (Scotiabank)', institutionNumber: '002', shortName: 'Scotiabank' },
  { id: 'rbc', name: 'Royal Bank of Canada (RBC)', institutionNumber: '003', shortName: 'RBC' },
  { id: 'td', name: 'The Toronto-Dominion Bank (TD)', institutionNumber: '004', shortName: 'TD' },
  { id: 'national', name: 'National Bank of Canada', institutionNumber: '006', shortName: 'National Bank' },
  { id: 'cibc', name: 'Canadian Imperial Bank of Commerce (CIBC)', institutionNumber: '010', shortName: 'CIBC' },
  { id: 'hsbc', name: 'HSBC Bank Canada', institutionNumber: '016', shortName: 'HSBC' },
  { id: 'desjardins', name: 'Desjardins Credit Union', institutionNumber: '815', shortName: 'Desjardins' },
  { id: 'tangerine', name: 'Tangerine Bank', institutionNumber: '614', shortName: 'Tangerine' },
  { id: 'presidents', name: "President's Choice Financial", institutionNumber: '623', shortName: 'PC Financial' }
];

const PayoutRequestModal: React.FC<PayoutRequestModalProps> = ({
  isOpen,
  onClose,
  availableAmount,
  onSuccess
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [requestAmount, setRequestAmount] = useState(availableAmount);
  const [error, setError] = useState('');

  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMethodType, setNewMethodType] = useState<'bank_transfer' | 'paypal'>('bank_transfer');
  const [selectedBank, setSelectedBank] = useState<CanadianBank | null>(null);
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [newMethodData, setNewMethodData] = useState({
    accountHolderName: '',
    institutionNumber: '',
    transitNumber: '',
    accountNumber: '',
    paypalEmail: '',
    makeDefault: true
  });
  const [savingMethod, setSavingMethod] = useState(false);

  // Stripe Connect onboarding state
  const [stripeAccountStatus, setStripeAccountStatus] = useState<StripeConnectService.AccountStatus | null>(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);
  const [stripeOnboardingLoading, setStripeOnboardingLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    const loadMethods = async () => {
      try {
        setMethodsLoading(true);
        const methods = await EarningsService.fetchPayoutMethods(user.id);
        setPayoutMethods(methods);
        if (methods.length > 0) {
          const defaultMethod = methods.find((method) => method.is_default);
          setSelectedMethodId(defaultMethod?.id ?? methods[0].id);
          setShowAddForm(false);
        } else {
          setSelectedMethodId(null);
          setShowAddForm(true);
        }
      } catch (fetchError) {
        console.error('Error loading payout methods:', fetchError);
      } finally {
        setMethodsLoading(false);
      }
    };

    // Check Stripe Connect account status
    const loadStripeStatus = async () => {
      try {
        setStripeStatusLoading(true);
        const status = await StripeConnectService.getAccountStatus(user.id);
        setStripeAccountStatus(status);
      } catch (statusError) {
        console.error('Error loading Stripe Connect status:', statusError);
        // Set null status if there's an error (account not created yet or network issue)
        setStripeAccountStatus(null);
      } finally {
        setStripeStatusLoading(false);
      }
    };

    loadMethods();
    loadStripeStatus();
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen) {
      setRequestAmount(availableAmount);
      setError('');
    }
  }, [isOpen, availableAmount]);

  const selectedMethod = useMemo(
    () => payoutMethods.find((method) => method.id === selectedMethodId) ?? null,
    [payoutMethods, selectedMethodId]
  );

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setRequestAmount(Math.min(value, availableAmount));
  };

  const handleBankSelect = (bank: CanadianBank) => {
    setSelectedBank(bank);
    setShowBankDropdown(false);
    setNewMethodData((prev) => ({
      ...prev,
      institutionNumber: bank.institutionNumber
    }));
  };

  const validateNewMethod = () => {
    if (newMethodType === 'bank_transfer') {
      if (
        !newMethodData.accountHolderName.trim() ||
        !newMethodData.accountNumber.trim() ||
        !newMethodData.transitNumber.trim() ||
        !newMethodData.institutionNumber.trim()
      ) {
        throw new Error('Please fill in all Canadian bank account details');
      }
      if (newMethodData.transitNumber.length !== 5) {
        throw new Error('Transit number must be 5 digits');
      }
      if (newMethodData.institutionNumber.length !== 3) {
        throw new Error('Institution number must be 3 digits');
      }
      if (newMethodData.accountNumber.length < 5) {
        throw new Error('Account number must be at least 5 digits');
      }
    } else {
      if (!newMethodData.paypalEmail.trim()) {
        throw new Error('Please enter your PayPal email');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMethodData.paypalEmail.trim())) {
        throw new Error('Please enter a valid PayPal email');
      }
    }
  };

  const handleSaveNewMethod = async () => {
    if (!user) return;

    try {
      setSavingMethod(true);
      setError('');
      validateNewMethod();

      const details = newMethodType === 'bank_transfer'
        ? {
            account_holder_name: newMethodData.accountHolderName.trim(),
            institution_number: newMethodData.institutionNumber.trim(),
            transit_number: newMethodData.transitNumber.trim(),
            account_number: newMethodData.accountNumber.trim()
          }
        : {
            paypal_email: newMethodData.paypalEmail.trim()
          };

      const saved = await EarningsService.savePayoutMethod(
        user.id,
        newMethodType,
        details,
        newMethodData.makeDefault
      );

      if (saved?.is_default) {
        setSelectedMethodId(saved.id);
      }

      if (newMethodData.makeDefault && saved) {
        await EarningsService.setDefaultPayoutMethod(user.id, saved.id);
      }

      const methods = await EarningsService.fetchPayoutMethods(user.id);
      setPayoutMethods(methods);
      const defaultMethod = methods.find((method) => method.is_default);
      setSelectedMethodId(defaultMethod?.id ?? saved?.id ?? null);

      setShowAddForm(false);
      setNewMethodData({
        accountHolderName: '',
        institutionNumber: '',
        transitNumber: '',
        accountNumber: '',
        paypalEmail: '',
        makeDefault: true
      });
      setSelectedBank(null);
    } catch (methodError) {
      console.error('Error saving payout method:', methodError);
      setError(methodError instanceof Error ? methodError.message : 'Failed to save payout method');
    } finally {
      setSavingMethod(false);
    }
  };

  const handleSetDefault = async (method: PayoutMethod) => {
    if (!user) return;

    try {
      await EarningsService.setDefaultPayoutMethod(user.id, method.id);
      const methods = await EarningsService.fetchPayoutMethods(user.id);
      setPayoutMethods(methods);
      setSelectedMethodId(method.id);
    } catch (defaultError) {
      console.error('Error setting default payout method:', defaultError);
      setError('Failed to update default payout method');
    }
  };

  const handleDeletePayoutMethod = async (method: PayoutMethod) => {
    if (!user) return;
    if (method.is_default) {
      setError('Set another payout method as default before deleting this one');
      return;
    }

    try {
      await EarningsService.deletePayoutMethod(user.id, method.id);
      const methods = await EarningsService.fetchPayoutMethods(user.id);
      setPayoutMethods(methods);

      if (selectedMethodId === method.id) {
        setSelectedMethodId(methods[0]?.id ?? null);
      }
    } catch (deleteError) {
      console.error('Error deleting payout method:', deleteError);
      setError('Failed to delete payout method');
    }
  };

  const handleStartStripeOnboarding = async () => {
    if (!user) return;

    try {
      setError('');
      setStripeOnboardingLoading(true);
      
      // Start onboarding and get the Stripe link
      const onboardingUrl = await StripeConnectService.startOnboarding(user.id);
      
      // Redirect user to Stripe Connect onboarding
      window.location.href = onboardingUrl;
    } catch (onboardingError) {
      console.error('Error starting Stripe onboarding:', onboardingError);
      setError(
        onboardingError instanceof Error
          ? onboardingError.message
          : 'Failed to start Stripe Connect setup'
      );
    } finally {
      setStripeOnboardingLoading(false);
    }
  };

  const refreshStripeStatus = async () => {
    if (!user) return;

    try {
      setStripeStatusLoading(true);
      const status = await StripeConnectService.getAccountStatus(user.id);
      setStripeAccountStatus(status);
    } catch (statusError) {
      console.error('Error refreshing Stripe Connect status:', statusError);
    } finally {
      setStripeStatusLoading(false);
    }
  };

  const renderMethodDetails = (method: PayoutMethod) => {
    if (method.payout_type === 'bank_transfer') {
      return (
        <div className="text-sm text-gray-600 space-y-1">
          <p className="font-medium text-gray-800">{method.account_holder_name}</p>
          <p>
            Institution #{method.institution_number} • Transit #{method.transit_number}
          </p>
          <p>Account ••••{method.account_number?.slice(-4)}</p>
        </div>
      );
    }

    return (
      <div className="text-sm text-gray-600">
        <p className="font-medium text-gray-800">PayPal</p>
        <p>{method.paypal_email}</p>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setError('');
      setLoading(true);

      if (!selectedMethod) {
        if (payoutMethods.length === 0) {
          throw new Error('Please add a payout method');
        }
        throw new Error('Please select a payout method');
      }

      if (requestAmount <= 0 || requestAmount > availableAmount) {
        throw new Error('Invalid payout amount');
      }

      let paymentDetails: any;
      if (selectedMethod.payout_type === 'bank_transfer') {
        paymentDetails = {
          account_number: selectedMethod.account_number,
          transit_number: selectedMethod.transit_number,
          institution_number: selectedMethod.institution_number,
          account_holder_name: selectedMethod.account_holder_name
        };
      } else {
        paymentDetails = {
          paypal_email: selectedMethod.paypal_email
        };
      }

      const payoutRequest = await EarningsService.requestPayout(
        user.id,
        requestAmount,
        selectedMethod.payout_type,
        paymentDetails
      );

      if (!payoutRequest) {
        throw new Error('Failed to create payout request');
      }

      onSuccess();
      onClose();
    } catch (submitError) {
      console.error('Error creating payout request:', submitError);
      setError(submitError instanceof Error ? submitError.message : 'Failed to request payout');
    } finally {
      setLoading(false);
    }
  };

  const NewMethodForm = () => (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Add payout method</h3>
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <Shield size={14} />
          <span>Secured with encryption</span>
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          type="button"
          onClick={() => {
            setNewMethodType('bank_transfer');
            setSelectedBank(null);
          }}
          className={`flex-1 border rounded-lg py-3 px-4 text-sm font-medium transition-colors ${
            newMethodType === 'bank_transfer'
              ? 'border-blue-500 bg-blue-50 text-blue-600'
              : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <CreditCard size={18} className="inline mr-2" />
          Canadian bank
        </button>
        <button
          type="button"
          onClick={() => setNewMethodType('paypal')}
          className={`flex-1 border rounded-lg py-3 px-4 text-sm font-medium transition-colors ${
            newMethodType === 'paypal'
              ? 'border-blue-500 bg-blue-50 text-blue-600'
              : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          <Wallet size={18} className="inline mr-2" />
          PayPal
        </button>
      </div>

      {newMethodType === 'bank_transfer' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account holder name</label>
            <input
              type="text"
              value={newMethodData.accountHolderName}
              onChange={(e) => setNewMethodData((prev) => ({ ...prev, accountHolderName: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Full legal name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select your bank</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBankDropdown((prev) => !prev)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between"
              >
                <span className={selectedBank ? 'text-gray-900' : 'text-gray-500'}>
                  {selectedBank ? selectedBank.name : 'Choose your Canadian bank'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showBankDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {CANADIAN_BANKS.map((bank) => (
                    <button
                      key={bank.id}
                      type="button"
                      onClick={() => handleBankSelect(bank)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-900">{bank.shortName}</span>
                        <span className="text-sm text-gray-500">#{bank.institutionNumber}</span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{bank.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedBank && (
              <div className="mt-2 p-2 bg-green-50 rounded-lg text-xs text-green-700 flex items-center justify-between">
                <span>Institution number auto-filled: <strong>{selectedBank.institutionNumber}</strong></span>
                <span className="text-green-600">✓</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account number</label>
            <input
              type="text"
              value={newMethodData.accountNumber}
              onChange={(e) => setNewMethodData((prev) => ({ ...prev, accountNumber: e.target.value.replace(/[^0-9]/g, '') }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="7-12 digit account number"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transit number</label>
              <input
                type="text"
                value={newMethodData.transitNumber}
                onChange={(e) =>
                  setNewMethodData((prev) => ({ ...prev, transitNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="5-digit transit"
              />
              <p className="text-xs text-gray-500 mt-1">Branch number (5 digits)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Institution number</label>
              <input
                type="text"
                value={newMethodData.institutionNumber}
                onChange={(e) =>
                  setNewMethodData((prev) => ({ ...prev, institutionNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) }))
                }
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  selectedBank ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                placeholder="3-digit bank"
                readOnly={!!selectedBank}
              />
              <p className="text-xs text-gray-500 mt-1">
                {selectedBank ? 'Auto-filled based on bank selection' : 'Bank identification number'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">PayPal email</label>
          <input
            type="email"
            value={newMethodData.paypalEmail}
            onChange={(e) => setNewMethodData((prev) => ({ ...prev, paypalEmail: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="name@example.com"
          />
        </div>
      )}

      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id="newMakeDefault"
          checked={newMethodData.makeDefault}
          onChange={(e) => setNewMethodData((prev) => ({ ...prev, makeDefault: e.target.checked }))}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="newMakeDefault" className="text-sm text-gray-700">
          Set as default payout method
        </label>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={() => {
            setShowAddForm(false);
            setSelectedBank(null);
            setNewMethodData({
              accountHolderName: '',
              institutionNumber: '',
              transitNumber: '',
              accountNumber: '',
              paypalEmail: '',
              makeDefault: true
            });
          }}
          className="py-2 px-4 text-sm text-gray-600 hover:text-gray-800"
          disabled={savingMethod}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveNewMethod}
          className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          disabled={savingMethod}
        >
          {savingMethod ? 'Saving...' : 'Save payout method'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Request payout</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-1">
              <DollarSign size={16} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">Available for payout</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{formatPayout(availableAmount)}</p>
            <p className="text-xs text-green-700 mt-1">Net earnings after service fees</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payout amount</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="number"
                value={requestAmount}
                onChange={handleAmountChange}
                min={1}
                max={availableAmount}
                step="0.01"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter amount"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Maximum: {formatPayout(availableAmount)}</p>
          </div>

          <div className="space-y-4">
            {/* Stripe Connect onboarding notice */}
            {!stripeStatusLoading && stripeAccountStatus && !stripeAccountStatus.payouts_enabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <p className="font-medium mb-2">Complete your Stripe setup for better payouts</p>
                    <p className="text-xs mb-3">
                      Stripe Connect enables faster, more secure payments to your bank account. 
                      {stripeAccountStatus.details_submitted ? ' Complete your verification to enable payouts.' : " Let's get you set up."}
                    </p>
                    <button
                      type="button"
                      onClick={handleStartStripeOnboarding}
                      disabled={stripeOnboardingLoading}
                      className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {stripeOnboardingLoading ? (
                        <>
                          <Loader size={14} className="mr-2 animate-spin" />
                          Starting setup...
                        </>
                      ) : (
                        <>
                          <ExternalLink size={14} className="mr-2" />
                          Complete Stripe setup
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Saved payout methods</h3>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus size={16} className="mr-1" /> Add payout method
              </button>
            </div>

            {methodsLoading ? (
              <div className="text-sm text-gray-500">Loading payout methods...</div>
            ) : payoutMethods.length === 0 ? (
              <div className="text-sm text-gray-500">
                No payout methods saved yet. Add a Canadian bank or PayPal account to request payouts.
              </div>
            ) : (
              <div className="space-y-3">
                {payoutMethods.map((method) => (
                  <div
                    key={method.id}
                    className={`border-2 rounded-xl p-4 transition-colors ${
                      selectedMethodId === method.id ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 text-sm font-medium text-gray-800">
                          {method.payout_type === 'bank_transfer' ? (
                            <>
                              <CreditCard size={16} className="text-blue-600" />
                              <span>Canadian bank account</span>
                            </>
                          ) : (
                            <>
                              <Wallet size={16} className="text-blue-600" />
                              <span>PayPal</span>
                            </>
                          )}
                        </div>
                        {renderMethodDetails(method)}
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        {method.is_default && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                            <CheckCircle2 size={14} className="mr-1" /> Default
                          </span>
                        )}
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => setSelectedMethodId(method.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              selectedMethodId === method.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {selectedMethodId === method.id ? 'Selected' : 'Select'}
                          </button>
                          {!method.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(method)}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              Make default
                            </button>
                          )}
                          {!method.is_default && (
                            <button
                              type="button"
                              onClick={() => handleDeletePayoutMethod(method)}
                              className="px-2 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddForm && <NewMethodForm />}
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Processing information</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Canadian bank transfers typically take 1-3 business days</li>
                  <li>• PayPal transfers usually process within 24 hours</li>
                  <li>• All requests are reviewed before processing</li>
                  <li>• Ensure your payout method details are accurate</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={loading || (!selectedMethod && payoutMethods.length === 0)}
              className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Request payout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayoutRequestModal;