import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Save } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { getPayoutMethods, savePayoutMethod, PayoutMethod } from '../../services/earningsService';

export default function PayoutMethodPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [formData, setFormData] = useState({
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    transitNumber: '',
    institutionNumber: '',
    accountHolderName: '',
  });
  const [existingMethod, setExistingMethod] = useState<PayoutMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUserAndPayoutMethod();
  }, [navigate]);

  const loadUserAndPayoutMethod = async () => {
    setLoading(true);
    const currentUser = await getCurrentUser();
    
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/auth');
      return;
    }
    
    setUser(currentUser);
    await loadPayoutMethod(currentUser.id);
    setLoading(false);
  };

  const loadPayoutMethod = async (userId: string) => {
    const methods = await getPayoutMethods(userId);
    if (methods.length > 0) {
      const method = methods[0]; // Get the first (default) method
      setExistingMethod(method);
      setFormData({
        bankName: method.bank_name,
        accountNumber: '****' + method.account_number, // Last 4 digits
        confirmAccountNumber: '****' + method.account_number,
        transitNumber: method.transit_number,
        institutionNumber: method.institution_number,
        accountHolderName: method.account_holder_name,
      });
    } else if (user) {
      setFormData(prev => ({ ...prev, accountHolderName: user.name }));
    }
    setLoading(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      alert('Account numbers do not match');
      return;
    }

    if (!user) return;

    setSaving(true);
    const success = await savePayoutMethod(user.id, {
      bank_name: formData.bankName,
      account_holder_name: formData.accountHolderName,
      institution_number: formData.institutionNumber,
      transit_number: formData.transitNumber,
      account_number: formData.accountNumber,
      is_default: true,
    });

    setSaving(false);

    if (success) {
      alert('Payout method saved successfully');
      navigate(-1);
    } else {
      alert('Failed to save payout method. Please try again.');
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading payout method...</p>
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
            <h1 className="text-xl font-bold text-gray-900">Payout Method</h1>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <CreditCard className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <div className="font-semibold mb-1">Canadian Bank Account Required</div>
                  <div className="text-blue-700">
                    We transfer earnings directly to your Canadian bank account. 
                    Please ensure all details are accurate.
                  </div>
                </div>
              </div>
            </div>

            {existingMethod && existingMethod.is_verified && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <div className="text-sm text-green-900 font-semibold">
                    Account Verified
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank Name
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  placeholder="Royal Bank of Canada"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  name="accountHolderName"
                  value={formData.accountHolderName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Institution Number (3 digits)
                </label>
                <input
                  type="text"
                  name="institutionNumber"
                  value={formData.institutionNumber}
                  onChange={handleInputChange}
                  placeholder="001"
                  maxLength={3}
                  pattern="[0-9]{3}"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transit Number (5 digits)
                </label>
                <input
                  type="text"
                  name="transitNumber"
                  value={formData.transitNumber}
                  onChange={handleInputChange}
                  placeholder="12345"
                  maxLength={5}
                  pattern="[0-9]{5}"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Number
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleInputChange}
                  placeholder="1234567"
                  maxLength={12}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Account Number
                </label>
                <input
                  type="text"
                  name="confirmAccountNumber"
                  value={formData.confirmAccountNumber}
                  onChange={handleInputChange}
                  placeholder="Re-enter account number"
                  maxLength={12}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-sm text-gray-600 space-y-2">
                <div className="font-semibold text-gray-900">How to find your banking details:</div>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Check your void cheque or bank statement</li>
                  <li>Institution Number: First 3 digits at bottom of cheque</li>
                  <li>Transit Number: Next 5 digits at bottom of cheque</li>
                  <li>Account Number: Remaining digits at bottom of cheque</li>
                </ul>
              </div>
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md flex items-center justify-center space-x-2 min-h-touch disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              <span>{saving ? 'Saving...' : existingMethod ? 'Update Payout Method' : 'Save Payout Method'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
