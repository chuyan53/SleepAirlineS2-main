import type { Flight, FlightStatus, NarrativeRegion, RouteDirection, BroadcastStyle, SocialCueType } from '../../types';
import {
  getNotionClient, isNotionConfigured,
  readTitle, readText, readSelect, readNumber, readDate,
  wTitle, wText, wSelect, wNumber, wDate,
} from './client';
import { resolveDashboardDbId } from './ensure-dashboard';
import { syncMemPassenger } from './passengers';
import { calculateFlightProgress } from '../flight/progress';
import { getNarrativeRegion } from '../flight/region';
import { getDashboardPropertyNames, pickExistingProperties } from './schema-introspect';

const mem: Flight[] = [];

function liveFlightState(
  status: FlightStatus,
  takeoffTime: string
): { flightProgress: number; narrativeRegion: NarrativeRegion } {
  if (status === 'landed') {
    return { flightProgress: 100, narrativeRegion: 'arrival_harbor' };
  }
  const flightProgress = calculateFlightProgress(takeoffTime);
  return { flightProgress, narrativeRegion: getNarrativeRegion(flightProgress) };
}

function readPassengerId(props: Record<string, unknown>): string {
  return readText(props, 'Passenger ID') || readTitle(props, 'Passenger ID');
}

function readFlightId(props: Record<string, unknown>): string {
  return readTitle(props, 'Flight ID') || readText(props, 'Flight ID');
}

function parseFlight(page: Record<string, unknown>): Flight {
  const props = page.properties as Record<string, unknown>;
  const takeoffTime = readDate(props, 'Takeoff Time');
  const status = (readSelect(props, 'Status') ?? 'not_started') as FlightStatus;
  const resolvedTakeoff = takeoffTime ?? new Date().toISOString();
  const live = liveFlightState(status === 'in_flight' ? 'in_flight' : status === 'landed' ? 'landed' : 'in_flight', resolvedTakeoff);
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
    flightProgress: status === 'landed' ? 100 : status === 'in_flight' ? live.flightProgress : 0,
    narrativeRegion: status === 'landed' ? 'arrival_harbor' : status === 'in_flight' ? live.narrativeRegion : 'departure_clouds',
    routeDirection: (readSelect(props, 'Route Direction') ?? 'auto') as RouteDirection,
    takeoffBroadcastStyle: readSelect(props, 'Takeoff Broadcast Style') as BroadcastStyle | null,
    takeoffBroadcast: readText(props, 'Takeoff Broadcast') || null,
    captainBroadcast: readText(props, 'Captain Broadcast') || null,
    socialCueType: readSelect(props, 'Social Cue Type') as SocialCueType | null,
    socialCueText: readText(props, 'Social Cue Text') || null,
    relatedPassenger: readText(props, 'Related Passenger') || null,
    createdAt: readDate(props, 'Created At') ?? new Date().toISOString(),
    updatedAt: readDate(props, 'Updated At') ?? new Date().toISOString(),
  };
}

function generateFlightId(passengerId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const suffix = passengerId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return `FL-${suffix}-${ts}`;
}

export async function createFlight(params: {
  passengerId: string;
  passengerName: string;
  groupId: string;
  departureLocation: string;
  departureLatitude: number;
  departureLongitude: number;
  routeDirection: RouteDirection;
  takeoffTime?: string;
}): Promise<Flight> {
  const now = new Date().toISOString();
  const takeoffTime = params.takeoffTime ?? now;
  const flightId = generateFlightId(params.passengerId);

  if (!isNotionConfigured()) {
    for (let i = mem.length - 1; i >= 0; i--) {
      if (mem[i].passengerId === params.passengerId && mem[i].status === 'in_flight') {
        mem.splice(i, 1);
      }
    }
    const f: Flight = {
      notionId: `mem_flight_${flightId}`,
      flightId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      groupId: params.groupId,
      status: 'in_flight',
      departureLocation: params.departureLocation,
      departureLatitude: params.departureLatitude,
      departureLongitude: params.departureLongitude,
      arrivalLocation: null, arrivalLatitude: null, arrivalLongitude: null,
      takeoffTime, landingTime: null,
      flightDurationMinutes: null, estimatedFlightDistanceKm: null,
      flightProgress: 0,
      narrativeRegion: 'departure_clouds',
      routeDirection: params.routeDirection,
      takeoffBroadcastStyle: null, takeoffBroadcast: null,
      captainBroadcast: null,
      socialCueType: null, socialCueText: null, relatedPassenger: null,
      createdAt: now, updatedAt: now,
    };
    mem.push(f);
    syncMemPassenger(params.passengerId, {
      status: 'in_flight',
      lastFlightId: flightId,
      name: params.passengerName,
      groupId: params.groupId,
    });
    return f;
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();
  const allowed = await getDashboardPropertyNames();

  const fullProperties = {
      'Flight ID': wTitle(flightId),
      'Passenger ID': wText(params.passengerId),
      'Name': wText(params.passengerName),
      'Group ID': wSelect(params.groupId),
      'Status': wSelect('in_flight'),
      'Departure Location': wText(params.departureLocation),
      'Departure Latitude': wNumber(params.departureLatitude),
      'Departure Longitude': wNumber(params.departureLongitude),
      'Arrival Location': wText(null),
      'Arrival Latitude': wNumber(null),
      'Arrival Longitude': wNumber(null),
      'Takeoff Time': wDate(takeoffTime),
      'Landing Time': wDate(null),
      'Flight Duration Minutes': wNumber(null),
      'Estimated Flight Distance KM': wNumber(null),
      'Route Direction': wSelect(params.routeDirection),
      'Takeoff Broadcast Style': wSelect(null),
      'Takeoff Broadcast': wText(null),
      'Captain Broadcast': wText(null),
      'Social Cue Type': wSelect(null),
      'Social Cue Text': wText(null),
      'Related Passenger': wText(null),
      'Created At': wDate(now),
      'Updated At': wDate(now),
  };

  const page = await client.pages.create({
    parent: { database_id: dbId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: pickExistingProperties(fullProperties, allowed) as any,
  });

  return parseFlight(page as unknown as Record<string, unknown>);
}

export async function getActiveFlight(passengerId: string): Promise<Flight | null> {
  if (!isNotionConfigured()) {
    return mem.find((f) => f.passengerId === passengerId && f.status === 'in_flight') ?? null;
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Passenger ID', rich_text: { equals: passengerId } },
        { property: 'Status', select: { equals: 'in_flight' } },
      ],
    },
    page_size: 1,
  });

  if (result.results.length === 0) return null;
  return parseFlight(result.results[0] as unknown as Record<string, unknown>);
}

export async function updateFlight(
  notionId: string,
  updates: Partial<{
    status: FlightStatus;
    passengerName: string;
    groupId: string;
    arrivalLocation: string;
    arrivalLatitude: number;
    arrivalLongitude: number;
    takeoffTime: string;
    landingTime: string;
    flightDurationMinutes: number;
    estimatedFlightDistanceKm: number;
    takeoffBroadcastStyle: BroadcastStyle;
    takeoffBroadcast: string;
    captainBroadcast: string;
    socialCueType: SocialCueType;
    socialCueText: string;
    relatedPassenger: string;
  }>
): Promise<void> {
  if (!isNotionConfigured()) {
    const f = mem.find((x) => x.notionId === notionId);
    if (f) {
      Object.assign(f, updates);
      f.updatedAt = new Date().toISOString();
      if (updates.status === 'landed' && updates.arrivalLocation) {
        syncMemPassenger(f.passengerId, {
          status: 'landed',
          currentLocation: updates.arrivalLocation,
          currentLatitude: updates.arrivalLatitude,
          currentLongitude: updates.arrivalLongitude,
          lastFlightId: f.flightId,
        });
      }
    }
    return;
  }

  const client = getNotionClient();
  const now = new Date().toISOString();
  const allowed = await getDashboardPropertyNames();

  const fullProperties: Record<string, unknown> = { 'Updated At': wDate(now) };
  if (updates.status !== undefined) fullProperties['Status'] = wSelect(updates.status);
  if (updates.passengerName !== undefined) fullProperties['Name'] = wText(updates.passengerName);
  if (updates.groupId !== undefined) fullProperties['Group ID'] = wSelect(updates.groupId);
  if (updates.arrivalLocation !== undefined) fullProperties['Arrival Location'] = wText(updates.arrivalLocation);
  if (updates.arrivalLatitude !== undefined) fullProperties['Arrival Latitude'] = wNumber(updates.arrivalLatitude);
  if (updates.arrivalLongitude !== undefined) fullProperties['Arrival Longitude'] = wNumber(updates.arrivalLongitude);
  if (updates.takeoffTime !== undefined) fullProperties['Takeoff Time'] = wDate(updates.takeoffTime);
  if (updates.landingTime !== undefined) fullProperties['Landing Time'] = wDate(updates.landingTime);
  if (updates.flightDurationMinutes !== undefined) fullProperties['Flight Duration Minutes'] = wNumber(updates.flightDurationMinutes);
  if (updates.estimatedFlightDistanceKm !== undefined) fullProperties['Estimated Flight Distance KM'] = wNumber(updates.estimatedFlightDistanceKm);
  if (updates.takeoffBroadcastStyle !== undefined) fullProperties['Takeoff Broadcast Style'] = wSelect(updates.takeoffBroadcastStyle);
  if (updates.takeoffBroadcast !== undefined) fullProperties['Takeoff Broadcast'] = wText(updates.takeoffBroadcast);
  if (updates.captainBroadcast !== undefined) fullProperties['Captain Broadcast'] = wText(updates.captainBroadcast);
  if (updates.socialCueType !== undefined) fullProperties['Social Cue Type'] = wSelect(updates.socialCueType);
  if (updates.socialCueText !== undefined) fullProperties['Social Cue Text'] = wText(updates.socialCueText);
  if (updates.relatedPassenger !== undefined) fullProperties['Related Passenger'] = wText(updates.relatedPassenger);

  const properties = pickExistingProperties(fullProperties, allowed);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.pages.update({ page_id: notionId, properties: properties as any });
}

function flightActivityTime(f: Flight): number {
  const t = f.status === 'landed' && f.landingTime ? f.landingTime : f.takeoffTime;
  return new Date(t).getTime();
}

/** 小隊看板：進行中航班 + 每位乘客最近一次降落（不限時間）。 */
export function buildGroupBoardFlights(flights: Flight[]): Flight[] {
  const inFlight = flights.filter((f) => f.status === 'in_flight');
  const flyingIds = new Set(inFlight.map((f) => f.passengerId));

  const latestLanded = new Map<string, Flight>();
  for (const f of flights) {
    if (f.status !== 'landed' || flyingIds.has(f.passengerId)) continue;
    const prev = latestLanded.get(f.passengerId);
    if (!prev || flightActivityTime(f) > flightActivityTime(prev)) {
      latestLanded.set(f.passengerId, f);
    }
  }

  return [...inFlight, ...latestLanded.values()].sort(
    (a, b) => flightActivityTime(b) - flightActivityTime(a)
  );
}

async function queryGroupFlightsByStatus(
  groupId: string,
  statuses: FlightStatus[]
): Promise<Flight[]> {
  if (!isNotionConfigured()) {
    return mem.filter((f) => f.groupId === groupId && statuses.includes(f.status));
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Group ID', select: { equals: groupId } },
        {
          or: statuses.map((status) => ({
            property: 'Status',
            select: { equals: status },
          })),
        },
      ],
    },
    sorts: [{ property: 'Takeoff Time', direction: 'descending' }],
    page_size: 100,
  });

  return result.results.map((p) => parseFlight(p as unknown as Record<string, unknown>));
}

export async function getLastLandedFlight(passengerId: string): Promise<Flight | null> {
  if (!isNotionConfigured()) {
    const landed = mem
      .filter((f) => f.passengerId === passengerId && f.status === 'landed')
      .sort((a, b) => flightActivityTime(b) - flightActivityTime(a));
    return landed[0] ?? null;
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Passenger ID', rich_text: { equals: passengerId } },
        { property: 'Status', select: { equals: 'landed' } },
      ],
    },
    sorts: [{ property: 'Landing Time', direction: 'descending' }],
    page_size: 1,
  });

  if (result.results.length === 0) return null;
  return parseFlight(result.results[0] as unknown as Record<string, unknown>);
}

export async function getGroupBoardFlights(groupId: string): Promise<Flight[]> {
  const flights = await queryGroupFlightsByStatus(groupId, ['in_flight', 'landed']);
  return buildGroupBoardFlights(flights);
}

/** 同組近期航班（社交提示用，預設 24 小時內）。 */
export async function getGroupFlights(
  groupId: string,
  sinceHours: number = 24
): Promise<Flight[]> {
  if (!isNotionConfigured()) {
    const since = Date.now() - sinceHours * 3600 * 1000;
    return mem
      .filter((f) => f.groupId === groupId && new Date(f.takeoffTime).getTime() >= since)
      .sort((a, b) => new Date(b.takeoffTime).getTime() - new Date(a.takeoffTime).getTime());
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Group ID', select: { equals: groupId } },
        { property: 'Takeoff Time', date: { on_or_after: since } },
      ],
    },
    sorts: [{ property: 'Takeoff Time', direction: 'descending' }],
    page_size: 50,
  });

  return result.results
    .map((p) => parseFlight(p as unknown as Record<string, unknown>))
    .filter((f) => f.status === 'in_flight' || f.status === 'landed');
}

export async function getAllActiveFlights(): Promise<Flight[]> {
  if (!isNotionConfigured()) {
    return mem.filter((f) => f.status === 'in_flight');
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const result = await client.databases.query({
    database_id: dbId,
    filter: { property: 'Status', select: { equals: 'in_flight' } },
    page_size: 100,
  });

  return result.results.map((p) => parseFlight(p as unknown as Record<string, unknown>));
}
