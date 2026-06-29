import type { Client } from '@notionhq/client';
import { DASHBOARD_TITLE, DEFAULT_PARENT_PAGE_ID, getDashboardProperties, normalizeNotionId } from './dashboard-schema';
import { getNotionClient } from './client';
import { resolveDbIdWithFallback } from './db-access';

let cachedDbId: string | null = null;
let resolving: Promise<string> | null = null;

function getParentPageId(): string {
  const raw = process.env.NOTION_PARENT_PAGE_ID ?? DEFAULT_PARENT_PAGE_ID;
  return normalizeNotionId(raw);
}

async function readDatabaseTitle(client: Client, databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const title = (db as { title?: { plain_text: string }[] }).title;
  return title?.[0]?.plain_text ?? '';
}

async function findDashboardOnPage(client: Client, parentPageId: string): Promise<string | null> {
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: parentPageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      const typed = block as { type?: string; id?: string };
      if (typed.type !== 'child_database' || !typed.id) continue;
      const title = await readDatabaseTitle(client, typed.id);
      if (title === DASHBOARD_TITLE) return typed.id;
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

async function createDashboard(client: Client, parentPageId: string): Promise<string> {
  const db = await client.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: DASHBOARD_TITLE } }],
    properties: getDashboardProperties(),
  });
  return db.id;
}

function isOwnWorkspace(): boolean {
  return getParentPageId() !== normalizeNotionId(DEFAULT_PARENT_PAGE_ID);
}

function canWriteSchema(): boolean {
  return process.env.NOTION_ALLOW_SCHEMA_WRITE === 'true' || isOwnWorkspace();
}

async function findOrCreateDashboard(): Promise<string> {
  const client = getNotionClient();
  const parentPageId = getParentPageId();

  try {
    return await resolveDbIdWithFallback({
      client,
      envDbId: process.env.NOTION_DASHBOARD_DB_ID,
      expectedTitle: DASHBOARD_TITLE,
      findOnParentPage: findDashboardOnPage,
      parentPageId,
    });
  } catch (fallbackErr) {
    if (!canWriteSchema()) throw fallbackErr;

    try {
      return await createDashboard(client, parentPageId);
    } catch {
      const retry = await findDashboardOnPage(client, parentPageId);
      if (retry) return retry;
      throw new Error('無法在 Notion 父頁面建立 Dashboard，請確認 Integration 已 Connect。');
    }
  }
}

export async function resolveDashboardDbId(): Promise<string> {
  if (cachedDbId) return cachedDbId;

  if (!resolving) {
    resolving = findOrCreateDashboard()
      .then((id) => {
        cachedDbId = id;
        return id;
      })
      .finally(() => {
        resolving = null;
      });
  }

  return resolving;
}
