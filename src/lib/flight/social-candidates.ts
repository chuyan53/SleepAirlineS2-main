import type { Flight, RouteDirection, SocialCueType } from '../../types';
import { CITIES } from '../../data/cities';
import { calculateBearing, haversineDistance } from '../utils/haversine';
import {
  bearingToDirectionLabel,
  COMPARABLE_ROUTE_DIRECTIONS,
  estimateFlightPosition,
  findNearestPlace,
} from './geo';

export interface CurrentFlightContext {
  passengerId: string;
  passengerName: string;
  departureLocation: string;
  departureLatitude: number;
  departureLongitude: number;
  arrivalLocation: string | null;
  arrivalLatitude: number | null;
  arrivalLongitude: number | null;
  routeDirection: RouteDirection;
  takeoffTime: string;
  landingTime: string | null;
  flightProgress: number;
  phase: 'takeoff' | 'landing';
}

export interface SocialCueCandidate {
  cueType: SocialCueType;
  relatedPassenger: string | null;
  facts: Record<string, string | number | null>;
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} 小時 ${m} 分鐘`;
  if (h > 0) return `${h} 小時`;
  return `${m} 分鐘`;
}

function elapsedMinutesSince(isoTime: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(isoTime).getTime()) / 60000));
}

function currentPosition(ctx: CurrentFlightContext): { lat: number; lng: number } {
  if (
    ctx.phase === 'landing' &&
    ctx.arrivalLatitude != null &&
    ctx.arrivalLongitude != null
  ) {
    return { lat: ctx.arrivalLatitude, lng: ctx.arrivalLongitude };
  }
  return { lat: ctx.departureLatitude, lng: ctx.departureLongitude };
}

function teammatePosition(flight: Flight): { lat: number; lng: number } {
  const pos = estimateFlightPosition(flight);
  return { lat: pos.latitude, lng: pos.longitude };
}

function addTeammateArrival(
  candidates: SocialCueCandidate[],
  landedOthers: Flight[]
): void {
  for (const other of landedOthers) {
    if (!other.arrivalLocation) continue;
    candidates.push({
      cueType: 'teammate_arrival',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        departureLocation: other.departureLocation,
        arrivalLocation: other.arrivalLocation,
        flightDuration: formatDuration(other.flightDurationMinutes) || '一段時間',
        flightDurationMinutes: other.flightDurationMinutes,
      },
    });
  }
}

function addTeammateDeparture(
  candidates: SocialCueCandidate[],
  inFlightOthers: Flight[]
): void {
  for (const other of inFlightOthers) {
    const elapsed = elapsedMinutesSince(other.takeoffTime);
    candidates.push({
      cueType: 'teammate_departure',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        departureLocation: other.departureLocation,
        routeDirection: other.routeDirection,
        elapsedMinutes: elapsed,
        elapsedLabel: formatDuration(elapsed) || '剛剛',
      },
    });
  }
}

function addRouteConvergence(
  candidates: SocialCueCandidate[],
  ctx: CurrentFlightContext,
  others: Flight[]
): void {
  const self = currentPosition(ctx);

  for (const other of others) {
    const otherPos = teammatePosition(other);
    const distanceKm = Math.round(
      haversineDistance(self.lat, self.lng, otherPos.lat, otherPos.lng)
    );
    if (distanceKm < 80) continue;

    const bearing = calculateBearing(
      self.lat,
      self.lng,
      otherPos.lat,
      otherPos.lng
    );
    const suggestDirection = bearingToDirectionLabel(bearing);
    const place = findNearestPlace(otherPos.lat, otherPos.lng, CITIES);
    const placeLabel = place
      ? `${place.country} 一帶`
      : other.status === 'landed' && other.arrivalLocation
        ? other.arrivalLocation
        : '未知空域';

    candidates.push({
      cueType: 'route_convergence',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        teammatePlace: placeLabel,
        distanceKm,
        suggestDirection,
        selfLocation: ctx.phase === 'takeoff' ? ctx.departureLocation : ctx.arrivalLocation ?? ctx.departureLocation,
      },
    });
  }
}

function addTeammateInSky(
  candidates: SocialCueCandidate[],
  inFlightOthers: Flight[]
): void {
  for (const other of inFlightOthers) {
    const elapsed = elapsedMinutesSince(other.takeoffTime);
    const pos = teammatePosition(other);
    const place = findNearestPlace(pos.lat, pos.lng, CITIES);
    const progress = Math.round(other.flightProgress);

    candidates.push({
      cueType: 'teammate_in_sky',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        elapsedMinutes: elapsed,
        elapsedLabel: formatDuration(elapsed) || '剛剛',
        flightProgress: progress,
        skyRegion: place?.country ?? '未知',
        nearestCity: place?.displayName ?? null,
      },
    });
  }
}

function addParallelHeading(
  candidates: SocialCueCandidate[],
  ctx: CurrentFlightContext,
  inFlightOthers: Flight[]
): void {
  if (!COMPARABLE_ROUTE_DIRECTIONS.includes(ctx.routeDirection)) return;

  for (const other of inFlightOthers) {
    if (other.routeDirection !== ctx.routeDirection) continue;
    candidates.push({
      cueType: 'parallel_heading',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        routeDirection: ctx.routeDirection,
        selfDeparture: ctx.departureLocation,
        teammateDeparture: other.departureLocation,
      },
    });
  }
}

function addRelayFlight(
  candidates: SocialCueCandidate[],
  inFlightOthers: Flight[]
): void {
  for (const other of inFlightOthers) {
    candidates.push({
      cueType: 'relay_flight',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        teammateDeparture: other.departureLocation,
        teammateProgress: Math.round(other.flightProgress),
      },
    });
  }
}

function addEarlyLanding(
  candidates: SocialCueCandidate[],
  earlierLanders: Flight[]
): void {
  for (const other of earlierLanders) {
    candidates.push({
      cueType: 'early_landing',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        arrivalLocation: other.arrivalLocation ?? '目的地',
      },
    });
  }
}

function addLateLanding(
  candidates: SocialCueCandidate[],
  laterLanders: Flight[]
): void {
  for (const other of laterLanders) {
    candidates.push({
      cueType: 'late_landing',
      relatedPassenger: other.passengerName,
      facts: {
        teammateName: other.passengerName,
        arrivalLocation: other.arrivalLocation ?? '目的地',
      },
    });
  }
}

/** 收集本趟所有可觸發的社交 cue（不含 solo）。 */
export function collectSocialCueCandidates(
  current: CurrentFlightContext,
  groupFlights: Flight[]
): SocialCueCandidate[] {
  const others = groupFlights.filter((f) => f.passengerId !== current.passengerId);
  const inFlightOthers = others.filter((f) => f.status === 'in_flight');
  const landedOthers = others.filter((f) => f.status === 'landed' && f.landingTime != null);
  const trackableOthers = others.filter(
    (f) => f.status === 'in_flight' || (f.status === 'landed' && f.arrivalLatitude != null)
  );

  const candidates: SocialCueCandidate[] = [];

  addTeammateArrival(candidates, landedOthers);
  addTeammateDeparture(candidates, inFlightOthers);
  addRouteConvergence(candidates, current, trackableOthers);
  addTeammateInSky(candidates, inFlightOthers);
  addParallelHeading(candidates, current, inFlightOthers);

  if (current.phase === 'landing' && current.landingTime) {
    addRelayFlight(candidates, inFlightOthers);

    const earlierLanders = landedOthers.filter(
      (f) => f.landingTime! < current.landingTime!
    );
    const laterLanders = landedOthers.filter(
      (f) => f.landingTime! > current.landingTime!
    );
    addEarlyLanding(candidates, earlierLanders);
    addLateLanding(candidates, laterLanders);
  }

  return candidates;
}

export function pickRandomSocialCueCandidate(
  candidates: SocialCueCandidate[]
): SocialCueCandidate | null {
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index] ?? null;
}

export function soloSocialCueCandidate(): SocialCueCandidate {
  return {
    cueType: 'solo',
    relatedPassenger: null,
    facts: { mood: 'solo_night_flight' },
  };
}
