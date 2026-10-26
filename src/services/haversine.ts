/**
 * Haversine formula helper for calculating great-circle distance between two geographic coordinates in kilometers.
 */

/**
 * Calculates great-circle distance between two latitude/longitude points in kilometers.
 * @param lat1 Latitude of first point in decimal degrees
 * @param lon1 Longitude of first point in decimal degrees
 * @param lat2 Latitude of second point in decimal degrees
 * @param lon2 Longitude of second point in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const R = 6371; // Earth's mean radius in kilometers
  const toRad = (angle: number) => (angle * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convenience alias for haversineDistanceKm.
 */
export const haversine = haversineDistanceKm;

/**
 * Interface representing a latitude/longitude coordinate pair.
 */
export interface GeoCoordinate {
  lat: number;
  lng?: number;
  lon?: number;
}

/**
 * Helper to compute distance between two coordinate objects in kilometers.
 */
export function haversineCoordinatesKm(
  point1: GeoCoordinate,
  point2: GeoCoordinate
): number {
  const lon1 = point1.lng ?? point1.lon ?? 0;
  const lon2 = point2.lng ?? point2.lon ?? 0;
  return haversineDistanceKm(point1.lat, lon1, point2.lat, lon2);
}
