import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, Search } from 'lucide-react';
import { AddressAutocomplete } from '../../components/map/AddressAutocomplete';
import { Location } from '../../types';

// Get Mapbox token from ywConfig (set in yw_manifest.json)
const MAPBOX_TOKEN = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || 'pk.YOUR_MAPBOX_ACCESS_TOKEN_HERE';

export default function FindRidePage() {
  const navigate = useNavigate();
  const [fromLocation, setFromLocation] = useState<Location | null>(null);
  const [fromSearchValue, setFromSearchValue] = useState('');
  const [toLocation, setToLocation] = useState<Location | null>(null);
  const [toSearchValue, setToSearchValue] = useState('');
  const [date, setDate] = useState('');
  const [passengers, setPassengers] = useState('1');

  const handleSearch = () => {
    if (!fromLocation || !toLocation) {
      alert('Please select both pickup and dropoff locations from the suggestions');
      return;
    }
    
    // Navigate to available rides with search params including location data
    const params = new URLSearchParams({
      from: fromLocation.address,
      to: toLocation.address,
      fromLat: fromLocation.lat.toString(),
      fromLng: fromLocation.lng.toString(),
      toLat: toLocation.lat.toString(),
      toLng: toLocation.lng.toString(),
      ...(date && { date }),
      passengers,
    });
    navigate(`/rider/available-rides?${params.toString()}`);
  };

  return (
    <div className="w-full h-dvh bg-gradient-to-b from-blue-50 to-white">
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
          <h1 className="text-xl font-bold text-gray-900">Find a Ride</h1>
        </header>

        {/* Search Form */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-4">
            {/* From Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  Pickup Location
                </div>
              </label>
              <AddressAutocomplete
                value={fromSearchValue}
                onChange={(value) => setFromSearchValue(value)}
                onSelectLocation={(location) => {
                  setFromLocation(location);
                  setFromSearchValue(location.address);
                }}
                placeholder="Enter pickup address, mall, landmark..."
                mapboxToken={MAPBOX_TOKEN}
              />
            </div>

            {/* To Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-600"></div>
                  Dropoff Location
                </div>
              </label>
              <AddressAutocomplete
                value={toSearchValue}
                onChange={(value) => setToSearchValue(value)}
                onSelectLocation={(location) => {
                  setToLocation(location);
                  setToSearchValue(location.address);
                }}
                placeholder="Enter dropoff address, mall, landmark..."
                mapboxToken={MAPBOX_TOKEN}
              />
            </div>

            {/* Date (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600" />Date</div>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={(() => {
                  const today = new Date();
                  const year = today.getFullYear();
                  const month = String(today.getMonth() + 1).padStart(2, '0');
                  const day = String(today.getDate()).padStart(2, '0');
                  return `${year}-${month}-${day}`;
                })()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Number of Passengers */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-600" />
                  Number of Passengers
                </div>
              </label>
              <select
                value={passengers}
                onChange={(e) => setPassengers(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <option key={num} value={num}>{num} {num === 1 ? 'Passenger' : 'Passengers'}</option>
                ))}
              </select>
            </div>

            {/* Search Tips */}
            <div className="bg-blue-50 rounded-lg p-4 mt-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Search Tips</h3>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Enter full addresses for better results</li>
                <li>• Leave date empty to see all available rides</li>
                <li>• Segment booking available for OnGoPool drivers</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Search Button */}
        <div className="flex-none bg-white border-t border-gray-200 p-4">
          <button
            onClick={handleSearch}
            className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 active:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled={!fromLocation || !toLocation}
          >
            <Search className="w-5 h-5" />
            Search Available Rides
          </button>
        </div>
      </main>
    </div>
  );
}
