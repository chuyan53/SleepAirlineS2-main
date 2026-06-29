export type PassengerStatus = 'not_started' | 'in_flight' | 'landed';
export type FlightStatus = 'boarding' | 'in_flight' | 'landed' | 'cancelled';
export type NarrativeRegion =
  | 'departure_clouds'
  | 'pacific_drift'
  | 'deep_night_current'
  | 'dawn_corridor'
  | 'arrival_harbor';
export type RouteDirection =
  | 'auto'
  | 'eastbound'
  | 'westbound'
  | 'northbound'
  | 'southbound'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest'
  | 'circular'
  | 'unknown';
export type BroadcastStyle =
  | 'formal_captain'
  | 'poetic'
  | 'playful'
  | 'flight_attendant'
  | 'radio_host'
  | 'custom';
export type SocialCueType =
  | 'teammate_arrival'
  | 'teammate_departure'
  | 'route_convergence'
  | 'teammate_in_sky'
  | 'parallel_heading'
  | 'relay_flight'
  | 'early_landing'
  | 'late_landing'
  | 'solo'
  /** @deprecated 舊版 Notion 紀錄可能仍存在 */
  | 'same_sky'
  | 'same_region'
  | 'nearby_region';

export interface Passenger {
  notionId: string;
  passengerId: string;
  name: string;
  groupId: string;
  currentLocation: string;
  currentLatitude: number;
  currentLongitude: number;
  lastFlightId: string | null;
  status: PassengerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Flight {
  notionId: string;
  flightId: string;
  passengerId: string;
  passengerName: string;
  groupId: string;
  status: FlightStatus;
  departureLocation: string;
  departureLatitude: number;
  departureLongitude: number;
  arrivalLocation: string | null;
  arrivalLatitude: number | null;
  arrivalLongitude: number | null;
  takeoffTime: string;
  landingTime: string | null;
  flightDurationMinutes: number | null;
  estimatedFlightDistanceKm: number | null;
  flightProgress: number;
  narrativeRegion: NarrativeRegion;
  routeDirection: RouteDirection;
  takeoffBroadcastStyle: BroadcastStyle | null;
  takeoffBroadcast: string | null;
  captainBroadcast: string | null;
  socialCueType: SocialCueType | null;
  socialCueText: string | null;
  relatedPassenger: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Destination {
  notionId?: string;
  destinationId: string;
  city: string;
  country: string;
  displayName: string;
  latitude: number;
  longitude: number;
  airportCode: string | null;
  region: string;
  availableForLanding: boolean;
}

export interface DestinationResult extends Destination {
  distanceKm: number;
}

export interface SocialCue {
  cueType: SocialCueType;
  relatedPassenger: string | null;
  cueText: string;
}

export interface WorkshopSummary {
  activeGroupCount: number;
  totalInFlightCount: number;
  totalLandedCount: number;
  mostCommonRegion: NarrativeRegion | null;
}

export interface LandingScenery {
  notionId: string;
  entryId: string;
  flightId: string;
  passengerId: string;
  passengerName: string;
  groupId: string;
  arrivalLocation: string;
  country: string;
  imageUrl: string;
  imagePrompt: string;
  landingTime: string | null;
  createdAt: string;
}
