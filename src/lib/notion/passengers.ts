import type { Passenger, PassengerStatus } from '../../types';
import {
  getNotionClient, isNotionConfigured,
  readTitle, readText, readSelect, readNumber, readDate,
} from './client';
import { resolveDashboardDbId } from './ensure-dashboard';

const DEFAULT_LOCATION = 'Taipei, Taiwan';
const DEFAULT_LAT = 25.0330;
const DEFAULT_LNG = 121.5654;

const mem = new Map<string, Passenger>();

/** Notion 模式下登入不寫表，起飛前暫存姓名／小隊。 */
const profileCache = new Map<string, { name: string; groupId: string }>();

function resolveProfile(
  passengerId: string,
  name: string,
  groupId: string
): { name: string; groupId: string } {
  const cached = profileCache.get(passengerId);
  const resolved = {
    name: name || cached?.name || '',
    groupId: groupId || cached?.groupId || '',
  };
  if (resolved.name || resolved.groupId) {
    profileCache.set(passengerId, resolved);
  }
  return resolved;
}

function readPassengerId(props: Record<string, unknown>): string {
  return readText(props, 'Passenger ID') || readTitle(props, 'Passenger ID');
}

function readFlightId(props: Record<string, unknown>): string {
  return readTitle(props, 'Flight ID') || readText(props, 'Flight ID');
}

/** 從航班列推導乘客目前狀態（登入不寫 Notion，僅讀最新／進行中航班）。 */
function parsePassengerFromFlightRow(
  page: Record<string, unknown>,
  overrides?: { name?: string; groupId?: string }
): Passenger {
  const props = page.properties as Record<string, unknown>;
  const status = (readSelect(props, 'Status') ?? 'not_started') as PassengerStatus;
  const passengerId = readPassengerId(props);

  let currentLocation = DEFAULT_LOCATION;
  let currentLatitude = DEFAULT_LAT;
  let currentLongitude = DEFAULT_LNG;

  if (status === 'landed') {
    currentLocation = readText(props, 'Arrival Location') || DEFAULT_LOCATION;
    currentLatitude = readNumber(props, 'Arrival Latitude') ?? DEFAULT_LAT;
    currentLongitude = readNumber(props, 'Arrival Longitude') ?? DEFAULT_LNG;
  } else if (status === 'in_flight') {
    currentLocation = readText(props, 'Departure Location') || DEFAULT_LOCATION;
    currentLatitude = readNumber(props, 'Departure Latitude') ?? DEFAULT_LAT;
    currentLongitude = readNumber(props, 'Departure Longitude') ?? DEFAULT_LNG;
  }

  return {
    notionId: page.id as string,
    passengerId,
    name: overrides?.name || readText(props, 'Name'),
    groupId: overrides?.groupId || (readSelect(props, 'Group ID') ?? ''),
    currentLocation,
    currentLatitude,
    currentLongitude,
    lastFlightId: readFlightId(props) || null,
    status: status === 'not_started' ? 'landed' : status,
    createdAt: readDate(props, 'Created At') ?? new Date().toISOString(),
    updatedAt: readDate(props, 'Updated At') ?? new Date().toISOString(),
  };
}

function defaultPassenger(
  passengerId: string,
  name: string,
  groupId: string
): Passenger {
  const now = new Date().toISOString();
  return {
    notionId: `pending_${passengerId}`,
    passengerId,
    name,
    groupId,
    currentLocation: DEFAULT_LOCATION,
    currentLatitude: DEFAULT_LAT,
    currentLongitude: DEFAULT_LNG,
    lastFlightId: null,
    status: 'not_started',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreatePassenger(
  passengerId: string,
  name: string,
  groupId: string
): Promise<{ passenger: Passenger; created: boolean }> {
  const profile = resolveProfile(passengerId, name, groupId);

  if (!isNotionConfigured()) {
    const existing = mem.get(passengerId);
    if (existing) {
      if (profile.name) existing.name = profile.name;
      if (profile.groupId) existing.groupId = profile.groupId;
      existing.updatedAt = new Date().toISOString();
      return { passenger: existing, created: false };
    }
    const p = defaultPassenger(passengerId, profile.name, profile.groupId);
    p.notionId = `mem_${passengerId}`;
    mem.set(passengerId, p);
    return { passenger: p, created: true };
  }

  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();

  const inFlight = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: 'Passenger ID', rich_text: { equals: passengerId } },
        { property: 'Status', select: { equals: 'in_flight' } },
      ],
    },
    page_size: 1,
  });

  if (inFlight.results.length > 0) {
    const page = inFlight.results[0] as Record<string, unknown>;
    const props = page.properties as Record<string, unknown>;
    const rowName = readText(props, 'Name');
    const rowGroup = readSelect(props, 'Group ID') ?? '';
    return {
      passenger: parsePassengerFromFlightRow(page, {
        name: profile.name || rowName || undefined,
        groupId: profile.groupId || rowGroup || undefined,
      }),
      created: false,
    };
  }

  const lastLanded = await client.databases.query({
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

  if (lastLanded.results.length > 0) {
    const page = lastLanded.results[0] as Record<string, unknown>;
    const passenger = parsePassengerFromFlightRow(page, {
      name: profile.name || undefined,
      groupId: profile.groupId || undefined,
    });
    passenger.status = 'not_started';
    return { passenger, created: false };
  }

  return {
    passenger: defaultPassenger(passengerId, profile.name, profile.groupId),
    created: true,
  };
}

/** 記憶體模式：起飛／降落時同步乘客快取。 */
export function syncMemPassenger(
  passengerId: string,
  updates: {
    status?: PassengerStatus;
    currentLocation?: string;
    currentLatitude?: number;
    currentLongitude?: number;
    lastFlightId?: string;
    name?: string;
    groupId?: string;
  }
): void {
  const p = mem.get(passengerId);
  if (!p) return;
  if (updates.status !== undefined) p.status = updates.status;
  if (updates.currentLocation !== undefined) p.currentLocation = updates.currentLocation;
  if (updates.currentLatitude !== undefined) p.currentLatitude = updates.currentLatitude;
  if (updates.currentLongitude !== undefined) p.currentLongitude = updates.currentLongitude;
  if (updates.lastFlightId !== undefined) p.lastFlightId = updates.lastFlightId;
  if (updates.name !== undefined) p.name = updates.name;
  if (updates.groupId !== undefined) p.groupId = updates.groupId;
  p.updatedAt = new Date().toISOString();
}
