import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, coordinates?: { lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  province?: string;
  region?: string;
  state_district?: string;
  country?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
  address?: NominatimAddress;
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Enter address',
  className = '',
  disabled = false,
}) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    if (value.length > 2) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        searchAddresses(value);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const formatLocation = (result: NominatimResult) => {
    const address = result.address || {};
    const cityName = (
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.hamlet ||
      result.display_name.split(',')[0]
    ).trim();

    const rawRegion = (
      address.state ||
      address.province ||
      address.region ||
      address.county ||
      address.state_district ||
      ''
    ).trim();

    let region = rawRegion;
    if (region) {
      if (/ontario/i.test(region)) {
        region = 'Ontario';
      } else {
        const directionalPrefixes = [
          'northern',
          'southern',
          'eastern',
          'western',
          'northeastern',
          'northwestern',
          'southeastern',
          'southwestern',
          'central',
        ];
        const lowerRegion = region.toLowerCase();
        const prefix = directionalPrefixes.find((dir) => lowerRegion.startsWith(dir));
        if (prefix) {
          const parts = region.split(/[\s,-]+/);
          const lastPart = parts[parts.length - 1];
          if (lastPart && /ontario/i.test(lastPart)) {
            region = 'Ontario';
          } else {
            region = lastPart ? lastPart.trim() : '';
          }
        }
      }
    }

    const country = (address.country || 'Canada').trim();
    const parts = [cityName, region, country].filter(Boolean);
    const uniqueParts = parts.filter(
      (part, index) => parts.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === index,
    );

    return uniqueParts.join(', ');
  };

  const searchAddresses = async (query: string) => {
    if (!query.trim()) return;

    console.log('🗺️ Address Autocomplete Search:');
    console.log('  - Original query:', query);

    setLoading(true);
    try {
      // Add Canada restriction to the search query
      const canadaQuery = `${query}, Canada`;
      const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        canadaQuery,
      )}&limit=8&addressdetails=1&countrycodes=ca&class=place&type=city`;

      console.log('  - Enhanced query:', canadaQuery);
      console.log('  - API URL:', apiUrl);

      const response = await fetch(apiUrl);

      console.log('  - API Response status:', response.status);
      console.log('  - API Response ok:', response.ok);

      if (response.ok) {
        const data: NominatimResult[] = await response.json();
        console.log('  - Raw API results count:', data.length);
        console.log('  - Raw API data:', data.slice(0, 2)); // Log first 2 for brevity

        const formattedResults = data
          .map((result) => ({
            ...result,
            display_name: formatLocation(result),
          }))
          .filter(
            (result, index, self) =>
              index === self.findIndex((r) => r.display_name.toLowerCase() === result.display_name.toLowerCase()),
          );

        setSuggestions(formattedResults);
        setShowSuggestions(formattedResults.length > 0);
      }
    } catch (error) {
      console.error('Error searching addresses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: NominatimResult) => {
    const coordinates = {
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
    };

    skipNextSearchRef.current = true;
    onChange(suggestion.display_name, coordinates);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
        />
        {loading && (
          <Loader className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 animate-spin" size={20} />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:bg-gray-50 focus:outline-none"
            >
              <div className="flex items-start space-x-3">
                <MapPin size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{suggestion.display_name}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
