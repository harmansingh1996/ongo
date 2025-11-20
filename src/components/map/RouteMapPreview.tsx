import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface RouteMapPreviewProps {
  routeStops: Array<{
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    stop_order: number;
    estimated_arrival?: string;
  }>;
  routeGeometry?: any; // GeoJSON route geometry from Mapbox
  mapboxToken: string;
  className?: string;
}

/**
 * Interactive map preview component for displaying ride routes
 * Uses Mapbox GL JS for real map rendering with route visualization
 */
export function RouteMapPreview({ 
  routeStops, 
  routeGeometry, 
  mapboxToken,
  className = 'w-full h-64'
}: RouteMapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken || map.current) return;

    // Set Mapbox access token
    mapboxgl.accessToken = mapboxToken;

    // Calculate bounds from stops
    const bounds = new mapboxgl.LngLatBounds();
    routeStops.forEach(stop => {
      bounds.extend([stop.lng, stop.lat]);
    });

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      bounds: bounds,
      fitBoundsOptions: {
        padding: 50,
        maxZoom: 12
      }
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Cleanup on unmount
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, routeStops]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Add route line if we have geometry
    if (routeGeometry && routeGeometry.coordinates) {
      // Add route source
      if (!map.current.getSource('route')) {
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: routeGeometry
          }
        });

        // Add route layer
        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 4,
            'line-opacity': 0.8
          }
        });
      }
    } else {
      // Fallback: draw straight lines between stops
      const lineCoordinates = routeStops
        .sort((a, b) => a.stop_order - b.stop_order)
        .map(stop => [stop.lng, stop.lat]);

      if (!map.current.getSource('route')) {
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: lineCoordinates
            }
          }
        });

        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 4,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2]
          }
        });
      }
    }

    // Add markers for each stop
    routeStops
      .sort((a, b) => a.stop_order - b.stop_order)
      .forEach((stop, index) => {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = 'route-marker';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '12px';
        el.style.fontWeight = 'bold';
        el.style.color = 'white';
        
        // Color based on stop type
        if (index === 0) {
          el.style.backgroundColor = '#10b981'; // green for start
          el.innerHTML = '🚗';
        } else if (index === routeStops.length - 1) {
          el.style.backgroundColor = '#ef4444'; // red for end
          el.innerHTML = '🏁';
        } else {
          el.style.backgroundColor = '#2563eb'; // blue for waypoints
          el.innerHTML = (index + 1).toString();
        }

        // Create popup
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px; min-width: 150px;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
              ${stop.name || stop.address}
            </div>
            ${stop.estimated_arrival ? `
              <div style="font-size: 12px; color: #6b7280;">
                ETA: ${stop.estimated_arrival}
              </div>
            ` : ''}
          </div>
        `);

        // Add marker to map
        new mapboxgl.Marker(el)
          .setLngLat([stop.lng, stop.lat])
          .setPopup(popup)
          .addTo(map.current!);
      });

  }, [mapLoaded, routeStops, routeGeometry]);

  return (
    <div className={`${className} rounded-xl overflow-hidden border border-gray-200 shadow-sm`}>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
