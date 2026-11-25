import React, { useCallback, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation } from 'lucide-react';
import type { PropertyListing, PropertyLocation } from '../types.ts';

interface PropertyPinMarkerProps {
  property: PropertyListing;
  isSelected: boolean;
  onSelect: (property: PropertyListing) => void;
  onOpenDetail?: (property: PropertyListing) => void;
}

const PropertyPinMarker: React.FC<PropertyPinMarkerProps> = ({
  property,
  isSelected,
  onSelect,
  onOpenDetail,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={property.location}
        title={`${property.title} - PKR ${property.rent.toLocaleString()}/mo`}
        onClick={() => onSelect(property)}
      >
        <Pin
          background={isSelected ? '#4F46E5' : '#1E1B4B'}
          borderColor="#FFFFFF"
          glyphColor="#FFFFFF"
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={() => onSelect(property)}>
          <div className="p-1 text-slate-900">
            {property.imageURLs[0] && (
              <img
                src={property.imageURLs[0]}
                alt={property.title}
                referrerPolicy="no-referrer"
                className="w-full h-24 object-cover rounded-lg mb-2"
              />
            )}
            <p className="font-semibold text-sm leading-tight truncate">{property.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {property.society || property.area}, {property.city}
            </p>
            <p className="text-sm font-bold text-indigo-600 mt-1 tabular-nums">
              PKR {property.rent.toLocaleString()}/mo
            </p>
            {onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail(property)}
                className="mt-2 w-full py-1.5 px-3 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                View Property
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface PropertyMapProps {
  apiKey: string;
  properties?: PropertyListing[];
  center?: PropertyLocation;
  zoom?: number;
  heightClass?: string;
  pickerMode?: boolean;
  pickedLocation?: PropertyLocation;
  onPickLocation?: (loc: PropertyLocation) => void;
  onOpenDetail?: (property: PropertyListing) => void;
}

export const PropertyMap: React.FC<PropertyMapProps> = ({
  apiKey,
  properties = [],
  center = { lat: 31.5204, lng: 74.3587 },
  zoom = 12,
  heightClass = 'h-72',
  pickerMode = false,
  pickedLocation,
  onPickLocation,
  onOpenDetail,
}) => {
  const [selectedProperty, setSelectedProperty] = useState<PropertyListing | null>(null);

  const handleToggleSelect = useCallback((prop: PropertyListing) => {
    setSelectedProperty((prev) => (prev?.propertyId === prop.propertyId ? null : prop));
  }, []);

  const effectiveKey = apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!effectiveKey) {
    return (
      <div
        className={`${heightClass} w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-indigo-50/50 to-slate-100 flex flex-col items-center justify-center p-6 text-center`}
      >
        <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
          <MapPin className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-slate-800">
          Approximate Neighborhood Pin ({center.lat.toFixed(4)}, {center.lng.toFixed(4)})
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Interactive Google Map renders once a Google Maps API key is configured in environment settings. Exact residential address remains protected.
        </p>
        {pickerMode && onPickLocation && (
          <button
            type="button"
            onClick={() =>
              onPickLocation({
                lat: Number((center.lat + (Math.random() - 0.5) * 0.015).toFixed(4)),
                lng: Number((center.lng + (Math.random() - 0.5) * 0.015).toFixed(4)),
              })
            }
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            Snap Approximate Neighborhood Pin
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${heightClass} w-full rounded-2xl overflow-hidden border border-slate-200 relative`}>
      <APIProvider apiKey={effectiveKey} libraries={['marker']} language="en" region="PK">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={pickedLocation || center}
          defaultZoom={zoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          onClick={(ev) => {
            if (pickerMode && onPickLocation && ev.detail.latLng) {
              onPickLocation({
                lat: Number(ev.detail.latLng.lat.toFixed(5)),
                lng: Number(ev.detail.latLng.lng.toFixed(5)),
              });
            }
          }}
        >
          {pickerMode && pickedLocation && (
            <AdvancedMarker position={pickedLocation} title="Approximate listing location">
              <Pin background="#5B3CF5" borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={1.15} />
            </AdvancedMarker>
          )}

          {!pickerMode &&
            properties.map((prop) => (
              <PropertyPinMarker
                key={prop.propertyId}
                property={prop}
                isSelected={selectedProperty?.propertyId === prop.propertyId}
                onSelect={handleToggleSelect}
                onOpenDetail={onOpenDetail}
              />
            ))}
        </GoogleMap>
      </APIProvider>
    </div>
  );
};
