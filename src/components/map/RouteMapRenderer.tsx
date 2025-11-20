import React, { useEffect, useRef } from 'react';
import { MapRouteData, RouteStop } from '../../types';

interface RouteMapRendererProps {
  routeData: MapRouteData | null;
  stops: RouteStop[];
  highlightStops?: { pickupStopId?: string; dropoffStopId?: string };
  mapboxToken?: string;
  height?: string;
  showControls?: boolean;
}

/**
 * Renders an interactive map with route and stops using Mapbox GL JS
 * Highlights specific pickup/dropoff stops for segment bookings
 */
export const RouteMapRenderer: React.FC<RouteMapRendererProps> = ({
  routeData,
  stops,
  highlightStops,
  mapboxToken = typeof window !== 'undefined' && (window as any).ywConfig?.mapbox_token || 'pk.YOUR_MAPBOX_ACCESS_TOKEN_HERE',
  height = '400px',
  showControls = true,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);

  useEffect(() => {
    if (!mapContainer.current || !routeData || stops.length === 0) return;

    // Dynamically load Mapbox GL JS
    const loadMapbox = async () => {
      // Load Mapbox GL JS library
      if (!(window as any).mapboxgl) {
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
        script.async = true;
        document.head.appendChild(script);

        const link = document.createElement('link');
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
        link.rel = 'stylesheet';
        document.head.appendChild(link);

        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      const mapboxgl = (window as any).mapboxgl;
      mapboxgl.accessToken = mapboxToken;

      // Initialize map
      if (!map.current) {
        // Calculate bounds from stops
        const bounds = new mapboxgl.LngLatBounds();
        stops.forEach((stop) => {
          bounds.extend([stop.lng, stop.lat]);
        });

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          bounds: bounds,
          fitBoundsOptions: { padding: 50 },
        });

        if (showControls) {
          map.current.addControl(new mapboxgl.NavigationControl());
        }

        map.current.on('load', () => {
          // Add route line
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: routeData.geometry,
            },
          });

          map.current.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': 4,
            },
          });

          // Add stop markers
          stops.forEach((stop, index) => {
            const isPickup = highlightStops?.pickupStopId === stop.id;
            const isDropoff = highlightStops?.dropoffStopId === stop.id;
            const isHighlighted = isPickup || isDropoff;

            // Create marker element
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.width = isHighlighted ? '32px' : '24px';
            el.style.height = isHighlighted ? '32px' : '24px';
            el.style.borderRadius = '50%';
            el.style.backgroundColor = isPickup
              ? '#10b981'
              : isDropoff
              ? '#ef4444'
              : '#3b82f6';
            el.style.border = '3px solid white';
            el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.color = 'white';
            el.style.fontSize = isHighlighted ? '14px' : '12px';
            el.style.fontWeight = 'bold';
            el.textContent = (index + 1).toString();

            // Create popup
            const popupText = isPickup
              ? `🟢 Your Pickup: ${stop.name}`
              : isDropoff
              ? `🔴 Your Drop-off: ${stop.name}`
              : stop.name;

            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div style="padding: 8px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${popupText}</div>
                ${stop.estimatedArrival ? `<div style="color: #6b7280; font-size: 12px;">ETA: ${stop.estimatedArrival}</div>` : ''}
              </div>`
            );

            // Add marker to map
            new mapboxgl.Marker(el).setLngLat([stop.lng, stop.lat]).setPopup(popup).addTo(map.current);
          });
        });
      }
    };

    loadMapbox();

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [routeData, stops, highlightStops, mapboxToken, showControls]);

  if (!routeData || stops.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full bg-gray-100 rounded-lg flex items-center justify-center text-gray-500"
      >
        No route data available
      </div>
    );
  }

  return <div ref={mapContainer} style={{ height }} className="w-full rounded-lg" />;
};
