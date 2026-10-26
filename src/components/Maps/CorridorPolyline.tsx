import React from 'react';
import { Polyline } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface CorridorPolylineProps {
  path: LatLngPoint[];
  color?: string;
  weight?: number;
  isDashed?: boolean;
  opacity?: number;
  dashArray?: string;
}

export const CorridorPolyline: React.FC<CorridorPolylineProps> = ({
  path,
  color = '#6366f1',
  weight = 3.5,
  isDashed = false,
  opacity = 0.85,
  dashArray = '6, 8',
}) => {
  if (!path || path.length === 0) return null;

  const positions: LatLngExpression[] = path.map((p) => [p.lat, p.lng]);

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color,
        weight,
        opacity,
        dashArray: isDashed ? dashArray : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }}
    />
  );
};
