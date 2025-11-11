import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlertCircle, Save, Users, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ride } from '../types';
import { calculateDistance } from '../utils/distance';

export interface EditRideModalProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
  onRideUpdated: () => void;
}

interface PriceTier {
  id: number;
  name: string;
  min_distance_km: string;
  max_distance_km: string | null;
  min_price_per_km: string;
  max_price_per_km: string;
  driver_override_allowed?: boolean | null;
}

interface PriceValidationState {
  isValid: boolean;
  message: string;
  suggestedPrice?: number;
}

interface PriceValidationOptions {
  enforceLimits?: boolean;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const parseLocalDateTime = (timestamp?: string | null) => {
  if (!timestamp) return null;
  const trimmed = timestamp.split(/[Z+]/)[0].replace('T', ' ');
  const parsed = new Date(trimmed);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = new Date(timestamp);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const formatDateForInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatTimeForInput = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const buildLocalTimestamp = (date: Date) => {
  const working = new Date(date.getTime());
  working.setSeconds(0, 0);

  const year = working.getFullYear();
  const month = String(working.getMonth() + 1).padStart(2, '0');
  const day = String(working.getDate()).padStart(2, '0');
  const hours = String(working.getHours()).padStart(2, '0');
  const minutes = String(working.getMinutes()).padStart(2, '0');
  const seconds = String(working.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const combineLocalDateTime = (date: string, time: string) => {
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? null : combined;
};

const EditRideModal: React.FC<EditRideModalProps> = ({ ride, isOpen, onClose, onRideUpdated }) => {
  const [departureDate, setDepartureDate] = useState<string>('');
  const [departureTime, setDepartureTime] = useState<string>('');
  const [availableSeats, setAvailableSeats] = useState<number>(ride.available_seats || 1);
  const [pricePerSeat, setPricePerSeat] = useState<number>(ride.price_per_seat || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceTierHint, setPriceTierHint] = useState<PriceValidationState | null>(null);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [priceTierError, setPriceTierError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    initializeForm();
    loadPriceTiers().catch(() => {
      /* silent */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const initializeForm = () => {
    const parsedDeparture = parseLocalDateTime(ride.departure_time);
    if (parsedDeparture) {
      setDepartureDate(formatDateForInput(parsedDeparture));
      setDepartureTime(formatTimeForInput(parsedDeparture));
    } else {
      setDepartureDate('');
      setDepartureTime('');
    }

    setAvailableSeats(ride.available_seats || 1);
    setPricePerSeat(ride.price_per_seat || 0);
    setError(null);
    setPriceTierHint(null);
  };

  const loadPriceTiers = async () => {
    setPriceTierError(null);

    const { data, error: tierError } = await supabase
      .from('price_tiers')
      .select('*')
      .order('priority', { ascending: true });

    if (tierError) {
      console.warn('Failed to load price tiers', tierError);
      setPriceTierError(
        'We could not verify the allowed price range. Please try again later or contact support if the issue persists.'
      );
      setPriceTiers([]);
      return;
    }

    if (!data || data.length === 0) {
      setPriceTierError('No price tiers were found. Please contact support.');
      setPriceTiers([]);
      return;
    }

    setPriceTiers(data);
  };

  const evaluatePrice = async (
    newPrice: number,
    options: PriceValidationOptions = {}
  ): Promise<PriceValidationState | null> => {
    if (priceTiers.length === 0) {
      setPriceTierHint(null);
      return {
        isValid: false,
        message: 'Price tiers are unavailable. Please wait a moment and try again.',
        suggestedPrice: undefined
      };
    }

    if (!ride || !ride.from_lat || !ride.from_lng || !ride.to_lat || !ride.to_lng) {
      setPriceTierHint({
        isValid: false,
        message: 'Cannot validate price because ride coordinates are missing.',
        suggestedPrice: undefined
      });
      return {
        isValid: false,
        message: 'Cannot validate price because ride coordinates are missing.',
        suggestedPrice: undefined
      };
    }

    if (!newPrice || Number.isNaN(newPrice) || newPrice <= 0) {
      setPriceTierHint(null);
      return {
        isValid: false,
        message: 'Price per seat must be greater than 0.',
        suggestedPrice: undefined
      };
    }

    try {
      const distanceKm = await calculateDistance(
        { lat: ride.from_lat, lng: ride.from_lng },
        { lat: ride.to_lat, lng: ride.to_lng }
      );

      const applicableTier = priceTiers.find((tier) => {
        const minDistance = parseFloat(tier.min_distance_km);
        const maxDistance = tier.max_distance_km ? parseFloat(tier.max_distance_km) : Infinity;
        return distanceKm >= minDistance && distanceKm <= maxDistance;
      });

      if (!applicableTier) {
        setPriceTierHint(null);
        return null;
      }

      const minPrice = parseFloat(applicableTier.min_price_per_km) * distanceKm;
      const maxPrice = parseFloat(applicableTier.max_price_per_km) * distanceKm;

      if (Number.isNaN(minPrice) || Number.isNaN(maxPrice)) {
        const state: PriceValidationState = {
          isValid: false,
          message: 'Price tier limits could not be calculated. Please contact support.',
          suggestedPrice: undefined
        };
        setPriceTierHint(state);
        return state;
      }
      const roundedMin = roundCurrency(minPrice);
      const roundedMax = roundCurrency(maxPrice);

      if (newPrice < roundedMin) {
        const state: PriceValidationState = {
          isValid: false,
          message: `Price must be at least $${roundedMin.toFixed(2)} CAD per seat for this route.`,
          suggestedPrice: roundedMin
        };
        setPriceTierHint(state);
        return state;
      }

      if (newPrice > roundedMax) {
        const state: PriceValidationState = {
          isValid: false,
          message: `Price must not exceed $${roundedMax.toFixed(2)} CAD per seat for this route.`,
          suggestedPrice: roundedMax
        };
        setPriceTierHint(state);
        return state;
      }

      const validState: PriceValidationState = {
        isValid: true,
        message: 'Price is within the required range for this route.',
        suggestedPrice: undefined
      };
      setPriceTierHint(validState);
      return validState;
    } catch (validationError) {
      console.warn('Price validation failed', validationError);
      const state: PriceValidationState = {
        isValid: false,
        message: 'Price validation failed. Please try again.',
        suggestedPrice: undefined
      };
      setPriceTierHint(state);
      return state;
    }
  };

  const validatePrice = async (value: number, options?: PriceValidationOptions) => {
    return evaluatePrice(value, options);
  };

  const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    const normalized = Number.isNaN(value) ? 0 : value;
    setPricePerSeat(normalized);
    validatePrice(normalized).catch(() => {
      /* ignored */
    });
  };

  const handleSeatChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setAvailableSeats(parseInt(event.target.value, 10));
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDepartureDate(event.target.value);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setDepartureTime(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!departureDate || !departureTime) {
      setError('Please select a departure date and time.');
      return;
    }

    const combinedDate = combineLocalDateTime(departureDate, departureTime);
    if (!combinedDate) {
      setError('Invalid departure date or time.');
      return;
    }

    const now = new Date();
    if (combinedDate < now) {
      setError('Departure time must be in the future.');
      return;
    }

    if (availableSeats < 1) {
      setError('Available seats must be at least 1.');
      return;
    }

    if (priceTiers.length === 0) {
      setError('Price tiers are still loading. Please wait a moment and try again.');
      return;
    }

    if (!pricePerSeat || pricePerSeat <= 0) {
      setError('Price per seat must be greater than 0.');
      return;
    }

    const validation = await validatePrice(pricePerSeat, { enforceLimits: true });
    if (!validation || !validation.isValid) {
      setError(validation?.message || 'Price did not pass validation.');
      return;
    }

    setLoading(true);

    try {
      const departureTimestamp = buildLocalTimestamp(combinedDate);

      const { error: updateError } = await supabase
        .from('rides')
        .update({
          departure_time: departureTimestamp,
          available_seats: availableSeats,
          price_per_seat: pricePerSeat,
        })
        .eq('id', ride.id);

      if (updateError) {
        throw updateError;
      }

      setLoading(false);
      onRideUpdated();
      onClose();
    } catch (updateError) {
      console.error('Error updating ride', updateError);
      setLoading(false);
      setError('Failed to update ride. Please try again.');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit Ride</h2>
            <p className="text-sm text-gray-500">Update departure details or seat availability</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          {error && (
            <div className="flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-gray-700">Departure Date</span>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="date"
                  value={departureDate}
                  onChange={handleDateChange}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
            </label>
            <label className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-gray-700">Departure Time</span>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select
                  value={departureTime}
                  onChange={handleTimeChange}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  required
                >
                  <option value="">Select time</option>
                  {Array.from({ length: 24 }, (_, hour) =>
                    Array.from({ length: 4 }, (_, quarter) => {
                      const minutes = quarter * 15;
                      const timeValue = `${hour.toString().padStart(2, '0')}:${minutes
                        .toString()
                        .padStart(2, '0')}`;
                      const display = new Date(`2000-01-01T${timeValue}:00`).toLocaleTimeString('en-CA', {
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      return (
                        <option key={`${hour}-${quarter}`} value={timeValue}>
                          {display}
                        </option>
                      );
                    })
                  ).flat()}
                </select>
              </div>
            </label>
            <label className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-gray-700">Available Seats</span>
              <div className="relative">
                <Users className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select
                  value={availableSeats}
                  onChange={handleSeatChange}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((seat) => (
                    <option key={seat} value={seat}>
                      {seat} seat{seat > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </label>

          </div>

          {priceTierError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {priceTierError}
            </div>
          )}

          {priceTierHint && !priceTierError && (
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                priceTierHint.isValid
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{priceTierHint.message}</span>
                {priceTierHint.suggestedPrice && !priceTierHint.isValid && (
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={() => {
                      const suggested = priceTierHint.suggestedPrice || 0;
                      setPricePerSeat(suggested);
                      validatePrice(suggested).catch(() => {
                        /* ignored */
                      });
                    }}
                  >
                    Use ${priceTierHint.suggestedPrice.toFixed(2)}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center space-x-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {loading ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRideModal;
