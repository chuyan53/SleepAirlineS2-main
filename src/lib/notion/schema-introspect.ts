import type { Client } from '@notionhq/client';
import { getNotionClient, isNotionConfigured } from './client';
import { resolveDashboardDbId } from './ensure-dashboard';
import { resolveLandscapeDbId } from './ensure-landscape-db';
import { DASHBOARD_PROPERTY_ORDER } from './dashboard-schema';
import { getDashboardProperties } from './dashboard-schema';

type PropMeta = { name: string; type: string; selectOptions?: string[] };

let dashboardPropCache: Set<string> | null = null;
let landscapePropCache: Set<string> | null = null;

function extractProperties(db: Record<string, unknown>): PropMeta[] {
  const props = db.properties as Record<
    string,
    { type?: string; select?: { options?: { name: string }[] } }
  >;
  return Object.entries(props ?? {}).map(([name, def]) => ({
    name,
    type: def?.type ?? 'unknown',
    selectOptions:
      def?.type === 'select'
        ? def.select?.options?.map((o) => o.name) ?? []
        : undefined,
  }));
}

async function loadPropertyNames(
  client: Client,
  databaseId: string
): Promise<Set<string>> {
  const db = (await client.databases.retrieve({ database_id: databaseId })) as Record<
    string,
    unknown
  >;
  return new Set(Object.keys((db.properties as Record<string, unknown>) ?? {}));
}

/** 依 Notion 實際存在的欄位過濾寫入 payload（刪掉的欄位自動略過）。 */
export function pickExistingProperties(
  properties: Record<string, unknown>,
  allowed: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

export async function getDashboardPropertyNames(): Promise<Set<string>> {
  if (!isNotionConfigured()) {
    return new Set(Object.keys(getDashboardProperties()));
  }
  if (dashboardPropCache) return dashboardPropCache;
  const client = getNotionClient();
  const dbId = await resolveDashboardDbId();
  dashboardPropCache = await loadPropertyNames(client, dbId);
  return dashboardPropCache;
}

export async function getLandscapePropertyNames(): Promise<Set<string>> {
  if (!isNotionConfigured()) return new Set();
  if (landscapePropCache) return landscapePropCache;
  const client = getNotionClient();
  const dbId = await resolveLandscapeDbId();
  landscapePropCache = await loadPropertyNames(client, dbId);
  return landscapePropCache;
}

export function clearSchemaCache(): void {
  dashboardPropCache = null;
  landscapePropCache = null;
}

export async function introspectNotionSchemas(): Promise<{
  configured: boolean;
  flightLog: {
    title: string;
    databaseId: string;
    properties: PropMeta[];
    missingFromNotion: string[];
    extraInNotion: string[];
  } | null;
  landingScenery: {
    title: string;
    databaseId: string;
    properties: PropMeta[];
  } | null;
}> {
  if (!isNotionConfigured()) {
    return { configured: false, flightLog: null, landingScenery: null };
  }

  const client = getNotionClient();
  const dashboardId = await resolveDashboardDbId();
  const dashboardDb = (await client.databases.retrieve({
    database_id: dashboardId,
  })) as Record<string, unknown>;
  const dashTitle =
    (dashboardDb.title as { plain_text: string }[] | undefined)?.[0]?.plain_text ?? '';
  const dashProps = extractProperties(dashboardDb);
  const dashNames = new Set(dashProps.map((p) => p.name));

  dashboardPropCache = dashNames;

  const expected = [...DASHBOARD_PROPERTY_ORDER];
  const missingFromNotion = expected.filter((n) => !dashNames.has(n));
  const extraInNotion = [...dashNames].filter(
    (n) => !expected.includes(n as (typeof DASHBOARD_PROPERTY_ORDER)[number])
  );

  let landingScenery: {
    title: string;
    databaseId: string;
    properties: PropMeta[];
  } | null = null;

  try {
    const landscapeId = await resolveLandscapeDbId();
    const landscapeDb = (await client.databases.retrieve({
      database_id: landscapeId,
    })) as Record<string, unknown>;
    const lsTitle =
      (landscapeDb.title as { plain_text: string }[] | undefined)?.[0]?.plain_text ?? '';
    landscapePropCache = new Set(
      Object.keys((landscapeDb.properties as Record<string, unknown>) ?? {})
    );
    landingScenery = {
      title: lsTitle,
      databaseId: landscapeId,
      properties: extractProperties(landscapeDb),
    };
  } catch {
    landingScenery = null;
  }

  return {
    configured: true,
    flightLog: {
      title: dashTitle,
      databaseId: dashboardId,
      properties: dashProps,
      missingFromNotion,
      extraInNotion,
    },
    landingScenery,
  };
}
