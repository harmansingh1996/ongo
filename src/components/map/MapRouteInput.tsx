import React, { useState, useEffect } from 'react';
import { Plus, X, MapPin, Navigation, Clock, DollarSign } from 'lucide-react';
import { Location, RouteStop, MapRouteData, RouteSegment, RouteCalculationResult } from '../../types';
import { AddressAutocomplete } from './AddressAutocomplete';
import { calculateStopTimings, formatDuration } from './RouteTimingCalculator';

interface MapRouteInputProps {
  onRouteCalculated: (result: RouteCalculationResult) => void;
  initialStartLocation?: Location;
  initialEndLocation?: Location;
  startTime: string;
  pricePerKm?: number;
  mapboxToken?: string;
}

interface StopInput {
  id: string;
  location: Location | null;
  searchValue: string;
}

/**
 * Main component for route input with address autocomplete and map routing
 * Handles multi-stop routes with real-time distance and ETA calculations
 */
export const MapRouteInput: React.FC<MapRouteInputProps> = ({
  onRouteCalculated,
  initialStartLocation,
  initialEndLocation,
  startTime,
  pricePerKm = 0.15, // Default $0.15 per km
  mapboxToken = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || 'pk.YOUR_MAPBOX_ACCESS_TOKEN_HERE',
}) => {
  const [startStop, setStartStop] = useState<StopInput>({
    id: 'start',
    location: initialStartLocation || null,
    searchValue: initialStartLocation?.address || '',
  });

  const [endStop, setEndStop] = useState<StopInput>({
    id: 'end',
    location: initialEndLocation || null,
    searchValue: initialEndLocation?.address || '',
  });

  const [intermediateStops, setIntermediateStops] = useState<StopInput[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteCalculationResult | null>(null);

  // Add intermediate stop
  const addIntermediateStop = () => {
    setIntermediateStops([
      ...intermediateStops,
      {
        id: `stop-${Date.now()}`,
        location: null,
        searchValue: '',
      },
    ]);
  };

  // Remove intermediate stop
  const removeIntermediateStop = (id: string) => {
    setIntermediateStops(intermediateStops.filter((stop) => stop.id !== id));
  };

  // Calculate route when stops change OR when start time changes
  useEffect(() => {
    if (startStop.location && endStop.location) {
      calculateRoute();
    }
  }, [startStop.location, endStop.location, intermediateStops, startTime]);

  /**
   * Fetch route from Mapbox Directions API
   */
  const calculateRoute = async () => {
    if (!startStop.location || !endStop.location) return;

    setIsCalculating(true);

    try {
      // Build coordinates string for Mapbox Directions API
      const allStops = [
        startStop.location,
        ...intermediateStops.map((s) => s.location).filter(Boolean) as Location[],
        endStop.location,
      ];

      const coordinates = allStops.map((stop) => `${stop.lng},${stop.lat}`).join(';');

      // Call Mapbox Directions API
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&steps=true&access_token=${mapboxToken}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];

        // Build segments from route legs
        const segments: RouteSegment[] = route.legs.map((leg: any, index: number) => ({
          distance: leg.distance,
          duration: leg.duration,
          fromStopId: allStops[index].id,
          toStopId: allStops[index + 1].id,
          geometry: {
            type: 'LineString',
            coordinates: leg.steps.flatMap((step: any) => step.geometry.coordinates),
          },
        }));

        // Calculate total distance and duration
        const totalDistance = route.distance; // meters
        const totalDuration = route.duration; // seconds

        // Build base stops (without ETA)
        const baseStops: Omit<RouteStop, 'estimatedArrival'>[] = allStops.map((stop, index) => ({
          id: stop.id,
          name: stop.name,
          address: stop.address,
          lat: stop.lat,
          lng: stop.lng,
          time: index === 0 ? startTime : '',
          order: index,
        }));

        // Calculate ETAs for each stop
        const { stops } = calculateStopTimings(baseStops, segments, startTime);

        // Build full route data
        const fullRoute: MapRouteData = {
          geometry: route.geometry,
          distance: totalDistance,
          duration: totalDuration,
          legs: segments,
        };

        // Calculate total price
        const totalPrice = Math.round((totalDistance / 1000) * pricePerKm * 100) / 100;

        const result: RouteCalculationResult = {
          fullRoute,
          stops,
          totalDistance,
          totalDuration,
          pricePerKm,
          totalPrice,
        };

        setRouteResult(result);
        onRouteCalculated(result);
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const canCalculateRoute = startStop.location && endStop.location;

  return (
    <div className="space-y-4">
      {/* Start Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <MapPin className="inline w-4 h-4 mr-1" />
          Start Location
        </label>
        <AddressAutocomplete
          value={startStop.searchValue}
          onChange={(value) => setStartStop({ ...startStop, searchValue: value })}
          onSelectLocation={(location) => setStartStop({ ...startStop, location, searchValue: location.address })}
          placeholder="Enter start address..."
          mapboxToken={mapboxToken}
        />
      </div>

      {/* Intermediate Stops */}
      {intermediateStops.map((stop, index) => (
        <div key={stop.id} className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Navigation className="inline w-4 h-4 mr-1" />
            Stop {index + 1}
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <AddressAutocomplete
                value={stop.searchValue}
                onChange={(value) => {
                  const updated = [...intermediateStops];
                  updated[index] = { ...stop, searchValue: value };
                  setIntermediateStops(updated);
                }}
                onSelectLocation={(location) => {
                  const updated = [...intermediateStops];
                  updated[index] = { ...stop, location, searchValue: location.address };
                  setIntermediateStops(updated);
                }}
                placeholder="Enter stop address..."
                mapboxToken={mapboxToken}
              />
            </div>
            <button
              onClick={() => removeIntermediateStop(stop.id)}
              className="px-3 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}

      {/* Add Stop Button */}
      <button
        onClick={addIntermediateStop}
        className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Stop
      </button>

      {/* End Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <MapPin className="inline w-4 h-4 mr-1" />
          End Location
        </label>
        <AddressAutocomplete
          value={endStop.searchValue}
          onChange={(value) => setEndStop({ ...endStop, searchValue: value })}
          onSelectLocation={(location) => setEndStop({ ...endStop, location, searchValue: location.address })}
          placeholder="Enter end address..."
          mapboxToken={mapboxToken}
        />
      </div>

      {/* Route Summary */}
      {isCalculating && (
        <div className="p-4 bg-blue-50 rounded-lg text-center text-blue-600">
          Calculating route...
        </div>
      )}

      {routeResult && !isCalculating && (
        <div className="p-4 bg-green-50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              <Navigation className="inline w-4 h-4 mr-1" />
              Distance:
            </span>
            <span className="font-medium">{(routeResult.totalDistance / 1000).toFixed(1)} km</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              <Clock className="inline w-4 h-4 mr-1" />
              Duration:
            </span>
            <span className="font-medium">{formatDuration(routeResult.totalDuration)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              <DollarSign className="inline w-4 h-4 mr-1" />
              Total Price:
            </span>
            <span className="font-medium text-lg text-green-600">${routeResult.totalPrice}</span>
          </div>
        </div>
      )}

      {!canCalculateRoute && (
        <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500 text-sm">
          Enter start and end locations to calculate route
        </div>
      )}
    </div>
  );
};
