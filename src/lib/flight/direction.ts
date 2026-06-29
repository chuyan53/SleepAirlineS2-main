import type { Destination, DestinationResult, RouteDirection } from '../../types';
import { haversineDistance, calculateBearing } from '../utils/haversine';

// Bearing ranges for each direction (0° = north, clockwise)
function isInDirection(bearing: number, direction: RouteDirection): boolean {
  const b = ((bearing % 360) + 360) % 360;
  switch (direction) {
    case 'northbound': return b >= 315 || b < 45;
    case 'northeast':  return b >= 22.5 && b < 67.5;
    case 'eastbound':  return b >= 45 && b < 135;
    case 'southeast':  return b >= 112.5 && b < 157.5;
    case 'southbound': return b >= 135 && b < 225;
    case 'southwest':  return b >= 202.5 && b < 247.5;
    case 'westbound':  return b >= 225 && b < 315;
    case 'northwest':  return b >= 292.5 && b < 337.5;
    // auto, circular, unknown → no direction constraint
    default:           return true;
  }
}

export function findArrivalDestination(
  departureLat: number,
  departureLng: number,
  distanceKm: number,
  routeDirection: RouteDirection,
  destinations: Destination[],
  departureLocation: string
): DestinationResult {
  const available = destinations.filter(
    (d) => d.availableForLanding && d.displayName !== departureLocation
  );

  type Candidate = DestinationResult & { distanceDelta: number; inDirection: boolean };

  const candidates: Candidate[] = available.map((dest) => {
    const actualDistance = haversineDistance(
      departureLat, departureLng,
      dest.latitude, dest.longitude
    );
    const bearing = calculateBearing(
      departureLat, departureLng,
      dest.latitude, dest.longitude
    );
    return {
      ...dest,
      distanceKm: actualDistance,
      distanceDelta: Math.abs(actualDistance - distanceKm),
      inDirection: isInDirection(bearing, routeDirection),
    };
  });

  // Primary: correct direction, closest to target distance
  const directional = candidates.filter((c) => c.inDirection);
  if (directional.length > 0) {
    directional.sort((a, b) => a.distanceDelta - b.distanceDelta);
    return directional[0];
  }

  // Fallback: any direction, closest to target distance
  candidates.sort((a, b) => a.distanceDelta - b.distanceDelta);
  return candidates[0];
}
