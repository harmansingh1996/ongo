import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, Edit2, Save, X } from 'lucide-react';
import { getCurrentUser, AuthUser } from '../../services/authService';
import { User } from '../../types';

export default function VehicleDetailsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.userType !== 'driver') {
        navigate('/driver/home');
        return;
      }
      setUser(currentUser);
      setLoading(false);
    };
    
    checkAuth();
  }, [navigate]);

  const handleEditToggle = () => {
    if (isEditing) {
      setEditedUser(null);
      setIsEditing(false);
    } else {
      setEditedUser(user);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (editedUser) {
      // Save to localStorage
      const users = JSON.parse(localStorage.getItem('ongopool_users') || '[]');
      const userIndex = users.findIndex((u: User) => u.id === editedUser.id);
      if (userIndex !== -1) {
        users[userIndex] = editedUser;
        localStorage.setItem('ongopool_users', JSON.stringify(users));
        localStorage.setItem('ongopool_current_user', JSON.stringify(editedUser));
        setUser(editedUser);
        setIsEditing(false);
        alert('Vehicle details updated successfully!');
      }
    }
  };

  const handleInputChange = (field: keyof User, value: string | number) => {
    if (editedUser) {
      setEditedUser({ ...editedUser, [field]: value });
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

  const displayUser = isEditing ? editedUser! : user;

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
            <h1 className="text-xl font-bold text-gray-900">Vehicle Details</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {/* Vehicle Icon */}
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl p-8 text-center">
              <Car className="w-24 h-24 text-gray-600 mx-auto mb-3" />
              <div className="text-2xl font-bold text-gray-900">
                {displayUser.vehicleYear} {displayUser.vehicleMake}
              </div>
              <div className="text-lg text-gray-700">{displayUser.vehicleModel}</div>
              <div className="text-sm text-gray-600 mt-2">{displayUser.vehicleColor}</div>
            </div>

            {/* Vehicle Information */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Vehicle Information</h3>
                {isEditing ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={handleEditToggle}
                      className="flex items-center space-x-1 text-sm text-gray-600 font-medium px-3 py-1 rounded-lg hover:bg-gray-100 active:scale-95 transition-all"
                    >
                      <X className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center space-x-1 text-sm text-blue-600 font-medium px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleEditToggle}
                    className="flex items-center space-x-1 text-sm text-blue-600 font-medium px-3 py-1 rounded-lg hover:bg-blue-50 active:scale-95 transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {isEditing ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Make</label>
                      <input
                        type="text"
                        value={editedUser?.vehicleMake || ''}
                        onChange={(e) => handleInputChange('vehicleMake', e.target.value)}
                        placeholder="Toyota"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                      <input
                        type="text"
                        value={editedUser?.vehicleModel || ''}
                        onChange={(e) => handleInputChange('vehicleModel', e.target.value)}
                        placeholder="Camry"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                      <input
                        type="number"
                        value={editedUser?.vehicleYear || ''}
                        onChange={(e) => handleInputChange('vehicleYear', parseInt(e.target.value))}
                        placeholder="2020"
                        min="2000"
                        max="2025"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                      <input
                        type="text"
                        value={editedUser?.vehicleColor || ''}
                        onChange={(e) => handleInputChange('vehicleColor', e.target.value)}
                        placeholder="Silver"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">License Plate</label>
                      <input
                        type="text"
                        value={editedUser?.vehiclePlate || ''}
                        onChange={(e) => handleInputChange('vehiclePlate', e.target.value)}
                        placeholder="ABC 123"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Make</span>
                      <span className="font-medium text-gray-900">{displayUser.vehicleMake}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Model</span>
                      <span className="font-medium text-gray-900">{displayUser.vehicleModel}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Year</span>
                      <span className="font-medium text-gray-900">{displayUser.vehicleYear}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Color</span>
                      <span className="font-medium text-gray-900">{displayUser.vehicleColor}</span>
                    </div>

                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-600">License Plate</span>
                      <span className="font-medium text-gray-900">{displayUser.vehiclePlate}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-sm text-blue-900">
                <div className="font-semibold mb-1">Keep Your Information Updated</div>
                <div className="text-blue-700">
                  Make sure your vehicle information is accurate. Riders will see these details when booking your rides.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
