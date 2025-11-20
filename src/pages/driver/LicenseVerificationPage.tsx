import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileCheck, Camera, CheckCircle, AlertCircle, Calendar, Edit2, Save, X } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { 
  getDriverLicence, 
  upsertDriverLicence, 
  submitLicenceForVerification,
  isLicenceExpiringSoon,
  isLicenceExpired,
  getDaysUntilExpiry,
  DriverLicence 
} from '../../services/licenceService';

export default function LicenseVerificationPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [licence, setLicence] = useState<DriverLicence | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [licenceNumber, setLicenceNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [licenceClass, setLicenceClass] = useState('');
  const [frontImage, setFrontImage] = useState<string>('');
  const [backImage, setBackImage] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [navigate]);

  const loadData = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.userType !== 'driver') {
      navigate('/driver/home');
      return;
    }
    setUser(currentUser);
    
    // Load licence from Supabase
    const licenceData = await getDriverLicence(currentUser.id);
    if (licenceData) {
      setLicence(licenceData);
      setLicenceNumber(licenceData.licence_number);
      setExpiryDate(licenceData.expiry_date);
      setIssueDate(licenceData.issue_date || '');
      setIssuingCountry(licenceData.issuing_country || '');
      setIssuingState(licenceData.issuing_state || '');
      setLicenceClass(licenceData.licence_class || '');
      setFrontImage(licenceData.front_image_url || '');
      setBackImage(licenceData.back_image_url || '');
    } else {
      // No licence yet, enable editing mode
      setIsEditing(true);
    }
    
    setLoading(false);
  };

  const handleFileUpload = (side: 'front' | 'back', file: File) => {
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (side === 'front') {
        setFrontImage(result);
      } else {
        setBackImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!licenceNumber.trim()) {
      alert('Please enter your licence number');
      return;
    }
    if (!expiryDate) {
      alert('Please select an expiry date');
      return;
    }

    // Check if expired
    if (isLicenceExpired(expiryDate)) {
      alert('Your licence has expired. Please renew it before verifying.');
      return;
    }

    setSaving(true);

    const licenceData: DriverLicence = {
      user_id: user.id,
      licence_number: licenceNumber,
      expiry_date: expiryDate,
      issue_date: issueDate || undefined,
      issuing_country: issuingCountry || undefined,
      issuing_state: issuingState || undefined,
      licence_class: licenceClass || undefined,
      front_image_url: frontImage || undefined,
      back_image_url: backImage || undefined,
      is_verified: false,
      verification_status: licence?.verification_status || 'pending',
    };

    const success = await upsertDriverLicence(licenceData);
    
    if (success) {
      alert('Licence information saved successfully!');
      setIsEditing(false);
      await loadData(); // Reload to get latest data
    } else {
      alert('Failed to save licence information. Please try again.');
    }

    setSaving(false);
  };

  const handleSubmitForVerification = async () => {
    if (!user) return;

    if (!frontImage || !backImage) {
      alert('Please upload both front and back images of your licence');
      return;
    }

    if (!licenceNumber || !expiryDate) {
      alert('Please fill in all required licence information before submitting');
      return;
    }

    setSaving(true);

    // First save the current data
    const licenceData: DriverLicence = {
      user_id: user.id,
      licence_number: licenceNumber,
      expiry_date: expiryDate,
      issue_date: issueDate || undefined,
      issuing_country: issuingCountry || undefined,
      issuing_state: issuingState || undefined,
      licence_class: licenceClass || undefined,
      front_image_url: frontImage,
      back_image_url: backImage,
      is_verified: false,
      verification_status: 'pending',
    };

    const saveSuccess = await upsertDriverLicence(licenceData);
    
    if (saveSuccess) {
      const submitSuccess = await submitLicenceForVerification(user.id);
      if (submitSuccess) {
        alert('Licence submitted for verification! We will review it within 24-48 hours.');
        await loadData();
      } else {
        alert('Failed to submit for verification. Please try again.');
      }
    } else {
      alert('Failed to save licence information. Please try again.');
    }

    setSaving(false);
  };

  const handleCancel = () => {
    if (licence) {
      // Restore original values
      setLicenceNumber(licence.licence_number);
      setExpiryDate(licence.expiry_date);
      setIssueDate(licence.issue_date || '');
      setIssuingCountry(licence.issuing_country || '');
      setIssuingState(licence.issuing_state || '');
      setLicenceClass(licence.licence_class || '');
      setFrontImage(licence.front_image_url || '');
      setBackImage(licence.back_image_url || '');
      setIsEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const verificationStatus = licence?.verification_status || 'pending';
  const isVerified = licence?.is_verified || false;
  const showExpiryWarning = expiryDate && isLicenceExpiringSoon(expiryDate) && !isLicenceExpired(expiryDate);
  const isExpired = expiryDate && isLicenceExpired(expiryDate);
  const daysUntilExpiry = expiryDate ? getDaysUntilExpiry(expiryDate) : 0;

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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">License Verification</h1>
            </div>
            
            {!isEditing && licence && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 active:scale-95 transition-all"
              >
                <Edit2 className="w-4 h-4" />
                <span className="text-sm font-medium">Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
          <div className="space-y-4">
            {/* Expiry Warning */}
            {isExpired && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-red-900 mb-1">Licence Expired</div>
                    <div className="text-sm text-red-800">
                      Your licence expired {Math.abs(daysUntilExpiry)} days ago. Please renew it to continue driving.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showExpiryWarning && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <Calendar className="w-6 h-6 text-yellow-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-yellow-900 mb-1">Licence Expiring Soon</div>
                    <div className="text-sm text-yellow-800">
                      Your licence expires in {daysUntilExpiry} days. Please renew it to avoid service interruption.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Status Banner */}
            {verificationStatus && (
              <div className={`rounded-xl p-4 border ${
                isVerified 
                  ? 'bg-green-50 border-green-200'
                  : verificationStatus === 'pending'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start space-x-3">
                  {isVerified ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  ) : verificationStatus === 'pending' ? (
                    <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className={`font-semibold mb-1 ${
                      isVerified 
                        ? 'text-green-900'
                        : verificationStatus === 'pending'
                        ? 'text-yellow-900'
                        : 'text-red-900'
                    }`}>
                      {isVerified && 'License Verified'}
                      {verificationStatus === 'pending' && !isVerified && 'Verification Pending'}
                      {verificationStatus === 'rejected' && 'Verification Rejected'}
                    </div>
                    <div className={`text-sm ${
                      isVerified 
                        ? 'text-green-800'
                        : verificationStatus === 'pending'
                        ? 'text-yellow-800'
                        : 'text-red-800'
                    }`}>
                      {isVerified && 'Your driver\'s license has been verified successfully.'}
                      {verificationStatus === 'pending' && !isVerified && 'Your license is being reviewed. This usually takes 24-48 hours.'}
                      {verificationStatus === 'rejected' && 'Your license verification was rejected. Please upload clear photos and try again.'}
                    </div>
                    {licence?.verification_notes && (
                      <div className="mt-2 text-sm text-gray-700 bg-white bg-opacity-50 rounded p-2">
                        <strong>Note:</strong> {licence.verification_notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <FileCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <div className="font-semibold mb-1">Upload Your Driver's License</div>
                  <ul className="text-blue-700 space-y-1 list-disc list-inside">
                    <li>Upload clear photos of both front and back</li>
                    <li>Ensure all text is readable</li>
                    <li>Avoid glare and shadows</li>
                    <li>License must be valid and not expired</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Licence Information Form */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-3">License Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Licence Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={licenceNumber}
                    onChange={(e) => setLicenceNumber(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                    placeholder="Enter licence number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={issuingCountry}
                      onChange={(e) => setIssuingCountry(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                      placeholder="e.g., USA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State/Province
                    </label>
                    <input
                      type="text"
                      value={issuingState}
                      onChange={(e) => setIssuingState(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                      placeholder="e.g., CA"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Licence Class
                  </label>
                  <input
                    type="text"
                    value={licenceClass}
                    onChange={(e) => setLicenceClass(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                    placeholder="e.g., Class C"
                  />
                </div>
              </div>
            </div>

            {/* Upload Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Upload License Photos</h3>
              
              {/* Front Side */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="font-medium text-gray-900 mb-3">Front Side</div>
                
                {frontImage ? (
                  <div className="relative">
                    <img 
                      src={frontImage} 
                      alt="License front"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    {isEditing && (
                      <button
                        onClick={() => setFrontImage('')}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 active:scale-95 transition-all shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg transition-colors ${
                    isEditing ? 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer' : 'bg-gray-100 cursor-not-allowed'
                  }`}>
                    <Camera className="w-12 h-12 text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-600">Upload Front Side</span>
                    <span className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload('front', file);
                      }}
                      disabled={!isEditing}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Back Side */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="font-medium text-gray-900 mb-3">Back Side</div>
                
                {backImage ? (
                  <div className="relative">
                    <img 
                      src={backImage} 
                      alt="License back"
                      className="w-full h-48 object-cover rounded-lg border-2 border-gray-200"
                    />
                    {isEditing && (
                      <button
                        onClick={() => setBackImage('')}
                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 active:scale-95 transition-all shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg transition-colors ${
                    isEditing ? 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer' : 'bg-gray-100 cursor-not-allowed'
                  }`}>
                    <Camera className="w-12 h-12 text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-600">Upload Back Side</span>
                    <span className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload('back', file);
                      }}
                      disabled={!isEditing}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing ? (
              <div className="flex space-x-3">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 active:scale-98 transition-all shadow-md flex items-center justify-center space-x-2 min-h-touch disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !licenceNumber || !expiryDate}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 active:scale-98 transition-all shadow-md flex items-center justify-center space-x-2 min-h-touch disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-5 h-5" />
                  <span>{saving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            ) : (
              !isVerified && (
                <button
                  onClick={handleSubmitForVerification}
                  disabled={saving || !frontImage || !backImage || !licenceNumber || !expiryDate || isExpired}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 active:scale-98 transition-all shadow-md flex items-center justify-center space-x-2 min-h-touch disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-5 h-5" />
                  <span>{saving ? 'Submitting...' : 'Submit for Verification'}</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
