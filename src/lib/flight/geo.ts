import type { Destination, RouteDirection } from '../../types';
import { calculateFlightDistance } from './distance';
import { haversineDistance } from '../utils/haversine';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const DIRECTION_CENTER_BEARING: Partial<Record<RouteDirection, number>> = {
  northbound: 0,
  northeast: 45,
  eastbound: 90,
  southeast: 135,
  southbound: 180,
  southwest: 225,
  westbound: 270,
  northwest: 315,
};

const BEARING_TO_LABEL: Array<{ max: number; label: string }> = [
  { max: 22.5, label: '向北' },
  { max: 67.5, label: '向東北' },
  { max: 112.5, label: '向東' },
  { max: 157.5, label: '向東南' },
  { max: 202.5, label: '向南' },
  { max: 247.5, label: '向西南' },
  { max: 292.5, label: '向西' },
  { max: 337.5, label: '向西北' },
  { max: 360, label: '向北' },
];

export function directionCenterBearing(direction: RouteDirection): number | null {
  return DIRECTION_CENTER_BEARING[direction] ?? null;
}

export function bearingToDirectionLabel(bearing: number): string {
  const b = ((bearing % 360) + 360) % 360;
  for (const entry of BEARING_TO_LABEL) {
    if (b < entry.max) return entry.label;
  }
  return '向北';
}

export function moveAlongBearing(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceKm: number
): { latitude: number; longitude: number } {
  const angularDistance = distanceKm / 6371;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function estimateFlightPosition(flight: {
  departureLatitude: number;
  departureLongitude: number;
  routeDirection: RouteDirection;
  takeoffTime: string;
  status: string;
  arrivalLatitude: number | null;
  arrivalLongitude: number | null;
}): { latitude: number; longitude: number; traveledKm: number } {
  if (
    flight.status === 'landed' &&
    flight.arrivalLatitude != null &&
    flight.arrivalLongitude != null
  ) {
    return {
      latitude: flight.arrivalLatitude,
      longitude: flight.arrivalLongitude,
      traveledKm: 0,
    };
  }

  const elapsedMinutes = Math.max(
    0,
    (Date.now() - new Date(flight.takeoffTime).getTime()) / 60000
  );
  const traveledKm = calculateFlightDistance(elapsedMinutes);
  const bearing = directionCenterBearing(flight.routeDirection) ?? 90;
  const pos = moveAlongBearing(
    flight.departureLatitude,
    flight.departureLongitude,
    bearing,
    traveledKm
  );
  return { ...pos, traveledKm };
}

export function findNearestPlace(
  lat: number,
  lng: number,
  cities: Destination[]
): { displayName: string; country: string; distanceKm: number } | null {
  if (cities.length === 0) return null;

  let nearest = cities[0];
  let minDist = haversineDistance(lat, lng, nearest.latitude, nearest.longitude);

  for (const city of cities.slice(1)) {
    const dist = haversineDistance(lat, lng, city.latitude, city.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }

  return {
    displayName: nearest.displayName,
    country: nearest.country,
    distanceKm: Math.round(minDist),
  };
}

export const COMPARABLE_ROUTE_DIRECTIONS: RouteDirection[] = [
  'eastbound',
  'westbound',
  'northbound',
  'southbound',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
];
