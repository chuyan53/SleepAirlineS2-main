import type { Flight, FlightStatus, NarrativeRegion } from '../../types';
import {
  getNotionClient,
  isNotionConfigured,
  readTitle,
  readText,
  readSelect,
  readNumber,
  readDate,
} from './client';
import { resolveDashboardDbId } from './ensure-dashboard';
import { calculateFlightProgress } from '../flight/progress';
import { getNarrativeRegion } from '../flight/region';

function readPassengerId(props: Record<string, unknown>): string {
  return readText(props, 'Passenger ID') || readTitle(props, 'Passenger ID');
}

function readFlightId(props: Record<string, unknown>): string {
  return readTitle(props, 'Flight ID') || readText(props, 'Flight ID');
}

export function parseFlightFromPage(page: Record<string, unknown>): Flight {
  const props = page.properties as Record<string, unknown>;
  const takeoffTime = readDate(props, 'Takeoff Time');
  const status = (readSelect(props, 'Status') ?? 'not_started') as FlightStatus;
  const resolvedTakeoff = takeoffTime ?? new Date().toISOString();
  const flightProgress = status === 'landed' ? 100 : status === 'in_flight' ? calculateFlightProgress(resolvedTakeoff) : 0;
  const narrativeRegion: NarrativeRegion = status === 'landed' ? 'arrival_harbor' : status === 'in_flight' ? getNarrativeRegion(flightProgress) : 'departure_clouds';

  return {
    notionId: page.id as string,
    flightId: readFlightId(props),
    passengerId: readPassengerId(props),
    passengerName: readText(props, 'Name'),
    groupId: readSelect(props, 'Group ID') ?? '',
    status,
    departureLocation: readText(props, 'Departure Location'),
    departureLatitude: readNumber(props, 'Departure Latitude') ?? 0,
    departureLongitude: readNumber(props, 'Departure Longitude') ?? 0,
    arrivalLocation: readText(props, 'Arrival Location') || null,
    arrivalLatitude: readNumber(props, 'Arrival Latitude'),
    arrivalLongitude: readNumber(props, 'Arrival Longitude'),
    takeoffTime: resolvedTakeoff,
    landingTime: readDate(props, 'Landing Time'),
    flightDurationMinutes: readNumber(props, 'Flight Duration Minutes'),
    estimatedFlightDistanceKm: readNumber(props, 'Estimated Flight Distance KM'),
    flightProgress,
    narrativeRegion,
    routeDirection: (readSelect(props, 'Route Direction') ?? 'auto') as Flight['routeDirection'],
    takeoffBroadcastStyle: readSelect(props, 'Takeoff Broadcast Style') as Flight['takeoffBroadcastStyle'],
    takeoffBroadcast: readText(props, 'Takeoff Broadcast') || null,
    captainBroadcast: readText(props, 'Captain Broadcast') || null,
    socialCueType: readSelect(props, 'Social Cue Type') as Flight['socialCueType'],
    socialCueText: readText(props, 'Social Cue Text') || null,
    relatedPassenger: readText(props, 'Related Passenger') || null,
    createdAt: readDate(props, 'Created At') ?? new Date().toISOString(),
    updatedAt: readDate(props, 'Updated At') ?? new Date().toISOString(),
  };
}

export async function getFlightByFlightId(flightId: string): Promise<Flight | null> {
  if (!isNotionConfigured()) return null;

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const byTitle = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Flight ID', title: { equals: flightId } },
    page_size: 1,
  });

  if (byTitle.results.length > 0) {
    return parseFlightFromPage(byTitle.results[0] as unknown as Record<string, unknown>);
  }

  const byText = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Flight ID', rich_text: { equals: flightId } },
    page_size: 1,
  });

  if (byText.results.length === 0) return null;
  return parseFlightFromPage(byText.results[0] as unknown as Record<string, unknown>);
}
