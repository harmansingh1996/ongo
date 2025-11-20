import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Star, TrendingUp, DollarSign, CreditCard, History, 
  FileCheck, Car, AlertCircle, PhoneCall, LogOut, ChevronRight, Edit2, Save, X,
  FileText, BookOpen
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';
import { getCurrentUser, signOut } from '../../services/authService';
import { getUserProfile, updateUserProfile, UserProfile, getDriverTripCount } from '../../services/profileService';
import ProfileUploader from '../../components/ProfileUploader';
import { stopTracking } from '../../services/locationService';

export default function DriverProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<UserProfile> | null>(null);
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [realtimeTripCount, setRealtimeTripCount] = useState<number>(0);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/auth');
        return;
      }

      if (currentUser.userType !== 'driver') {
        navigate('/rider/home');
        return;
      }

      const userProfile = await getUserProfile(currentUser.id);
      if (!userProfile) {
        navigate('/auth');
        return;
      }

      // Get real-time trip count from bookings
      const tripCount = await getDriverTripCount(currentUser.id);
      setRealtimeTripCount(tripCount);

      setProfile(userProfile);
    } catch (error) {
      console.error('Error loading profile:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      setEditedProfile(null);
      setIsEditing(false);
    } else {
      setEditedProfile(profile);
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editedProfile || !profile) return;

    try {
      const success = await updateUserProfile(profile.id, {
        name: editedProfile.name,
        phone: editedProfile.phone || null,
        address: editedProfile.address || null,
        city: editedProfile.city || null,
        state: editedProfile.state || null,
        zipcode: editedProfile.zipcode || null,
      });

      if (success) {
        await loadProfile(); // Reload fresh data
        setIsEditing(false);
        setEditedProfile(null);
      } else {
        alert('Failed to update profile. Please try again.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  const handlePhotoSelect = async (imageData: string) => {
    if (!profile) return;

    setUploadingPhoto(true);
    try {
      // Update profile with new image (base64 data)
      const success = await updateUserProfile(profile.id, {
        profile_image: imageData,
      });

      if (success) {
        await loadProfile(); // Reload fresh data
        setIsEditingPhoto(false);
      } else {
        alert('Failed to update profile photo. Please try again.');
      }
    } catch (error) {
      console.error('Error updating profile photo:', error);
      alert('Failed to update profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        // Stop location tracking before signing out to prevent RLS policy violations
        stopTracking();
        await signOut();
        navigate('/');
      } catch (error) {
        console.error('Error signing out:', error);
      }
    }
  };

  const menuItems = [
    { 
      icon: Star, 
      label: 'Ratings & Reviews', 
      path: '/driver/ratings',
      color: 'text-yellow-600',
      bg: 'bg-yellow-50'
    },
    { 
      icon: DollarSign, 
      label: 'Earnings', 
      path: '/driver/earnings',
      color: 'text-green-600',
      bg: 'bg-green-50'
    },
    { 
      icon: CreditCard, 
      label: 'Payout Method', 
      path: '/driver/payout-method',
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    { 
      icon: History, 
      label: 'Payout History', 
      path: '/driver/payout-history',
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
    { 
      icon: FileCheck, 
      label: 'License Verification', 
      path: '/driver/license',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50'
    },
    { 
      icon: Car, 
      label: 'Vehicle Details', 
      path: '/driver/vehicle',
      color: 'text-gray-600',
      bg: 'bg-gray-50'
    },
    { 
      icon: AlertCircle, 
      label: 'Report Issue', 
      path: '/driver/report-issue',
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    { 
      icon: PhoneCall, 
      label: 'SOS Emergency', 
      path: '/driver/sos',
      color: 'text-red-600',
      bg: 'bg-red-50'
    },
    { 
      icon: FileText, 
      label: 'Terms & Conditions', 
      path: '/terms',
      color: 'text-gray-600',
      bg: 'bg-gray-50'
    },
    { 
      icon: BookOpen, 
      label: 'Cancellation Policy', 
      path: '/cancellation-policy',
      color: 'text-gray-600',
      bg: 'bg-gray-50'
    },
  ];

  return (
    <div className="w-full h-dvh bg-gray-50">
      <div 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-gray-600 font-medium">Loading...</p>
            </div>
          </div>
        ) : !profile ? null : (
          <>
            {/* Header with Profile Info */}
            <div className="flex-none bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-6">
              <div className="text-center space-y-3">
                <div className="relative inline-block">
                  {profile.profile_image ? (
                    <img
                      src={profile.profile_image}
                      alt={profile.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg mx-auto"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-4xl font-bold text-blue-600 border-4 border-white shadow-lg mx-auto">
                      {profile.name.charAt(0)}
                    </div>
                  )}
                  <button
                    onClick={() => setIsEditingPhoto(true)}
                    className="absolute bottom-0 right-0 bg-blue-500 text-white p-2 rounded-full shadow-lg active:bg-blue-600 transition-colors"
                    disabled={uploadingPhoto}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-white">
                  <h1 className="text-2xl font-bold">{profile.name}</h1>
                  <p className="text-blue-100">{profile.email}</p>
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{profile.rating.toFixed(1)}</span>
                    </div>
                    <span className="text-blue-200">•</span>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-medium">{realtimeTripCount} trips</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto pb-24">
              {/* Personal Information Card */}
              <div className="px-4 py-4 space-y-3">
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Personal Information</h2>
                    <button
                      onClick={handleEditToggle}
                      className="p-2 text-blue-600 active:bg-blue-50 rounded-lg"
                    >
                      {isEditing ? <X className="w-5 h-5" /> : <Edit2 className="w-5 h-5" />}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {isEditing ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                          <input
                            type="text"
                            value={editedProfile?.name || ''}
                            onChange={(e) => setEditedProfile({ ...editedProfile!, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={editedProfile?.phone || ''}
                            onChange={(e) => setEditedProfile({ ...editedProfile!, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={editedProfile?.email || ''}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                          <input
                            type="text"
                            value={editedProfile?.address || ''}
                            onChange={(e) => setEditedProfile({ ...editedProfile!, address: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                            <input
                              type="text"
                              value={editedProfile?.city || ''}
                              onChange={(e) => setEditedProfile({ ...editedProfile!, city: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">ZIP Code</label>
                            <input
                              type="text"
                              value={editedProfile?.zipcode || ''}
                              onChange={(e) => setEditedProfile({ ...editedProfile!, zipcode: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleSave}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 mt-4"
                        >
                          <Save className="w-5 h-5" />
                          Save Changes
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Name</span>
                          <span className="text-sm font-medium text-gray-900">{profile.name}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Phone</span>
                          <span className="text-sm font-medium text-gray-900">{profile.phone || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Email</span>
                          <span className="text-sm font-medium text-gray-900">{profile.email}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-600">Address</span>
                          <span className="text-sm font-medium text-gray-900 text-right">{profile.address || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-sm text-gray-600">City</span>
                          <span className="text-sm font-medium text-gray-900">
                            {profile.city && profile.zipcode ? `${profile.city}, ${profile.zipcode}` : 'Not set'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">Quick Actions</h2>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {menuItems.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors"
                      >
                        <div className={`p-2 rounded-lg ${item.bg}`}>
                          <item.icon className={`w-5 h-5 ${item.color}`} />
                        </div>
                        <span className="flex-1 text-left text-sm font-medium text-gray-900">{item.label}</span>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-medium active:bg-red-100"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            </div>
          </>
        )}

        {/* Bottom Navigation - Always Visible */}
        <BottomNav active="profile" userType="driver" />
      </div>

      {/* Profile Photo Edit Modal */}
      {isEditingPhoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Update Profile Photo</h3>
              <button
                onClick={() => setIsEditingPhoto(false)}
                disabled={uploadingPhoto}
                className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ProfileUploader
              currentImage={profile?.profile_image || ''}
              onImageSelect={handlePhotoSelect}
            />

            {uploadingPhoto && (
              <div className="mt-4 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Uploading...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
