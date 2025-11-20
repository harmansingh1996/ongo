import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Car, MapPin, Award } from 'lucide-react';
import { User, RatingReview } from '../../types';
import { getUserById } from '../../services/mockData';

export default function DriverProfilePage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const [driver, setDriver] = useState<User | null>(null);

  // Mock reviews data
  const mockReviews: RatingReview[] = [
    {
      id: 'rev1',
      riderId: 'r1',
      riderName: 'Sarah Rider',
      riderPhoto: '/assets/placeholder-avatar-2.jpg',
      rating: 5,
      comment: 'Excellent driver! Very punctual and friendly. Smooth ride.',
      date: '2025-11-10',
    },
    {
      id: 'rev2',
      riderId: 'r2',
      riderName: 'Mike Johnson',
      riderPhoto: '/assets/placeholder-avatar-3.jpg',
      rating: 4,
      comment: 'Good experience overall. Safe driver and clean car.',
      date: '2025-11-08',
    },
    {
      id: 'rev3',
      riderId: 'r3',
      riderName: 'Emma Wilson',
      riderPhoto: '/assets/placeholder-avatar-4.jpg',
      rating: 5,
      comment: 'Highly recommended! Great conversation and comfortable ride.',
      date: '2025-11-05',
    },
  ];

  useEffect(() => {
    if (driverId) {
      const driverData = getUserById(driverId);
      setDriver(driverData);
    }
  }, [driverId]);

  if (!driver) {
    return (
      <div className="w-full h-dvh flex items-center justify-center">
        <p className="text-gray-600">Loading driver profile...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-gray-50">
      <main 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none px-4 py-3 bg-white shadow-sm flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 active:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Driver Profile</h1>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Driver Info Card */}
          <div className="bg-white p-6 mb-2">
            <div className="flex flex-col items-center">
              <img
                src={driver.profilePicture}
                alt={driver.name}
                className="w-24 h-24 rounded-full object-cover mb-4"
              />
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{driver.name}</h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  <span className="text-lg font-semibold text-gray-900">{driver.rating}</span>
                </div>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600">{driver.totalRides} rides</span>
              </div>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Vehicle Information</h3>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <Car className="w-10 h-10 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">
                  {driver.vehicleMake} {driver.vehicleModel} ({driver.vehicleYear})
                </p>
                <p className="text-sm text-gray-600">{driver.vehicleColor}</p>
                <p className="text-sm text-gray-600">Plate: {driver.vehiclePlate}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <MapPin className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{driver.totalRides}</p>
                <p className="text-xs text-gray-600">Total Rides</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <Star className="w-6 h-6 text-yellow-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{driver.rating}</p>
                <p className="text-xs text-gray-600">Rating</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <Award className="w-6 h-6 text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">98%</p>
                <p className="text-xs text-gray-600">On Time</p>
              </div>
            </div>
          </div>

          {/* Ratings & Reviews */}
          <div className="bg-white p-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Reviews ({mockReviews.length})
            </h3>
            <div className="space-y-4">
              {mockReviews.map(review => (
                <div key={review.id} className="border-b border-gray-100 pb-4 last:border-0">
                  <div className="flex items-start gap-3">
                    <img
                      src={review.riderPhoto}
                      alt={review.riderName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-gray-900">{review.riderName}</h4>
                        <span className="text-xs text-gray-500">{review.date}</span>
                      </div>
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${
                              star <= review.rating 
                                ? 'text-yellow-500 fill-yellow-500' 
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-sm text-gray-700">{review.comment}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
